// Rocky's Sheep Stampede, as the players see it: five woolly sheep galloping up the road (the server
// runs them and says where they are: shared/specials.js SHEEP).
//
//   const sheep = createSheep({ scene });
//   sheep.release([{ id, position, yaw }]);      // 'sheepReleased'
//   sheep.move([{ id, position, yaw }]);         // 'sheepMoved' (every server tick; drawn smoothly between)
//   sheep.gone(id, position, hit);               // 'sheepGone': a puff of wool where it was
//   each frame: sheep.update(delta);             sheep.dispose();
import * as THREE from 'three';

const PUFF_LIFE = 0.6;

export function createSheep({ scene }) {
  const root = new THREE.Group(); root.name = 'Sheep'; scene.add(root);
  const wool = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 1, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.9 });
  const body = new THREE.IcosahedronGeometry(1, 1);
  const leg = new THREE.CylinderGeometry(0.07, 0.06, 0.55, 6).translate(0, -0.275, 0);
  const head = new THREE.SphereGeometry(0.26, 10, 8);
  const ear = new THREE.SphereGeometry(0.1, 6, 5);
  const flock = new Map();           // id -> { group, legs, at (where it is drawn), target (where the server has it), yaw, t }
  const puffs = [];

  // One sheep, facing +Z, standing on the ground at its origin
  function build() {
    const group = new THREE.Group();
    const fleece = new THREE.Mesh(body, wool); fleece.scale.set(0.55, 0.5, 0.8); fleece.position.set(0, 0.95, 0); group.add(fleece);
    for (const [x, y, z, r] of [[0.25, 1.15, 0.3, 0.3], [-0.25, 1.15, 0.3, 0.3], [0.22, 1.18, -0.3, 0.32], [-0.22, 1.18, -0.3, 0.32], [0, 1.3, 0, 0.34], [0, 1.05, -0.7, 0.2]]) {
      const lump = new THREE.Mesh(body, wool); lump.scale.setScalar(r); lump.position.set(x, y, z); group.add(lump);
    }
    const face = new THREE.Mesh(head, dark); face.scale.set(0.85, 0.95, 1.25); face.position.set(0, 1.15, 0.92); group.add(face);
    const top = new THREE.Mesh(body, wool); top.scale.setScalar(0.24); top.position.set(0, 1.38, 0.8); group.add(top);
    for (const side of [-1, 1]) { const e = new THREE.Mesh(ear, dark); e.scale.set(1.6, 0.6, 1); e.position.set(side * 0.3, 1.25, 0.82); group.add(e); }
    const legs = [[0.26, 0.5], [-0.26, 0.5], [0.26, -0.5], [-0.26, -0.5]].map(([x, z]) => {
      const mesh = new THREE.Mesh(leg, dark); mesh.position.set(x, 0.58, z); group.add(mesh); return mesh;
    });
    group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { group, legs };
  }

  function puff(position) {
    const group = new THREE.Group(); group.position.fromArray(position); group.position.y += 0.9;
    const bits = Array.from({ length: 9 }, () => {
      const mesh = new THREE.Mesh(body, wool); mesh.scale.setScalar(0.18 + Math.random() * 0.16);
      mesh.userData.v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).multiplyScalar(5);
      group.add(mesh); return mesh;
    });
    root.add(group);
    puffs.push({ group, bits, age: 0 });
  }

  return {
    release(list) {
      for (const { id, position, yaw } of list) {
        const one = build();
        one.group.position.fromArray(position); one.group.rotation.y = yaw;
        root.add(one.group);
        flock.set(id, { ...one, at: new THREE.Vector3().fromArray(position), target: new THREE.Vector3().fromArray(position), yaw, t: Math.random() * 6 });
      }
    },
    move(list) {
      for (const { id, position, yaw } of list) {
        const one = flock.get(id);
        if (one) { one.target.fromArray(position); one.yaw = yaw; }
      }
    },
    gone(id, position) {
      const one = flock.get(id);
      if (!one) return;
      root.remove(one.group); flock.delete(id);
      puff(position ?? one.group.position.toArray());
    },
    update(delta) {
      const ease = 1 - Math.exp(-22 * delta);
      for (const one of flock.values()) {
        const { group } = one;
        one.at.lerp(one.target, ease);
        let turn = one.yaw - group.rotation.y; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        group.rotation.y += turn * ease;
        // a gallop: the pairs of legs swing against each other and the whole sheep bounds
        one.t += delta * 17;
        const swing = Math.sin(one.t);
        one.legs[0].rotation.x = one.legs[1].rotation.x = swing * 0.9;
        one.legs[2].rotation.x = one.legs[3].rotation.x = -swing * 0.9;
        group.position.copy(one.at);
        group.position.y += Math.abs(Math.sin(one.t)) * 0.18;
        group.rotation.x = Math.cos(one.t) * 0.08;
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += delta;
        for (const bit of p.bits) { bit.position.addScaledVector(bit.userData.v, delta); bit.userData.v.y -= 9 * delta; bit.scale.multiplyScalar(1 - 1.4 * delta); }
        if (p.age >= PUFF_LIFE) { root.remove(p.group); puffs.splice(i, 1); }
      }
    },
    dispose() {
      scene.remove(root);
      for (const g of [body, leg, head, ear]) g.dispose();
      wool.dispose(); dark.dispose();
    },
  };
}
