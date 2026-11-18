// Golden Bones: automatic speed-boost pickups (model built by golden_bone/create_golden_bone.py).
//
//   const bones = createGoldenBones({ scene, renderer, placements: GOLDEN_BONE_SPOTS[mapId] });
//   ... each frame:  if (bones.update(delta, player.position, canCollect)) { /* just picked one up */ }
//                    maxSpeed *= bones.speedMultiplier();   accel *= bones.accelerationMultiplier();
//   ... on fall / respawn:  bones.cancelBoost();
//   ... leaving the map:    bones.dispose();
//
// Your own game boosts you the moment you touch a bone (no waiting on the network), and the server
// decides who really got it: bones.take(index) / bones.respawn(index) follow its goldenBoneTaken /
// goldenBoneRespawned messages, so a bone a friend eats disappears on your screen too.  Other dogs'
// boosts (from a road bone or a Golden Bone item) get the same golden trail: bones.showBoost(id).
import * as THREE from 'three';
import { BONE_BOOST } from '../../shared/items.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const GOLDEN_BONE = {
  ...BONE_BOOST,              // how much faster, and for how long (shared/items.js: the server's computer dogs get the same)
  respawnDelay: 6.0,          // seconds before a taken bone comes back (the server says when)
  respawnFallback: 3.0,       // ...extra wait before bringing it back anyway if the server never took it
  pickupRadius: 2.0,          // metres, measured flat (plus a height check)
  scale: 2.0,                 // 0.8 m model -> 1.6 m wide next to the x3 dogs
  floatHeight: 1.3,           // bone centre above the road
  spinSpeed: 1.4,             // radians per second
  bobHeight: 0.18, bobSpeed: 2.2,
  model: '/models/golden_bone.glb',
};

// Where the bones go on each map is decided in shared/pickupSpots.js (GOLDEN_BONE_SPOTS).

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,236,150,1)'); grd.addColorStop(0.25, 'rgba(255,196,60,0.65)');
  grd.addColorStop(0.6, 'rgba(255,150,20,0.18)'); grd.addColorStop(1, 'rgba(255,140,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function ringTexture() {                       // glowing ring with a paw print, for the ground
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(255,190,40,1)'; g.shadowBlur = 18;
  g.strokeStyle = 'rgba(255,214,90,1)'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,214,90,0.9)';
  g.beginPath(); g.ellipse(128, 146, 30, 24, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y, r] of [[90, 120, 11], [110, 98, 11], [146, 98, 11], [166, 120, 11]]) {
    g.beginPath(); g.ellipse(x, y, r, r * 1.25, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

export function createGoldenBones({ scene, renderer, placements, config = {} }) {
  const C = { ...GOLDEN_BONE, ...config };
  const group = new THREE.Group(); group.name = 'GoldenBones'; scene.add(group);
  const disposables = [];
  const glowTex = glowTexture(), ringTex = ringTexture(), dotTex = dotTexture();
  disposables.push(glowTex, ringTex, dotTex);
  const add = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false };
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc040, opacity: 0.85, ...add });
  const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, color: 0xffb830, opacity: 0.9, side: THREE.DoubleSide, ...add });
  const sparkMat = new THREE.PointsMaterial({ map: dotTex, color: 0xffd65a, size: 0.22, sizeAttenuation: true, ...add });
  disposables.push(glowMat, ringGeo, ringMat, sparkMat);

  const SPARKS = 14;
  const bones = placements.map((p, i) => {
    const holder = new THREE.Group();
    holder.position.set(p.x, p.y, p.z);
    group.add(holder);
    const pivot = new THREE.Group(); pivot.position.y = C.floatHeight; holder.add(pivot);
    const glow = new THREE.Sprite(glowMat.clone()); glow.scale.setScalar(C.scale * 1.6); pivot.add(glow);
    const flash = new THREE.Sprite(glowMat.clone()); flash.visible = false; pivot.add(flash);
    disposables.push(glow.material, flash.material);
    const ring = new THREE.Mesh(ringGeo, ringMat.clone()); ring.position.y = 0.06; ring.scale.setScalar(C.scale * 1.5);
    disposables.push(ring.material); holder.add(ring);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
    const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; holder.add(sparks);
    disposables.push(sparkGeo);
    const seeds = Array.from({ length: SPARKS }, (_, k) => ({ a: k / SPARKS * Math.PI * 2, r: 0.9 + Math.random() * 0.6, h: Math.random(), v: 0.4 + Math.random() * 0.5 }));
    return { holder, pivot, glow, flash, ring, sparks, seeds, model: null, phase: i * 1.7,
      state: 'idle', stateTime: 0, base: new THREE.Vector3(p.x, p.y, p.z) };
  });

  // golden trail behind the dog while boosted (vertex colours fade to black = fade out under additive)
  const TRAIL = 260;           // shared by every boosting dog on screen
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 3), 3));
  trailGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 3), 3));
  const trailMat = new THREE.PointsMaterial({ map: dotTex, size: 0.35, vertexColors: true, ...add });
  const trail = new THREE.Points(trailGeo, trailMat); trail.frustumCulled = false; group.add(trail);
  const trailLife = new Float32Array(TRAIL), trailVel = new Float32Array(TRAIL * 3);
  let trailNext = 0, trailCarry = 0;
  disposables.push(trailGeo, trailMat);

  // the bone's gold needs something to reflect: the game has no environment map, so give the
  // bone alone a small built-in room
  let envTex = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose(); disposables.push(envTex);
  }

  let disposed = false;
  new GLTFLoader().loadAsync(C.model).then(gltf => {
    if (disposed) return;
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (envTex) { m.envMap = envTex; m.envMapIntensity = 1.3; }
        if (m.name === 'Gold') { m.emissive.set(0xffa21f); m.emissiveIntensity = 0.35; }
        m.needsUpdate = true; disposables.push(m);
      }
      disposables.push(o.geometry);
    });
    for (const b of bones) {
      b.model = gltf.scene.clone(true);
      b.model.scale.setScalar(C.scale);
      b.pivot.add(b.model);
    }
  }).catch(err => console.warn('[GoldenBones] model failed to load:', err));

  let boostStart = -Infinity;            // seconds (performance clock)
  const othersBoostStart = new Map();    // other dogs boosting: id -> start
  const now = () => performance.now() / 1000;

  function boostAmount(t = now(), start = boostStart) {      // 1 while boosted, easing to 0 afterwards
    const e = t - start;
    if (e < 0) return 0;
    if (e <= C.duration) return 1;
    return 1 - smooth((e - C.duration) / C.easeOut);
  }

  function emitTrail(pos, count) {
    const pa = trailGeo.attributes.position.array;
    for (let k = 0; k < count; k++) {
      const i = trailNext; trailNext = (trailNext + 1) % TRAIL;
      pa[i * 3] = pos.x + (Math.random() - 0.5) * 0.7;
      pa[i * 3 + 1] = pos.y + 0.4 + Math.random() * 1.0;
      pa[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.7;
      trailVel[i * 3] = (Math.random() - 0.5) * 0.8; trailVel[i * 3 + 1] = 0.6 + Math.random() * 0.8; trailVel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
      trailLife[i] = 0.6 + Math.random() * 0.3;
    }
  }

  const otherCarry = new Map();
  function updateTrail(delta, playerPosition, others) {
    const amount = boostAmount();
    if (amount > 0 && playerPosition) {
      trailCarry += delta * 70 * amount;
      const n = Math.floor(trailCarry); trailCarry -= n;
      if (n) emitTrail(playerPosition, n);
    }
    for (const [id, start] of othersBoostStart) {
      const a = boostAmount(now(), start), pos = others?.get(id);
      if (a <= 0) { othersBoostStart.delete(id); otherCarry.delete(id); continue; }
      if (!pos) continue;
      const carry = (otherCarry.get(id) ?? 0) + delta * 70 * a, n = Math.floor(carry);
      otherCarry.set(id, carry - n);
      if (n) emitTrail(pos, n);
    }
    const pa = trailGeo.attributes.position.array, ca = trailGeo.attributes.color.array;
    for (let i = 0; i < TRAIL; i++) {
      if (trailLife[i] > 0) {
        trailLife[i] = Math.max(0, trailLife[i] - delta);
        pa[i * 3] += trailVel[i * 3] * delta; pa[i * 3 + 1] += trailVel[i * 3 + 1] * delta; pa[i * 3 + 2] += trailVel[i * 3 + 2] * delta;
      }
      const f = Math.min(1, trailLife[i] / 0.6);
      ca[i * 3] = f; ca[i * 3 + 1] = 0.75 * f; ca[i * 3 + 2] = 0.25 * f;
    }
    trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
  }

  const flat = new THREE.Vector2();
  return {
    group, config: C,

    /** Animate, check for a pickup and run the trails. Returns true on the frame a bone is taken.
     *  others: Map of other dogs' positions (id -> Vector3), for their boost trails. */
    update(delta, playerPosition, canCollect = true, others = null) {
      const t = now();
      let collected = false;
      for (const b of bones) {
        b.stateTime += delta;
        const showing = b.state === 'idle' || b.state === 'respawn';
        // idle motion
        b.pivot.rotation.y += C.spinSpeed * delta;
        b.pivot.position.y = C.floatHeight + Math.sin(t * C.bobSpeed + b.phase) * C.bobHeight;
        b.glow.material.opacity = 0.55 + 0.2 * Math.sin(t * 3 + b.phase);
        const sp = b.sparks.geometry.attributes.position.array;
        for (let k = 0; k < SPARKS; k++) {
          const s = b.seeds[k], a = s.a + t * s.v, h = (s.h + t * 0.25 * s.v) % 1;
          sp[k * 3] = Math.cos(a) * s.r * C.scale * 0.55; sp[k * 3 + 1] = 0.2 + h * (C.floatHeight + 0.8); sp[k * 3 + 2] = Math.sin(a) * s.r * C.scale * 0.55;
        }
        b.sparks.geometry.attributes.position.needsUpdate = true;

        if (b.state === 'idle' && canCollect && playerPosition) {
          flat.set(playerPosition.x - b.base.x, playerPosition.z - b.base.z);
          const dy = playerPosition.y - b.base.y;
          if (flat.length() < C.pickupRadius && dy > -1.5 && dy < C.floatHeight + 2) {
            b.state = 'collect'; b.stateTime = 0; collected = true;
            boostStart = t;
          }
        }
        // collect: bone pops and shrinks, a flash swells and fades, then everything hides
        if (b.state === 'collect') {
          const k = b.stateTime;
          if (b.model) b.model.scale.setScalar(C.scale * (1 + 0.3 * smooth(k / 0.06)) * (1 - smooth((k - 0.06) / 0.12)));
          b.flash.visible = true;
          b.flash.scale.setScalar(C.scale * (1.2 + 3.5 * smooth(k / 0.35)));
          b.flash.material.opacity = 1 - smooth(k / 0.35);
          if (k > 0.35) { b.state = 'hidden'; b.stateTime = 0; b.flash.visible = false; }
        }
        if (b.state === 'hidden' && b.stateTime >= C.respawnDelay + C.respawnFallback) { b.state = 'respawn'; b.stateTime = 0; }
        if (b.state === 'respawn') {
          const k = smooth(b.stateTime / 0.4);
          if (b.model) b.model.scale.setScalar(C.scale * k);
          b.flash.visible = b.stateTime < 0.4;
          b.flash.scale.setScalar(C.scale * 2.2 * k);
          b.flash.material.opacity = 0.8 * (1 - k);
          if (b.stateTime >= 0.4) { b.state = 'idle'; b.flash.visible = false; if (b.model) b.model.scale.setScalar(C.scale); }
        }
        const vis = b.state !== 'hidden';
        b.glow.visible = b.ring.visible = b.sparks.visible = vis && (showing || b.state === 'respawn');
        if (b.model) b.model.visible = vis;
      }
      updateTrail(delta, playerPosition, others);
      return collected;
    },

    /** The server says bone `index` was taken (by anyone): pop it.  True if it was still showing here. */
    take(index) {
      const b = bones[index];
      if (!b || b.state === 'collect' || b.state === 'hidden') return false;
      b.state = 'collect'; b.stateTime = 0;
      return true;
    },
    /** The server says bone `index` is back. */
    respawn(index) {
      const b = bones[index];
      if (!b || b.state === 'idle' || b.state === 'respawn') return;
      b.state = 'respawn'; b.stateTime = 0; b.flash.visible = false;
    },
    /** Another dog started a golden-bone boost: draw its trail. */
    showBoost(playerId) { othersBoostStart.set(playerId, now()); },
    stopBoost(playerId) { othersBoostStart.delete(playerId); },

    /** Multiplier for the dog's top speed right now (1 when not boosted). */
    speedMultiplier() { return 1 + (C.speedMultiplier - 1) * boostAmount(); },
    accelerationMultiplier() { return 1 + (C.accelerationMultiplier - 1) * boostAmount(); },
    /** Extra speed (m/s) to add the moment a bone is taken, for a dog whose sprint speed is given. */
    instantKick(sprintSpeed) { return sprintSpeed * (C.speedMultiplier - 1) * C.instantKick; },
    isBoosting() { return boostAmount() > 0; },
    /** Start a boost without a pickup on the road (the Golden Bone item). */
    startBoost() { boostStart = now(); },
    cancelBoost() { boostStart = -Infinity; },

    dispose() {
      disposed = true;
      scene.remove(group);
      for (const d of new Set(disposables)) d.dispose?.();
    },
  };
}
