// The Yorkshire Dales — the look of it: green fells under a big sky, dry stone walls, meadows full of
// buttercups, heather on the tops, a village of stone cottages, field barns, sheep, a viaduct across
// the valley, the beck.  The track itself is shared/dalesData.js; the parts every kit map shares are
// in ../trackKit3d.js.
import * as THREE from 'three';
import { DALES as T, dalesHill } from '../../../shared/dalesData.js';
import { createKitWorld, rng, box, cyl, ball, cone, merge, paint, canvasTexture } from '../trackKit3d.js';

const S = T.samples;
const GRASS = 0x6fb34a, STONE = 0xa9a698, SLATE = 0x5d6470;
const LANE = { K: [0x8fa3a3, 0x86999a], A: [0xc9b78d, 0xc0ae84], B: [0x9ccb62, 0x93c259], C: [0xc9b78d, 0xbfad82], D: [0xd6d2c4, 0xcbc7b8], E: [0x9ccb62, 0x93c259], F: [0xb8b3a2, 0xaea998], G: [0x9ccb62, 0x93c259], H: [0xc9b78d, 0xbfad82], I: [0xd6d2c4, 0xcbc7b8], J: [0xc9b78d, 0xc0ae84] };
const walled = section => 'ACHJ'.includes(section);
const stones = (g) => {
  const r = rng(8); g.fillStyle = '#6f6c62'; g.fillRect(0, 0, 128, 64);
  for (let row = 0; row < 5; row++) for (let x = -10 + (row % 2) * 9; x < 128; ) { const w = 12 + r() * 16, v = 150 + Math.floor(r() * 50); g.fillStyle = `rgb(${v},${v - 4},${v - 14})`; g.fillRect(x + 1, row * 12 + 5, w - 2, 10); x += w; }
  g.fillStyle = '#8d8a7c'; for (let x = 0; x < 128; x += 9) g.fillRect(x + 1, 0, 7, 5);            // the coping stones on top
};

export const createDales = () => createKitWorld(T, {
  name: 'YorkshireDales', sunDirection: [0.4, 0.8, 0.35],
  sky: { top: 0x4f9fe8, horizon: 0xdff0fb, clouds: 0xffffff, cloudCount: 26 },
  ground: { color: 0x3f8a2a, y: -0.6 },
  road: { color: i => (T.depthAt(S.s[i]) > 0.05 ? 0x8a8676 : LANE[S.section[i]][Math.floor(i / 3) % 2]), side: GRASS, skirt: { out: 3.5, drop: 0.9 }, roughness: 0.9 },
  edges: [
    { height: 1.15, every: 6, size: [128, 64], skip: (s, side, section) => !walled(section), draw: stones, shadow: true },
    // across the open country: a post-and-rail fence
    { height: 1.0, every: 4, size: [64, 32], cutout: true, skip: (s, side, section) => walled(section), draw(g) { g.clearRect(0, 0, 64, 32); g.fillStyle = '#8a6a44'; g.fillRect(0, 0, 7, 32); g.fillRect(0, 6, 64, 4); g.fillRect(0, 18, 64, 4); } },
  ],
  start: { text: 'YORKSHIRE DALES', color: 0x7a6a52, background: '#f3ead2', ink: '#3c5a2a' },
  strips: { color: '#ffffff', background: 'rgba(60,120,50,0.9)' },
  // the goat path across the first hairpin: a dirt track between post-and-rail fences
  branch: { color: () => 0xa08c64, edges: [{ height: 1.0, every: 4, size: [64, 32], cutout: true, draw(g) { g.clearRect(0, 0, 64, 32); g.fillStyle = '#8a6a44'; g.fillRect(0, 0, 7, 32); g.fillRect(0, 6, 64, 4); g.fillRect(0, 18, 64, 4); } }] },
  water: { color: 0x6fb7d6 },
  env: { fog: [0xdff0fb, 260, 2600], background: 0xdff0fb, exposure: 1.0 },
  lights: { hemi: [0xf2fbff, 0x8fb86a, 1.6], sun: [0xfff6dc, 2.2] },

  build({ group, D, movers, herd, clear, beside, sign, add, keep, prop, terrain, band, animated }) {
    const r = rng(404), c = new THREE.Color(), heather = new THREE.Color(0x8d5aa6), rock = new THREE.Color(0xb9b6a8);
    // ---------- the fells
    // (the scar: over the cave the hill stands `cover` metres higher, with a sheer face at each end of it)
    const CAVE = T.cave, edge = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const scarAt = (x, z) => { const q = T.query(x, z), d = q.distance; return CAVE.cover * edge(-3, 3, T.along(q.s, CAVE.sStart)) * edge(-3, 3, -T.along(q.s, CAVE.sEnd)) * (1 - edge(44, 80, d)); };
    const ground = terrain({ size: 1560, cell: 7.5, centre: [-40, 0], height: (x, z) => dalesHill(x, z) + scarAt(x, z), blend: 42, gapDrop: 7,
      color(x, z, y) {
        if (y - dalesHill(x, z) > 3) return c.setRGB(0.5, 0.49, 0.43).lerp(heather, 0.12);
        const n = 0.5 + 0.5 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.09), high = Math.min(1, Math.max(0, (y - 26) / 22));
        c.setRGB(0.17 + 0.07 * n, 0.44 + 0.1 * n, 0.1 + 0.04 * n).lerp(heather, high * 0.5 * (n > 0.45 ? 1 : 0.2)).lerp(rock, high * (n < 0.22 ? 0.8 : 0));
        return c;
      } });
    const scatter = (count, margin, far, make, keepIf = () => true) => { const list = []; let tries = 0; while (list.length < count && tries++ < count * 30) { const x = -40 - far + r() * far * 2, z = -far + r() * far * 2; if (clear(x, z, margin) && keepIf(x, z)) list.push(make(x, ground(x, z), z)); } return list; };
    const one = (name, geo, x, y, z, turn = 0, size = 1) => herd(name, geo, [[x, y, z, turn, size]]);

    // ---------- flowers: thousands of them beside the lane, buttercups and daisies low down, heather on the tops
    const petal = hue => cone(0.12, 0.17, 5, hue, 0, 0.26, 0, Math.PI);
    const sorts = { buttercup: [], daisy: [], poppy: [], heather: [], bluebell: [] };
    for (let s = 0; s < T.length; s += 0.8) {
      if (T.isGap(s)) continue;
      const p = T.pointAt(s), high = p.y > 27, meadow = 'BEG'.includes(p.section), count = meadow ? 5 : 2;
      for (let k = 0; k < count; k++) {
        const side = r() < 0.5 ? -1 : 1, out = 1.0 + r() * r() * (meadow ? 26 : 12), [x, , z] = beside(s, side, out);
        if (!clear(x, z, 1)) continue;
        const pick = r(), sort = high ? (pick < 0.75 ? 'heather' : 'daisy') : pick < 0.5 ? 'buttercup' : pick < 0.75 ? 'daisy' : pick < 0.88 ? 'poppy' : 'bluebell';
        sorts[sort].push([x, ground(x, z), z, r() * 6, 0.8 + r() * 0.7]);
      }
    }
    for (const [sort, hue] of [['buttercup', 0xffd92e], ['daisy', 0xffffff], ['poppy', 0xe8362e], ['heather', 0xa25fc4], ['bluebell', 0x5b7fe8]]) herd(`Flowers_${sort}`, petal(hue), sorts[sort]).castShadow = false;
    // (and tall ones right at the wall foot: foxgloves)
    const foxglove = merge([cyl(0.04, 0.05, 1.3, 4, 0x4c8a3a, 0, 0.65, 0), ...[0, 1, 2, 3, 4].map(k => cone(0.13, 0.26, 5, 0xd65fa8, (k % 2 ? 0.1 : -0.1), 0.6 + k * 0.17, 0, Math.PI))]);
    const tall = []; for (let s = 6; s < T.length; s += 7) { if (T.isGap(s)) continue; const side = r() < 0.5 ? -1 : 1, [x, , z] = beside(s + r() * 5, side, 0.9 + r()); tall.push([x, ground(x, z), z, r() * 6, 0.8 + r() * 0.6]); }
    herd('Foxgloves', foxglove, tall);

    // ---------- trees, sheep on the hill, field barns, field walls
    const tree = merge([cyl(0.4, 0.6, 3.6, 6, 0x6b4a2c, 0, 1.8, 0), ball(2.9, 1, 0x3f8f3a, 0, 5.4, 0, 1, 0.9, 1), ball(2.0, 1, 0x4ba046, 1.3, 6.6, 0.5)]);
    herd('Trees', tree, scatter(90, 14, 700, (x, y, z) => [x, y - 0.2, z, r() * 6, 0.9 + r() * 1.1], (x, z) => ground(x, z) < 24));
    const sheepG = merge([ball(0.8, 1, 0xf4f1e6, 0, 1.05, 0, 0.85, 0.8, 1.25), ball(0.34, 1, 0x26262a, 0, 1.25, 1.05, 0.9, 1, 1.2), ...[[-0.35, -0.5], [0.35, -0.5], [-0.35, 0.55], [0.35, 0.55]].map(([x, z]) => cyl(0.09, 0.09, 0.6, 4, 0x26262a, x, 0.3, z))]);
    herd('Sheep_Grazing', sheepG, scatter(80, 10, 520, (x, y, z) => [x, y, z, r() * 6, 0.9 + r() * 0.3]));
    const barn = merge([box(7, 4.4, 11, STONE, 0, 2.2, 0), box(5.2, 0.5, 11.6, SLATE, -1.9, 5.3, 0, 0, 0, 0.6), box(5.2, 0.5, 11.6, SLATE, 1.9, 5.3, 0, 0, 0, -0.6), box(2.2, 2.8, 0.3, 0x5a3a22, 0, 1.4, 5.5)]);
    herd('Field_Barns', barn, scatter(9, 30, 480, (x, y, z) => [x, y - 0.4, z, r() * 6, 1], (x, z) => ground(x, z) < 30));
    const wallBit = box(0.7, 1.1, 6.2, 0x9a978a, 0, 0.45, 0), bits = [];
    for (let line = 0; line < 26; line++) {
      let x = -40 - 560 + r() * 1120, z = -560 + r() * 1120, yaw = r() * 6.28;
      for (let k = 0; k < 28; k++) { yaw += (r() - 0.5) * 0.25; x += Math.sin(yaw) * 6; z += Math.cos(yaw) * 6; if (clear(x, z, 9)) bits.push([x, ground(x, z), z, yaw, 1]); }
    }
    herd('Field_Walls', wallBit, bits).castShadow = false;

    // ---------- the village: cottages either side of the green, the church, the pub
    // (stone walls, a slate roof with a proper ridge to it, a chimney at each end, a front door, windows with white frames, and a garden wall)
    const WIDE = 13, DEEP = 9.5, EAVES = 7, RIDGE = 4.2;
    const gableEnd = (hue) => {        // the triangle of wall under the roof at each end, and the stone between them
      const x = WIDE / 2, z = DEEP / 2, h = RIDGE, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0, x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0, -x, 0, -z, -x, 0, z, -x, h, 0, x, 0, z, x, 0, -z, x, h, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(36), 2)); g.computeVertexNormals();
      return paint(g, hue).translate(0, EAVES, 0);
    };
    const windowAt = (x, y, z, turn = 0) => [box(2.1, 2.2, 0.24, 0xf7f4ea, 0, 0, 0), box(1.7, 1.8, 0.3, 0x86b4d4, 0, 0, 0), box(0.12, 1.8, 0.36, 0xf7f4ea, 0, 0, 0), box(1.7, 0.12, 0.36, 0xf7f4ea, 0, 0, 0), box(2.5, 0.22, 0.6, 0xd9d4c2, 0, -1.2, 0.1)].map(g => g.rotateY(turn).translate(x, y, z));
    const cottage = (wall, door) => {
      const slope = Math.atan(RIDGE / (DEEP / 2)), slab = Math.hypot(RIDGE, DEEP / 2) + 1.0, front = DEEP / 2 + 0.05;
      return merge([
        box(WIDE, EAVES, DEEP, wall, 0, EAVES / 2, 0), box(WIDE + 0.5, 2.4, DEEP + 0.5, 0x8d8a7c, 0, -1.0, 0), gableEnd(wall),
        // the roof: a slab down each side of the ridge, overhanging the walls all round
        ...[1, -1].map(side => box(WIDE + 1.0, 0.4, slab, SLATE, 0, EAVES + RIDGE / 2 + 0.05, side * (DEEP / 4 + 0.22), 0, side * slope)), box(WIDE + 1.1, 0.4, 0.7, 0x4a505a, 0, EAVES + RIDGE + 0.2, 0),
        ...[-1, 1].flatMap(end => [box(1.6, 3.4, 1.6, wall, end * (WIDE / 2 - 1.1), EAVES + RIDGE + 0.6, 0), box(1.9, 0.3, 1.9, 0x8d8a7c, end * (WIDE / 2 - 1.1), EAVES + RIDGE + 2.3, 0), cyl(0.3, 0.38, 0.8, 7, 0xb5613a, end * (WIDE / 2 - 1.1), EAVES + RIDGE + 2.8, 0)]),
        // the front: the door in a stone surround with a step up to it, a window either side and three upstairs
        box(1.8, 3.6, 0.3, door, 0, 1.8, front), box(2.6, 0.5, 0.5, 0xd9d4c2, 0, 3.85, front), box(0.4, 3.6, 0.5, 0xd9d4c2, -1.1, 1.8, front), box(0.4, 3.6, 0.5, 0xd9d4c2, 1.1, 1.8, front), box(3.2, 0.3, 1.4, 0xb9b5a6, 0, 0.15, front + 0.6), ball(0.13, 0, 0xe8c24a, 0.55, 1.8, front + 0.2),
        ...windowAt(-3.9, 2.6, front), ...windowAt(3.9, 2.6, front), ...windowAt(-3.9, 5.5, front), ...windowAt(0, 5.5, front), ...windowAt(3.9, 5.5, front),
        ...windowAt(-3.2, 4.2, -front, Math.PI), ...windowAt(3.2, 4.2, -front, Math.PI),
        // the garden: a low wall with a gap for the gate, and something in flower along the front of the house
        box(WIDE / 2 - 1.2, 1.0, 0.6, 0x9a978a, -(WIDE / 4 + 0.6), 0.5, front + 3.4), box(WIDE / 2 - 1.2, 1.0, 0.6, 0x9a978a, WIDE / 4 + 0.6, 0.5, front + 3.4), box(0.6, 1.0, 3.4, 0x9a978a, -WIDE / 2, 0.5, front + 1.7), box(0.6, 1.0, 3.4, 0x9a978a, WIDE / 2, 0.5, front + 1.7),
        ...[-5.2, -3.6, -2.2, 2.2, 3.6, 5.2].map((x, k) => ball(0.55, 0, [0xe8362e, 0xffd92e, 0xd65fa8][k % 3], x, 0.5, front + 0.7, 1, 0.8, 1)),
      ]);
    };
    const homes = [[], [], []];
    for (let k = 0; k < 12; k++) { const side = k % 2 ? 1 : -1, s = -150 + k * 26, [x, , z, yaw] = beside(s, side, 12.5 + (k % 3) * 2.5); homes[k % 3].push([x, ground(x, z) - 0.2, z, yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 1]); }        // (front doors to the lane)
    [[0xd9cfb2, 0x2f6fb0], [0xe3d9be, 0xb5303a], [0xcdc4a8, 0x2f7a3a]].forEach(([wall, door], k) => herd(`Cottages_${k}`, cottage(wall, door), homes[k]));
    { const [x, , z, yaw] = beside(-40, 1, 46); one('Church', merge([box(9, 8, 20, STONE, 0, 4, 0), box(10, 0.6, 7, SLATE, 0, 10, -2.6, 0, 0.7), box(10, 0.6, 7, SLATE, 0, 10, 2.6, 0, -0.7), box(6.5, 17, 6.5, STONE, 0, 8.5, -12), ...[-1, 1].flatMap(a => [-1, 1].map(b => box(1, 1.6, 1, STONE, a * 2.7, 17.8, -12 + b * 2.7)))]), x, ground(x, z) - 0.3, z, yaw); }
    // ---------- the viaduct across the head of the valley
    const piers = [];
    for (let k = 0; k < 13; k++) { const x = -330 + k * 52, z = 392 + k * 4; piers.push(box(7, 46, 9, 0x8f8b7d, x, 23, z), ball(26, 1, 0x8f8b7d, x + 26, 46, z, 1, 0.42, 0.2)); }
    add('Viaduct', merge([...piers, box(700, 4, 10, 0x8f8b7d, -18, 50, 416, 0.077)]), prop);

    // ---------- the beck: down off the fell, through the ford and away
    { const mid = (T.ford.sStart + T.ford.sEnd) / 2, p = T.pointAt(mid), pos = [], idx = [];
      for (let k = -34; k <= 34; k++) { const d = k * 6, bend = Math.sin(k * 0.5) * 5; for (const w of [-3.6, 3.6]) { const x = p.x + p.nx * d + Math.sin(p.rotationY) * (w + bend), z = p.z + p.nz * d + Math.cos(p.rotationY) * (w + bend); pos.push(x, Math.abs(d) < p.halfWidth + 4 ? p.y - 0.3 : ground(x, z) + 0.12, z); } }
      for (let k = 0; k < 68; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      add('Beck', g, keep(new THREE.MeshStandardMaterial({ color: 0x6fb7d6, roughness: 0.1, transparent: true, opacity: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))); }
    // ---------- the stream: from the waterfall's pool down the beck, ankle deep over pebbles, with flat rocks out of it
    { const [a, b] = [T.indexAtS(T.stream.sStart), T.indexAtS(T.stream.sEnd)];
      const flow = canvasTexture(64, 64, (g) => { const q = rng(9); g.fillStyle = 'rgba(110,183,214,0.62)'; g.fillRect(0, 0, 64, 64); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${0.15 + q() * 0.35})`; g.fillRect(q() * 64, q() * 64, 2 + q() * 10, 1 + q() * 1.5); } }, true); D.push(flow);
      flow.repeat.set(2, 1);
      const water = add('Stream_Water', band(T, a, b, i => ({ lat: -S.width[i] / 2, y: S.y[i] + 0.03 }), i => ({ lat: S.width[i] / 2, y: S.y[i] + 0.03 }), { every: 2 }),
        keep(new THREE.MeshStandardMaterial({ map: flow, color: 0xbfe6f5, roughness: 0.08, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
      water.renderOrder = 0;
      animated.push(t => { flow.offset.x = -t * 0.9; });
      // the rocks: a flat stone under each boost, its rim showing round the arrows
      // (a flattened stone 2.8 m across and 3.5 m long, its top just under the arrows)
      herd('Stream_Rocks', ball(1, 1, 0x9c9a8e, 0, 0, 0, 1, 0.1, 1.25), T.strips.filter(strip => strip.kind === 'rock').map((strip) => {
        const mid = (strip.sStart + strip.sEnd) / 2, p = T.pointAt(mid, (strip.latMin + strip.latMax) / 2);
        return [p.x, p.y - 0.22, p.z, p.rotationY, 2.8];
      }));
      // pebbles and reeds along the banks
      const reeds = []; for (let s = T.stream.sStart; s < T.stream.sEnd; s += 2.2) { const side = r() < 0.5 ? -1 : 1, [x, , z] = beside(s, side, 0.6 + r() * 3); if (clear(x, z, 0.6)) reeds.push([x, ground(x, z), z, r() * 6, 0.7 + r() * 0.6]); }
      herd('Reeds', merge([cyl(0.05, 0.07, 1.6, 4, 0x5f8a3a, 0, 0.8, 0), cyl(0.05, 0.07, 1.3, 4, 0x6f9a42, 0.2, 0.65, 0.1, 0.2), cyl(0.12, 0.12, 0.4, 5, 0x6b4a2c, 0, 1.55, 0)]), reeds).castShadow = false; }

    // ---------- on the lane: boulders on the tops, milk churns
    herd('Boulders', ball(1.25, 0, 0xb9b6a8, 0, 0.7, 0, 1.1, 0.9, 1), T.obstacles.filter(ob => ob.kind === 'boulder').map((ob, k) => [ob.x, ob.y, ob.z, k * 2, 1]));
    herd('Milk_Churns', merge([cyl(0.6, 0.7, 1.6, 10, 0xc9ced4, 0, 0.8, 0), cyl(0.35, 0.55, 0.5, 10, 0xc9ced4, 0, 1.8, 0), cyl(0.5, 0.5, 0.12, 10, 0xaab0b6, 0, 2.1, 0)]), T.obstacles.filter(ob => ob.kind === 'churn').map(ob => [ob.x, ob.y, ob.z, 0, 1]));
    // ---------- the scar, the cave through it and the waterfall
    { const [a, b] = [T.indexAtS(CAVE.sStart), T.indexAtS(CAVE.sEnd)], LIME = 0xcfcabc, DARK = 0x4b473f, half = i => S.width[i] / 2 + 0.3;
      // inside: rock walls, a rock roof (the hill's own ground runs down to the lane here, so the cave is built, and roofed over)
      const rockTex = canvasTexture(128, 128, (g) => { const q = rng(21); g.fillStyle = '#6a655a'; g.fillRect(0, 0, 128, 128); for (let k = 0; k < 260; k++) { const v = 70 + Math.floor(q() * 70); g.fillStyle = `rgb(${v},${v - 3},${v - 10})`; g.fillRect(q() * 128, q() * 128, 6 + q() * 20, 3 + q() * 9); } }, true); D.push(rockTex);
      const inside = keep(new THREE.MeshStandardMaterial({ color: 0x8a8578, map: rockTex, roughness: 1, side: THREE.DoubleSide }));
      for (const side of [-1, 1]) add('Cave_Wall', band(T, a, b, i => ({ lat: side * half(i), y: S.y[i] - 0.5 }), i => ({ lat: side * (half(i) - 1.6), y: S.y[i] + CAVE.roof }), { every: 9 }), inside);
      add('Cave_Roof', band(T, a, b, i => ({ lat: -half(i) + 1.6, y: S.y[i] + CAVE.roof }), i => ({ lat: half(i) - 1.6, y: S.y[i] + CAVE.roof }), { every: 9 }), inside);
      // outside: the top of the scar, laid over the cave from one face to the other, and down its sides into the hill
      const top = keep(new THREE.MeshStandardMaterial({ color: 0x86836f, roughness: 1, side: THREE.DoubleSide })), turf = keep(new THREE.MeshStandardMaterial({ color: 0x4f9632, roughness: 1, side: THREE.DoubleSide })), out = 56;
      add('Scar_Top', band(T, a, b, i => ({ lat: -out, y: S.y[i] + CAVE.cover - 1 }), i => ({ lat: out, y: S.y[i] + CAVE.cover - 1 })), turf);
      for (const side of [-1, 1]) add('Scar_Side', band(T, a, b, i => ({ lat: side * out, y: S.y[i] + CAVE.cover - 1 }), i => ({ lat: side * (out + 6), y: S.y[i] + CAVE.cover - 12 })), top);
      // a face of limestone at each end, with the way in (or out) through the foot of it: blocks, ledges, and an arch of stones
      const face = (hw) => { const q = rng(33), parts = [], wide = out + 8, high = CAVE.cover + 2, gap = hw + 0.9;
        for (const side of [-1, 1]) parts.push(box(wide - gap, high + 6, 5, LIME, side * (gap + wide) / 2, high / 2 - 3, -2.6));
        parts.push(box(gap * 2, high - CAVE.roof, 5, LIME, 0, (high + CAVE.roof) / 2, -2.6));
        for (let k = 0; k < 40; k++) { const x = (q() - 0.5) * 2 * wide, y = q() * (high - 2); if (Math.abs(x) < gap + 1.5 && y < CAVE.roof + 1.5) continue; parts.push(box(5 + q() * 9, 1.6 + q() * 3.2, 1.5 + q() * 1.6, q() < 0.5 ? 0xdcd7c8 : 0xbdb8a8, x, y, 0.2 + q() * 0.8)); }
        for (let k = 0; k <= 8; k++) { const t = Math.PI * k / 8; parts.push(box(2.3, 1.7, 1.6, 0xa9a595, -Math.cos(t) * (gap + 0.4), Math.min(CAVE.roof, 1) + Math.sin(t) * (CAVE.roof - 0.4), 0.9, 0, 0, t - Math.PI / 2)); }
        parts.push(box(gap * 2, 0.4, 6, DARK, 0, CAVE.roof + 0.1, -2.6));
        return merge(parts); };
      const mouth = T.pointAt(CAVE.sStart), exit = T.pointAt(CAVE.sEnd);
      one('Scar_Face', face(mouth.halfWidth), mouth.x, mouth.y, mouth.z, mouth.rotationY + Math.PI);
      one('Fall_Face', face(exit.halfWidth), exit.x, exit.y, exit.z, exit.rotationY);
      // rocks at the foot of each face, and glow-worms down the roof so the way through can be seen
      const foot = [];
      for (const [p, way] of [[mouth, -1], [exit, 1]]) for (let k = 0; k < 26; k++) { const d = (k - 13) * 4.4, x = p.x + p.nx * d + Math.sin(p.rotationY) * way * (2 + r() * 5), z = p.z + p.nz * d + Math.cos(p.rotationY) * way * (2 + r() * 5); if (Math.abs(d) < p.halfWidth + 2) continue; foot.push([x, ground(x, z) - 0.6, z, r() * 6, 1.6 + r() * 2.2]); }
      herd('Scar_Rocks', ball(1, 0, LIME, 0, 0.5, 0, 1, 1.3, 1), foot);
      const worms = []; for (let s = CAVE.sStart + 5, k = 0; s < CAVE.sEnd - 4; s += 3.2, k++) { const p = T.pointAt(s, (r() - 0.5) * 9); worms.push([p.x, p.y + CAVE.roof - 0.25 - r() * 0.5, p.z, 0, 0.5 + r()]); }
      herd('Glow_Worms', ball(0.16, 0, 0x9ff7c8), worms, keep(new THREE.MeshBasicMaterial({ vertexColors: true }))).castShadow = false;
      const lamps = []; for (let s = CAVE.sStart + 10, k = 0; s < CAVE.sEnd - 6; s += 16, k++) { const side = k % 2 ? 1 : -1, c = T.pointAt(s), p = T.pointAt(s, side * (c.halfWidth - 1.3)); lamps.push([p.x, c.y + 3.2, p.z, c.rotationY, 1]); }
      herd('Cave_Lanterns', merge([box(0.5, 0.7, 0.5, 0xffd27a, 0, 0, 0), box(0.6, 0.12, 0.6, 0x3a2f24, 0, 0.42, 0), box(0.6, 0.12, 0.6, 0x3a2f24, 0, -0.42, 0)]), lamps, keep(new THREE.MeshBasicMaterial({ vertexColors: true }))).castShadow = false;

      // the waterfall: over the top of the face and down across the way out, into the pool; the beck it came down runs to the edge above
      const fallTex = canvasTexture(64, 256, (g) => { const q = rng(5); g.clearRect(0, 0, 64, 256); g.fillStyle = 'rgba(150,205,235,0.62)'; g.fillRect(0, 0, 64, 256); for (let k = 0; k < 150; k++) { g.fillStyle = `rgba(255,255,255,${0.25 + q() * 0.6})`; g.fillRect(q() * 64, q() * 256, 1.5 + q() * 3, 20 + q() * 70); } }, true); D.push(fallTex);
      const fallM = keep(new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })), wide = exit.halfWidth * 2 + 5, high = CAVE.cover + 2.5;
      fallTex.repeat.set(wide / 5, 1.6);
      const sheet = new THREE.Group(); sheet.position.set(exit.x, exit.y, exit.z); sheet.rotation.y = exit.rotationY; sheet.name = 'Waterfall'; group.add(sheet);
      const fallG = new THREE.PlaneGeometry(wide, high + 0.8), lipG = new THREE.PlaneGeometry(wide, 16).rotateX(-Math.PI / 2); D.push(fallG, lipG);
      const curtain = new THREE.Mesh(fallG, fallM); curtain.position.set(0, high / 2 - 0.4, 1.9); curtain.renderOrder = 3; sheet.add(curtain);
      const over = new THREE.Mesh(lipG, keep(new THREE.MeshStandardMaterial({ color: 0x6fb7d6, roughness: 0.1, transparent: true, opacity: 0.85 }))); over.position.set(0, high + 0.05, -6); sheet.add(over);
      // white water where it lands, and the spray
      const foamG = new THREE.IcosahedronGeometry(1, 1), foamM = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false })); D.push(foamG);
      const foam = Array.from({ length: 12 }, (_, k) => { const m = new THREE.Mesh(foamG, foamM); m.position.set((k - 5.5) * wide / 12, -0.2, 2.2 + (k % 3) * 0.9); sheet.add(m); return m; });
      animated.push(t => { fallTex.offset.y = t * 1.5; foam.forEach((m, k) => { const b = 0.75 + 0.35 * Math.sin(t * 5 + k * 1.7); m.scale.set(1.3 * b, 0.7 * b, 1.1 * b); }); });
      // the pool spreads either side of the lane, and its water runs off downhill as a beck
      const mid = T.pointAt((T.plunge.sStart + T.plunge.sEnd) / 2), pool = add('Plunge_Pool', new THREE.CircleGeometry(1, 30).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: 0x6fb7d6, roughness: 0.08, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
      pool.position.set(mid.x, mid.y - 0.28, mid.z); pool.scale.set(24, 1, 17); pool.rotation.y = mid.rotationY; }

    // ---------- what moves: the cheeses rolling down the Long Pull, the sheep crossing
    const cheeseG = merge([cyl(T.cheeseRun.radius, T.cheeseRun.radius, 0.7, 18, 0xf2c94c, 0, 0, 0, 0, Math.PI / 2), cyl(T.cheeseRun.radius * 0.55, T.cheeseRun.radius * 0.55, 0.74, 14, 0xe8b23a, 0, 0, 0, 0, Math.PI / 2), box(0.76, 0.5, 0.5, 0xd8232f, 0, T.cheeseRun.radius * 0.6, 0)]); D.push(cheeseG);
    [...T.cheeseRun.lanes.map((_, k) => k), 'goat'].forEach((k) => {
      const cheese = new THREE.Mesh(cheeseG, prop); cheese.rotation.order = 'YXZ'; cheese.castShadow = true; cheese.name = 'Cheese'; group.add(cheese);
      movers[`cheese-${k}`] = h => { cheese.visible = h.fade > 0.01; cheese.position.set(h.x, h.y + T.cheeseRun.radius, h.z); cheese.rotation.set(-h.spin, h.rotationY, 0); cheese.scale.setScalar(0.5 + 0.5 * h.fade); };
    });
    D.push(sheepG);
    T.flocks.forEach((_, k) => { for (let n = 0; n < 3; n++) {
      const sheep = new THREE.Mesh(sheepG, prop); sheep.castShadow = true; sheep.name = 'Sheep'; group.add(sheep);
      movers[`sheep-${k}-${n}`] = h => { sheep.position.set(h.x, h.y + 0.08 * Math.abs(Math.sin(h.trot)), h.z); sheep.rotation.y = h.rotationY; };
    } });
    for (const [text, s, side] of [['BOOST UP THE HILL', T.pull.sStart - 20, 1], ['CHEESE!', T.pull.sStart + 6, -1], ['FORD', T.ford.sStart - 18, 1], ['SHEEP', T.flocks[0] - 22, 1], ['BOOST UP THE HILL', T.bank.sStart - 16, -1], ['THE CAVE', T.cave.sStart - 34, 1], ['GOAT PATH', T.goatPath.sStart - 14, T.goatPath.side], ['ROCK TO ROCK', T.stream.sStart + 2, 1]]) sign(text, s, side, '#f3ead2', '#3c5a2a');
  },
});
