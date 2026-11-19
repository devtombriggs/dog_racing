// Kombu's House — the look of it: the drive up to a big stone house with green and cream gables, the
// conservatory and its sliding glass doors, and then the inside of it room by room (each with its own
// floor, walls, ceiling and doorway), the lift shaft, the floor above, and out on to the hill behind:
// the terrace, the dog pen, the chickens, the back drive and the main road along the wall.  The track
// itself is shared/kombuHouseData.js; the parts every kit map shares are in ../trackKit3d.js.
//
// Sides: a distance across the road is positive to the dogs' RIGHT.  A thing made to stand against a
// wall has its front at -x, and is turned half round when it stands against the right-hand wall.
import * as THREE from 'three';
import { KOMBU_HOUSE as T, PLAN } from '../../../shared/kombuHouseData.js';
import { createKitWorld, rng, box, cyl, ball, cone, torus, merge, paint, signTexture, canvasTexture } from '../trackKit3d.js';

const S = T.samples, N = T.sampleCount;
const LEFT = -1, RIGHT = 1;
const CEILING = 8, TOP = T.upstairs + CEILING + 1.5;
const STONE = 0xc4ab7c, STONE_DARK = 0xa89064, BRICK = 0x8f6248, TILE = 0x8e4636, CREAM = 0xece6cf, GREEN = 0x86b79c, WHITE = 0xf7f4ee, WOOD = 0x8a5a2b, STEEL = 0xb9c0c8, GRASS = 0x5f9a48;
const indoors = section => 'CDEFGHI'.includes(section);       // (the conservatory is glass: it is lit, and floored, like outdoors)
// map east and north (the plan in the track file) -> the game's x and z
const gx = east => -east * PLAN, gz = north => north * PLAN;
// the house: the main block, and the wing the computer room is in.  [east0, east1, north0, north1]
const MAIN = [-185, 40, 18, 222], WING = [-185, -50, 222, 284];
/** is (x, z) in the house?  shrink: only if it is this far in from the outside walls */
const inside = (x, z, shrink = 0) => [MAIN, WING].some(rect => { const [e0, e1, n0, n1] = rect, e = -x / PLAN, n = z / PLAN; return e > e0 + shrink && e < e1 - shrink && n > (rect === WING ? n0 - Math.abs(shrink) - 0.01 : n0 + shrink) && n < n1 - shrink; });
// the hill the house is built into: level at the front, 10 m up behind it
const hill = (x, z) => { const n = z / PLAN, e = -x / PLAN, rise = 10.6 * Math.min(1.25, Math.max(0, (n - 40) / 290)); return rise + (n > 380 || e < -230 || e > 150 ? 1.4 * Math.sin(e * 0.031) * Math.cos(n * 0.027) + 1 : 0); };

// each room's floor, in two shades so that it has a pattern running up it: [shade, shade, samples to a stripe]
const FLOORS = {
  A: [0x5d6066, 0x585b61, 3],            // the tarmac drive
  B: [0xc9825a, 0xe6d3b0, 1],            // the conservatory's tiles
  C: [0xa8473c, 0x9a3f35, 4],            // the living room carpet
  D: [0xd5edf3, 0xc3e2ea, 2],            // poolside tiles
  E: [0xa8473c, 0x9a3f35, 4],
  F: [0xf4f4f0, 0x39404d, 2],            // kitchen tiles, black and white
  G: [0x7c8794, 0x727d8a, 3],            // the lift lobby
  H: [0x2f7a5a, 0x2a6e51, 3],            // the hall runner
  I: [0x4a6fa5, 0x43669a, 2],            // carpet tiles
  J: [0xcfc5ae, 0xc2b79e, 2],            // the terrace's flagstones
  K: [0x6aa84f, 0x8a9a52, 3],            // the pen: grass, worn
  L: [0x63ad4c, 0x5ba345, 4],            // the hill
  M: [0x5d6066, 0x585b61, 3],            // the back drive
  N: [0x4c4f55, 0x484b51, 6],            // the main road
};
// walls, a room at a time: the bottom of the canvas is the bottom of the wall
const skirting = g => { g.fillStyle = '#ffffff'; g.fillRect(0, 116, 128, 12); };
const PAPER = {
  living(g) { g.fillStyle = '#efe2c6'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#d9c59a'; for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 5, 128); g.fillStyle = '#b98d5a'; g.fillRect(0, 70, 128, 5); skirting(g); },
  pool(g) { g.fillStyle = '#bfe9f2'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#ffffff'; g.lineWidth = 2; for (let x = 0; x <= 128; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); } for (let y = 0; y <= 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
    g.fillStyle = '#2b9fd0'; g.fillRect(0, 96, 128, 6); g.fillStyle = '#f7fbfd'; g.fillRect(36, 14, 56, 60); g.fillStyle = '#9fd4ee'; g.fillRect(40, 18, 48, 52); g.fillStyle = '#f7fbfd'; g.fillRect(62, 18, 4, 52); },
  kitchen(g) { g.fillStyle = '#fbe7b0'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ffffff'; g.fillRect(0, 64, 128, 64); g.strokeStyle = '#c9d3da'; g.lineWidth = 2; for (let x = 0; x <= 128; x += 16) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x, 128); g.stroke(); } for (let y = 64; y <= 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); } g.fillStyle = '#3f8f6a'; g.fillRect(0, 58, 128, 6); },
  hall(g) { g.fillStyle = '#e9e4d2'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#7fae95'; g.fillRect(0, 78, 128, 50); g.fillStyle = '#5d8f76'; for (let x = 0; x < 128; x += 32) g.fillRect(x + 4, 84, 24, 28); g.fillStyle = '#ffffff'; g.fillRect(0, 74, 128, 5); skirting(g); },
  computer(g) { g.fillStyle = '#dfe6ee'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#c3cfdc'; g.fillRect(0, 90, 128, 38); g.fillStyle = '#4a6fa5'; g.fillRect(0, 86, 128, 4); const r = rng(8); for (let k = 0; k < 5; k++) { g.fillStyle = ['#ffd23a', '#f06f6f', '#6fc6f0'][k % 3]; g.fillRect(8 + r() * 100, 14 + r() * 50, 10, 10); } skirting(g); },
};
const stones = (light, dark, mortar) => g => { const r = rng(21); g.fillStyle = mortar; g.fillRect(0, 0, 128, 64); for (let row = 0; row < 4; row++) for (let x = row % 2 ? -18 : 0; x < 128;) { const w = 24 + Math.floor(r() * 18); g.fillStyle = r() < 0.5 ? light : dark; g.fillRect(x + 1, row * 16 + 1, w - 2, 14); x += w; } };
const glazing = g => { g.clearRect(0, 0, 128, 128); g.fillStyle = '#9ccdb4'; g.fillRect(0, 0, 128, 7); g.fillRect(0, 64, 128, 5); for (const x of [0, 62, 122]) g.fillRect(x, 0, 6, 128); g.fillStyle = '#c4ab7c'; g.fillRect(0, 104, 128, 24); g.fillStyle = '#a89064'; g.fillRect(0, 104, 128, 3); };
const wire = g => { g.clearRect(0, 0, 64, 64); g.strokeStyle = '#9aa3ad'; g.lineWidth = 2; for (let k = -64; k < 128; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); } g.fillStyle = '#6b4a2c'; g.fillRect(0, 0, 6, 64); g.fillRect(0, 0, 64, 5); };
const rails = g => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#2b2f38'; for (let x = 4; x < 64; x += 12) g.fillRect(x, 6, 3, 58); g.fillRect(0, 6, 64, 4); g.fillRect(0, 52, 64, 3); };
const room = (sections, draw, upstairs = false) => ({ height: CEILING, every: 6, size: [128, 128], skip: (s, side, section) => !sections.includes(section), draw, upstairs });
const stoneWall = (sections, height, only = 0) => ({ height, every: 7, size: [128, 64], roughness: 1, skip: (s, side, section) => !sections.includes(section) || (only && side !== only), draw: stones('#c9b184', '#b39a6c', '#8d7a55') });

/** a gable: a triangle `wide` across and `high` tall, `deep` from front to back, standing on y = 0 with its ridge along z */
function gable(wide, high, deep, color, x = 0, y = 0, z = 0, ry = 0) {
  const w = wide / 2, d = deep / 2, v = [[-w, 0, d], [w, 0, d], [0, high, d], [-w, 0, -d], [w, 0, -d], [0, high, -d]], faces = [[0, 1, 2], [4, 3, 5], [1, 4, 5], [1, 5, 2], [3, 0, 2], [3, 2, 5], [0, 3, 4], [0, 4, 1]];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(faces.flatMap(f => f.flatMap(k => v[k])), 3)); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(faces.length * 6), 2));
  const out = paint(g, color); if (ry) out.rotateY(ry); return out.translate(x, y, z);
}

export const createKombuHouse = () => createKitWorld(T, {
  name: 'KombuHouse', sunDirection: [-0.35, 0.85, -0.4],
  sky: { top: 0x6fb4ea, horizon: 0xeef3f6, clouds: 0xffffff, cloudCount: 20 },
  road: {
    color: i => { if (T.depthAt(S.s[i]) > 0.05) return i % 4 < 2 ? 0x4fc3e8 : 0x45b8de; const [a, b, n] = FLOORS[S.section[i]]; return Math.floor(i / n) % 2 ? a : b; },
    side: i => (indoors(S.section[i]) ? 0x6b5a48 : 'AMN'.includes(S.section[i]) ? 0x7b7d82 : GRASS), shoulder: 0.7, roughness: 0.75,
  },
  edges: [
    room('CE', PAPER.living), room('D', PAPER.pool), room('F', PAPER.kitchen), room('GH', PAPER.hall), room('I', PAPER.computer),
    // the conservatory: glass in a pale green frame on a low stone wall
    { height: CEILING, every: 6, size: [128, 128], cutout: true, skip: (s, side, section) => section !== 'B', draw: glazing },
    // the drives: stone walls.  The main road: the big wall on the house's side, a kerb on the other
    stoneWall('AM', 2.2), stoneWall('N', 3.4, RIGHT),
    { height: 0.3, skip: (s, side, section) => section !== 'N' || side === RIGHT, color: 0xc9ced4 },
    // the terrace: railings.  The dog pen: wire.  The hill: a post and rail fence
    { height: 1.5, every: 2, size: [64, 64], cutout: true, skip: (s, side, section) => section !== 'J', draw: rails },
    { height: 3.2, every: 3, size: [64, 64], cutout: true, skip: (s, side, section) => section !== 'K', draw: wire },
    { height: 1.3, every: 4, size: [64, 64], cutout: true, skip: (s, side, section) => section !== 'L', draw(g) { g.clearRect(0, 0, 64, 64); g.fillStyle = '#8a6a44'; g.fillRect(0, 0, 7, 64); g.fillRect(0, 12, 64, 6); g.fillRect(0, 36, 64, 6); } },
  ],
  start: { text: 'KOMBU’S HOUSE', color: 0x5d8f76, background: '#5d8f76', ink: '#ffffff' },
  water: { color: 0x39bdf0 },
  env: { fog: [0xeef3f6, 200, 1700], background: 0xeef3f6, exposure: 1.0 },
  lights: { hemi: [0xfff8ec, 0xbfb59a, 1.7], sun: [0xfff1d6, 1.9] },

  build({ group, D, movers, animated, herd, beside, sign, add, keep, prop, band, terrain }) {
    const r = rng(27);
    const one = (name, geo, x, y, z, turn = 0, size = 1) => herd(name, geo, [[x, y, z, turn, size]]);
    /** a place on (or beside) the road: [x, y, z, rotationY] at s, `across` metres to the dogs' right of the middle */
    const at = (s, across = 0) => { const c = T.pointAt(s), p = T.pointAt(s, across); return [p.x, c.y, p.z, c.rotationY]; };
    const wallAt = (s, side, inFrom = 0) => { const c = T.pointAt(s); const [x, y, z, yaw] = at(s, side * (c.halfWidth - inFrom)); return [x, y, z, yaw + (side > 0 ? Math.PI : 0)]; };
    const span = id => { const sec = T.sections.find(q => q.id === id); return [sec.sStart, sec.sEnd]; };
    const nearDoor = (s, pad = 5) => T.doors.some(d => Math.abs(d.s - s) < pad);
    const sU = u => T.sAtU(u), P = T.places;

    // ---------- the ground: level in front of the house, rising to the hill behind it; nothing under the house itself
    const groundAt = terrain({
      size: 1500, cell: 7.5, centre: [gx(-20), gz(120)], near: 4, blend: 40,
      aloft: s => indoors(T.pointAt(s).section),
      height: (x, z) => { if (inside(x, z, 8)) return -2; const q = T.query(x, z); return 'CDEFG'.includes(q.section) && q.distance < q.halfWidth + 10 ? -2 : hill(x, z); },
      color: (x, z, y, d) => (inside(x, z, 2) ? 0x4a4338 : d < 1.2 ? 0x77935a : (Math.floor(x / 9) + Math.floor(z / 9)) % 2 ? 0x5f9a48 : 0x58913f),
    });

    // ---------- the house from outside: stone below, brick above, green and cream gables, a red tiled roof
    const shell = [];
    /** a length of outside wall between two places on the plan (east-west or north-south), in two storeys */
    const wall = (e0, n0, e1, n1, from = -2, to = TOP) => {
      const x = (gx(e0) + gx(e1)) / 2, z = (gz(n0) + gz(n1)) / 2, w = Math.abs(gx(e1) - gx(e0)) + 1.2, d = Math.abs(gz(n1) - gz(n0)) + 1.2, split = T.upstairs - 0.4;
      if (from < split) shell.push(box(w, Math.min(to, split) - from, d, STONE, x, (Math.min(to, split) + from) / 2, z));
      if (to > split) shell.push(box(w, to - Math.max(from, split), d, BRICK, x, (to + Math.max(from, split)) / 2, z));
    };
    const glassIn = T.pointAt(T.doors[0].s), glassOut = T.pointAt(T.doors[6].s);
    const doorE = -glassIn.x / PLAN, wayIn = 10 / PLAN, gapHalf = 7 / PLAN, outN = glassOut.z / PLAN, outTop = T.upstairs + 7.2;
    // the front, with the way in from the conservatory
    wall(MAIN[0], MAIN[2], doorE - wayIn, MAIN[2]); wall(doorE + wayIn, MAIN[2], MAIN[1], MAIN[2]); wall(doorE - wayIn, MAIN[2], doorE + wayIn, MAIN[2], T.floor + CEILING);
    wall(MAIN[1], MAIN[2], MAIN[1], MAIN[3]); wall(WING[1], MAIN[3], MAIN[1], MAIN[3]); wall(MAIN[0], MAIN[2], MAIN[0], WING[3]); wall(WING[0], WING[3], WING[1], WING[3]);
    // the wing's east wall, with the second glass doors in it
    wall(WING[1], WING[2], WING[1], outN - gapHalf); wall(WING[1], outN + gapHalf, WING[1], WING[3]); wall(WING[1], outN - gapHalf, WING[1], outN + gapHalf, -2, T.upstairs - 0.1); wall(WING[1], outN - gapHalf, WING[1], outN + gapHalf, outTop);
    const front = gz(MAIN[2]), mainX = (gx(MAIN[0]) + gx(MAIN[1])) / 2, mainZ = (gz(MAIN[2]) + gz(MAIN[3])) / 2, mainW = Math.abs(gx(MAIN[1]) - gx(MAIN[0])), mainD = gz(MAIN[3]) - gz(MAIN[2]);
    const wingX = (gx(WING[0]) + gx(WING[1])) / 2, wingZ = (gz(WING[2]) + gz(WING[3])) / 2, wingW = Math.abs(gx(WING[1]) - gx(WING[0])), wingD = gz(WING[3]) - gz(WING[2]);
    // the roofs, their eaves, the chimneys
    shell.push(gable(mainD + 6, 30, mainW + 6, TILE, mainX, TOP, mainZ, Math.PI / 2), gable(wingW + 6, 20, wingD + 8, TILE, wingX, TOP, wingZ + 2),
      box(mainW + 5, 0.8, mainD + 5, WHITE, mainX, TOP + 0.1, mainZ), box(wingW + 5, 0.8, wingD + 5, WHITE, wingX, TOP + 0.1, wingZ));
    for (const e of [-120, -30, 28]) shell.push(box(7, 16, 7, BRICK, gx(e), TOP + 22, gz(MAIN[2] + 60)), box(8, 1, 8, STONE_DARK, gx(e), TOP + 30.2, gz(MAIN[2] + 60)));
    // the two gables on the front: cream panels and green timbers
    for (const [e, wide, high] of [[14, 46, 18], [-52, 34, 13]]) {
      const x = gx(e), z = front - 1.6;
      shell.push(gable(wide, high, 60, TILE, x, TOP, front + 28), gable(wide - 3, high - 1.5, 0.6, CREAM, x, TOP + 0.2, z));
      // (the bargeboards, and the timbers standing in the panel: each as tall as the triangle is there)
      for (const k of [-1, 1]) shell.push(box(Math.hypot(wide / 2, high) + 1, 0.9, 0.9, GREEN, x + k * wide / 4, TOP + high / 2 + 0.3, z - 0.5, 0, 0, -k * Math.atan2(high, wide / 2)));
      for (let dx = -wide / 2 + 4; dx < wide / 2 - 2; dx += 3.6) { const h = (high - 1.5) * (1 - Math.abs(dx) / ((wide - 3) / 2)) - 0.8; if (h > 1) shell.push(box(0.7, h, 0.5, GREEN, x + dx, TOP + 0.3 + h / 2, z - 0.4)); }
      shell.push(box(wide - 1, 0.9, 1.2, GREEN, x, TOP + 0.3, z - 0.4), box(8, 5, 0.5, WHITE, x, TOP + 4.6, z - 0.6), box(6.8, 3.8, 0.6, 0x7fb2d6, x, TOP + 4.6, z - 0.65), box(0.4, 3.8, 0.7, WHITE, x, TOP + 4.6, z - 0.7));
    }
    // the bay: two storeys of windows standing out from the front, under the big gable
    { const x = gx(14), z = front - 3;
      shell.push(box(26, T.upstairs - 0.4 + 2, 5, STONE, x, (T.upstairs - 0.4 - 2) / 2, z), box(26, TOP - T.upstairs + 0.4, 5, BRICK, x, (TOP + T.upstairs - 0.4) / 2, z), box(27.5, 0.7, 6, WHITE, x, T.upstairs - 0.4, z), box(27.5, 0.7, 6, WHITE, x, TOP, z));
      for (const y of [4.6, T.upstairs + 4.6]) for (const dx of [-8, 0, 8]) shell.push(box(6.4, 6.6, 0.5, WHITE, x + dx, y, z - 2.5), box(5.4, 5.6, 0.6, 0x7fb2d6, x + dx, y, z - 2.55), box(5.4, 0.35, 0.7, WHITE, x + dx, y + 0.8, z - 2.6), box(0.35, 5.6, 0.7, WHITE, x + dx, y, z - 2.6)); }
    // the front door, on the right of the house as you come up the drive: a green door under a little tiled porch, a step, a path to it
    { const x = gx(33), z = front - 0.7;
      shell.push(box(6, 9, 0.6, 0x2f6b4f, x, 4.5, z), box(7.4, 10, 0.5, WHITE, x, 5, z + 0.2), box(4.4, 2.2, 0.7, 0x7fb2d6, x, 7.3, z - 0.1), ball(0.35, 1, 0xd9b44a, x - 2.2, 4.4, z - 0.5),
        box(10, 0.6, 5, STONE_DARK, x, 0.3, z - 2.6), gable(11, 3, 6, TILE, x, 10.2, z - 2.8), box(0.5, 10.2, 0.5, GREEN, x - 4.6, 5.1, z - 5), box(0.5, 10.2, 0.5, GREEN, x + 4.6, 5.1, z - 5)); }
    add('House', merge(shell), prop, { shadow: true });
    // windows round the rest of it
    const pane = merge([box(9, 7, 0.5, WHITE, 0, 0, 0), box(7.8, 5.8, 0.7, 0x7fb2d6, 0, 0, 0), box(0.4, 5.8, 0.9, WHITE, 0, 0, 0), box(7.8, 0.4, 0.9, WHITE, 0, 0, 0), box(10, 0.5, 1.4, STONE_DARK, 0, -3.7, 0)]), panes = [];
    for (let e = MAIN[0] + 14; e < MAIN[1] - 6; e += 21) { if (Math.abs(e - 14) > 22 && Math.abs(e - doorE) > 22 && Math.abs(e - 33) > 8) for (const y of [4.8, T.upstairs + 4.6]) panes.push([gx(e), y, front - 0.7, 0, 1]); if (e > WING[1] + 8) panes.push([gx(e), T.upstairs + 4.6, gz(MAIN[3]) + 0.7, 0, 1]); else panes.push([gx(e), T.upstairs + 4.6, gz(WING[3]) + 0.7, 0, 1]); }
    for (let n = MAIN[2] + 16; n < WING[3] - 8; n += 21) { if (n < MAIN[3] - 8) for (const y of [T.upstairs + 4.6, ...(hill(0, gz(n)) < 2 ? [4.8] : [])]) panes.push([gx(MAIN[1]) - 0.7, y, gz(n), Math.PI / 2, 1]); panes.push([gx(MAIN[0]) + 0.7, T.upstairs + 4.6, gz(n), Math.PI / 2, 1]); }
    herd('Windows', pane, panes);
    // ivy up the front, either side of the way in
    { const leaves = []; for (let k = 0; k < 150; k++) { const e = doorE + (r() < 0.5 ? -1 : 1) * (wayIn + 2 + r() * 16), y = r() * r() * 12; leaves.push([gx(e), y, front - 0.75, r() * 6, 0.7 + r() * 0.9]); } herd('Ivy', ball(1, 0, 0x3d7d3f, 0, 0, 0, 1, 1, 0.35), leaves); }

    // ---------- the conservatory: a glass roof, plants in pots, and the sliding glass doors
    const glassM = keep(new THREE.MeshStandardMaterial({ color: 0xbfe6dc, roughness: 0.1, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    { const [a, b] = [T.indexAtS(T.doors[0].s), T.indexAtS(sU(P.living) + 1)];
      add('Conservatory_Roof', band(T, a, b, i => ({ lat: -S.width[i] / 2 - 0.5, y: S.y[i] + CEILING }), i => ({ lat: S.width[i] / 2 + 0.5, y: S.y[i] + CEILING })), glassM);
      const rafters = []; for (let s = T.doors[0].s; s < sU(P.living) + 1; s += 3.2) { const [x, y, z, yaw] = at(s); rafters.push([x, y + CEILING, z, yaw, 1]); }
      herd('Rafters', box(14, 0.4, 0.4, 0x9ccdb4, 0, 0, 0), rafters);
      const pots = []; for (const [s, side] of [[T.doors[0].s + 4, LEFT], [T.doors[0].s + 9, RIGHT], [T.doors[0].s + 13, LEFT]]) { const [x, y, z, yaw] = wallAt(s, side, 0.2); pots.push([x, y, z, yaw, 1]); }
      herd('Pot_Plants', merge([cyl(0.55, 0.4, 0.9, 8, 0xb5553a, 0, 0.45, 0), ball(0.9, 1, 0x3d9148, 0, 1.7, 0, 0.8, 1.2, 0.8), ball(0.5, 0, 0xf06fa0, -0.2, 2.6, 0.3)]), pots); }
    /** a pair of glass doors across the road at a doorway, which slide apart as the dog being followed comes up to them */
    const slidingDoors = (door, name) => {
      const c = T.pointAt(door.s), half = door.width / 2, high = 7, holder = new THREE.Group(); holder.position.set(c.x, c.y, c.z); holder.rotation.y = c.rotationY; holder.name = name; group.add(holder);
      const frameG = merge([box(0.5, high + 0.6, 0.7, 0x9ccdb4, -half - 0.25, (high + 0.6) / 2, 0), box(0.5, high + 0.6, 0.7, 0x9ccdb4, half + 0.25, (high + 0.6) / 2, 0), box(door.width + 1, 0.6, 0.7, 0x9ccdb4, 0, high + 0.3, 0)]);
      const leafFrameG = merge([box(half, 0.35, 0.3, WHITE, 0, 0.18, 0), box(half, 0.35, 0.3, WHITE, 0, high - 0.18, 0), box(0.35, high, 0.3, WHITE, -half / 2 + 0.18, high / 2, 0), box(0.35, high, 0.3, WHITE, half / 2 - 0.18, high / 2, 0), box(0.16, 1.4, 0.5, STEEL, 0, high * 0.45, 0)]);
      const paneG = new THREE.BoxGeometry(half - 0.5, high - 0.5, 0.12).translate(0, high / 2, 0); D.push(frameG, leafFrameG, paneG);
      holder.add(new THREE.Mesh(frameG, prop));
      const leaves = [-1, 1].map(k => { const leaf = new THREE.Group(); leaf.add(new THREE.Mesh(leafFrameG, prop), new THREE.Mesh(paneG, glassM)); holder.add(leaf); return [leaf, k]; });
      let open = 0, last = 0;
      animated.push((t, focus) => {
        const near = focus && Math.abs(focus.y - c.y) < 5 && Math.hypot(focus.x - c.x, focus.z - c.z) < 30, dt = Math.min(0.1, Math.max(0, t - last)); last = t;
        open += ((near ? 1 : 0) - open) * Math.min(1, dt * 5);
        for (const [leaf, k] of leaves) leaf.position.x = k * (half / 2 + open * (half - 0.3));
      });
    };
    slidingDoors(T.doors[0], 'Glass_Doors'); slidingDoors(T.doors[6], 'Glass_Doors_2');

    // ---------- inside: a ceiling over every room, lights, and a frame round every door
    const ceilingM = keep(new THREE.MeshStandardMaterial({ color: 0xfbf7ef, roughness: 0.95, side: THREE.DoubleSide }));
    add('Ceiling', band(T, 0, N, i => ({ lat: -S.width[i] / 2 - 0.4, y: S.y[i] + CEILING }), i => ({ lat: S.width[i] / 2 + 0.4, y: S.y[i] + CEILING }),
      { skip: i => !indoors(S.section[i]) || T.isGapSegment(i) || T.isGapSegment((i + N - 1) % N) }), ceilingM);
    const lamps = []; for (let s = span('C')[0] + 8; s < span('I')[1] - 6; s += 16) { if (Math.abs(T.along(s, (T.launch.gapStart + T.launch.gapEnd) / 2)) < 12) continue; const [x, y, z] = at(s); lamps.push([x, y + CEILING - 1.5, z, 0, 1]); }
    herd('Ceiling_Lights', merge([cyl(0.05, 0.05, 1.2, 4, 0x30343a, 0, 0.9, 0), cone(1.3, 1.1, 12, 0xffe9a8, 0, 0, 0)]), lamps, keep(new THREE.MeshBasicMaterial({ vertexColors: true })));
    const frame = half => merge([box(0.7, 6.6, 3.2, WOOD, -half - 0.2, 3.3, 0), box(0.7, 6.6, 3.2, WOOD, half + 0.2, 3.3, 0), box(half * 2 + 1.1, CEILING - 6.2, 3.2, WHITE, 0, (CEILING + 6.2) / 2, 0), box(half * 2 + 1.1, 0.6, 3.4, WOOD, 0, 6.3, 0)]);
    herd('Door_Frames', frame(4.5), T.doors.filter(d => d.kind === 'door' || d.kind === 'pool').map(d => at(d.s)).map(([x, y, z, yaw]) => [x, y, z, yaw, 1]));
    // (the pool room doorway is one wide doorway with a pillar down the middle: in on one side of it, out on the other)
    { const a = T.pointAt(T.doors[1].s), b = T.pointAt(T.doors[2].s), wide = Math.hypot(a.x - b.x, a.z - b.z) - 10;
      one('Pool_Door_Pillar', merge([box(wide, CEILING, 3.4, 0xbfe9f2, 0, CEILING / 2, 0), box(wide + 0.4, 1.2, 3.8, 0x2b9fd0, 0, 6.4, 0)]), (a.x + b.x) / 2, a.y, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2); }
    // pictures along the walls of the living room, the lift lobby and the hall
    const picture = hue => merge([box(0.2, 3.2, 4.2, 0xd9a55b, 0, 0, 0), box(0.3, 2.5, 3.5, hue, 0, 0, 0)]), hung = [[], [], []];
    for (const id of ['C', 'E', 'G', 'H']) { const [a, b] = span(id); for (let s = a + 6, n = 0; s < b - 4; s += 9, n++) { if (nearDoor(s, 6) || T.along(s, T.launch.padStart + 6) > 0 && T.along(s, T.launch.landingS) < 0) continue; const [x, y, z, yaw] = wallAt(s, n % 2 ? RIGHT : LEFT, 0.1); hung[n % 3].push([x, y + 4.6, z, yaw, 1]); } }
    [0x7fc4ea, 0xf7a8c4, 0x9ad89a].forEach((hue, k) => herd(`Pictures_${k}`, picture(hue), hung[k]));

    // ---------- the living room: the sofa, the television, a rug of toys, and the toy car
    const sofa = T.obstacles.filter(ob => ob.kind === 'sofa')[1];
    one('Sofa', merge([box(4.0, 1.5, 12.6, 0x3f7a5f, 0, 0.95, 0), box(1.3, 3.4, 12.6, 0x3f7a5f, -1.5, 1.7, 0), box(4.0, 2.4, 1.3, 0x356a52, 0, 1.2, -6.2), box(4.0, 2.4, 1.3, 0x356a52, 0, 1.2, 6.2), box(2.2, 0.8, 2.6, 0xffd23a, 0.4, 2.0, 2.5, 0.3), box(2.0, 0.8, 2.4, 0xf06f6f, 0.4, 2.0, -3, -0.2)]), sofa.x, sofa.y, sofa.z, sofa.rotationY);
    { const [x, y, z, yaw] = wallAt(sofa.s + 4, LEFT, 0.3); one('Television', merge([box(0.4, 5.6, 10, 0x15161a, 0, 4.6, 0), box(0.5, 4.8, 9.2, 0x39bdf0, -0.05, 4.6, 0), box(0.5, 1.6, 0.4, 0x9ad89a, -0.12, 4.2, -1.5), box(0.5, 0.9, 1.4, 0xffd23a, -0.12, 5.2, 1.8), box(0.8, 1.2, 8, WOOD, -0.1, 0.6, 0)]), x, y, z, yaw); }
    // (a red toy car with a yellow roof: plain, with no badge and no face)
    const RED = 0xd8232f, YELLOW = 0xffd23a, wheel = (x, z) => [cyl(0.62, 0.62, 0.5, 14, 0x15161a, x, 0.62, z, 0, Math.PI / 2), cyl(0.32, 0.32, 0.56, 10, WHITE, x, 0.62, z, 0, Math.PI / 2)];
    const carG = merge([box(2.3, 1.0, 3.5, RED, 0, 1.0, 0), box(2.1, 0.5, 1.2, RED, 0, 1.6, 1.15), box(2.3, 0.7, 0.3, RED, 0, 1.75, -1.6), ball(0.75, 2, RED, 0, 1.15, 1.55, 1.5, 0.6, 0.6),
      ...[[-0.95, -1.45], [0.95, -1.45], [-0.95, 0.5], [0.95, 0.5]].map(([x, z]) => box(0.24, 1.9, 0.24, YELLOW, x, 2.65, z, 0, z > 0 ? 0.22 : -0.1)), box(2.4, 0.3, 2.7, YELLOW, 0, 3.65, -0.5), ball(1.2, 2, YELLOW, 0, 3.7, -0.5, 1, 0.3, 1.12),
      cyl(0.3, 0.3, 0.1, 10, 0x15161a, 0, 2.1, 0.5, 1.1), ...wheel(-1.3, 1.2), ...wheel(1.3, 1.2), ...wheel(-1.3, -1.2), ...wheel(1.3, -1.2)]); D.push(carG);
    { const car = new THREE.Mesh(carG, prop); car.castShadow = true; car.name = 'Toy_Car'; group.add(car); movers['toy-car'] = h => { car.position.set(h.x, h.y + 0.04 * Math.sin(h.roll), h.z); car.rotation.y = h.rotationY; }; }
    // toy bricks piled against the walls
    { const bricks = [[], [], []]; for (let s = T.living.sStart + 3, n = 0; s < T.living.sEnd; s += 5.5, n++) { const side = n % 2 ? RIGHT : LEFT; if (side === RIGHT && Math.abs(s - sofa.s) < 11) continue; if (side === LEFT && Math.abs(s - sofa.s - 4) < 7) continue; const [x, y, z, yaw] = wallAt(s, side, 0.35); bricks[n % 3].push([x, y, z, yaw + r(), 0.8 + r() * 0.5]); }
      [0x39bdf0, 0xffd23a, 0x9ad89a].forEach((hue, k) => herd(`Toy_Bricks_${k}`, merge([box(0.7, 0.7, 0.7, hue, 0, 0.35, 0), box(0.6, 0.6, 0.6, hue, 0.1, 1.0, 0.2, 0.5)]), bricks[k])); }

    // ---------- the pool room: steps and a rail at each end of the pool, life rings and towels on the walls
    { const rings = [], towels = []; for (let s = span('D')[0] + 10, n = 0; s < span('D')[1] - 8; s += 13, n++) { if (nearDoor(s, 7)) continue; const [x, y, z, yaw] = wallAt(s, n % 2 ? RIGHT : LEFT, 0.15); (n % 3 ? rings : towels).push([x, y + 3.6, z, yaw, 1]); }
      herd('Life_Rings', merge([torus(0.9, 0.3, 0xf2f2f2, 0, 0, 0, 0, 14).rotateY(Math.PI / 2), ...[0, 1, 2, 3].map(k => box(0.66, 0.5, 0.62, 0xd8232f, 0, Math.sin(k * 1.571) * 0.9, Math.cos(k * 1.571) * 0.9))]), rings);
      herd('Towels', merge([box(0.15, 0.2, 3.4, STEEL, 0, 0.9, 0), box(0.2, 2.2, 1.3, 0xffd23a, -0.05, -0.2, -0.9), box(0.2, 2.6, 1.3, 0xf06fa0, -0.05, -0.4, 0.8)]), towels);
      const steps = []; for (const s of [T.pool.sStart + 3, T.pool.sEnd - 3]) for (const side of [LEFT, RIGHT]) { const [x, y, z, yaw] = wallAt(s, side, 0.25); steps.push([x, y, z, yaw, 1]); }
      herd('Pool_Rails', merge([-0.7, 0.7].flatMap(dz => [cyl(0.07, 0.07, 1.9, 6, STEEL, 0, 0.6, dz), torus(0.35, 0.07, STEEL, -0.35, 1.5, dz, 0, 8)])), steps); }

    // ---------- the kitchen: cupboards down both walls, the fridge, and what comes at you
    const cupboards = [], [kitchenFrom, kitchenTo] = span('F');
    for (let s = kitchenFrom + 10; s < kitchenTo - 12; s += 6.9) for (const side of [LEFT, RIGHT]) { if (nearDoor(s, 8)) continue; const [x, y, z, yaw] = wallAt(s, side, 0.05); cupboards.push([x, y, z, yaw, 1]); }
    herd('Cupboards', merge([box(0.9, 2.6, 6.6, 0xfbf7ef, -0.2, 1.3, 0), box(1.1, 0.3, 6.8, 0x30343a, -0.25, 2.75, 0), box(0.15, 0.3, 1.2, 0x3f8f6a, -0.7, 1.9, -1.6), box(0.15, 0.3, 1.2, 0x3f8f6a, -0.7, 1.9, 1.6), box(0.8, 2.2, 6.6, 0xfbf7ef, -0.15, 6.4, 0)]), cupboards);
    // (a knife and a fork, each standing on its point; and the round shadow that says where the next will land)
    const SILVER = 0xd9dee4, knifeG = merge([box(0.12, 2.6, 0.7, SILVER, 0, 1.3, 0), cone(0.35, 0.8, 4, SILVER, 0, -0.1, 0, Math.PI), box(0.26, 1.9, 0.5, 0x15161a, 0, 3.5, 0)]).translate(0, -0.25, 0);
    const forkG = merge([...[-0.3, 0, 0.3].map(z => box(0.1, 1.5, 0.12, SILVER, 0, 0.75, z)), box(0.12, 0.6, 0.86, SILVER, 0, 1.75, 0), box(0.12, 1.1, 0.26, SILVER, 0, 2.55, 0), box(0.24, 1.6, 0.4, SILVER, 0, 3.7, 0)]).translate(0, -0.3, 0);
    const shadowG = new THREE.CircleGeometry(T.cutlery.radius + 0.25, 18).rotateX(-Math.PI / 2), shadowM = keep(new THREE.MeshBasicMaterial({ color: 0xd8232f, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const silverM = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25 })); D.push(knifeG, forkG, shadowG);
    for (const d of T.cutleryDrops) {
      const piece = new THREE.Mesh(d.kind === 'knife' ? knifeG : forkG, silverM), shadow = new THREE.Mesh(shadowG, shadowM); piece.castShadow = true; piece.name = 'Cutlery'; shadow.name = 'Cutlery_Shadow'; group.add(piece, shadow);
      movers[d.id] = h => { piece.visible = h.drop >= 0; piece.position.set(h.x, h.y + Math.max(0, h.drop), h.z); piece.rotation.y = h.rotationY; shadow.visible = h.drop >= 0; shadow.position.set(h.x, h.y + 0.07, h.z); shadow.scale.setScalar(0.25 + 0.75 * h.warning); };
    }
    { const kettleG = merge([cyl(0.95, 1.2, 1.9, 16, 0xe8ecf0, 0, 0.95, 0), cyl(1.22, 1.22, 0.2, 16, 0x30343a, 0, 0.1, 0), cyl(0.7, 0.95, 0.3, 14, 0x30343a, 0, 2.05, 0), ball(0.2, 1, 0x30343a, 0, 2.35, 0), cyl(0.16, 0.26, 0.9, 8, 0xe8ecf0, 0, 1.6, 1.15, 0.9), torus(0.6, 0.12, 0x30343a, 1.2, 1.2, 0, 0, 12).rotateY(Math.PI / 2)]);
      const puffG = new THREE.IcosahedronGeometry(0.3, 1), puffM = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false })); D.push(kettleG, puffG);
      const kettle = new THREE.Group(), body = new THREE.Mesh(kettleG, prop), puffs = [0, 1, 2].map(() => new THREE.Mesh(puffG, puffM)); body.castShadow = true; kettle.add(body, ...puffs); kettle.name = 'Kettle'; group.add(kettle);
      movers.kettle = h => { kettle.position.set(h.x, h.y, h.z); kettle.rotation.y = h.rotationY; body.rotation.z = 0.06 * Math.sin(h.steam * 13); puffs.forEach((p, k) => { const f = (h.steam * 0.9 + k / 3) % 1; p.position.set(0, 2.3 + f * 2.4, 1.5 + f * 0.6); p.scale.setScalar(0.6 + f * 1.6); }); }; }

    // ---------- the lift: a steel shaft from the lobby to the floor above, and the car that takes you up it
    { const L = T.launch, a = T.pointAt(L.gapStart), b = T.pointAt(L.gapEnd), m = T.launchPoint(L.duration / 2), long = L.gapEnd - L.gapStart + 2, half = a.halfWidth + 0.5, high = T.upstairs + CEILING, DARK = 0x4b525c;
      const holder = new THREE.Group(); holder.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2); holder.rotation.y = a.rotationY; holder.name = 'Lift_Shaft'; group.add(holder);
      const shaftG = merge([box(0.6, high, long, DARK, -half, high / 2, 0), box(0.6, high, long, DARK, half, high / 2, 0), box(half * 2, 0.5, long, DARK, 0, high + 0.25, 0), box(half * 2, 0.3, long, 0x2b2f38, 0, T.floor - 0.5, 0),
        box(half * 2, T.upstairs - 0.3, 0.6, DARK, 0, (T.upstairs - 0.3) / 2, long / 2), box(half * 2, high - T.floor - 7, 0.6, DARK, 0, (high + T.floor + 7) / 2, -long / 2), box(half * 2, CEILING - 7, 0.6, DARK, 0, T.upstairs + (CEILING + 7) / 2, long / 2),
        // the doors, standing open either side, and the frame round them
        ...[-1, 1].flatMap(k => [box(1.6, 7, 0.3, STEEL, k * (half - 1.1), T.floor + 3.5, -long / 2 - 0.3), box(0.5, 7.4, 0.9, 0xffd23a, k * (half - 0.1), T.floor + 3.7, -long / 2 - 0.6)]), box(half * 2, 0.7, 0.9, 0xffd23a, 0, T.floor + 7.3, -long / 2 - 0.6)]);
      D.push(shaftG); holder.add(new THREE.Mesh(shaftG, prop));
      // arrows running up the walls of the shaft
      const arrows = canvasTexture(64, 64, g => { g.fillStyle = '#4b525c'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#ffd23a'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(12, 44); g.lineTo(32, 20); g.lineTo(52, 44); g.stroke(); }, true); arrows.repeat.set(2, 5);
      const arrowM = keep(new THREE.MeshBasicMaterial({ map: arrows, side: THREE.DoubleSide })), arrowG = new THREE.PlaneGeometry(long - 1.5, high - 1); D.push(arrows, arrowG);
      for (const k of [-1, 1]) { const panel = new THREE.Mesh(arrowG, arrowM); panel.position.set(k * (half - 0.32), high / 2, 0); panel.rotation.y = Math.PI / 2; holder.add(panel); }
      animated.push(t => { arrows.offset.y = -t * 2.2; });
      // the car: it waits at the bottom, and goes up under whichever dog is being followed
      const carG = merge([box(half * 2 - 1.4, 0.4, long - 1.4, STEEL, 0, -0.2, 0), box(half * 2 - 1.2, 0.12, long - 1.2, 0xffd23a, 0, -0.42, 0)]); D.push(carG);
      const car = new THREE.Mesh(carG, prop); car.name = 'Lift_Car'; car.position.set(m.x, T.floor, m.z); car.rotation.y = a.rotationY; group.add(car);
      const ax = Math.sin(a.rotationY), az = Math.cos(a.rotationY);
      animated.push((t, focus) => { const riding = focus && Math.abs((focus.x - m.x) * ax + (focus.z - m.z) * az) < 1.2 && Math.hypot(focus.x - m.x, focus.z - m.z) < half + 1 && focus.y > T.floor - 0.5 && focus.y < T.upstairs + 0.5; car.position.y += ((riding ? focus.y : T.floor) - car.position.y) * (riding ? 1 : 0.08); });
      { const tex = signTexture('LIFT ↑', '#ffd23a', '#202020'), g = new THREE.PlaneGeometry(4.4, 1.5), mat = keep(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); D.push(tex, g);
        const plate = new THREE.Mesh(g, mat); plate.position.set(0, T.floor + 6.45, -long / 2 - 1.1); plate.rotation.y = Math.PI; holder.add(plate); } }

    // ---------- the hallway: the doors that swing both ways
    { const W = T.swing, leafG = merge([box(0.3, 6.6, W.leaf, 0xf3ead8, 0, 3.3, W.leaf / 2), box(0.36, 1.1, W.leaf - 0.3, 0xb9c0c8, 0, 0.6, W.leaf / 2), cyl(0.9, 0.9, 0.4, 14, 0x7fb2d6, 0, 4.6, W.leaf * 0.62, 0, Math.PI / 2), box(0.44, 2.0, 0.5, 0xb9c0c8, 0, 3.3, W.leaf - 0.6)]), postG = merge([box(0.7, 7, 0.7, WOOD, 0, 3.5, 0), box(0.5, 7, 0.5, 0xb9c0c8, 0, 3.5, 0)]); D.push(leafG, postG);
      for (const d of T.swingDoors) {
        const holder = new THREE.Group(), leaf = new THREE.Mesh(leafG, prop); leaf.castShadow = true; holder.add(leaf, new THREE.Mesh(postG, prop)); holder.position.set(d.x, d.y, d.z); holder.name = 'Swing_Door'; group.add(holder);
        movers[`${d.id}-0`] = h => { leaf.rotation.y = h.rotationY; };
      } }

    // ---------- the computer room: desks and screens, and the man in the wheelchair
    const desk = merge([box(2.6, 0.3, 6.6, WOOD, 0, 2.3, 0), ...[[-1.1, -3], [1.1, -3], [-1.1, 3], [1.1, 3]].map(([x, z]) => box(0.3, 2.3, 0.3, 0x30343a, x, 1.15, z)),
      ...[-1.7, 1.7].flatMap(z => [box(0.25, 2.2, 2.9, 0x15161a, 0.6, 4.0, z), box(0.3, 1.8, 2.5, 0x39e07a, 0.52, 4.0, z), box(0.3, 0.5, 0.5, 0x30343a, 0.6, 2.7, z)]), box(0.9, 0.12, 3.2, 0x30343a, -0.4, 2.52, 0), box(1.4, 2.6, 1.4, 0x2b2f38, 0.4, 1.3, -4.4)]);
    herd('Desks', desk, T.obstacles.filter(ob => ob.kind === 'desk').map(ob => [ob.x, ob.y, ob.z, ob.rotationY + (ob.lateral > 0 ? Math.PI : 0), 1]));
    { const SKIN = 0xe8b998, JUMPER = 0x2a6fb8;
      const wheelG = merge([torus(1.05, 0.12, 0x15161a, 0, 0, 0, 0, 18).rotateY(Math.PI / 2), torus(0.9, 0.05, STEEL, 0, 0, 0, 0, 18).rotateY(Math.PI / 2), ...[0, 1, 2, 3].map(k => box(0.08, 2.0, 0.08, STEEL, 0, 0, 0, 0, k * Math.PI / 4)), cyl(0.14, 0.14, 0.3, 8, STEEL, 0, 0, 0, 0, Math.PI / 2)]);
      const manG = merge([box(1.9, 0.25, 1.9, 0x30343a, 0, 1.5, 0), box(1.9, 2.0, 0.25, 0x30343a, 0, 2.6, -0.95), ...[-0.95, 0.95].map(x => box(0.14, 1.0, 1.9, STEEL, x, 2.0, 0)), ...[-0.6, 0.6].flatMap(x => [box(0.5, 0.12, 0.8, STEEL, x, 0.35, 1.55), cyl(0.2, 0.2, 0.2, 8, 0x15161a, x, 0.2, 1.1, 0, Math.PI / 2)]),
        // the man: jumper, trousers, his arms out at the wheels, and a cross face
        box(1.5, 1.9, 0.9, JUMPER, 0, 2.75, -0.35), ...[-0.42, 0.42].flatMap(x => [box(0.55, 0.5, 1.7, 0x3a4250, x, 1.85, 0.45), box(0.5, 1.3, 0.5, 0x3a4250, x, 1.05, 1.25), box(0.52, 0.3, 0.9, 0x15161a, x, 0.5, 1.5)]),
        ...[-1, 1].flatMap(k => [box(0.42, 0.42, 1.5, JUMPER, k * 1.0, 3.0, 0.35, 0, 0.5), ball(0.26, 1, SKIN, k * 1.0, 2.6, 1.05)]), ball(0.62, 2, SKIN, 0, 4.25, -0.25), ball(0.64, 1, 0x5a3a22, 0, 4.5, -0.42, 1, 0.75, 0.95),
        ...[-0.24, 0.24].flatMap(x => [ball(0.09, 0, 0x15161a, x, 4.3, 0.33), box(0.3, 0.07, 0.07, 0x3a2414, x, 4.5, 0.33, 0, 0, x > 0 ? 0.4 : -0.4)]), box(0.34, 0.07, 0.07, 0x7a2a2a, 0, 3.98, 0.34)]);
      D.push(wheelG, manG);
      const chair = new THREE.Group(), man = new THREE.Mesh(manG, prop), wheels = [-1.15, 1.15].map(x => { const w = new THREE.Mesh(wheelG, prop); w.position.set(x, 1.1, -0.2); return w; }); man.castShadow = true; chair.add(man, ...wheels); chair.name = 'Wheelchair'; group.add(chair);
      movers.wheelchair = h => { chair.position.set(h.x, h.y, h.z); chair.rotation.y = h.rotationY; for (const w of wheels) w.rotation.x = h.roll; man.rotation.x = 0.05 * Math.sin(h.roll * 0.7); }; }

    // ---------- the terrace and the dog pen
    { const g = T.doors[7], [x, y, z, yaw] = at(g.s), h = g.width / 2; one('Pen_Gate', merge([box(0.8, 4, 0.8, WOOD, -h - 0.4, 2, 0), box(0.8, 4, 0.8, WOOD, h + 0.4, 2, 0), box(g.width + 1.6, 0.5, 0.6, WOOD, 0, 4.1, 0), box(0.25, 3, h * 1.8, 0x9aa3ad, -h + 0.2, 1.6, h * 0.95)]), x, y, z, yaw);
      const tex = signTexture('DOG PEN', '#8a5a2b', '#ffffff'), pg = new THREE.PlaneGeometry(5, 1.6), pm = keep(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); D.push(tex);
      const plate = add('Pen_Sign', pg, pm); plate.position.set(x, y + 5.2, z); plate.rotation.y = yaw + Math.PI; }
    const kennel = merge([box(3.4, 2.6, 3.6, 0xa9743f, 0, 1.3, 0), gable(4.2, 1.8, 4.4, 0xb5303a, 0, 2.6, 0, Math.PI / 2), box(0.2, 1.7, 1.5, 0x2b1e12, -1.72, 0.85, 0), ball(0.75, 1, 0x2b1e12, -1.72, 1.7, 0, 0.14, 1, 1)]);
    herd('Kennels', kennel, T.obstacles.filter(ob => ob.kind === 'kennel').map(ob => [ob.x, ob.y, ob.z, ob.rotationY + (ob.lateral > 0 ? Math.PI : 0), 1]));
    herd('Dog_Bowls', merge([cyl(0.7, 0.9, 0.5, 12, 0xd8232f, 0, 0.25, 0), cyl(0.6, 0.6, 0.1, 12, 0x7fc4ea, 0, 0.5, 0)]), T.obstacles.filter(ob => ob.kind === 'bowl').map(ob => [ob.x, ob.y, ob.z, 0, 1]));
    herd('Dog_Balls', merge([ball(0.85, 2, 0xffd23a, 0, 0.85, 0), torus(0.86, 0.06, 0x2a6fb8, 0, 0.85, 0, Math.PI / 2, 16)]), T.obstacles.filter(ob => ob.kind === 'ball').map(ob => [ob.x, ob.y, ob.z, 0, 1]));
    { const pots = []; for (const [s, side] of [[span('J')[0] + 8, RIGHT], [span('J')[0] + 14, LEFT], [span('J')[0] + 22, RIGHT]]) { const [x, y, z] = beside(s, side, 1.4); pots.push([x, y, z, 0, 1.3]); }
      herd('Terrace_Pots', merge([cyl(0.6, 0.45, 1.0, 8, 0xb5553a, 0, 0.5, 0), ball(1.0, 1, 0x3d9148, 0, 1.8, 0), ball(0.4, 0, 0xffd23a, 0.3, 2.6, 0.2), ball(0.4, 0, 0xf06fa0, -0.4, 2.4, -0.2)]), pots); }

    // ---------- the hill: the chickens in their pen, the coop
    { const [x0, , z0, yaw] = beside(sU(P.hill + 1.5), LEFT, 17), y0 = groundAt(x0, z0), W = 20, Dp = 14, pen = new THREE.Group(); pen.position.set(x0, y0, z0); pen.rotation.y = yaw; pen.scale.setScalar(1.5); pen.name = 'Chicken_Pen'; group.add(pen);
      const posts = []; for (let k = 0; k <= 6; k++) { posts.push(box(0.3, 2.4, 0.3, WOOD, -W / 2 + k * W / 6, 1.2, -Dp / 2), box(0.3, 2.4, 0.3, WOOD, -W / 2 + k * W / 6, 1.2, Dp / 2)); } for (let k = 1; k < 4; k++) posts.push(box(0.3, 2.4, 0.3, WOOD, -W / 2, 1.2, -Dp / 2 + k * Dp / 4), box(0.3, 2.4, 0.3, WOOD, W / 2, 1.2, -Dp / 2 + k * Dp / 4));
      const penG = merge([...posts, box(W, 0.14, 0.14, WOOD, 0, 2.35, -Dp / 2), box(W, 0.14, 0.14, WOOD, 0, 2.35, Dp / 2), box(0.14, 0.14, Dp, WOOD, -W / 2, 2.35, 0), box(0.14, 0.14, Dp, WOOD, W / 2, 2.35, 0), box(W, 0.08, Dp, 0xb39a6c, 0, 0.12, 0),
        // the coop: a little red house on legs with a ramp up to it
        box(5, 3, 4, 0xb5303a, -W / 2 + 4, 2.6, -Dp / 2 + 3.4), gable(5.8, 1.8, 4.8, 0x6b4a2c, -W / 2 + 4, 4.1, -Dp / 2 + 3.4), box(1.2, 1.4, 0.2, 0x2b1e12, -W / 2 + 4, 2.0, -Dp / 2 + 5.45), ...[[-1.8, -1.4], [1.8, -1.4], [-1.8, 1.4], [1.8, 1.4]].map(([px, pz]) => box(0.3, 1.2, 0.3, WOOD, -W / 2 + 4 + px, 0.6, -Dp / 2 + 3.4 + pz)), box(1.2, 0.15, 2.6, WOOD, -W / 2 + 4, 0.7, -Dp / 2 + 6.5, 0, 0.5)]);
      D.push(penG); pen.add(new THREE.Mesh(penG, prop));
      const meshM = keep(new THREE.MeshStandardMaterial({ map: canvasTexture(64, 64, wire, true), alphaTest: 0.5, side: THREE.DoubleSide })); meshM.map.repeat.set(8, 1); D.push(meshM.map);
      for (const [w, px, pz, turn] of [[W, 0, -Dp / 2, 0], [W, 0, Dp / 2, 0], [Dp, -W / 2, 0, Math.PI / 2], [Dp, W / 2, 0, Math.PI / 2]]) { const g = new THREE.PlaneGeometry(w, 2.3); D.push(g); const side = new THREE.Mesh(g, meshM); side.position.set(px, 1.2, pz); side.rotation.y = turn; pen.add(side); }
      // (the chickens: each scratches about its own patch, and pecks)
      const hen = hue => merge([ball(0.55, 1, hue, 0, 0.75, 0, 0.8, 0.85, 1.15), ball(0.3, 1, hue, 0, 1.35, 0.5), cone(0.1, 0.3, 4, 0xffa51f, 0, 1.33, 0.86, Math.PI / 2), box(0.08, 0.26, 0.3, 0xd8232f, 0, 1.68, 0.5), box(0.5, 0.5, 0.12, hue, 0, 1.05, -0.62, 0, -0.5), cyl(0.04, 0.04, 0.4, 4, 0xffa51f, -0.16, 0.2, 0), cyl(0.04, 0.04, 0.4, 4, 0xffa51f, 0.16, 0.2, 0)]);
      const hens = [hen(0xf7f4ee), hen(0xb5743a), hen(0x4a3a2e)]; D.push(...hens);
      for (let k = 0; k < 11; k++) { const bird = new THREE.Mesh(hens[k % 3], prop), cx = -W / 2 + 2 + r() * (W - 4), cz = -Dp / 2 + 1.5 + r() * (Dp - 3), reach = 0.6 + r() * 1.1, pace = 0.5 + r() * 0.8, phase = r() * 6; bird.castShadow = true; bird.name = 'Chicken'; pen.add(bird);
        animated.push(t => { const a = t * pace + phase; bird.position.set(Math.max(-W / 2 + 0.8, Math.min(W / 2 - 0.8, cx + Math.cos(a) * reach)), 0.12, Math.max(-Dp / 2 + 0.8, Math.min(Dp / 2 - 0.8, cz + Math.sin(a) * reach))); bird.rotation.y = -a; bird.rotation.x = Math.max(0, Math.sin(t * 5 + phase * 3)) * (Math.sin(t * 0.7 + phase) > 0.2 ? 0.7 : 0); }); } }

    // ---------- the drives: the garage, the vans, the bins.  The main road: a lamp post, the bus stop, a bin
    const vanG = merge([box(3.6, 3.4, 6.4, 0x8a97a6, 0, 2.3, -0.4), box(3.5, 2.1, 1.6, 0x8a97a6, 0, 1.65, 3.4), box(3.3, 1.5, 0.3, 0x2b3644, 0, 3.2, 2.72, 0, -0.35), box(3.7, 0.5, 0.4, 0x30343a, 0, 0.8, 4.15), ...[-1.3, 1.3].map(x => box(0.6, 0.4, 0.2, 0xfff3c4, x, 1.6, 4.22)), ...[[-1.8, -2.4], [1.8, -2.4], [-1.8, 2.6], [1.8, 2.6]].map(([x, z]) => cyl(0.75, 0.75, 0.5, 12, 0x15161a, x, 0.75, z, 0, Math.PI / 2))]);
    const parked = T.obstacles.filter(ob => ob.kind === 'van').map((ob, k) => [ob.x, ob.y, ob.z, ob.rotationY + Math.PI + (k ? -0.08 : 0.06), 0.8]);
    // (two more by the garage, as they are in front of the real house: beside the drive, not on it)
    { const s0 = sU(2.1), c = T.pointAt(s0), place = (along, out) => { const p = T.pointAt(s0 + along, LEFT * (c.halfWidth + out)); return [p.x, groundAt(p.x, p.z), p.z]; };
      for (const out of [6, 11.5]) parked.push([...place(-4, out), c.rotationY + Math.PI, 1]);
      herd('Vans', vanG, parked);
      one('Garage', merge([box(15, 5.4, 18, STONE, 0, 2.7, 0), gable(17, 5.5, 20, TILE, 0, 5.4, 0), gable(15.2, 4.8, 0.3, CREAM, 0, 5.5, -10.15), ...[-4, 0, 4].map(dx => box(0.5, 4.2 * (1 - Math.abs(dx) / 7.6), 0.4, GREEN, dx, 5.5 + 2.1 * (1 - Math.abs(dx) / 7.6), -10.4)), box(10, 4.4, 0.4, 0x5d8f76, 0, 2.2, -9.2)]), ...place(15, 10), c.rotationY); }
    // gate posts where each drive meets the road
    herd('Gate_Posts', merge([box(1.4, 3.2, 1.4, STONE, 0, 1.6, 0), box(1.8, 0.4, 1.8, STONE_DARK, 0, 3.4, 0)]), [sU(0.35), sU(P.backDrive + 6.4)].flatMap(s => [LEFT, RIGHT].map(side => { const [x, y, z, yaw] = beside(s, side, 0.4); return [x, y, z, yaw, 1]; })));
    const bin = merge([box(1.5, 2.2, 1.5, 0x3d6b4a, 0, 1.1, 0), box(1.7, 0.25, 1.7, 0x2b4f36, 0, 2.3, 0), cyl(0.2, 0.2, 0.3, 8, 0x15161a, -0.5, 0.2, 0.8, 0, Math.PI / 2)]);
    herd('Bins', bin, T.obstacles.filter(ob => ob.kind === 'bin').map((ob, k) => [ob.x, ob.y, ob.z, ob.rotationY + k, 1]));
    { const [roadFrom, roadTo] = span('N'), posts = []; for (let s = roadFrom + 14; s < roadTo; s += 34) { const [x, y, z, yaw] = beside(s, LEFT, 2.2); posts.push([x, y, z, yaw, 1]); }
      herd('Lamp_Posts', merge([cyl(0.16, 0.24, 9, 6, 0x8f9297, 0, 4.5, 0), box(0.3, 0.2, 2.2, 0x8f9297, -0.9, 9, 0, Math.PI / 2), box(0.5, 0.25, 1.1, 0x30343a, -1.9, 8.95, 0, Math.PI / 2)]), posts);
      const [x, y, z, yaw] = beside(roadFrom + 30, LEFT, 3.4); one('Bus_Stop', merge([cyl(0.08, 0.08, 3.4, 6, 0x8f9297, 0, 1.7, 0), box(0.12, 1.5, 0.9, 0xd8232f, 0, 2.6, 0), box(0.14, 1.1, 0.7, WHITE, 0, 2.6, 0), box(1.0, 1.9, 1.0, 0x1c1d20, 0, 0.95, 2.2), box(1.1, 0.2, 1.1, 0x2b2c30, 0, 2.0, 2.2)]), x, y, z, yaw); }
    // creeper along the top of the big wall on the main road, as in front of the real house
    { const leaves = [], [roadFrom, roadTo] = span('N'); for (let s = roadFrom + 6; s < roadTo - 4; s += 1.1) { const [x, y, z] = beside(s, RIGHT, 0.5 + r() * 0.5); leaves.push([x, y + 3.2 + r() * 0.6, z, r() * 6, 0.6 + r() * 0.7]); } herd('Creeper', ball(1, 0, 0x7a5a3a, 0, 0, 0, 1, 0.5, 1), leaves); }

    // ---------- trees and hedges: the copper beech by the drive, more up the back drive and over the hill
    const tree = hue => merge([cyl(0.6, 0.9, 6, 7, 0x5a3f28, 0, 3, 0), ball(4.2, 1, hue, 0, 9, 0), ball(3.0, 1, hue, 2.0, 11, 0.8), ball(2.8, 1, hue, -1.8, 10.4, -0.9)]), trees = [[], []];
    { const [x, , z] = beside(sU(2.6), RIGHT, 13); trees[1].push([x, groundAt(x, z), z, 0, 2.3]); }
    for (let k = 0; k < 700 && trees[0].length + trees[1].length < 70; k++) {
      const x = gx(-330 + r() * 600), z = gz(-260 + r() * 760), q = T.query(x, z);
      if (q.distance < q.halfWidth + 9 || inside(x, z, -12) || (Math.abs(-x / PLAN - 10) < 60 && z / PLAN < 30 && z / PLAN > -150)) continue;
      trees[r() < 0.2 ? 1 : 0].push([x, groundAt(x, z) - 0.2, z, r() * 6, 1.1 + r() * 1.2]);
    }
    herd('Trees', tree(0x3d8a45), trees[0]); herd('Copper_Beeches', tree(0x7a4a3a), trees[1]);
    { const hedge = []; for (let s = sU(1.2); s < sU(3.5); s += 2.4) { const [x, , z] = beside(s, RIGHT, 2.2 + r()); hedge.push([x, groundAt(x, z), z, r() * 6, 1.5 + r() * 0.5]); } herd('Hedge', ball(1.6, 1, 0x2f7a3a, 0, 1.9, 0, 1, 1.2, 1), hedge); }

    for (const [text, s, side] of [['TOY CAR!', T.living.sStart - 12, LEFT], ['POOL ←', T.doors[1].s - 13, RIGHT], ['KITCHEN', T.doors[3].s - 12, RIGHT], ['LOOK UP!', T.kitchen.sStart - 1, LEFT], ['MIND THE DOORS', T.hall.sStart + 3, RIGHT], ['COMPUTER ROOM', T.doors[5].s - 12, LEFT], ['CHICKENS', sU(P.hill + 0.4), LEFT], ['SLOW: VANS', sU(P.backDrive + 0.9), RIGHT]]) sign(text, s, side, '#5d8f76', '#ffffff');
  },
});
