// The Boneyard — the look of it: rain, mud to the horizon, brown water, and bones.  The skeleton of
// something enormous lies down the middle of the lap with its ribs arching over the road; there are
// bones in heaps, bones half buried, skulls, dead trees, holes somebody has been digging, and lanterns
// to see it all by.  The track itself is shared/boneyardData.js; the parts every kit map shares are in
// ../trackKit3d.js.
import * as THREE from 'three';
import { BONEYARD as T } from '../../../shared/boneyardData.js';
import { createKitWorld, rng, box, cyl, ball, cone, torus, merge } from '../trackKit3d.js';

const S = T.samples;
const GROUND = -0.55, MUD = 0x5c4a36, BONE = 0xf2ecd8, OLD = 0xd9d0b2, WATER = 0xa58a55;
/** a bone lying along z, `long` metres from knob to knob */
const boneAlongZ = (long, thick, hue = BONE) => [cyl(thick, thick, long, 8, hue, 0, 0, 0, Math.PI / 2), ...[-1, 1].flatMap(end => [-1, 1].map(k => ball(thick * 1.7, 1, hue, k * thick * 1.05, 0, end * long / 2)))];

export const createBoneyard = () => createKitWorld(T, {
  name: 'Boneyard', sunDirection: [-0.3, 0.8, 0.4],
  sky: { top: 0x353b45, horizon: 0x7e858f, clouds: 0x50555e, cloudCount: 60 },
  ground: { color: MUD, roughness: 0.45, y: GROUND },       // (below the water in the pools, which lies 0.3 m under the road)
  road: { color: i => (T.depthAt(S.s[i]) > 0.05 ? 0x6a5236 : Math.floor(i / 3) % 2 ? 0x8a7052 : 0x80674b), side: MUD, bank: 9, groundY: GROUND - 0.05, roughness: 0.55 },
  // a fence of bones: a rail of long ones on crossed pairs
  edges: [{ height: 1.05, every: 3.2, size: [128, 64], cutout: true, draw(g) {
    g.clearRect(0, 0, 128, 64); g.strokeStyle = '#e9e2cc'; g.fillStyle = '#e9e2cc'; g.lineCap = 'round';
    const bone = (x0, y0, x1, y1, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); for (const [x, y] of [[x0, y0], [x1, y1]]) { g.beginPath(); g.arc(x - 2, y - 3, w * 0.8, 0, 7); g.arc(x + 2, y + 3, w * 0.8, 0, 7); g.fill(); } };
    bone(8, 12, 120, 12, 7); bone(40, 60, 88, 22, 6); bone(88, 60, 40, 22, 6);
  } }],
  start: { text: 'THE BONEYARD', color: 0xe9e2cc, background: '#3a2f24', ink: '#e9e2cc' },
  patches: { color: 0x241a10, roughness: 0.15 },
  water: { color: WATER },
  signPost: 0xe9e2cc,
  env: { fog: [0x79808a, 70, 700], background: 0x79808a, exposure: 1.08 },
  lights: { hemi: [0xdfe6f0, 0x8a7458, 2.1], sun: [0xe6ebf2, 1.5] },

  build({ group, D, movers, herd, clear, beside, sign, keep, prop, rain, animated }) {
    const r = rng(613);
    const scatter = (count, margin, far, make) => { const list = []; let tries = 0; while (list.length < count && tries++ < count * 40) { const x = (r() - 0.5) * far * 2, z = (r() - 0.5) * far * 1.3; if (clear(x, z, margin)) list.push(make(x, z)); } return list; };
    rain({ count: 2600, color: 0xd6e2f0, opacity: 0.7 });

    // ---------- the great skeleton: its spine down the middle of the lap, a rib over the road every few strides, its skull at the far end
    const spine = [];
    for (let x = -176; x <= 176; x += 11) spine.push([x, GROUND, 0, 0, 1]);
    herd('Vertebrae', merge([ball(4.2, 1, OLD, 0, 2.6, 0, 1, 0.85, 1.25), cone(1.3, 6, 6, OLD, 0, 7.2, 0), box(11, 1.3, 2.2, OLD, 0, 3.2, 0)]), spine);
    const ribs = [];
    for (const id of ['A', 'E']) for (const sec of T.sections.filter(q => q.id === id)) for (let s = sec.sStart + 10; s < sec.sEnd - 8; s += 15) { const p = T.pointAt(s); ribs.push([p.x, GROUND, p.z, p.rotationY, 1]); }
    herd('Ribs', torus(11.4, 0.62, OLD, 0, 0, 0, 0, 22), ribs);
    const skull = merge([ball(22, 2, OLD, 0, 15, 0, 1.25, 0.8, 0.95), box(26, 9, 24, OLD, 22, 8, 0), ball(5.4, 1, 0x1c1814, 12, 19, 10.5), ball(5.4, 1, 0x1c1814, 12, 19, -10.5), ball(2.4, 1, 0x1c1814, 33, 11, 3.2), ball(2.4, 1, 0x1c1814, 33, 11, -3.2),
      ...[-9, -4.5, 0, 4.5, 9].flatMap(z => [cone(1.5, 5, 5, BONE, 32, 1.6, z, Math.PI), cone(1.3, 4, 5, BONE, 26, 1.4, z + 2.2, Math.PI)])]);
    herd('Great_Skull', skull, [[222, 0, 0, 0, 1]]);
    // (its tail, off the other end)
    const tail = []; for (let k = 0; k < 9; k++) tail.push([-196 - k * 9, 0, Math.sin(k * 0.6) * 5, 0, 1 - k * 0.085]);
    herd('Tail', ball(3.4, 1, OLD, 0, 2, 0, 1.3, 0.8, 1), tail);

    // ---------- bones everywhere: heaps, bones sticking out of the mud, skulls
    const heap = merge([...boneAlongZ(3.4, 0.24).map(g => g.translate(0, 0.35, 0)), ...boneAlongZ(2.8, 0.22, OLD).map(g => g.rotateY(1.1).translate(0.4, 0.6, 0.2)), ...boneAlongZ(3.0, 0.22).map(g => g.rotateY(-0.8).rotateX(0.3).translate(-0.3, 0.9, 0)), ...boneAlongZ(2.2, 0.2, OLD).map(g => g.rotateY(2.2).translate(0.2, 1.15, -0.2))]);
    herd('Bone_Heaps', heap, scatter(150, 2.5, 420, (x, z) => [x, GROUND + 0.05, z, r() * 6, 0.9 + r() * 1.6]));
    const stuck = merge(boneAlongZ(3.2, 0.26).map(g => g.rotateX(Math.PI / 2 - 0.35).translate(0, 0.9, 0)));
    herd('Buried_Bones', stuck, scatter(170, 2, 420, (x, z) => [x, GROUND, z, r() * 6, 0.8 + r() * 1.8]));
    const dogSkull = merge([ball(0.8, 1, BONE, 0, 0.7, 0, 0.9, 0.85, 1.1), box(0.75, 0.55, 1.1, BONE, 0, 0.5, 1.1), ball(0.2, 0, 0x1c1814, 0.33, 0.85, 0.62), ball(0.2, 0, 0x1c1814, -0.33, 0.85, 0.62)]);
    herd('Skulls', dogSkull, scatter(70, 2, 380, (x, z) => [x, GROUND, z, r() * 6, 0.9 + r() * 1.4]));
    // big ones, further off: thigh bones standing like standing stones
    herd('Standing_Bones', merge(boneAlongZ(15, 1.0, OLD).map(g => g.rotateX(Math.PI / 2 - 0.12).translate(0, 6.6, 0))), scatter(26, 22, 520, (x, z) => [x, GROUND - 0.2, z, r() * 6, 0.8 + r() * 1.3]));
    // ---------- dead trees, puddles, holes with a spade in the heap beside them, lanterns
    const dead = merge([cyl(0.25, 0.6, 7, 6, 0x3a2f28, 0, 3.5, 0), cyl(0.12, 0.22, 4, 5, 0x3a2f28, 1.3, 6.4, 0, 0, -0.75), cyl(0.1, 0.2, 3.4, 5, 0x3a2f28, -1.1, 5.6, 0.2, 0, 0.8), cyl(0.07, 0.14, 2.4, 4, 0x3a2f28, 0.2, 7.8, -0.8, 0.7, 0)]);
    herd('Dead_Trees', dead, scatter(60, 9, 520, (x, z) => [x, GROUND, z, r() * 6, 0.9 + r() * 1.2]));
    const puddleG = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), puddles = herd('Puddles', puddleG, scatter(130, 3, 440, (x, z) => [x, GROUND + 0.03, z, r() * 6, 2 + r() * 7]), keep(new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.05 })));
    puddles.castShadow = false;
    const hole = merge([cyl(1.5, 1.2, 0.2, 12, 0x1c140c, 0, 0.02, 0), ball(1.3, 1, 0x5a452e, 2.3, 0.1, 0.4, 1.2, 0.6, 1), cyl(0.06, 0.06, 2.2, 5, 0x8a6a44, 2.4, 1.5, 0.4, 0, 0.3), box(0.5, 0.7, 0.08, 0x9aa3ad, 2.75, 0.6, 0.4, 0, 0, 0.3)]);
    herd('Dig_Holes', hole, scatter(46, 3.5, 400, (x, z) => [x, GROUND + 0.02, z, r() * 6, 0.9 + r() * 0.5]));
    const posts = [], lights = [];
    for (let s = 12; s < T.length; s += 34) { if (T.isGap(s)) continue; const [x, y, z, yaw] = beside(s, Math.round(s / 34) % 2 ? 1 : -1, 2.2); posts.push([x, y - 0.5, z, yaw, 1]); lights.push([x, y + 3.0, z, 0, 1]); }
    herd('Lantern_Posts', merge(boneAlongZ(3.6, 0.16, OLD).map(g => g.rotateX(Math.PI / 2).translate(0, 1.9, 0))), posts);
    herd('Lanterns', ball(0.42, 1, 0xffc85a), lights, keep(new THREE.MeshBasicMaterial({ vertexColors: true }))).castShadow = false;

    // ---------- what moves: the great bones rolling across, the mud spouts
    const rollerG = merge(boneAlongZ(T.rollerRun.half * 2, T.rollerRun.radius * 0.72)); D.push(rollerG);
    T.rollers.forEach((_, k) => {
      const bone = new THREE.Mesh(rollerG, prop); bone.rotation.order = 'YXZ'; bone.castShadow = true; bone.name = 'Rolling_Bone'; group.add(bone);
      movers[`roller-${k}-1`] = h => { bone.visible = h.fade > 0.01; bone.position.set(h.x, h.y + T.rollerRun.radius, h.z); bone.rotation.set(0, h.rotationY, h.spin); bone.scale.setScalar(0.5 + 0.5 * h.fade); };
    });
    const bubbleG = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), jetG = new THREE.CylinderGeometry(0.7, 1.5, 1, 10).translate(0, 0.5, 0), capG = new THREE.IcosahedronGeometry(1.6, 1); D.push(bubbleG, jetG, capG);
    const mudM = keep(new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.25 })), bubbleM = keep(new THREE.MeshStandardMaterial({ color: 0x20160c, roughness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    T.spouts.forEach((_, k) => {
      const ring = new THREE.Mesh(bubbleG, bubbleM), jet = new THREE.Mesh(jetG, mudM), cap = new THREE.Mesh(capG, mudM); ring.name = 'Mud_Bubbles'; jet.name = 'Mud_Spout'; group.add(ring, jet, cap);
      movers[`spout-${k}`] = (h, t) => {
        ring.position.set(h.x, h.y + 0.07, h.z); ring.scale.setScalar(T.spoutRun.radius * (h.blow >= 0 ? 1 : 0.55 + 0.45 * h.warn + 0.06 * Math.sin(t * 22)));
        const up = h.blow >= 0 ? Math.sin(Math.PI * Math.min(1, h.blow * 1.15)) : 0;
        jet.visible = cap.visible = up > 0.02; jet.position.set(h.x, h.y, h.z); jet.scale.set(1, 0.2 + up * 6.5, 1); cap.position.set(h.x, h.y + 0.4 + up * 6.5, h.z); cap.scale.setScalar(0.6 + up * 0.6);
      };
    });
    void animated; void cone; void box;
    for (const [text, s, side] of [['PUDDLE', T.water[0].sStart - 16, 1], ['SWIM!', T.water[1].sStart - 16, -1], ['ROLLING BONES', T.rollers[0] - 22, 1], ['MUD SPOUTS', T.spouts[0].s - 18, -1], ['SWIM!', T.water[2].sStart - 16, 1], ['MUD SPOUTS', T.spouts[3].s - 18, 1]]) sign(text, s, side, '#3a2f24', '#e9e2cc');
  },
});
