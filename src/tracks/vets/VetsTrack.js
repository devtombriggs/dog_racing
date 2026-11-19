// The Vets — the look of it: a three-storey clinic with a green cross over the door, a treadmill running
// in at it, and then the inside of it room by room and floor by floor (reception, the waiting room, the
// stairs, the needle corridor, the operating theatre, more stairs, the kennels, the long ward), and the
// open window at the end of the top floor, over the forecourt.  And what is after you: cones of shame,
// giant pills, syringes, trolleys, and the vets themselves.  The track itself is
// shared/vetsData.js; the parts every kit map shares are in ../trackKit3d.js.
import * as THREE from 'three';
import { VETS as T } from '../../../shared/vetsData.js';
import { createKitWorld, rng, box, cyl, ball, cone, merge, signTexture } from '../trackKit3d.js';

const S = T.samples, N = T.sampleCount;
const LAWN = 0x58a444, GROUND = -0.4, CEILING = 8, TOP = T.top + CEILING + 1.5, BELT = 0x1c1d21, WALL = 0xeef2f0, GREEN = 0x1f9d6b, WHITE = 0xf7f9f8, STEEL = 0xb9c2c9;
const indoors = section => 'BCDEFGHIJK'.includes(section);
// each room's floor, in two shades: [shade, shade, samples to a stripe]
const FLOORS = {
  A: [BELT, 0x24262b, 1], B: [0xdfeee6, 0xc9e0d3, 2], C: [0xdfeee6, 0xc9e0d3, 2], D: [0x9aa3ad, 0x6f7882, 1], E: [0xf2f4f5, 0xdde3e8, 2], F: [0xdfeee6, 0xc9e0d3, 2],
  G: [0xbfe6e0, 0xf2fbfa, 2], H: [0x9aa3ad, 0x6f7882, 1], I: [0xa9cfe0, 0x9cc4d6, 3], J: [0xf3ead2, 0xe6dcc0, 2], K: [0xf3ead2, 0xe6dcc0, 2], L: [0xbdb9ae, 0xb2aea3, 3],
};
const tiles = (g, hue, line, size = 16) => { g.fillStyle = hue; g.fillRect(0, 0, 128, 128); g.strokeStyle = line; g.lineWidth = 2; for (let x = 0; x <= 128; x += size) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); } for (let y = 0; y <= 128; y += size) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); } };
const paw = (g, x, y, size, hue) => { g.fillStyle = hue; g.beginPath(); g.arc(x, y, size, 0, 7); g.fill(); for (const [dx, dy] of [[-1.1, -1.2], [-0.4, -1.8], [0.4, -1.8], [1.1, -1.2]]) { g.beginPath(); g.arc(x + dx * size, y + dy * size, size * 0.45, 0, 7); g.fill(); } };
// the walls, a room at a time: the bottom of the canvas is the bottom of the wall
const PAPER = {
  BC(g) { g.fillStyle = '#f4f7f1'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#1f9d6b'; g.fillRect(0, 74, 128, 8); g.fillStyle = '#cfe9dc'; g.fillRect(0, 82, 128, 46); paw(g, 30, 40, 7, '#bfe3d1'); paw(g, 94, 28, 7, '#bfe3d1'); g.fillStyle = '#ffffff'; g.fillRect(0, 120, 128, 8); },
  DFH(g) { g.fillStyle = '#dcebf5'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#b9d3e6'; g.fillRect(0, 86, 128, 42); g.fillStyle = '#8a9aa6'; g.fillRect(0, 80, 128, 5); },
  E(g) { tiles(g, '#fbfcfc', '#cfd8de'); g.fillStyle = '#d8232f'; g.fillRect(0, 60, 128, 6); g.fillStyle = '#d8232f'; g.fillRect(56, 22, 16, 5); g.fillRect(61.5, 16, 5, 17); },
  G(g) { tiles(g, '#8fd3c4', '#eafaf6'); g.fillStyle = '#5fb7a6'; g.fillRect(0, 0, 128, 10); },
  JK(g) { g.fillStyle = '#fbf6e6'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#2f6fb0'; g.fillRect(0, 74, 128, 8); g.fillStyle = '#d6e4f2'; g.fillRect(0, 82, 128, 46); paw(g, 30, 40, 7, '#f0e2b8'); paw(g, 94, 28, 7, '#f0e2b8'); g.fillStyle = '#ffffff'; g.fillRect(0, 120, 128, 8); },
  I(g) { g.fillStyle = '#c9cfd4'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#2b3138'; g.fillRect(6, 44, 116, 78); g.fillStyle = '#9aa3ad'; for (let x = 6; x <= 122; x += 11.6) g.fillRect(x - 1.5, 44, 3, 78); g.fillRect(6, 44, 116, 4); g.fillRect(6, 118, 116, 4); g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(48, 96, 3, 0, 7); g.arc(62, 96, 3, 0, 7); g.fill(); },
};
const hedge = g => { const r = rng(5); g.fillStyle = '#2f7a3a'; g.fillRect(0, 0, 64, 64); for (let k = 0; k < 160; k++) { g.fillStyle = r() < 0.5 ? '#3d9148' : '#246330'; g.fillRect(r() * 64, r() * 64, 5, 5); } };
const room = (sections, draw) => ({ height: CEILING, every: 6, size: [128, 128], skip: (s, side, section) => !sections.includes(section), draw });

export const createVets = () => createKitWorld(T, {
  name: 'TheVets', sunDirection: [0.3, 0.85, -0.35],
  sky: { top: 0x74b8ee, horizon: 0xeef6fb, clouds: 0xffffff, cloudCount: 16 },
  ground: { color: LAWN, roughness: 0.95, y: GROUND },
  road: { color: i => { const [a, b, n] = FLOORS[S.section[i]]; return Math.floor(i / n) % 2 ? a : b; }, side: i => (indoors(S.section[i]) ? 0x5c6168 : S.section[i] === 'A' ? 0x30343a : LAWN), shoulder: 0.7, roughness: 0.6 },
  edges: [
    room('BCF', PAPER.BC), room('DH', PAPER.DFH), room('E', PAPER.E), room('G', PAPER.G), room('I', PAPER.I), room('JK', PAPER.JK),
    // the treadmill's guard rails: there is no getting off it
    { height: 1.6, every: 2, size: [64, 64], cutout: true, skip: (s, side, section) => section !== 'A', draw(g) { g.clearRect(0, 0, 64, 64); g.fillStyle = '#c9ced4'; for (const x of [2, 34]) g.fillRect(x, 6, 5, 58); g.fillRect(0, 4, 64, 7); g.fillStyle = '#ffd23a'; g.fillRect(0, 34, 64, 5); } },
    { height: 2.0, every: 5, size: [64, 64], skip: (s, side, section) => section !== 'L', draw: hedge },
  ],
  start: { text: 'THE VETS', color: GREEN, background: '#1f9d6b', ink: '#ffffff' },
  strips: { color: '#39e07a', background: 'rgba(22,23,27,0.96)' },
  env: { fog: [0xeef6fb, 180, 1600], background: 0xeef6fb, exposure: 1.0 },
  lights: { hemi: [0xf6fbff, 0xbfc9c4, 1.75], sun: [0xfff6e6, 1.8] },

  build({ group, D, movers, herd, beside, sign, add, keep, prop, band, clear }) {
    const r = rng(77);
    const one = (name, geo, x, y, z, turn = 0, size = 1) => herd(name, geo, [[x, y, z, turn, size]]);
    const at = (s, lateral = 0) => { const c = T.pointAt(s), p = T.pointAt(s, lateral); return [p.x, c.y, p.z, c.rotationY]; };
    const wallAt = (s, side, inFrom = 0) => { const c = T.pointAt(s); return at(s, side * (c.halfWidth - inFrom)); };
    const mid = id => { const sec = T.sections.find(q => q.id === id); return [sec.sStart, sec.sEnd]; };

    // ---------- the clinic from outside: three storeys, four walls, the front door and (on the top floor) the open window in
    // the front one, a flat roof, the sign
    const door = T.pointAt(T.doors[0].s), win = T.pointAt(T.windowS - 0.5);
    let east = -Infinity, back = -Infinity, west = Infinity;
    for (let i = 0; i < N; i++) if (indoors(S.section[i])) { east = Math.max(east, S.x[i] + S.width[i] / 2); west = Math.min(west, S.x[i] - S.width[i] / 2); back = Math.max(back, S.z[i] + S.width[i] / 2); }
    east += 7; back += 7; west -= 7;
    const front = door.z - 0.4, wide = east - west, deep = back - front, cx = (west + east) / 2, cz = (front + back) / 2, thick = 1.2;
    const doorHalf = T.doors[0].width / 2 + 0.5, doorTop = T.floor + 6.4, winHalf = T.doors.at(-1).width / 2 + 0.5, sill = T.top - 0.2, winTop = T.top + 6.4;
    const wallX = (x0, x1, y0, y1) => box(x1 - x0, y1 - y0, thick, WALL, (x0 + x1) / 2, (y0 + y1) / 2, front);
    const shell = [
      // the front wall: west of the window, under it, over it, between it and the door, over the door, east of the door
      wallX(west, win.x - winHalf, 0, TOP), wallX(win.x - winHalf, win.x + winHalf, 0, sill), wallX(win.x - winHalf, win.x + winHalf, winTop, TOP), wallX(win.x + winHalf, door.x - doorHalf, 0, TOP),
      wallX(door.x - doorHalf, door.x + doorHalf, doorTop, TOP), wallX(door.x + doorHalf, east, 0, TOP),
      box(wide, TOP, thick, WALL, cx, TOP / 2, back), box(thick, TOP, deep, WALL, east, TOP / 2, cz), box(thick, TOP, deep, WALL, west, TOP / 2, cz),
      // a green band round the top and one at each floor, the roof, a canopy over the front door on two posts
      box(wide + 1.4, 2.2, 0.5, GREEN, cx, TOP - 2.4, front - 0.5), box(0.5, 2.2, deep + 1.4, GREEN, west - 0.5, TOP - 2.4, cz), box(0.5, 2.2, deep + 1.4, GREEN, east + 0.5, TOP - 2.4, cz), box(wide + 2, 0.8, deep + 2, 0x8a9199, cx, TOP + 0.4, cz),
      ...[T.first, T.top].flatMap(y => [wallX(west, win.x - winHalf - 0.6, y - 0.9, y - 0.3), wallX(win.x + winHalf + 0.6, east, y - 0.9, y - 0.3)].map(g => g.translate(0, 0, -0.35))),
      box(doorHalf * 2 + 8, 0.6, 7, GREEN, door.x, doorTop + 0.5, front - 3.4), ...[-1, 1].map(k => cyl(0.3, 0.3, doorTop, 8, STEEL, door.x + k * (doorHalf + 3.2), doorTop / 2, front - 6.2)),
      // the cross, high up over the door
      box(8, 2.6, 0.5, GREEN, door.x, TOP - 8, front - 0.6), box(2.6, 8, 0.5, GREEN, door.x, TOP - 8, front - 0.6),
      // the window they come out of: its frame, the sill, the two halves of it flung open, a curtain blowing out
      box(0.6, winTop - sill, 1.6, WHITE, win.x - winHalf, (sill + winTop) / 2, front), box(0.6, winTop - sill, 1.6, WHITE, win.x + winHalf, (sill + winTop) / 2, front), box(winHalf * 2 + 0.6, 0.6, 1.6, WHITE, win.x, winTop, front), box(winHalf * 2 + 1.6, 0.5, 2.6, WHITE, win.x, sill - 0.05, front - 0.5),
      ...[-1, 1].flatMap(k => [box(0.25, winTop - sill - 0.6, winHalf, 0x8fc7e8, win.x + k * (winHalf + 0.2), (sill + winTop) / 2, front - winHalf / 2 - 0.6, k * 0.25), box(0.3, 0.35, winHalf, WHITE, win.x + k * (winHalf + 0.2), winTop - 0.5, front - winHalf / 2 - 0.6, k * 0.25)]),
      box(0.12, 4.6, 2.4, 0xf7a8c4, win.x - winHalf + 1.0, sill + 3.4, front - 1.6, 0.5, 0, 0.25),
    ];
    add('Clinic', merge(shell), prop);
    const pane = merge([box(9, 6, 0.4, WHITE, 0, 0, 0), box(8, 5, 0.5, 0x8fc7e8, 0, 0, 0), box(0.4, 5, 0.6, WHITE, 0, 0, 0)]), panes = [];
    for (let x = west + 12; x < east - 8; x += 20) for (const y of [T.floor + 4.2, T.first + 4.2, T.top + 4.2]) if (Math.abs(x - door.x) > doorHalf + 9 && Math.abs(x - win.x) > winHalf + 7) panes.push([x, y, front - 0.6, 0, 1]);
    herd('Windows', pane, panes);
    { const tex = signTexture('VETS', '#1f9d6b', '#ffffff'), g = new THREE.PlaneGeometry(12, 5), m = keep(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); D.push(tex);
      const plate = add('Clinic_Sign', g, m); plate.position.set(door.x, doorTop + 3.6, front - 0.75); plate.rotation.y = Math.PI; }
    // the treadmill: a roller at each end of the belt, a motor box beside it, and a board over it
    { const from = T.pointAt(T.treadmill.sStart), half = from.halfWidth + 0.4, roller = () => cyl(0.55, 0.55, half * 2, 12, STEEL, 0, 0, 0, 0, Math.PI / 2);
      for (const [s, lift] of [[T.treadmill.sStart, 0], [T.treadmill.sEnd, 0]]) { const p = T.pointAt(s); one('Treadmill_Roller', roller(), p.x, p.y - 0.42 + lift, p.z, p.rotationY); }
      const [x, y, z, yaw] = beside(T.treadmill.sStart + 6, 1, 2.4); one('Treadmill_Motor', merge([box(2.6, 2.2, 4, 0x30343a, 0, 1.1, 0), box(2.7, 0.3, 4.1, 0xffd23a, 0, 2.3, 0), ball(0.3, 0, 0xd8232f, -1.35, 1.6, 1.2), ball(0.3, 0, 0x39e07a, -1.35, 1.6, 0.3)]), x, y, z, yaw); }

    // ---------- inside: a ceiling over every room, strip lights, a frame round every door
    add('Ceiling', band(T, 0, N, i => ({ lat: -S.width[i] / 2 - 0.4, y: S.y[i] + CEILING }), i => ({ lat: S.width[i] / 2 + 0.4, y: S.y[i] + CEILING }), { skip: i => !indoors(S.section[i]) }), keep(new THREE.MeshStandardMaterial({ color: 0xf4f6f6, roughness: 0.95, side: THREE.DoubleSide })));
    const lamps = []; for (let s = mid('B')[0] + 6; s < T.windowS - 6; s += 13) { const [x, y, z, yaw] = at(s); lamps.push([x, y + CEILING - 0.25, z, yaw, 1]); }
    herd('Strip_Lights', box(1.0, 0.2, 5, 0xffffff), lamps, keep(new THREE.MeshBasicMaterial({ vertexColors: true }))).castShadow = false;
    const hw = T.doors[1].width / 2;
    herd('Door_Frames', merge([box(0.7, 6.4, 3.4, STEEL, -hw - 0.2, 3.2, 0), box(0.7, 6.4, 3.4, STEEL, hw + 0.2, 3.2, 0), box(hw * 2 + 1.1, CEILING - 6, 3.4, WALL, 0, (CEILING + 6) / 2, 0), box(hw * 2 + 1.1, 0.6, 3.6, GREEN, 0, 6.1, 0)]), T.doors.map(d => { const [x, y, z, yaw] = at(d.s); return [x, y, z, yaw, 1]; }));
    // posters up the walls: a tooth, a heart, a bone, a warning
    const poster = (hue, mark) => merge([box(0.2, 3.4, 2.6, WHITE, 0, 0, 0), box(0.3, 2.9, 2.1, hue, 0, 0, 0), box(0.4, 1.1, 1.1, mark, 0, 0.2, 0)]);
    const hung = [[], [], []];
    for (const id of ['B', 'C', 'D', 'F', 'H', 'J', 'K']) { const [a, b] = mid(id); for (let s = a + 7, n = 0; s < b - 5; s += 9, n++) { if (T.doors.some(d => Math.abs(d.s - s) < 5)) continue; const [x, y, z, yaw] = wallAt(s, n % 2 ? 1 : -1, 0.1); hung[n % 3].push([x, y + 4.6, z, yaw, 1]); } }
    [[0x8fc7e8, WHITE], [0xf7a8c4, 0xd8232f], [0xffe08a, 0xf7f4e6]].forEach(([hue, mark], k) => herd(`Posters_${k}`, poster(hue, mark), hung[k]));

    // ---------- reception and the waiting room
    { const [x, y, z, yaw] = wallAt(mid('B')[0] + 16, 1, 2.2); one('Reception_Desk', merge([box(2.4, 2.6, 9, WHITE, 0, 1.3, 0), box(2.8, 0.3, 9.4, GREEN, 0, 2.75, 0), box(0.3, 1.6, 2.2, 0x30343a, -0.4, 3.7, -1.5), ball(0.5, 1, 0xf3c9a5, -1.6, 4.3, 1.8), box(1.4, 1.8, 1.0, GREEN, -1.6, 3.0, 1.8)]), x, y, z, yaw); }
    const bench = merge([box(1.8, 0.3, 12.4, 0x2f6fb0, 0, 1.3, 0), box(0.3, 1.9, 12.4, 0x2f6fb0, -0.8, 2.3, 0), ...[-5.6, -1.9, 1.9, 5.6].map(z => box(1.6, 1.3, 0.25, STEEL, 0, 0.65, z))]);
    for (const tag of ['chairs-l', 'chairs-r']) { const c = T.obstacles.find(ob => ob.id === `${tag}-1`); one('Chairs', bench, c.x, c.y, c.z, c.rotationY + (tag === 'chairs-r' ? Math.PI : 0)); }
    const carrier = merge([box(1.5, 1.2, 2.0, 0xd8232f, 0, 0.6, 0), box(1.3, 0.25, 1.4, 0x9a1a22, 0, 1.4, 0), box(1.1, 0.8, 0.1, 0x30343a, 0, 0.6, 1.0), box(0.15, 0.5, 1.1, 0x30343a, 0, 1.7, 0)]);
    herd('Pet_Carriers', carrier, T.obstacles.filter(ob => ob.kind === 'carrier').map((ob, k) => [ob.x, ob.y, ob.z, ob.rotationY + k * 1.3, 1]));
    // ---------- the two flights of stairs: a step every two metres, each a little higher than the last, with a yellow edge to it
    { const steps = [];
      for (const flight of [T.stairs, T.topStairs]) for (let s0 = T.sAtU(Math.floor(T.samples.u[T.indexAtS(flight.sStart)])), s = s0, k = 0; s < flight.sEnd + 30; s += 2, k++) {
        const c = T.pointAt(s + 1), high = T.pointAt(s + 2).y; if (high - T.pointAt(s).y < 0.03) continue;
        steps.push(box(c.halfWidth * 2 + 0.6, 0.5, 2.5, k % 2 ? 0xaab3bc : 0x98a1ab, 0, 0, 0, c.rotationY).translate(c.x, high - 0.23, c.z), box(c.halfWidth * 2 + 0.6, 0.5, 0.2, 0xffd23a, 0, 0, 0, c.rotationY).translate(T.pointAt(s).x, high - 0.225, T.pointAt(s).z));
      }
      add('Stairs', merge(steps), prop).receiveShadow = true; }
    // a handrail up each side
    const railM = keep(new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }));
    for (const id of ['D', 'H']) { const [a0, b0] = mid(id), [a, b] = [T.indexAtS(a0 + 3), T.indexAtS(b0 - 3)]; for (const side of [1, -1]) add('Handrail', band(T, a, b, i => ({ lat: side * (S.width[i] / 2 - 0.12), y: S.y[i] + 1.9 }), i => ({ lat: side * (S.width[i] / 2 - 0.12), y: S.y[i] + 2.3 })), railM); }
    // ---------- the corridor: a door every few strides, and a trolley of instruments at each end
    const sideDoor = merge([box(0.25, 5.4, 3.6, 0x8fb9a8, 0, 2.7, 0), box(0.3, 1.2, 1.2, 0xcfe6f2, -0.05, 4.0, 0), ball(0.16, 0, STEEL, -0.2, 2.6, 1.3)]), doors = [];
    for (let s = T.corridor.sStart + 9, n = 0; s < T.corridor.sEnd - 6; s += 12, n++) { const [x, y, z, yaw] = wallAt(s, n % 2 ? 1 : -1, 0.05); doors.push([x, y, z, yaw, 1]); }
    herd('Corridor_Doors', sideDoor, doors);
    // ---------- the operating theatre: the tables, a great lamp over each, the machines that go beep
    const table = merge([box(3.2, 0.3, 6.4, STEEL, 0, 2.0, 0), cyl(0.5, 0.9, 2.0, 8, 0x8a9199, 0, 1.0, 0), box(2.8, 0.25, 5.4, 0x8fd3c4, 0, 2.28, 0), box(2.0, 0.4, 1.2, WHITE, 0, 2.55, -2.2)]);
    const tables = T.obstacles.filter(ob => ob.kind === 'table');
    herd('Operating_Tables', table, tables.map(ob => [ob.x, ob.y, ob.z, ob.rotationY, 1]));
    herd('Theatre_Lamps', merge([cyl(0.12, 0.12, 2.6, 5, STEEL, 0, CEILING - 1.3, 0), cyl(2.0, 1.4, 0.5, 14, WHITE, 0, CEILING - 2.8, 0)]), tables.map(ob => [ob.x, ob.y, ob.z, 0, 1]));
    herd('Lamp_Glow', cyl(1.7, 1.7, 0.1, 14, 0xfff6c9, 0, CEILING - 3.1, 0), tables.map(ob => [ob.x, ob.y, ob.z, 0, 1]), keep(new THREE.MeshBasicMaterial({ vertexColors: true }))).castShadow = false;
    const monitor = merge([cyl(0.12, 0.12, 3.4, 5, STEEL, 0, 1.7, 0), box(0.4, 1.6, 2.2, 0x30343a, 0, 3.8, 0), box(0.45, 1.2, 1.8, 0x39e07a, -0.02, 3.8, 0), box(1.2, 0.2, 1.2, STEEL, 0, 0.1, 0)]), monitors = [];
    for (let s = T.theatre.sStart + 6, n = 0; s < T.theatre.sEnd - 4; s += 8, n++) { const [x, y, z, yaw] = wallAt(s, n % 2 ? 1 : -1, 0.8); monitors.push([x, y, z, yaw + (n % 2 ? Math.PI : 0), 1]); }
    herd('Monitors', monitor, monitors);
    // ---------- the kennels: buckets and a mop.  The long ward: a bed against the wall every few strides, and the drip stands
    herd('Mop_Buckets', merge([cyl(0.85, 0.7, 1.1, 12, 0xffd23a, 0, 0.55, 0), cyl(0.07, 0.07, 3.2, 5, 0x8a6a44, 0.3, 1.9, 0, 0, 0.25), box(0.9, 0.3, 0.4, 0xcfd8de, 0.72, 3.4, 0)]), T.obstacles.filter(ob => ob.kind === 'bucket').map((ob, k) => [ob.x, ob.y, ob.z, k * 2, 1]));
    herd('Drip_Stands', merge([cyl(0.07, 0.07, 5.2, 5, STEEL, 0, 2.6, 0), box(1.5, 0.12, 0.12, STEEL, 0, 5.1, 0), ball(0.42, 1, 0xbfe6f5, -0.6, 4.4, 0, 0.8, 1.3, 0.6), cyl(0.5, 0.6, 0.2, 8, 0x30343a, 0, 0.1, 0)]), T.obstacles.filter(ob => ob.kind === 'drip').map(ob => [ob.x, ob.y, ob.z, ob.rotationY, 1]));
    // (nothing stands out from the walls that a dog could not run through: cupboards and a sink, flat against them)
    const cupboard = merge([box(0.8, 2.4, 4.4, WHITE, 0, 1.2, 0), box(0.9, 0.2, 4.6, 0x8fc7e8, 0, 2.5, 0), box(0.86, 0.9, 0.08, STEEL, 0, 1.2, -1.1), box(0.86, 0.9, 0.08, STEEL, 0, 1.2, 1.1), box(0.5, 0.5, 0.9, 0x39e07a, 0, 2.85, 1.2), cyl(0.22, 0.22, 0.6, 8, 0xbfe6f5, 0, 2.9, -1.2)]), cupboards = [];
    for (let s = mid('J')[0] + 12, n = 0; s < T.wayOut.sStart - 6; s += 15, n++) { if (T.doors.some(d => Math.abs(d.s - s) < 7)) continue; const side = n % 2 ? 1 : -1, [x, y, z, yaw] = wallAt(s, side, 0.45); cupboards.push([x, y, z, yaw, 1]); }
    herd('Ward_Cupboards', cupboard, cupboards);
    // ---------- the forecourt: paving, a few cars, trees round about
    { const lot = add('Forecourt', new THREE.PlaneGeometry(wide + 40, 150).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: 0x7c7f86, roughness: 0.9 }))); lot.position.set(cx, GROUND + 0.22, front - 75); lot.receiveShadow = true; }
    const car = hue => merge([box(5.4, 1.5, 11, hue, 0, 1.4, 0), box(4.8, 1.5, 6, 0x9fd0ee, 0, 2.8, -0.4), ...[[-2.7, -3.4], [2.7, -3.4], [-2.7, 3.4], [2.7, 3.4]].map(([px, pz]) => cyl(1, 1, 0.7, 14, 0x15161a, px, 1, pz, 0, Math.PI / 2))]);
    const parked = [[], [], []];
    for (let k = 0; k < 14; k++) { const x = door.x + 34 + k * 10, z = front - 26 - (k % 2) * 40; if (x < east && clear(x, z, 8)) parked[k % 3].push([x, GROUND, z, 0, 1]); }
    [0xd8232f, 0x2f6fb0, 0xf2c94c].forEach((hue, k) => herd(`Cars_${k}`, car(hue), parked[k]));
    const tree = merge([cyl(0.5, 0.7, 5, 7, 0x6b4a2c, 0, 2.5, 0), ball(3.4, 1, 0x3d9148, 0, 7, 0), ball(2.4, 1, 0x4aa556, 1.6, 8.6, 0.6)]), trees = [];
    for (let k = 0; k < 600 && trees.length < 60; k++) {
      const x = west - 150 + r() * (wide + 300), z = front - 300 + r() * (deep + 470);
      if (!clear(x, z, 9) || (x > west - 6 && x < east + 6 && z > front - 150 && z < back + 6)) continue;
      trees.push([x, GROUND, z, r() * 6, 1.2 + r() * 1.3]);
    }
    herd('Trees', tree, trees);

    // ---------- what is after you
    // cones of shame, rolling from wall to wall on their sides
    const coneG = new THREE.CylinderGeometry(1.2, 0.55, 1.5, 18, 1, true).rotateX(Math.PI / 2).translate(0, 1.2, 0), coneM = keep(new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 0.3, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); D.push(coneG);
    T.cones.forEach((_, k) => { const m = new THREE.Mesh(coneG, coneM); m.name = 'Cone_Of_Shame'; m.rotation.order = 'YXZ'; group.add(m); movers[`cone-${k}`] = h => { m.position.set(h.x, h.y, h.z); m.rotation.set(0, h.rotationY, 0); m.rotation.z = Math.sin(h.spin) * 0.25; }; });
    // trolleys loose in the long ward
    const trolleyG = merge([box(2.2, 0.2, 3.4, STEEL, 0, 1.5, 0), box(2.0, 0.15, 3.2, STEEL, 0, 0.6, 0), ...[[-1, -1.6], [1, -1.6], [-1, 1.6], [1, 1.6]].flatMap(([x, z]) => [cyl(0.07, 0.07, 1.5, 5, STEEL, x, 0.8, z), ball(0.2, 0, 0x30343a, x, 0.2, z)]),
      box(0.5, 0.5, 0.9, 0x39e07a, -0.5, 1.85, 0.6), cyl(0.2, 0.2, 0.7, 8, 0xbfe6f5, 0.5, 1.95, -0.6), box(1.2, 0.08, 0.6, WHITE, 0.2, 1.64, 1.0)]); D.push(trolleyG);
    T.trolleys.forEach((_, k) => { const m = new THREE.Mesh(trolleyG, prop); m.castShadow = true; m.name = 'Trolley'; group.add(m); movers[`trolley-${k}`] = h => { m.position.set(h.x, h.y + 0.03 * Math.sin(h.rattle), h.z); m.rotation.y = h.rotationY + Math.PI / 2 + 0.05 * Math.sin(h.rattle * 0.7); }; });
    // giant pills, bouncing down the stairs
    const R = T.pillRun.radius, pillG = merge([cyl(R, R, 1.3, 12, 0xd8232f, -0.65, 0, 0, 0, Math.PI / 2), cyl(R, R, 1.3, 12, WHITE, 0.65, 0, 0, 0, Math.PI / 2), ball(R, 1, 0xd8232f, -1.3, 0, 0), ball(R, 1, WHITE, 1.3, 0, 0)]); D.push(pillG);
    T.pillRun.lanes.forEach((_, k) => {
      const pill = new THREE.Mesh(pillG, prop); pill.rotation.order = 'YXZ'; pill.castShadow = true; pill.name = 'Pill'; group.add(pill);
      movers[`pill-${k}`] = h => { pill.visible = h.fade > 0.01; pill.position.set(h.x, h.y + R + 0.35 * Math.abs(Math.sin(h.spin * 1.7)), h.z); pill.rotation.set(-h.spin, h.rotationY, 0); pill.scale.setScalar(0.5 + 0.5 * h.fade); };
    });
    // syringes, needle first
    const syringeG = merge([cyl(0.36, 0.36, 2.4, 10, 0xbfe6f5, 0, 0, 0, Math.PI / 2), cyl(0.3, 0.3, 1.3, 10, 0x39e07a, 0, 0, 0.5, Math.PI / 2), cone(0.09, 1.9, 6, STEEL, 0, 0, 2.1, Math.PI / 2), cyl(0.5, 0.5, 0.12, 10, WHITE, 0, 0, -1.2, Math.PI / 2), cyl(0.09, 0.09, 1.0, 5, WHITE, 0, 0, -1.7, Math.PI / 2), cyl(0.42, 0.42, 0.12, 10, WHITE, 0, 0, -2.2, Math.PI / 2)]); D.push(syringeG);
    T.syringeRun.lanes.forEach((_, k) => {
      const syringe = new THREE.Mesh(syringeG, prop); syringe.castShadow = true; syringe.name = 'Syringe'; group.add(syringe);
      movers[`syringe-${k}`] = (h, t) => { syringe.visible = h.fade > 0.01; syringe.position.set(h.x, h.y + 0.25 + 0.12 * Math.sin(t * 9 + k), h.z); syringe.rotation.y = h.rotationY; syringe.scale.setScalar(0.4 + 0.6 * h.fade); };
    });
    // the vets: green scrubs, a mask, a cap, cross eyebrows, and a syringe held out in front
    const SKIN = 0xf0c8a4, SCRUB = 0x2fa58a;
    const bodyG = merge([box(1.5, 1.9, 0.95, SCRUB, 0, 2.55, 0), ball(0.62, 1, SKIN, 0, 4.0, 0), box(1.05, 0.5, 0.75, 0xbfe6f5, 0, 3.78, 0.34), cyl(0.66, 0.6, 0.42, 10, SCRUB, 0, 4.5, 0),
      box(0.42, 0.11, 0.1, 0x2a1a12, -0.28, 4.22, 0.6, 0, 0, -0.45), box(0.42, 0.11, 0.1, 0x2a1a12, 0.28, 4.22, 0.6, 0, 0, 0.45), ball(0.09, 0, 0xd8232f, -0.26, 4.08, 0.58), ball(0.09, 0, 0xd8232f, 0.26, 4.08, 0.58),
      box(0.34, 0.34, 1.5, SCRUB, -0.95, 3.0, 0.6), box(0.34, 0.34, 1.5, SCRUB, 0.95, 3.0, 0.6), ball(0.24, 0, 0x8fd3f0, -0.95, 3.0, 1.4), ball(0.24, 0, 0x8fd3f0, 0.95, 3.0, 1.4),
      cyl(0.2, 0.2, 1.3, 8, 0xbfe6f5, 0.95, 3.2, 2.0, Math.PI / 2), cone(0.06, 1.0, 5, STEEL, 0.95, 3.2, 3.1, Math.PI / 2)]);
    const legG = box(0.5, 1.7, 0.55, 0x23806b, 0, -0.85, 0); D.push(bodyG, legG);
    T.vetRuns.forEach((_, k) => {
      const vet = new THREE.Group(), body = new THREE.Mesh(bodyG, prop), legs = [-0.4, 0.4].map(x => { const leg = new THREE.Mesh(legG, prop); leg.position.set(x, 1.7, 0); leg.castShadow = true; return leg; });
      body.castShadow = true; vet.add(body, ...legs); vet.name = 'Vet'; group.add(vet);
      movers[`vet-${k}`] = h => { vet.position.set(h.x, h.y + 0.07 * Math.abs(Math.sin(h.stride)), h.z); vet.rotation.y = h.rotationY; legs[0].rotation.x = Math.sin(h.stride) * 0.7; legs[1].rotation.x = -Math.sin(h.stride) * 0.7; body.rotation.x = h.coming ? 0.16 : -0.05; };
    });

    for (const [text, s, side] of [['NO WAY BACK', T.treadmill.sStart + 8, -1], ['CONES!', T.cones[0] - 14, -1], ['PILLS!', T.stairs.sStart - 4, 1], ['NEEDLES!', T.corridor.sStart - 3, 1], ['VETS!!', T.theatre.sStart - 2, 1], ['UP AGAIN', T.topStairs.sStart - 3, -1],
      ['WET FLOOR', T.kennels.sStart + 3, 1], ['TROLLEYS!', T.trolleys[0] - 22, -1], ['WAY OUT', T.wayOut.sStart - 6, 1], ['THE WINDOW!', T.windowS - 34, -1]]) sign(text, s, side, '#1f9d6b', '#ffffff');
  },
});
