// Wendover Woods — the look of it: a real wood.  Oaks, beeches, birches and pines all round, ferns and bluebells under them,
// toadstools, the log cabin in the clearing, a giant fallen tree hollow enough to run through, the beck, the old oak at the
// hairpin, the Treetop Walk up in the branches, deer, and the fallen log with the ramp in front of it.  The track itself is
// shared/wendoverWoodsData.js; the parts every kit map shares are in ../trackKit3d.js.
import * as THREE from 'three';
import { WENDOVER_WOODS as T } from '../../../shared/wendoverWoodsData.js';
import { createKitWorld, rng, box, cyl, ball, cone, merge, canvasTexture } from '../trackKit3d.js';

const S = T.samples;
const EARTH = [0x7a5c3c, 0x735738], GRASS_ROAD = [0x6f9a45, 0x689340];
const woodsHill = (x, z) => -4 + 4 * Math.sin(x / 70 + 0.6) * Math.cos(z / 83) + 2.2 * Math.sin((x - z) / 41);

export const createWendoverWoods = () => createKitWorld(T, {
  name: 'WendoverWoods', sunDirection: [0.35, 0.85, 0.3],
  sky: { top: 0x6fb2e8, horizon: 0xe4f1ea, clouds: 0xffffff, cloudCount: 20 },
  ground: { color: 0x3d6a2c, y: -12 },
  road: { color: i => (T.depthAt(S.s[i]) > 0.05 ? 0x6b6a5a : 'AI'.includes(S.section[i]) ? GRASS_ROAD[Math.floor(i / 3) % 2] : S.section[i] === 'C' ? 0x5a3f28 : EARTH[Math.floor(i / 3) % 2]),
    side: 0x456b2f, skirt: { out: 3, drop: 0.8 }, roughness: 0.95 },
  edges: [
    // a low split-rail fence, and the wood beyond it
    { height: 0.9, every: 4, size: [64, 32], cutout: true, draw(g) { g.clearRect(0, 0, 64, 32); g.fillStyle = '#6b4a2c'; g.fillRect(0, 0, 7, 32); g.fillStyle = '#7d5835'; g.fillRect(0, 8, 64, 5); g.fillRect(0, 20, 64, 5); } },
  ],
  start: { text: 'WENDOVER WOODS', color: 0x6b4a2c, background: '#efe4c8', ink: '#2f5a28' },
  strips: { color: '#ffffff', background: 'rgba(60,110,40,0.9)' },
  megaStrips: { color: '#ffffff', background: 'rgba(230,150,30,0.95)' },
  water: { color: 0x5f9fb4 },
  branch: { color: () => 0x8a6a44, edges: [{ height: 1.1, every: 3, size: [64, 32], cutout: true, draw(g) { g.clearRect(0, 0, 64, 32); g.fillStyle = '#5d4027'; g.fillRect(0, 0, 6, 32); g.strokeStyle = '#d8c79a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 6); g.quadraticCurveTo(32, 14, 64, 6); g.stroke(); g.beginPath(); g.moveTo(0, 18); g.quadraticCurveTo(32, 25, 64, 18); g.stroke(); } }] },
  env: { fog: [0xd6e8d8, 140, 1300], background: 0xd6e8d8, exposure: 1.0 },
  lights: { hemi: [0xeaf6ff, 0x5a7a3a, 1.6], sun: [0xfff2d6, 2.1] },

  build({ group, D, movers, herd, clear, beside, sign, add, keep, prop, terrain, animated }) {
    const r = rng(1466), field = new THREE.Color();
    const ground = terrain({ size: 1100, cell: 7, centre: [10, -223], height: woodsHill, blend: 34,
      color: (x, z) => { const n = 0.5 + 0.5 * Math.sin(x * 0.09) * Math.cos(z * 0.11); return field.setRGB(0.2 + 0.05 * n, 0.33 + 0.07 * n, 0.15 + 0.03 * n); } });
    const scatter = (count, margin, far, make, keepIf = () => true) => { const list = []; let tries = 0; while (list.length < count && tries++ < count * 25) { const x = 10 - far + r() * far * 2, z = -223 - far + r() * far * 2; if (clear(x, z, margin) && keepIf(x, z)) list.push(make(x, ground(x, z), z)); } return list; };

    // ---------- the wood: oaks, beeches, birches and pines, thick right up to the path
    const oak = merge([cyl(0.55, 0.85, 5, 7, 0x5d4027, 0, 2.5, 0), ball(3.6, 1, 0x3f7a2e, 0, 7, 0, 1, 0.85, 1), ball(2.6, 1, 0x4a8a34, 1.8, 8.2, 0.8), ball(2.4, 1, 0x356b28, -1.6, 7.8, -1)]);
    const beech = merge([cyl(0.45, 0.6, 7, 7, 0x8a8478, 0, 3.5, 0), ball(3.0, 1, 0x5f9a3a, 0, 9, 0, 1, 1.2, 1), ball(2.2, 1, 0x6aa842, 0.6, 11, 0.4)]);
    const birch = merge([cyl(0.22, 0.3, 8, 6, 0xeeeee6, 0, 4, 0), ...[1.5, 3, 4.6, 6].map(y => box(0.5, 0.12, 0.46, 0x2a2a2a, 0, y, 0)), ball(1.9, 1, 0x8cc455, 0, 8.6, 0, 1, 1.4, 1)]);
    const pine = merge([cyl(0.3, 0.45, 3, 6, 0x5d3f26, 0, 1.5, 0), cone(2.6, 5, 7, 0x24452c, 0, 4.6, 0), cone(2.0, 4.2, 7, 0x2b5234, 0, 7, 0), cone(1.3, 3.4, 7, 0x326040, 0, 9.2, 0)]);
    const near = (count, kind, margin, far, scale) => herd(kind.name, kind.geo, scatter(count, margin, far, (x, y, z) => [x, y - 0.2, z, r() * 6.28, scale()]));
    // (thickest near the path: a ring of trees close in all the way round, then the wood out to the hills)
    const edge = (count, kind, scale) => { const list = []; let tries = 0; while (list.length < count && tries++ < count * 20) { const s = r() * T.length, side = r() < 0.5 ? -1 : 1, [x, , z] = beside(s, side, 4 + r() * r() * 34); if (clear(x, z, 3.5) && !list.some(q => Math.abs(q[0] - x) + Math.abs(q[2] - z) < 4)) list.push([x, ground(x, z) - 0.2, z, r() * 6.28, scale()]); } return herd(kind.name, kind.geo, list); };
    edge(420, { name: 'Woods_Edge_Oaks', geo: oak }, () => 0.75 + r() * 0.6);
    edge(320, { name: 'Woods_Edge_Beeches', geo: beech }, () => 0.8 + r() * 0.5);
    edge(300, { name: 'Woods_Edge_Birches', geo: birch }, () => 0.8 + r() * 0.5);
    edge(260, { name: 'Woods_Edge_Pines', geo: pine }, () => 0.85 + r() * 0.7);
    near(380, { name: 'Woods_Oaks', geo: oak }, 9, 480, () => 0.8 + r() * 0.7);
    near(280, { name: 'Woods_Beeches', geo: beech }, 8, 480, () => 0.85 + r() * 0.5);
    near(220, { name: 'Woods_Birches', geo: birch }, 6, 460, () => 0.8 + r() * 0.5);
    near(320, { name: 'Woods_Pines', geo: pine }, 8, 520, () => 0.9 + r() * 0.8);
    // ---------- under the trees: ferns, bluebells (thickest down Bluebell Run), toadstools, stumps
    const fern = merge([0, 1, 2, 3, 4].map(k => box(0.25, 0.04, 1.4, 0x3f8a32, 0, 0.35, 0.55, k * 1.256, -0.5)));
    herd('Woods_Ferns', fern, scatter(700, 1.5, 420, (x, y, z) => [x, y, z, r() * 6.28, 0.7 + r() * 0.8])).castShadow = false;
    const bell = cone(0.1, 0.22, 5, 0x5b6fe8, 0, 0.2, 0, Math.PI), bells = [];
    for (let s = 0; s < T.length; s += 0.9) { const p = T.pointAt(s); const thick = p.section === 'B' ? 6 : 1; for (let k = 0; k < thick; k++) { const side = r() < 0.5 ? -1 : 1, [x, , z] = beside(s, side, 1 + r() * r() * 14); if (clear(x, z, 0.8)) bells.push([x, ground(x, z), z, r() * 6, 0.8 + r() * 0.6]); } }
    herd('Woods_Bluebells', bell, bells).castShadow = false;
    const toadstool = merge([cyl(0.08, 0.1, 0.4, 6, 0xf2ead8, 0, 0.2, 0), ball(0.26, 1, 0xd8232f, 0, 0.42, 0, 1, 0.55, 1), ball(0.05, 0, 0xffffff, 0.12, 0.5, 0.05), ball(0.05, 0, 0xffffff, -0.08, 0.52, -0.1)]);
    herd('Woods_Toadstools', toadstool, scatter(160, 1.2, 380, (x, y, z) => [x, y, z, r() * 6, 0.8 + r() * 1.2])).castShadow = false;
    herd('Woods_Stumps', merge([cyl(0.6, 0.75, 0.8, 8, 0x6b4a2c, 0, 0.4, 0), cyl(0.58, 0.58, 0.02, 8, 0xc9a070, 0, 0.81, 0)]), scatter(60, 3, 420, (x, y, z) => [x, y, z, r() * 6, 0.7 + r() * 0.6]));

    // ---------- the clearing: the log cabin and a woodpile
    { const [x, , z, yaw] = beside(-30, 1, 18), y = ground(x, z);
      const logs = []; for (let k = 0; k < 8; k++) for (const [lx, lz, len, turn] of [[0, -4, 10, Math.PI / 2], [0, 4, 10, Math.PI / 2], [-5, 0, 8, 0], [5, 0, 8, 0]]) logs.push(cyl(0.35, 0.35, len, 8, k % 2 ? 0x7a5232 : 0x6b4a2c, lx, 0.35 + k * 0.62, lz, turn === 0 ? Math.PI / 2 : 0, turn ? Math.PI / 2 : 0));
      const cabin = merge([...logs, box(11, 0.3, 9.6, 0x4a3a2a, 0, 5.4, -2.3, 0, 0.55), box(11, 0.3, 9.6, 0x4a3a2a, 0, 5.4, 2.3, 0, -0.55), box(1.6, 2.6, 0.3, 0x3a2a1a, 0, 1.3, 4.2), box(1.2, 1, 0.3, 0xffe9a8, 3, 2.6, 4.2), box(1.2, 1, 0.3, 0xffe9a8, -3, 2.6, 4.2), box(1, 3, 1, 0x8a8478, 3.5, 6, 0)]);
      herd('Woods_Cabin', cabin, [[x, y - 0.1, z, yaw + Math.PI, 1]]);
      const pile = []; for (let k = 0; k < 12; k++) pile.push(cyl(0.25, 0.25, 2, 7, 0x7a5232, (k % 4) * 0.5 - 0.75, 0.25 + Math.floor(k / 4) * 0.45, 0, Math.PI / 2));
      const [px, , pz] = beside(-10, 1, 6); herd('Woods_Woodpile', merge(pile), [[px, ground(px, pz), pz, yaw, 1]]); }

    // ---------- the hollow log: a giant fallen tree, the path running through the middle of it
    { const H = T.hollow, a = T.pointAt(H.sStart), b = T.pointAt(H.sEnd), long = H.sEnd - H.sStart, R = 6.2;
      const bark = canvasTexture(128, 128, (g) => { const q = rng(9); g.fillStyle = '#5a3f28'; g.fillRect(0, 0, 128, 128); for (let k = 0; k < 90; k++) { g.fillStyle = q() < 0.5 ? '#4a3220' : '#6b4a30'; g.fillRect(q() * 128, 0, 2 + q() * 4, 128); } }, true);
      bark.repeat.set(6, 4); D.push(bark);
      const tubeG = new THREE.CylinderGeometry(R, R, long, 28, 1, true).rotateX(Math.PI / 2), tubeM = keep(new THREE.MeshStandardMaterial({ map: bark, roughness: 1, side: THREE.DoubleSide }));
      const mid = T.pointAt((H.sStart + H.sEnd) / 2), tube = add('Hollow_Log', tubeG, tubeM);
      tube.position.set(mid.x, mid.y + R - 1.2, mid.z); tube.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const ringG = new THREE.TorusGeometry(R, 0.6, 8, 28); D.push(ringG);
      for (const end of [a, b]) { const ring = new THREE.Mesh(ringG, keep(new THREE.MeshStandardMaterial({ color: 0xc9a070, roughness: 0.9 }))); ring.position.set(end.x, mid.y + R - 1.2, end.z); ring.rotation.y = tube.rotation.y; group.add(ring); }
      // moss and toadstools on its back, roots at one end
      herd('Hollow_Log_Moss', ball(1.6, 1, 0x4f8a34, 0, 0, 0, 1.4, 0.35, 1), Array.from({ length: 9 }, (_, k) => { const p = T.pointAt(H.sStart + (k + 0.5) * long / 9); return [p.x, mid.y + R * 2 - 1.3, p.z, k, 1]; }));
      const roots = []; for (let k = 0; k < 7; k++) { const t = k / 7 * Math.PI * 2; roots.push(cyl(0.4, 0.8, 7, 6, 0x4a3220, Math.cos(t) * (R + 1), Math.sin(t) * (R + 1), 0, Math.PI / 2 + 0.4 * Math.cos(t), 0.4 * Math.sin(t))); }
      herd('Hollow_Log_Roots', merge(roots), [[a.x, mid.y + R - 1.2, a.z, tube.rotation.y, 1]]); }

    // ---------- the beck: banks of stones, and the water running away either side
    { const B = T.beck, mid = T.pointAt((B.sStart + B.sEnd) / 2), stones = [];
      for (let k = -30; k <= 30; k++) { if (Math.abs(k) < 2) continue; for (const side of [-1, 1]) { const d = k * 3, x = mid.x + mid.nx * d + Math.sin(mid.rotationY) * side * (9 + r() * 2), z = mid.z + mid.nz * d + Math.cos(mid.rotationY) * side * (9 + r() * 2); stones.push([x, ground(x, z) - 0.3, z, r() * 6, 0.6 + r() * 0.8]); } }
      herd('Beck_Stones', ball(1, 0, 0x8a8a7c, 0, 0, 0, 1.3, 0.6, 1), stones);
      const run = add('Beck_Water', new THREE.PlaneGeometry(16, 200).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: 0x5f9fb4, roughness: 0.1, transparent: true, opacity: 0.8 })));
      run.position.set(mid.x, mid.y - 0.45, mid.z); run.rotation.y = mid.rotationY + Math.PI / 2; }

    // ---------- the old oak at the hairpin: the biggest tree in the wood
    { const [cx, cz] = T.oak, y = ground(cx, cz);
      herd('Old_Oak', merge([cyl(2.2, 3.4, 12, 10, 0x4a3220, 0, 6, 0), ball(9, 1, 0x356b28, 0, 16, 0, 1.2, 0.8, 1.2), ball(6.5, 1, 0x3f7a2e, 6, 18, 3), ball(6, 1, 0x2f6224, -5, 17, -4), ...[0, 1, 2, 3, 4].map(k => cyl(0.4, 1.2, 6, 6, 0x4a3220, Math.cos(k * 1.26) * 3.5, 0.6, Math.sin(k * 1.26) * 3.5, 0, Math.PI / 2.6))]), [[cx, y - 0.3, cz, 0, 1]]); }

    // ---------- the Treetop Walk: trunks holding it up, and lanterns along it
    { const W = T.treetop, posts = [], lamps = [];
      for (let s = W.sStart + 8; s < W.sEnd - 8; s += 7) { const br = T.branchAt(s); if (!br || !br.open) continue; for (const edge of [-1, 1]) { const p = T.pointAt(s, br.side * (br.centre + edge * (br.half + 0.3))); posts.push([p.x, p.y + br.lift, p.z, 0, 1]); } const l = T.pointAt(s, br.side * br.centre); lamps.push([l.x, l.y + br.lift + 2.6, l.z, 0, 1]); }
      herd('Treetop_Posts', cyl(0.35, 0.45, 1, 6, 0x5d4027, 0, -0.5, 0), posts.map(([x, y, z]) => [x, y, z, 0, 1])).scale?.set?.(1, 1, 1);
      const trunks = posts.map(([x, y, z]) => { const g = ground(x, z); return [x, g, z, 0, 1, y - g]; });
      const trunkG = cyl(0.5, 0.7, 1, 7, 0x5d4027, 0, 0.5, 0); D.push(trunkG);
      const mesh = new THREE.InstancedMesh(trunkG, prop, trunks.length), o = new THREE.Object3D();
      trunks.forEach(([x, y, z, , , h], k) => { o.position.set(x, y, z); o.scale.set(1, Math.max(1, h), 1); o.updateMatrix(); mesh.setMatrixAt(k, o.matrix); });
      mesh.name = 'Treetop_Trunks'; mesh.castShadow = true; group.add(mesh); D.push(mesh);
      herd('Treetop_Lanterns', box(0.4, 0.5, 0.4, 0xffd27a, 0, 0, 0), lamps, keep(new THREE.MeshBasicMaterial({ vertexColors: true }))).castShadow = false; }

    // ---------- the fallen log across the path, and the ramp in front of it
    { const s = T.fallenLog.s, c = T.pointAt(s), R = T.fallenLog.radius;
      const logG = merge([cyl(R, R, c.halfWidth * 2 + 4, 10, 0x6b4a2c, 0, R, 0, 0, Math.PI / 2), cyl(R * 0.82, R * 0.82, c.halfWidth * 2 + 4.05, 10, 0xc9a070, 0, R, 0, 0, Math.PI / 2), cyl(0.15, 0.1, 1.4, 5, 0x5d3f26, 1.5, R * 2, 0.3, 0.4)]);
      herd('Fallen_Log', logG, [[c.x, c.y - 0.1, c.z, c.rotationY, 1]]);
      const k = T.pointAt(T.kicker), rampG = new THREE.BufferGeometry();
      rampG.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 1, -0.5, 0, 0, 0.5, 1, 1, -0.5, 1, 1, -0.5, 0, 1, 0.5, 0, 1, 0.5, 1, 1, -0.5, 0, 1, 0.5, 1, 1, -0.5, 1, 1], 3)); rampG.computeVertexNormals(); D.push(rampG);
      const ramp = new THREE.Mesh(rampG, keep(new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9, side: THREE.DoubleSide }))); ramp.position.set(k.x, k.y - 0.02, k.z); ramp.rotation.y = k.rotationY; ramp.scale.set(k.halfWidth * 2 - 1, 0.6, 5); ramp.name = 'Log_Ramp'; group.add(ramp); }

    // ---------- deer crossing Bluebell Run
    const deerG = merge([ball(0.7, 1, 0xa0683a, 0, 1.4, 0, 0.7, 0.65, 1.3), ball(0.32, 1, 0xa0683a, 0, 2.15, 0.95, 0.8, 0.9, 1.1), box(0.18, 0.7, 0.18, 0xa0683a, 0, 1.75, 0.75, 0, -0.5),
      ...[[-0.25, -0.6], [0.25, -0.6], [-0.25, 0.6], [0.25, 0.6]].map(([x, z]) => cyl(0.07, 0.06, 1.1, 5, 0x7a4a28, x, 0.55, z)), ball(0.12, 0, 0xffffff, 0, 1.45, -0.9),
      cyl(0.03, 0.03, 0.6, 4, 0x6b4a2c, 0.15, 2.6, 0.85, 0, -0.4), cyl(0.03, 0.03, 0.6, 4, 0x6b4a2c, -0.15, 2.6, 0.85, 0, 0.4)]); D.push(deerG);
    T.deer.forEach((_, k) => {
      const deer = new THREE.Mesh(deerG, prop); deer.castShadow = true; deer.name = 'Deer'; group.add(deer);
      movers[`deer-${k}`] = h => { deer.position.set(h.x, h.y + 0.12 * Math.abs(Math.sin(h.trot)), h.z); deer.rotation.y = h.rotationY; };
    });
    void animated;

    for (const [text, s, side] of [['DEER!', T.deer[0] - 26, 1], ['THE HOLLOW LOG', T.hollow.sStart - 26, -1], ['THE BECK', T.beck.sStart - 20, 1], ['THE OLD OAK', T.beck.sEnd + 30, -1],
      ['TREETOP WALK', T.treetop.sStart - 18, -1], ['LONG DRIFT', T.sections.find(sec => sec.id === 'G').sStart - 20, 1], ['JUMP THE LOG!', T.kicker - 30, 1]]) sign(text, s, side, '#efe4c8', '#2f5a28');
  },
});
