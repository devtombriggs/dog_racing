// Kombu's Kelp Dive, as the players see it: fronds of seaweed burst out of the ground where he goes
// under, and again where he comes up (the server moves him: shared/specials.js KELP).
//
//   const kelp = createKelp({ scene });
//   kelp.burst([x, y, z]);                  // fronds come up here, wave, and sink away
//   each frame: kelp.update(delta);         kelp.dispose();
import * as THREE from 'three';

const FRONDS = 9;
const LIFE = 1.7;                  // seconds a clump lasts: up fast, a wave or two, down again

export function createKelp({ scene }) {
  const root = new THREE.Group(); root.name = 'Kelp'; scene.add(root);
  // one frond: a tall, tapering ribbon, wider in the middle, standing on its foot
  const frond = new THREE.PlaneGeometry(0.5, 4.2, 1, 10).translate(0, 2.1, 0);
  const at = frond.getAttribute('position');
  for (let i = 0; i < at.count; i++) { const t = at.getY(i) / 4.2; at.setX(i, at.getX(i) * (0.35 + 1.3 * Math.sin(Math.PI * Math.min(1, t * 0.95)))); }
  const materials = [0x2f7d3a, 0x3f9a46, 0x256b33].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 }));
  const clumps = [];

  return {
    burst(position) {
      const clump = new THREE.Group(); clump.position.fromArray(position);
      const fronds = Array.from({ length: FRONDS }, (_, k) => {
        const mesh = new THREE.Mesh(frond, materials[k % materials.length]), a = k / FRONDS * Math.PI * 2 + Math.random() * 0.4, r = 0.5 + Math.random() * 0.9;
        mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        mesh.rotation.y = -a + Math.PI / 2;
        mesh.userData = { height: 0.7 + Math.random() * 0.6, phase: Math.random() * 6.28, lean: 0.25 + Math.random() * 0.3 };
        clump.add(mesh); return mesh;
      });
      root.add(clump);
      clumps.push({ clump, fronds, age: 0 });
    },
    update(delta) {
      for (let i = clumps.length - 1; i >= 0; i--) {
        const c = clumps[i];
        c.age += delta;
        const k = c.age / LIFE, up = Math.min(1, k / 0.18) * Math.min(1, (1 - k) / 0.3);      // shoots up, sinks away
        for (const mesh of c.fronds) {
          const u = mesh.userData;
          mesh.scale.set(1, Math.max(0.001, up * u.height), 1);
          mesh.rotation.x = -u.lean * (0.6 + 0.4 * Math.sin(c.age * 7 + u.phase));             // leaning in over him, waving
        }
        if (k >= 1) { root.remove(c.clump); clumps.splice(i, 1); }
      }
    },
    dispose() {
      scene.remove(root);
      frond.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
