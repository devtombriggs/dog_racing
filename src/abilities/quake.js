// Jazz's Earthquake, as the players see it (the server says who is slowed: shared/specials.js QUAKE): she rears
// up and comes down with both front paws, rings of dust run out across the ground from where she stands, the
// ground there is left cracked, the camera shakes, and every dog that is shaken shudders until it is over.
//
//   const quake = createQuake({ scene });
//   quake.stomp({ position: [x, y, z], avatar, slowed: [avatar, ...], slowedFor: [seconds, ...], seconds });     // avatar: Jazz (may be missing)
//   each frame: quake.update(delta);   then, once the camera has been placed:  quake.shake(camera);
//   quake.dispose();
import * as THREE from 'three';
import { QUAKE } from '../../shared/specials.js';

const RING = { seconds: 1.7, reach: 130, count: 3, gap: 0.22 };       // each ring runs out this far, one after another
const SHAKE = { seconds: 1.1, amount: 0.55 };

export function createQuake({ scene }) {
  const root = new THREE.Group(); root.name = 'Earthquake'; scene.add(root);
  const ringGeometry = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  const cracksGeometry = (() => {
    // a star of jagged cracks, flat on the ground
    const points = [];
    for (let k = 0; k < 9; k++) {
      let a = k / 9 * Math.PI * 2 + Math.random() * 0.4, r = 0.4, x = Math.cos(a) * r, z = Math.sin(a) * r;
      for (let n = 0; n < 6; n++) { a += (Math.random() - 0.5) * 0.9; r = 0.9 + Math.random() * 1.1; const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r; points.push(x, 0, z, nx, 0, nz); x = nx; z = nz; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); return g;
  })();
  const quakes = [];
  let shakeLeft = 0, clock = 0;

  function settle(dog) {
    if (!dog?.model) return;
    dog.model.position.set(0, 0, 0);
  }

  return {
    stomp({ position, avatar = null, slowed = [], slowedFor = [], seconds = QUAKE.seconds }) {
      const at = new THREE.Group(); at.position.fromArray(position); at.position.y += 0.12; root.add(at);
      const rings = Array.from({ length: RING.count }, () => {
        const material = new THREE.MeshBasicMaterial({ color: 0xd9c9a3, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeometry, material); ring.visible = false; ring.renderOrder = 2; at.add(ring); return ring;
      });
      const cracks = new THREE.LineSegments(cracksGeometry, new THREE.LineBasicMaterial({ color: 0x1c1712, transparent: true, opacity: 0 }));
      cracks.rotation.y = Math.random() * 6.28; at.add(cracks);
      quakes.push({ at, rings, cracks, avatar, slowed, slowedFor, seconds, t: 0, landed: false });
    },

    update(delta) {
      clock += delta;
      shakeLeft = Math.max(0, shakeLeft - delta);
      for (let i = quakes.length - 1; i >= 0; i--) {
        const q = quakes[i];
        q.t += delta;
        // Jazz: up on her hind legs, and down hard
        const model = q.avatar?.model;
        if (model && q.t < QUAKE.stompSeconds) {
          const up = q.t / QUAKE.stompAt;
          model.rotation.x = q.t < QUAKE.stompAt ? -0.75 * Math.sin(Math.min(1, up) * Math.PI * 0.5) ** 0.7 * (1 - up ** 6) : 0.12 * Math.sin((q.t - QUAKE.stompAt) / (QUAKE.stompSeconds - QUAKE.stompAt) * Math.PI);
          // (she turns about her hind paws, not her middle: lifted by as much as they would otherwise sink)
          model.position.y = Math.max(0, -Math.sin(model.rotation.x)) * 0.2 * model.scale.x;
        } else if (model && !q.settled) { q.settled = true; model.position.y = 0; }
        if (!q.landed && q.t >= QUAKE.stompAt) { q.landed = true; shakeLeft = SHAKE.seconds; }
        const since = q.t - QUAKE.stompAt;
        q.rings.forEach((ring, k) => {
          const f = (since - k * RING.gap) / RING.seconds;
          ring.visible = f > 0 && f < 1;
          if (ring.visible) { ring.scale.setScalar(1 + RING.reach * (1 - (1 - f) ** 2)); ring.material.opacity = 0.8 * (1 - f) ** 1.5; }
        });
        q.cracks.material.opacity = since > 0 ? 0.9 * Math.min(1, since * 8) * Math.max(0, 1 - since / q.seconds) : 0;
        q.cracks.scale.setScalar(1 + Math.min(1, Math.max(0, since) * 5) * 1.6);
        // every shaken dog shudders where it stands until it is over
        // (each for as long as it is slowed: shorter the further back it is)
        q.slowed.forEach((dog, n) => {
          if (!dog?.model) return;
          const lasts = q.slowedFor[n] ?? q.seconds;
          if (since > 0 && since < lasts) dog.model.position.x = 0.07 * dog.model.scale.x * Math.sin(clock * 46 + dog.model.id);
          else if (since >= lasts && since - delta < lasts) settle(dog);
        });
        if (since > Math.max(q.seconds, RING.seconds + RING.count * RING.gap)) {
          for (const ring of q.rings) ring.material.dispose();
          q.cracks.material.dispose();
          q.at.removeFromParent();
          quakes.splice(i, 1);
        }
      }
    },

    /** jolt the camera while the ground is shaking (call after the camera has been placed for this frame) */
    shake(camera) {
      if (shakeLeft <= 0) return;
      const k = SHAKE.amount * (shakeLeft / SHAKE.seconds) ** 1.5;
      camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; camera.position.z += (Math.random() - 0.5) * k * 0.6;
    },

    dispose() {
      for (const q of quakes) { for (const ring of q.rings) ring.material.dispose(); q.cracks.material.dispose(); for (const dog of q.slowed) settle(dog); }
      quakes.length = 0;
      root.removeFromParent(); ringGeometry.dispose(); cracksGeometry.dispose();
    },
  };
}
