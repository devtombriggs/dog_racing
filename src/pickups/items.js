// Items in the race, as the players see them: what each dog is holding (floating above its head),
// tennis balls in flight, chew toys lying on the road and the burst when something hits.
// The server decides everything (shared/items.js); this only draws it.
//
//   const items = createItems({ scene, renderer });
//   items.setHeld(playerId, 'ball' | 'toy' | 'bone' | 'frisbee' | 'firework' | 'collar' | 'special' | null);
//   items.throwBall({ id, origin, direction, legs, length, popped, heights });   items.removeBall(id, position);
//   (a ball bounces off walls and skims the road: its route, legs and heights, comes from the server: shared/items.js ballRoute)
//   items.placeHazard({ id, position, rotationY }); items.removeHazard(id, burst);
//   items.throwFrisbee({ id, position, yaw });  items.moveFrisbees([{ id, position, yaw }]);  items.removeFrisbee(id, position);
//   each frame: items.update(delta, anchors)       // anchors: Map playerId -> Object3D (the dog's head)
//   items.dispose();
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ballPositionAt, ballSeconds, ballBouncesAt } from '../../shared/items.js';
import { buildRocket } from './firework.js';
import { buildCollar } from './collar.js';

const MODELS = { ball: '/models/tennis_ball.glb', toy: '/models/chew_toy.glb', bone: '/models/golden_bone.glb', frisbee: '/models/frisbee.glb' };
// Size shown above a dog's head, a vertical nudge to centre it, the glow colour (as on the HUD sheet),
// and a tilt: every held item turns the same way as the chew toy (about the vertical), and the round
// ones are tipped so you can see them turning (a level ball or a flat disc spinning looks still).
const HELD = {
  ball: { scale: 1.5, lift: 0, glow: 0x3fc8ff, tilt: 0.6 },
  toy: { scale: 0.6, lift: -0.36, glow: 0xb45cff, tilt: 0 },
  bone: { scale: 1.4, lift: 0, glow: 0xffc040, tilt: 0 },
  frisbee: { scale: 1.3, lift: 0, glow: 0xff3b3b, tilt: Math.PI / 2 - 0.3 },   // stood up like a coin
  firework: { scale: 1.25, lift: 0.1, glow: 0xff7a2e, tilt: -1.0 },            // nose up, ready to go
  collar: { scale: 1.6, lift: 0, glow: 0xffc233, tilt: Math.PI / 2 - 0.35 },   // stood up like a coin
  special: { scale: 1.5, lift: 0, glow: 0x7df9ff },        // the dog's own special: the crackling paw badge, not a model
};
const SPECIAL_ICON = '/icons/special.png';
const SPIN = 2.2;            // radians per second, for every held item
const ABOVE_HEAD = 1.3;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createItems({ scene, renderer }) {
  const root = new THREE.Group(); root.name = 'Items'; scene.add(root);
  const templates = {};
  const held = new Map(), balls = new Map(), hazards = new Map(), bursts = [];
  const glowTex = glowTexture();
  const additive = { map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false };
  const owned = [glowTex];
  let disposed = false;

  let envTex = null;                         // gold needs something to reflect (the game has no environment map)
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose(); owned.push(envTex);
  }

  const specialTex = new THREE.TextureLoader().load(SPECIAL_ICON);
  specialTex.colorSpace = THREE.SRGBColorSpace; owned.push(specialTex);
  const specialMat = new THREE.SpriteMaterial({ map: specialTex, transparent: true, depthWrite: false, toneMapped: false });
  owned.push(specialMat);

  // the firework and the golden collar are built here rather than loaded
  templates.firework = buildRocket();
  templates.collar = buildCollar(envTex);
  for (const built of [templates.firework, templates.collar]) built.traverse(o => { if (o.isMesh) owned.push(o.geometry, o.material); });

  const loader = new GLTFLoader();
  for (const [id, url] of Object.entries(MODELS)) {
    loader.loadAsync(url).then(gltf => {
      if (disposed) return;
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        owned.push(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (id === 'bone' && envTex) { m.envMap = envTex; m.envMapIntensity = 1.3; }
          owned.push(m);
          for (const k in m) if (m[k]?.isTexture) owned.push(m[k]);
        }
      });
      templates[id] = gltf.scene;
    }).catch(err => console.warn(`[Items] ${id} model failed to load:`, err));
  }

  function makeHeld(item) {
    const group = new THREE.Group();
    const spec = HELD[item];
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ ...additive, color: spec.glow, opacity: 0.8 }));
    glow.scale.setScalar(1.9);
    group.add(glow);
    const spinner = new THREE.Group();               // turns about the vertical, like the chew toy
    spinner.position.y = spec.lift;
    group.add(spinner);
    group.userData.spinner = spinner;
    if (item === 'special') {                        // a badge that always faces you, pulsing
      const badge = new THREE.Sprite(specialMat);
      badge.scale.setScalar(spec.scale);
      group.add(badge);
      group.userData.badge = badge;
      return group;
    }
    const model = templates[item].clone(true);
    model.scale.setScalar(spec.scale);
    model.rotation.x = spec.tilt;
    spinner.add(model);
    return group;
  }

  function burst(position, color) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ ...additive, color, opacity: 1 }));
    sprite.position.fromArray(position);
    root.add(sprite);
    bursts.push({ sprite, age: 0 });
  }

  // red frisbees in flight (positions from the server, smoothed between its updates)
  const frisbees = new Map();

  const anchorPos = new THREE.Vector3();
  return {
    envMap: envTex,                            // for anything else golden (the collar a dog is wearing)

    throwFrisbee({ id, position, yaw }) {
      frisbees.set(id, { from: [...position], to: [...position], yaw, at: performance.now(), object: null });
    },
    moveFrisbees(list) {
      for (const { id, position, yaw } of list) {
        const f = frisbees.get(id);
        if (!f) continue;
        f.from = f.object ? f.object.position.toArray() : f.to; f.to = [...position]; f.yaw = yaw; f.at = performance.now();
      }
    },
    removeFrisbee(id, position) {
      const f = frisbees.get(id);
      if (f?.object) root.remove(f.object);
      frisbees.delete(id);
      if (position) burst(position, 0xff5a5a);
    },

    setHeld(playerId, item) {
      const current = held.get(playerId);
      if (current?.object) { root.remove(current.object); current.object.children[0].material.dispose(); }
      if (item) held.set(playerId, { item, object: null }); else held.delete(playerId);
    },

    throwBall({ id, origin, direction, ground, legs = null, length = null, popped = false, heights = null }) {
      const ball = { origin, direction, ground, ...(legs ? { legs, length } : {}), ...(heights ? { heights } : {}) };
      balls.set(id, { ball, popped, bounced: 0, startedAt: performance.now(), object: null });
    },
    removeBall(id, position) {
      const entry = balls.get(id);
      if (entry?.object) root.remove(entry.object);
      balls.delete(id);
      if (position) burst(position, 0x9cf0ff);
    },

    // ride: dropped on a moving platform (Neon Nexus), it is carried along on it (shared/trackKit.js ridePosition)
    placeHazard({ id, position, rotationY, ride = null }) {
      hazards.set(id, { position, rotationY, ride, object: null, placedAt: performance.now() });
    },
    removeHazard(id, showBurst = false) {
      const entry = hazards.get(id);
      if (entry?.object) root.remove(entry.object);
      hazards.delete(id);
      if (showBurst && entry) burst([entry.position[0], entry.position[1] + 0.6, entry.position[2]], 0xff6a6a);
    },

    // track: the generated map, if it is one (a chew toy on a platform moves with it)
    update(delta, anchors, groundAt = null, track = null) {
      const t = performance.now() / 1000;
      for (const [playerId, entry] of held) {
        if (!entry.object && (templates[entry.item] || entry.item === 'special')) { entry.object = makeHeld(entry.item); root.add(entry.object); }
        if (!entry.object) continue;
        const anchor = anchors.get(playerId);
        entry.object.visible = !!anchor;
        if (!anchor) continue;
        anchor.getWorldPosition(anchorPos);
        entry.object.position.set(anchorPos.x, anchorPos.y + ABOVE_HEAD + Math.sin(t * 3) * 0.08, anchorPos.z);
        entry.object.userData.spinner.rotation.y += delta * SPIN;
        entry.object.userData.badge?.scale.setScalar(HELD.special.scale * (1 + 0.1 * Math.sin(t * 9)));
      }
      for (const f of frisbees.values()) {
        if (!f.object && templates.frisbee) { f.object = templates.frisbee.clone(true); f.object.scale.setScalar(1.3); root.add(f.object); }
        if (!f.object) continue;
        const k = Math.min(1, (performance.now() - f.at) / 50);       // the server moves it every 50 ms
        f.object.position.set(f.from[0] + (f.to[0] - f.from[0]) * k, f.from[1] + (f.to[1] - f.from[1]) * k, f.from[2] + (f.to[2] - f.from[2]) * k);
        f.object.rotation.y += delta * 16;                             // spinning flat as it flies
        f.object.rotation.z = Math.sin(t * 5) * 0.12;                  // with a little wobble
      }
      for (const [id, entry] of balls) {
        const age = (performance.now() - entry.startedAt) / 1000;
        // the wall after its last bounce: it pops there (out of time with no wall: it just goes)
        if (age > ballSeconds(entry.ball)) { this.removeBall(id, entry.popped ? ballPositionAt(entry.ball, age, groundAt) : null); continue; }
        if (!entry.object && templates.ball) { entry.object = templates.ball.clone(true); root.add(entry.object); }
        if (!entry.object) continue;
        const p = ballPositionAt(entry.ball, age, groundAt);
        const bounced = ballBouncesAt(entry.ball, age);
        if (bounced > entry.bounced) { entry.bounced = bounced; burst(p, 0xd8ff5a); }      // (a puff where it hit the wall)
        entry.object.position.set(p[0], p[1] + Math.abs(Math.sin(age * 7)) * 0.5, p[2]);   // skips along
        entry.object.rotation.x += delta * 18;
      }
      for (const entry of hazards.values()) {
        if (!entry.object && templates.toy) {
          entry.object = templates.toy.clone(true);
          entry.object.position.fromArray(entry.position);
          entry.object.rotation.y = entry.rotationY;
          root.add(entry.object);
        }
        if (!entry.object) continue;
        if (entry.ride && track?.ridePosition) { const at = track.ridePosition(entry.ride); if (at) { entry.position = at; entry.object.position.fromArray(at); } }
        const age = (performance.now() - entry.placedAt) / 1000;          // lands with a little bounce
        entry.object.scale.setScalar(age < 0.35 ? 0.4 + 0.6 * Math.sin(age / 0.35 * Math.PI / 2) * 1.08 : 1);
        entry.object.rotation.z = Math.sin(t * 2.5 + entry.position[0]) * 0.05;
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.age += delta;
        b.sprite.scale.setScalar(1 + b.age * 14);
        b.sprite.material.opacity = Math.max(0, 1 - b.age / 0.4);
        if (b.age > 0.4) { root.remove(b.sprite); b.sprite.material.dispose(); bursts.splice(i, 1); }
      }
    },

    dispose() {
      disposed = true;
      scene.remove(root);
      for (const entry of held.values()) entry.object?.children[0].material.dispose();
      for (const b of bursts) b.sprite.material.dispose();
      for (const d of new Set(owned)) d.dispose?.();
    },
  };
}
