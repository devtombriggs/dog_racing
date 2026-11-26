// What the specials of the three dogs from the Shop look like (Tom, 2026-11-26; the rules are in shared/specials.js):
//
//   createLightning({ scene })     Ziggy's Lightning Run: a trail of lightning bolts behind him, and a glow at his heels
//   createEarCopter({ model })     Barney's Ear-copter: his ears become two spinning rotors over his head
//   createFrogs({ scene })         Merlin's Hocus Croakus: a dog turned into a hopping frog for a few seconds
//   createPuffs({ scene })         ...and the purple puff of stars wherever his magic goes off
//
// Each is made when first needed, updated every frame, and disposed of with the race.
import * as THREE from 'three';

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

// ---------------------------------------------------------------------------------------------------
// Ziggy: lightning
// ---------------------------------------------------------------------------------------------------
export function createLightning({ scene }) {
  const root = new THREE.Group(); root.name = 'Lightning'; scene.add(root);
  const BOLTS = 16, LIFE = 0.38, EVERY = 0.035;
  // one bolt: a jagged strip, a metre and a half long, lying along +z
  const jag = [0, 0.18, -0.14, 0.2, -0.1, 0.12, 0], points = [];
  jag.forEach((x, k) => { const z = -k * 0.26; points.push(x - 0.07, 0, z, x + 0.07, 0, z); });
  const strip = new THREE.BufferGeometry(); strip.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  strip.setIndex(jag.slice(1).flatMap((_, k) => [k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2]));
  const bolts = Array.from({ length: BOLTS }, (_, k) => {
    const mesh = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ ...additive, color: k % 3 ? 0xffe94d : 0xffffff, opacity: 0 }));
    mesh.visible = false; mesh.userData.age = LIFE; root.add(mesh); return mesh;
  });
  const glowG = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), glow = new THREE.Mesh(glowG, new THREE.MeshBasicMaterial({ ...additive, color: 0xffe14d, opacity: 0 }));
  root.add(glow);
  let active = false, since = 0, next = 0, strength = 0;
  return {
    setActive(on) { active = on; },
    // dog: the Object3D that is moved round the track (its feet, facing +z)
    update(delta, dog) {
      strength += ((active ? 1 : 0) - strength) * Math.min(1, delta * 8);
      if (dog) {
        glow.position.copy(dog.position); glow.position.y += 0.08;
        glow.scale.setScalar(1.6 + 0.3 * Math.sin(performance.now() / 40));
        glow.material.opacity = 0.3 * strength;
        since += delta;
        if (active && since >= EVERY) {
          since = 0;
          const bolt = bolts[next]; next = (next + 1) % BOLTS;
          const yaw = dog.rotation.y, side = (Math.random() - 0.5) * 1.6, back = 0.4 + Math.random() * 0.8;
          bolt.position.set(dog.position.x - Math.sin(yaw) * back + Math.cos(yaw) * side, dog.position.y + 0.25 + Math.random() * 1.3, dog.position.z - Math.cos(yaw) * back - Math.sin(yaw) * side);
          bolt.rotation.set((Math.random() - 0.5) * 0.9, yaw, Math.random() * Math.PI);
          bolt.scale.setScalar(1 + Math.random() * 1.2);
          bolt.userData.age = 0; bolt.visible = true;
        }
      }
      for (const bolt of bolts) {
        if (!bolt.visible) continue;
        bolt.userData.age += delta;
        const left = 1 - bolt.userData.age / LIFE;
        if (left <= 0) { bolt.visible = false; continue; }
        bolt.material.opacity = left * (0.6 + 0.4 * Math.random());       // (it flickers as it goes)
      }
    },
    dispose() { scene.remove(root); strip.dispose(); glowG.dispose(); glow.material.dispose(); for (const bolt of bolts) bolt.material.dispose(); },
  };
}

// ---------------------------------------------------------------------------------------------------
// Barney: his ears as rotors
// ---------------------------------------------------------------------------------------------------
export function createEarCopter({ model }) {
  // (the loader takes the dot out of a bone's name: ear.L is earL)
  const bone = name => model.getObjectByName(name) ?? model.getObjectByName(name.replace('.', ''));
  const ears = ['ear.L', 'ear.R'].map(bone).filter(Boolean), head = bone('head');
  // a rotor: two long ear-shaped blades and the blur of them turning.  It goes on the dog's head bone, so it is his size;
  // it is kept level and spinning from outside the bone's own turning (update, below)
  const blade = new THREE.Shape(); blade.moveTo(0, -0.016); blade.quadraticCurveTo(0.13, -0.055, 0.23, -0.03); blade.quadraticCurveTo(0.265, 0, 0.23, 0.03); blade.quadraticCurveTo(0.13, 0.055, 0, 0.016);
  const bladeG = new THREE.ShapeGeometry(blade, 8).rotateX(-Math.PI / 2);
  const brown = new THREE.MeshStandardMaterial({ color: 0x6a3414, roughness: 0.8, side: THREE.DoubleSide });
  const blurG = new THREE.CircleGeometry(0.265, 28).rotateX(-Math.PI / 2), blurM = new THREE.MeshBasicMaterial({ color: 0x8a5a36, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const rotors = ears.map((ear, k) => {
    const hub = new THREE.Group(), spin = new THREE.Group();
    for (let b = 0; b < 2; b++) { const mesh = new THREE.Mesh(bladeG, brown); mesh.rotation.y = b * Math.PI; spin.add(mesh); }
    spin.add(new THREE.Mesh(blurG, blurM));
    hub.add(spin); hub.visible = false; hub.userData = { spin, way: k ? -1 : 1 };
    (head ?? ear).add(hub);
    return hub;
  });
  const parentTurn = new THREE.Quaternion(), at = new THREE.Vector3();
  let active = false, shown = 0;
  return {
    setActive(on) { active = on; },
    // (after the dog's clips have set its bones for this frame)
    update(delta) {
      shown += ((active ? 1 : 0) - shown) * Math.min(1, delta * 7);
      const on = shown > 0.02;
      rotors.forEach((hub, k) => {
        hub.visible = on;
        const ear = ears[k];
        if (ear) ear.scale.setScalar(Math.max(0.02, 1 - shown));           // the ear itself is drawn in to nothing: it has become the rotor
        if (!on) return;
        // over the head, out to its side, level whatever the head is doing
        const parent = hub.parent;
        parent.getWorldQuaternion(parentTurn); hub.quaternion.copy(parentTurn.invert());
        hub.userData.spin.rotation.y += delta * 38 * hub.userData.way;
        // (where the ear joins the head, lifted a little: worked out in the head's own space)
        ear.getWorldPosition(at); at.y += 0.07 * parent.getWorldScale(new THREE.Vector3()).y;
        hub.position.copy(parent.worldToLocal(at));
        hub.scale.setScalar(shown);
      });
    },
    dispose() {
      for (const hub of rotors) hub.parent?.remove(hub);
      for (const ear of ears) ear.scale.setScalar(1);
      bladeG.dispose(); blurG.dispose(); brown.dispose(); blurM.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Merlin: puffs of magic, and frogs
// ---------------------------------------------------------------------------------------------------
export function createPuffs({ scene }) {
  const root = new THREE.Group(); root.name = 'Magic_Puffs'; scene.add(root);
  const STARS = 14, LIFE = 0.9;
  const star = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, r = k % 2 ? 0.12 : 0.3; if (k) star.lineTo(Math.sin(a) * r, Math.cos(a) * r); else star.moveTo(Math.sin(a) * r, Math.cos(a) * r); }
  const starG = new THREE.ShapeGeometry(star), cloudG = new THREE.IcosahedronGeometry(1, 1);
  const gold = new THREE.MeshBasicMaterial({ ...additive, color: 0xffd23a }), purple = new THREE.MeshBasicMaterial({ color: 0x8a46f0, transparent: true, opacity: 0.6, depthWrite: false });
  const puffs = [];
  return {
    // size: about how big the thing it goes off round is (1: a dog)
    burst(position, size = 1) {
      const puff = new THREE.Group(); puff.position.fromArray(position); puff.position.y += 0.9 * size;
      const cloud = new THREE.Mesh(cloudG, purple.clone()); puff.add(cloud);
      const stars = Array.from({ length: STARS }, (_, k) => {
        const mesh = new THREE.Mesh(starG, gold.clone()), a = k / STARS * Math.PI * 2, up = (Math.random() - 0.3) * 1.4;
        mesh.userData.fly = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).multiplyScalar((2.2 + Math.random() * 1.8) * size);
        mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        puff.add(mesh); return mesh;
      });
      root.add(puff); puffs.push({ puff, cloud, stars, age: 0, size });
    },
    update(delta) {
      for (let k = puffs.length - 1; k >= 0; k--) {
        const p = puffs[k]; p.age += delta;
        const t = p.age / LIFE;
        if (t >= 1) {
          root.remove(p.puff); p.cloud.material.dispose(); for (const s of p.stars) s.material.dispose();
          puffs.splice(k, 1); continue;
        }
        p.cloud.scale.setScalar(p.size * (0.5 + 1.6 * Math.sqrt(t))); p.cloud.material.opacity = 0.6 * (1 - t);
        for (const s of p.stars) { s.position.addScaledVector(s.userData.fly, delta * (1 - t)); s.rotation.z += delta * 5; s.material.opacity = 1 - t * t; s.scale.setScalar(p.size * (1 - 0.5 * t)); }
      }
    },
    dispose() { scene.remove(root); starG.dispose(); cloudG.dispose(); gold.dispose(); purple.dispose(); for (const p of puffs) { p.cloud.material.dispose(); for (const s of p.stars) s.material.dispose(); } },
  };
}

export function createFrogs() {
  // a frog: a squat green body, a pale belly, two big eyes on top, four legs.  About 1.6 m long (the dogs here are big)
  const green = new THREE.MeshStandardMaterial({ color: 0x3fae3f, roughness: 0.6 }), pale = new THREE.MeshStandardMaterial({ color: 0xd8e88a, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const ball = new THREE.SphereGeometry(1, 16, 10), parts = [
    [green, [0, 0.42, 0], [0.62, 0.42, 0.8]], [pale, [0, 0.3, 0.12], [0.5, 0.3, 0.62]], [green, [0, 0.6, 0.55], [0.5, 0.34, 0.42]],        // body, belly, head
    [green, [-0.3, 0.92, 0.6], [0.2, 0.2, 0.2]], [green, [0.3, 0.92, 0.6], [0.2, 0.2, 0.2]],                                              // eye bumps
    [white, [-0.3, 0.96, 0.68], [0.15, 0.15, 0.15]], [white, [0.3, 0.96, 0.68], [0.15, 0.15, 0.15]],
    [black, [-0.3, 0.97, 0.79], [0.07, 0.08, 0.06]], [black, [0.3, 0.97, 0.79], [0.07, 0.08, 0.06]],
    [green, [-0.62, 0.2, -0.35], [0.26, 0.2, 0.5]], [green, [0.62, 0.2, -0.35], [0.26, 0.2, 0.5]],                                        // back legs, folded
    [green, [-0.5, 0.12, 0.5], [0.14, 0.12, 0.26]], [green, [0.5, 0.12, 0.5], [0.14, 0.12, 0.26]],                                        // front feet
  ];
  const frogs = new Map();
  return {
    /**
     * Turns a dog into a frog for `seconds`.  avatar: the dog (its `group` is moved round the track, its `model` is what is
     * drawn).  onDone(): it is a dog again
     */
    frog(id, avatar, seconds, onDone = () => {}) {
      this.release(id);
      if (!avatar?.group) return;
      const frog = new THREE.Group(); frog.name = 'Frog';
      for (const [material, at, size] of parts) { const mesh = new THREE.Mesh(ball, material); mesh.position.set(...at); mesh.scale.set(...size); mesh.castShadow = true; frog.add(mesh); }
      const size = 0.75 + 0.25 * Math.min(1.6, (avatar.config?.scale ?? 3) / 3);
      frog.scale.setScalar(size);
      avatar.group.add(frog);
      const hidden = avatar.model?.visible !== false;
      if (avatar.model && hidden) avatar.model.visible = false;
      if (avatar.duo?.second?.holder) avatar.duo.second.holder.visible = false;
      frogs.set(id, { frog, avatar, left: seconds, t: 0, hidden, onDone, size });
    },
    /** A dog again, now (the race is over, the dog has gone, or the time is up) */
    release(id) {
      const f = frogs.get(id);
      if (!f) return;
      f.avatar.group.remove(f.frog);
      if (f.hidden && f.avatar.model) f.avatar.model.visible = true;
      if (f.avatar.duo?.second?.holder) f.avatar.duo.second.holder.visible = true;
      frogs.delete(id);
      f.onDone();
    },
    has: id => frogs.has(id),
    update(delta) {
      for (const [id, f] of frogs) {
        f.t += delta; f.left -= delta;
        // hop, hop: up and forward a little, squashing as it lands
        const hop = (f.t * 2.2) % 1, up = Math.sin(Math.PI * Math.min(1, hop / 0.6));
        f.frog.position.y = hop < 0.6 ? 0.9 * up * f.size : 0;
        f.frog.scale.set(f.size * (hop < 0.6 ? 1 : 1.12), f.size * (hop < 0.6 ? 1 + 0.12 * up : 0.86), f.size * (hop < 0.6 ? 1 : 1.12));
        if (f.avatar.model && f.hidden) f.avatar.model.visible = false;      // (kept hidden: its clips and other effects may show it again)
        if (f.left <= 0) this.release(id);
      }
    },
    dispose() { for (const id of [...frogs.keys()]) this.release(id); ball.dispose(); for (const m of [green, pale, white, black]) m.dispose(); },
  };
}
