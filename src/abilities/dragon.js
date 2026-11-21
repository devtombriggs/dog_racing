// Jimmy's Dragon Dance, as the players see it (the rules are shared/specials.js SPECIALS.jimmy): for as long as it
// lasts he is a red and gold dragon, its head where he is and its long body following the way he has come, rippling.
// The fireworks it sends are the game's own (src/pickups/firework.js): the server flies them.
//
//   const dragon = createDragon({ scene });
//   dragon.show(group);                      // group: the Object3D that is moved round the track (his feet, facing +z)
//   each frame: dragon.update(delta, group); // after the dog has been moved
//   dragon.hide();                           // it shrinks away (and is gone a moment later)
//   dragon.active                            // true from show() until it has gone
//   dragon.dispose();
import * as THREE from 'three';

const COLOUR = { red: 0xd9161d, deep: 0x8e0b12, gold: 0xf5b21a, pale: 0xffdf8a, white: 0xfff7e6, black: 0x150a08, glow: 0xff7a1a };
const BODY = {
  segments: 17,
  spacing: 0.6,          // metres from one to the next along the way he has come
  radius: 0.42,          // of the body at the neck: it tapers to a third of that at the tail
  height: 0.78,          // the middle of the body above the road (low enough for his player to see the road over it)...
  neck: 0.85,            // ...the first few pieces climbing this much more, up to the head...
  ripple: 0.24,          // ...and how far it rises and falls,
  weave: 0.3,            // and swings from side to side, as the wave runs down it
  rate: 8.5,             // how fast that wave runs (radians a second)
};
const HEAD = { ahead: 0.75, height: 1.85, nod: 0.12 };
const GROW = 0.35, SHRINK = 0.3;      // seconds to appear and to go
const STEP = 0.12;                    // metres between the points kept of the way he has come

export function createDragon({ scene }) {
  const root = new THREE.Group(); root.name = 'Jimmy_Dragon'; root.visible = false; scene.add(root);
  const mat = (color, more = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...more });
  const M = {
    red: mat(COLOUR.red, { emissive: COLOUR.deep, emissiveIntensity: 0.35 }),
    deep: mat(COLOUR.deep),
    gold: mat(COLOUR.gold, { roughness: 0.38, metalness: 0.15, emissive: COLOUR.glow, emissiveIntensity: 0.18 }),
    pale: mat(COLOUR.pale, { roughness: 0.6 }),
    white: mat(COLOUR.white, { roughness: 0.3 }),
    black: mat(COLOUR.black, { roughness: 0.3 }),
  };
  const G = {
    ball: new THREE.SphereGeometry(1, 14, 10),
    cone: new THREE.ConeGeometry(1, 1, 6),
    flame: new THREE.ConeGeometry(1, 1, 4),
  };
  const part = (geometry, material, scale, position, rotation, parent) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(...scale); mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ----- the head (it faces +z)
  const head = new THREE.Group(); root.add(head);
  part(G.ball, M.red, [0.58, 0.52, 0.66], [0, 0, 0], null, head);                                    // the skull
  part(G.ball, M.red, [0.4, 0.27, 0.52], [0, -0.03, 0.66], null, head);                              // the snout
  part(G.ball, M.gold, [0.24, 0.15, 0.16], [0, 0.08, 1.12], null, head);                             // its gold nose
  for (const side of [-1, 1]) {
    part(G.ball, M.black, [0.045, 0.045, 0.045], [side * 0.1, 0.1, 1.26], null, head);               // nostrils
    part(G.ball, M.white, [0.17, 0.17, 0.12], [side * 0.3, 0.26, 0.42], null, head);                 // eyes
    part(G.ball, M.black, [0.075, 0.09, 0.05], [side * 0.31, 0.25, 0.53], null, head);
    part(G.flame, M.gold, [0.09, 0.42, 0.09], [side * 0.31, 0.46, 0.4], [0.3, 0, side * 1.25], head); // a fierce brow
    part(G.cone, M.gold, [0.085, 0.8, 0.085], [side * 0.27, 0.62, -0.22], [-0.95, 0, side * -0.3], head);      // horns, swept back
    part(G.cone, M.gold, [0.05, 0.3, 0.05], [side * 0.33, 0.76, -0.38], [-0.3, 0, side * -0.9], head);         // ...each with a tine
    part(G.ball, M.pale, [0.07, 0.2, 0.16], [side * 0.52, 0.2, -0.08], [0, 0, side * -0.5], head);    // ears
    for (let k = 0; k < 3; k++) part(G.cone, M.white, [0.035, 0.13, 0.035], [side * (0.1 + 0.11 * k), -0.2, 1.02 - 0.16 * k], [Math.PI, 0, 0], head);   // teeth
  }
  // the mane: flames of gold round the back of the skull
  for (let k = 0; k < 11; k++) {
    const a = -Math.PI * 0.62 + (k / 10) * Math.PI * 1.24, long = 0.55 + 0.3 * Math.cos(a) ** 2 + (k % 2) * 0.12;
    part(G.flame, M.gold, [0.13, long, 0.13], [Math.sin(a) * 0.5, Math.cos(a) * 0.42 - 0.02, -0.42 - 0.12 * (k % 2)], [-1.25 + 0.25 * Math.cos(a), 0, -Math.sin(a) * 0.95], head);
  }
  // the jaw: it opens and shuts
  const jaw = new THREE.Group(); jaw.position.set(0, -0.2, 0.2); head.add(jaw);
  part(G.ball, M.deep, [0.34, 0.12, 0.46], [0, -0.07, 0.42], null, jaw);
  part(G.flame, M.gold, [0.1, 0.5, 0.1], [0, -0.32, 0.2], [Math.PI * 0.92, 0, 0], jaw);              // his beard
  // whiskers: long, gold, trailing back from either side of the nose
  const whiskers = [-1, 1].map((side) => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.35, 0.12, -0.25), new THREE.Vector3(side * 0.55, 0.05, -0.85), new THREE.Vector3(side * 0.5, -0.12, -1.45)]);
    const holder = new THREE.Group(); holder.position.set(side * 0.22, 0.02, 1.05); head.add(holder);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.028, 5, false), M.gold); mesh.castShadow = true; holder.add(mesh);
    return { holder, mesh, side };
  });

  // ----- the body: a row of scaled balls, each with a gold belly and a fin; two pairs of little legs; a tuft on the tail
  const girth = i => BODY.radius * (1 - 0.66 * (i / (BODY.segments - 1)) ** 1.4);
  const segments = Array.from({ length: BODY.segments }, (_, i) => {
    const group = new THREE.Group(); root.add(group);
    const r = girth(i);
    part(G.ball, i % 2 ? M.deep : M.red, [r, r * 0.92, BODY.spacing * 0.78], [0, 0, 0], null, group);
    part(G.ball, M.pale, [r * 0.72, r * 0.5, BODY.spacing * 0.7], [0, -r * 0.5, 0], null, group);
    part(G.flame, M.gold, [r * 0.34, r * 1.05, r * 0.5], [0, r * 1.15, -0.05], [-0.5, 0, 0], group);
    if (i === 3 || i === 10) {
      for (const side of [-1, 1]) {
        part(G.cone, M.red, [r * 0.3, r * 1.1, r * 0.3], [side * r * 0.95, -r * 0.75, 0.1], [0.5, 0, side * 0.6 + Math.PI], group);
        part(G.ball, M.gold, [r * 0.3, r * 0.16, r * 0.42], [side * r * 1.25, -r * 1.25, 0.25], null, group);
      }
    }
    if (i === BODY.segments - 1) {
      for (let k = 0; k < 5; k++) part(G.flame, M.gold, [0.09, 0.75, 0.09], [(k - 2) * 0.09, 0.05 * Math.abs(k - 2), -0.3], [-Math.PI / 2 + (k - 2) * 0.12, 0, (k - 2) * -0.28], group);
    }
    return group;
  });

  // ----- sparks: a burst of gold as it appears and as it goes
  const SPARKS = 48;
  const sparkAt = new Float32Array(SPARKS * 3), sparkSpeed = Array.from({ length: SPARKS }, () => new THREE.Vector3());
  const sparkGeometry = new THREE.BufferGeometry(); sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkAt, 3));
  const sparkMaterial = new THREE.PointsMaterial({ color: COLOUR.gold, size: 5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial); sparks.frustumCulled = false; sparks.visible = false; scene.add(sparks);
  let sparkLeft = 0;
  function burst(at) {
    for (let i = 0; i < SPARKS; i++) {
      sparkAt.set([at.x, at.y + 1, at.z], i * 3);
      const a = Math.random() * Math.PI * 2, up = Math.random() * 5 + 1.5, out = 2 + Math.random() * 5;
      sparkSpeed[i].set(Math.cos(a) * out, up, Math.sin(a) * out);
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    sparkLeft = 0.7; sparks.visible = true;
  }

  // ----- the way he has come: the newest point last
  const trail = [];
  const fallback = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3(), across = new THREE.Vector3(), ahead = new THREE.Vector3();
  let time = 0, shown = 0, going = -1, active = false;

  // the point `back` metres behind him along the way he has come (straight on behind the oldest point if it is not that long yet)
  function behind(back, out) {
    let left = back;
    for (let i = trail.length - 1; i > 0; i--) {
      const length = trail[i].distanceTo(trail[i - 1]);
      if (left <= length) return out.copy(trail[i]).lerp(trail[i - 1], length > 0 ? left / length : 0);
      left -= length;
    }
    return out.copy(trail[0] ?? fallback).addScaledVector(fallback, left);
  }

  return {
    get active() { return active; },

    show(group) {
      trail.length = 0;
      trail.push(group.position.clone());
      fallback.set(-Math.sin(group.rotation.y), 0, -Math.cos(group.rotation.y));      // (straight back from where he faces)
      time = 0; shown = 0; going = -1; active = true;
      root.visible = true;
      burst(group.position);
      this.update(0, group);
    },

    hide() {
      if (active && going < 0) { going = 0; if (trail.length) burst(trail[trail.length - 1]); }
    },

    update(delta, group) {
      if (sparkLeft > 0) {
        sparkLeft -= delta;
        for (let i = 0; i < SPARKS; i++) {
          sparkSpeed[i].y -= 9 * delta;
          sparkAt[i * 3] += sparkSpeed[i].x * delta; sparkAt[i * 3 + 1] += sparkSpeed[i].y * delta; sparkAt[i * 3 + 2] += sparkSpeed[i].z * delta;
        }
        sparkGeometry.attributes.position.needsUpdate = true;
        sparkMaterial.opacity = Math.max(0, sparkLeft / 0.7);
        if (sparkLeft <= 0) sparks.visible = false;
      }
      if (!active) return;
      time += delta;
      if (going >= 0) {
        going += delta;
        if (going >= SHRINK) { active = false; root.visible = false; return; }
      } else shown = Math.min(1, shown + delta / GROW);
      const size = going >= 0 ? 1 - going / SHRINK : 1 - (1 - shown) ** 2;

      // where he is now, and the way he has come
      const here = group.position, last = trail[trail.length - 1];
      if (here.distanceTo(last) > 6) { trail.length = 0; trail.push(here.clone()); }        // (put somewhere else: start again)
      else if (here.distanceTo(last) >= STEP) trail.push(here.clone());
      const keep = Math.ceil((BODY.segments * BODY.spacing + 3) / STEP);
      if (trail.length > keep) trail.splice(0, trail.length - keep);
      const yaw = group.rotation.y;
      ahead.set(Math.sin(yaw), 0, Math.cos(yaw));

      // the head: a little in front of him, nodding, mouth working
      head.position.copy(here).addScaledVector(ahead, HEAD.ahead);
      head.position.y += HEAD.height + HEAD.nod * Math.sin(time * BODY.rate);
      head.rotation.set(-0.12 + 0.1 * Math.sin(time * BODY.rate + 1), yaw, 0.08 * Math.sin(time * 5), 'YXZ');
      head.scale.setScalar(size * 1.25);
      jaw.rotation.x = 0.22 + 0.2 * Math.sin(time * 11);
      for (const w of whiskers) w.holder.rotation.set(0.15 * Math.sin(time * 6 + w.side), 0.2 * Math.sin(time * 4.3 + w.side * 2), 0);

      // the body: each piece on the way he has come, lifted and swung by the wave that runs down it
      let previous = head.position;
      segments.forEach((segment, i) => {
        const back = 0.2 + i * BODY.spacing;
        behind(back, from); behind(back + 0.4, to);
        across.set(from.z - to.z, 0, to.x - from.x);                                          // (to the left of the way he is going)
        if (across.lengthSq() < 1e-8) across.set(Math.cos(yaw), 0, -Math.sin(yaw)); else across.normalize();
        const wave = Math.min(1, 0.35 + i * 0.2);
        segment.position.copy(from).addScaledVector(across, BODY.weave * wave * Math.sin(time * BODY.rate * 0.6 - i * 0.6));
        segment.position.y += BODY.height + BODY.neck * Math.max(0, 1 - i / 4) ** 1.6 + BODY.ripple * wave * Math.sin(time * BODY.rate - i * 0.85);
        segment.lookAt(previous);
        segment.scale.setScalar(size * Math.min(1, Math.max(0.01, shown * (BODY.segments + 3) - i * 0.8)));
        previous = segment.position;
      });
    },

    dispose() {
      root.removeFromParent(); sparks.removeFromParent();
      for (const geometry of Object.values(G)) geometry.dispose();
      for (const material of Object.values(M)) material.dispose();
      for (const w of whiskers) w.mesh.geometry.dispose();
      sparkGeometry.dispose(); sparkMaterial.dispose();
      active = false;
    },
  };
}
