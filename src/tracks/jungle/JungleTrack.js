// Monkey Jungle — the look of it: rainforest so thick the trail is a tunnel through it, a river at the
// bottom of a gorge, rope bridges with no ropes to hold on to, planks hung on vines, a fallen log, a
// ruined temple, a stair winding up round a kapok tree, a fig tree the size of a house, snakes, and monkeys.  The track itself is shared/jungleData.js; the parts every kit map shares are in
// ../trackKit3d.js.
import * as THREE from 'three';
import { JUNGLE as T, jungleHill, junglePlateau, RIVER_Y, STAIR_TREE } from '../../../shared/jungleData.js';
import { createKitWorld, rng, box, cyl, ball, cone, merge } from '../trackKit3d.js';

const S = T.samples;
const onStair = s => s > T.stair.sStart && s < T.stair.sEnd;
const EARTH = [0x8a6a44, 0x80613d], PLANK = [0xb98a55, 0xa97b48], ROPE = 0xd9c9a3, STONE = 0x9a9a8c, MOSS = 0x6f8f5a, LEAF = 0x2f8a3c, DARK = 0x1f6a30, BARK = 0x5a4028;

export const createJungle = () => createKitWorld(T, {
  name: 'MonkeyJungle', sunDirection: [0.25, 0.9, 0.3],
  sky: { top: 0x58a8d6, horizon: 0xd6efc4, clouds: 0xffffff, cloudCount: 12 },
  ground: { color: 0x1f5a2a, y: -5 },
  road: { color: i => (T.depthAt(S.s[i]) > 0.05 ? 0x4a5a3c : S.section[i] === 'D' ? (Math.floor(i / 2) % 2 ? 0xa9a998 : 0x9c9c8b) : 'CEI'.includes(S.section[i]) || onStair(S.s[i]) ? PLANK[i % 2] : S.section[i] === 'K' && T.isHole(S.s[i]) ? BARK : EARTH[Math.floor(i / 3) % 2]), side: 0x2a6a2c, skirt: { out: 3, drop: 0.9 }, roughness: 0.9 },
  edges: [
    // logs laid along the trail, and a rope above them; a stone kerb through the temple.  Nothing across the gorge
    { height: 0.9, every: 4, size: [64, 32], cutout: true, skip: (s, side, section) => section === 'D' || T.isHole(s) || T.isHole(s - 2), draw(g) { g.clearRect(0, 0, 64, 32); g.fillStyle = '#6b4a2c'; g.fillRect(0, 20, 64, 12); g.fillStyle = '#5a3d22'; g.fillRect(0, 0, 6, 32); g.fillStyle = '#d9c9a3'; g.fillRect(0, 5, 64, 3); } },
    { height: 1.0, every: 5, size: [64, 32], skip: (s, side, section) => section !== 'D', draw(g) { g.fillStyle = '#9a9a8c'; g.fillRect(0, 0, 64, 32); g.fillStyle = '#7c7c70'; g.fillRect(0, 0, 3, 32); g.fillRect(30, 0, 3, 32); g.fillStyle = '#6f8f5a'; g.fillRect(0, 26, 64, 6); } },
  ],
  platform: false,
  start: { text: 'MONKEY JUNGLE', color: 0x6b4a2c, background: '#f2c94c', ink: '#3a2a14' },
  water: { color: 0x4f9a7a },
  signPost: 0x6b4a2c,
  env: { fog: [0xa9d2a0, 50, 620], background: 0xa9d2a0, exposure: 1.0 },
  lights: { hemi: [0xe6ffd9, 0x4f7a3a, 1.7], sun: [0xfff3c9, 2.0] },

  build({ group, D, movers, herd, clear, beside, sign, add, keep, prop, terrain, animated, band }) {
    const r = rng(2024), c = new THREE.Color(), rock = new THREE.Color(0x5a4c3a);
    const ground = terrain({ size: 1120, cell: 6.5, centre: [0, -25], height: jungleHill, blend: 30, near: 4, aloft: s => s > T.stair.sStart + 6 && s < T.stair.sEnd,
      color(x, z, y) { const n = 0.5 + 0.5 * Math.sin(x * 0.13) * Math.cos(z * 0.11), deep = Math.min(1, Math.max(0, (junglePlateau(x, z) - y - 2.5) / 6)); return c.setRGB(0.06 + 0.04 * n, 0.2 + 0.07 * n, 0.07 + 0.03 * n).lerp(rock, deep * 0.85); } });
    const onTop = (x, z) => junglePlateau(x, z) - jungleHill(x, z) < 1.2;
    // (nothing tall grows where the stair goes round its tree: it is in a clearing, where it can be seen)
    const clearing = (x, z) => Math.hypot(x - STAIR_TREE[0], z - STAIR_TREE[1]) < 46, wooded = (x, z) => onTop(x, z) && !clearing(x, z);
    const scatter = (count, margin, far, make, keepIf = onTop) => { const list = []; let tries = 0; while (list.length < count && tries++ < count * 30) { const x = (r() - 0.5) * far * 2, z = -25 + (r() - 0.5) * far * 2; if (clear(x, z, margin) && keepIf(x, z)) list.push(make(x, ground(x, z), z)); } return list; };
    const one = (name, geo, x, y, z, turn = 0, size = 1) => herd(name, geo, [[x, y, z, turn, size]]);
    const open = s => !T.isGap(s) && !T.isHole(s);

    // ---------- the river at the bottom of the gorge
    { const pos = [], idx = [];
      for (let k = 0; k <= 120; k++) { const z = -600 + k * 10, x = -6 * Math.sin(z / 60); pos.push(x - 34, RIVER_Y, z, x + 34, RIVER_Y, z); }
      for (let k = 0; k < 120; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      add('River', g, keep(new THREE.MeshStandardMaterial({ color: 0x3f9a8a, roughness: 0.08, transparent: true, opacity: 0.85, side: THREE.DoubleSide }))); }
    herd('River_Rocks', ball(1, 0, 0x8a8a7c, 0, 0, 0, 1.3, 0.7, 1), Array.from({ length: 60 }, () => { const z = -520 + r() * 1000; return [-6 * Math.sin(z / 60) + (r() - 0.5) * 30, RIVER_Y - 0.2, z, r() * 6, 1 + r() * 2.2]; }));

    // ---------- the forest: big trees close in on the trail, palms, undergrowth, hanging vines, orchids
    const tree = merge([cyl(0.55, 0.95, 13, 6, BARK, 0, 6.5, 0), ball(5.2, 0, LEAF, 0, 14, 0, 1.15, 0.7, 1.15), ball(3.8, 0, DARK, 2.6, 12.2, 1.4), ball(3.6, 0, 0x3a9a46, -2.2, 15.6, -1.2), cyl(0.9, 1.6, 1.4, 6, BARK, 0, 0.5, 0)]);
    const near = [];
    for (let s = 0; s < T.length; s += 6) { if (!open(s)) continue; for (const side of [-1, 1]) { const [x, , z] = beside(s + r() * 5, side, 3.2 + r() * 9); if (clear(x, z, 3) && wooded(x, z)) near.push([x, ground(x, z) - 0.3, z, r() * 6, 0.85 + r() * 0.7]); } }
    herd('Trees_By_The_Trail', tree, near);
    herd('Trees', tree.clone(), scatter(420, 12, 560, (x, y, z) => [x, y - 0.3, z, r() * 6, 0.9 + r() * 1.0], wooded));
    const fronds = [0, 1, 2, 3, 4, 5].map(k => cone(0.8, 4.4, 4, 0x3f9a4b, Math.cos(k * 1.047) * 1.9, 8.1, Math.sin(k * 1.047) * 1.9, Math.sin(k * 1.047) * 1.15, -Math.cos(k * 1.047) * 1.15));
    herd('Palms', merge([cyl(0.26, 0.4, 8.4, 6, 0x8a6a44, 0, 4.2, 0), ...fronds]), scatter(150, 5, 520, (x, y, z) => [x, y - 0.2, z, r() * 6, 0.7 + r() * 0.8], wooded));
    herd('Undergrowth', merge([cone(1.4, 2.2, 5, 0x3d9a48, 0, 1.0, 0), cone(1.0, 1.7, 5, DARK, 0.9, 0.8, 0.4, 0, -0.5), cone(1.0, 1.7, 5, 0x4aa556, -0.8, 0.8, -0.3, 0, 0.5)]), scatter(1500, 1.2, 430, (x, y, z) => [x, y - 0.1, z, r() * 6, 0.7 + r() * 1.3]));
    const lianas = [];
    for (let s = 5; s < T.length; s += 13) { if (!open(s) || onStair(s)) continue; const [x, y, z] = beside(s, r() < 0.5 ? -1 : 1, 1 + r() * 2.5); lianas.push([x, y, z, r() * 6, 0.8 + r() * 0.6]); }
    herd('Lianas', merge([cyl(0.07, 0.07, 9, 4, 0x4f8a3a, 0, 8.5, 0), cyl(0.05, 0.05, 6, 4, 0x4f8a3a, 0.5, 10, 0.3), cone(0.3, 0.6, 4, 0x3f9a4b, 0, 4.2, 0, Math.PI)]), lianas).castShadow = false;
    const orchid = hue => merge([cone(0.14, 0.2, 5, hue, 0, 0.42, 0, Math.PI), cyl(0.025, 0.025, 0.4, 3, 0x3d9148, 0, 0.2, 0)]);
    const blooms = [[], [], []];
    for (let s = 0; s < T.length; s += 1.6) { if (!open(s)) continue; const [x, , z] = beside(s, r() < 0.5 ? -1 : 1, 0.8 + r() * 5); if (clear(x, z, 0.6)) blooms[Math.floor(r() * 3)].push([x, ground(x, z), z, r() * 6, 0.8 + r()]); }
    [0xff5fa8, 0xffb52e, 0xb46bff].forEach((hue, k) => { herd(`Orchids_${k}`, orchid(hue), blooms[k]).castShadow = false; });

    // ---------- base camp: tents, a fire, the jeep
    const tent = hue => merge([cone(3.4, 3.6, 4, hue, 0, 1.8, 0), box(1.4, 1.8, 0.2, 0x3a2a14, 0, 0.9, 2.4)]);
    [[-28, -1, 9, 0xd9a55b], [-52, -1, 11, 0x7fa86a], [-40, 1, 10, 0xd9a55b]].forEach(([s, side, out, hue], k) => { const [x, , z, yaw] = beside(T.length + s, side, out); one(`Tent_${k}`, tent(hue), x, ground(x, z), z, yaw + side * 1.2); });
    { const [x, , z, yaw] = beside(T.length - 16, 1, 8); one('Jeep', merge([box(4.6, 1.5, 9, 0x6b7a3a, 0, 1.6, 0), box(4.2, 1.5, 3.4, 0x55622c, 0, 3.0, -1.6), ...[[-2.3, -2.9], [2.3, -2.9], [-2.3, 2.9], [2.3, 2.9]].map(([px, pz]) => cyl(1.05, 1.05, 0.8, 12, 0x15161a, px, 1.05, pz, 0, Math.PI / 2)), box(1.2, 1.2, 1.2, 0xa9743f, 0, 2.9, 2.6)]), x, ground(x, z), z, yaw + 0.5); }
    { const [x, , z] = beside(T.length - 66, 1, 7), y = ground(x, z);
      one('Camp_Fire', merge([...[0, 1, 2, 3, 4, 5].map(k => ball(0.4, 0, STONE, Math.cos(k * 1.05) * 1.3, 0.2, Math.sin(k * 1.05) * 1.3)), cyl(0.15, 0.15, 2, 5, BARK, 0, 0.4, 0, 1.2, 0), cyl(0.15, 0.15, 2, 5, BARK, 0, 0.4, 0, 1.2, 1.57)]), x, y, z);
      herd('Camp_Flames', cone(0.7, 1.9, 6, 0xff9a2a, 0, 1.2, 0), [[x, y, z, 0, 1]], keep(new THREE.MeshBasicMaterial({ vertexColors: true }))).castShadow = false; }

    // ---------- the rope bridges and the swings: each is drawn where the track says it is
    // (no ropes down the sides of anything: a dog that goes off the edge is in the river)
    const deck = (pad, kind) => {
      const long = pad.s1 - pad.s0, parts = [];
      if (kind === 'log') {
        // a tree trunk on its side, the top of it worn flat; its roots at one end and what is left of its branches at the other
        const girth = pad.half * 1.5, trunk = cyl(girth, girth * 1.12, long + 14, 12, BARK, 0, 0, 0, Math.PI / 2); trunk.scale(1, 0.62, 1).translate(0, -girth * 0.62 + 0.04, 0); parts.push(trunk);
        parts.push(box(pad.half * 2, 0.1, long, 0x7a5a38, 0, -0.03, 0));
        for (let z = -long / 2 + 3, k = 0; z < long / 2; z += 6, k++) parts.push(box(pad.half * 2 - 0.3, 0.05, 0.5, 0x4a3320, 0, 0.03, z + (k % 2)));
        for (let k = 0; k < 7; k++) parts.push(cyl(0.25, 0.7, 6, 5, BARK, Math.cos(k * 0.9) * 2.2, -1.2 + Math.sin(k * 0.9) * 2.2, long / 2 + 8, Math.PI / 2 + Math.sin(k * 0.9) * 0.5, Math.cos(k * 0.9) * 0.5));
        for (const [x, z, lean] of [[-2.6, -long / 2 - 3, 0.9], [2.7, -long / 4, -1.0], [-2.7, long / 5, 1.1]]) parts.push(cyl(0.2, 0.45, 5, 5, BARK, x * 1.4, -0.6, z, 0, lean), ball(1.6, 0, LEAF, x * 2.3, 0.6, z, 1.2, 0.6, 1.2));
        return merge(parts);
      }
      for (let z = -long / 2 + 0.5, k = 0; z < long / 2; z += 1.0, k++) parts.push(box(pad.half * 2, 0.22, 0.86, PLANK[k % 2], 0, -0.11, z));
      for (const side of [-1, 1]) {
        parts.push(box(0.16, 0.16, long, ROPE, side * pad.half, -0.3, 0));        // (the rope the planks are tied to: under them, not a rail)
        if (kind === 'swings') for (const end of [-1, 1]) parts.push(cyl(0.09, 0.09, 15, 5, 0x4f8a3a, side * (pad.half - 0.2), 7.3, end * (long / 2 - 0.6)));      // the vines it hangs on
      }
      return merge(parts);
    };
    for (const zone of T.platforms) {
      for (const pad of zone.pads) {
        const g = deck(pad, zone.kind); D.push(g);
        const mesh = new THREE.Mesh(g, prop); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = { bridge: 'Rope_Bridge', log: 'Fallen_Log', swings: 'Vine_Swing' }[zone.kind]; group.add(mesh);
        animated.push((t, focus, raceSeconds = 0) => { const p = T.padAt(pad, raceSeconds); mesh.position.set(p.x, p.y, p.z); mesh.rotation.y = p.rotationY; });
      }
      // posts at each end of it (and, over the swings, the great branch the vines hang from)
      if (zone.kind === 'log') continue;
      const ends = [zone.sStart - 0.5, zone.sEnd + 0.5].flatMap(s => [-1, 1].map(side => { const p = T.pointAt(s, side * 3.6); return [p.x, p.y, p.z, 0, 1]; }));
      herd('Bridge_Posts', merge([cyl(0.35, 0.45, 3.2, 7, BARK, 0, 1.6, 0), ball(0.5, 0, ROPE, 0, 3.3, 0)]), ends);
      if (zone.kind === 'swings') {
        const a = T.pointAt(zone.sStart - 8), b = T.pointAt(zone.sEnd + 8), long = Math.hypot(b.x - a.x, b.z - a.z);
        one('Great_Branch', merge([cyl(0.9, 1.3, long, 7, BARK, 0, 14.8, 0, Math.PI / 2), ...[-0.4, -0.15, 0.1, 0.35].map((f, k) => ball(5, 0, LEAF, k % 2 ? 2 : -2, 17, f * long, 1.3, 0.6, 1.3)), cyl(1.6, 2.2, 32, 7, BARK, 9, 1, -long / 2 - 2), cyl(1.6, 2.2, 32, 7, BARK, -9, 1, long / 2 + 2)]), (a.x + b.x) / 2, a.y, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z));
      }
    }
    // ---------- the tree stair: the kapok it winds round, the stilts it stands on, and the end of it
    { const [tx, tz] = STAIR_TREE, ty = ground(tx, tz) - 1, top = T.pointAt(T.stair.sEnd - 1).y;
      one('Kapok', merge([cyl(8, 12, 70, 12, 0x6b5238, 0, 35, 0), ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const root = box(1.6, 15, 13, 0x6b5238, 0, 5.5, 14, 0, -0.5); root.rotateY(k * Math.PI / 4 + 0.2); return root; }),
        ball(30, 1, LEAF, 0, 80, 0, 1.3, 0.5, 1.3), ball(20, 1, DARK, 20, 72, 10, 1.2, 0.55, 1.2), ball(20, 1, 0x3a9a46, -18, 74, -12, 1.2, 0.55, 1.2), ball(16, 1, LEAF, -6, 68, 22, 1.2, 0.5, 1.2),
        ...[0.4, 2.0, 3.5, 5.1].map((turn, k) => cyl(1.2, 2.2, 26, 6, 0x6b5238, Math.cos(turn) * 13, 60 + k * 2, Math.sin(turn) * 13, Math.sin(turn) * 1.0, -Math.cos(turn) * 1.0)),
        ...[0.9, 2.6, 4.4, 5.6].map(turn => cyl(0.1, 0.1, 30, 4, 0x4f8a3a, Math.cos(turn) * 15, 48, Math.sin(turn) * 15))]), tx, ty, tz);
      // stilts down each side, a beam across under the boards between each pair, and a beam in to the trunk every so often
      const stilts = [];
      for (let s = T.stair.sStart + 4, k = 0; s < T.stair.sEnd; s += 7, k++) {
        const c = T.pointAt(s), half = c.halfWidth + 0.5;
        for (const side of [-1, 1]) { const p = T.pointAt(s, side * half), low = ground(p.x, p.z) - 0.5, tall = c.y - 0.3 - low; if (tall > 0.4) stilts.push(cyl(0.3, 0.38, tall, 6, BARK, p.x, low + tall / 2, p.z)); }
        if (c.y - ground(c.x, c.z) > 1.2) { const beam = box(half * 2 + 1, 0.5, 0.5, 0x4a3320, 0, 0, 0, c.rotationY); stilts.push(beam.translate(c.x, c.y - 1.0, c.z)); }
      }
      // (the last pair stand taller than the boards, with a crossbar: the end of the stair is a doorway on to nothing)
      { const lip = T.pointAt(T.stair.sEnd - 0.6), half = lip.halfWidth + 0.5;
        for (const side of [-1, 1]) { const p = T.pointAt(T.stair.sEnd - 0.6, side * half), low = ground(p.x, p.z) - 0.5; stilts.push(cyl(0.34, 0.44, top + 6 - low, 7, BARK, p.x, (top + 6 + low) / 2, p.z)); }
        const bar = box(half * 2 + 1.4, 0.6, 0.6, BARK, 0, 0, 0, lip.rotationY); stilts.push(bar.translate(lip.x, top + 5.6, lip.z)); }
      add('Stair_Stilts', merge(stilts), prop, { shadow: true });
      // the steps themselves: a board every two metres, each a little higher than the last
      const steps = [];
      for (let s = T.stair.sStart, k = 0; s < T.stair.turnS; s += 2, k++) {
        const c = T.pointAt(s + 1), high = T.pointAt(s + 2).y, tread = box(c.halfWidth * 2 - 0.1, 0.5, 2.6, PLANK[k % 2], 0, 0, 0, c.rotationY);
        steps.push(tread.translate(c.x, high - 0.23, c.z), box(c.halfWidth * 2 - 0.1, 0.5, 0.16, 0x6b4a2c, 0, 0, 0, c.rotationY).translate(T.pointAt(s).x, high - 0.25, T.pointAt(s).z));
      }
      add('Stair_Steps', merge(steps), prop, { shadow: true }).receiveShadow = true;
      // the side of the boards, so the stair has some thickness to it
      const [a, b] = [T.indexAtS(T.stair.sStart), T.indexAtS(T.stair.sEnd) - 1], sideM = keep(new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9, side: THREE.DoubleSide }));
      for (const side of [-1, 1]) add('Stair_Side', band(T, a, b, i => ({ lat: side * (S.width[i] / 2 + 3), y: S.y[i] - 0.9 }), i => ({ lat: side * (S.width[i] / 2 + 3), y: S.y[i] - 1.7 })), sideM);
      add('Stair_Under', band(T, a, b, i => ({ lat: -S.width[i] / 2 - 3, y: S.y[i] - 1.7 }), i => ({ lat: S.width[i] / 2 + 3, y: S.y[i] - 1.7 })), sideM); }

    // ---------- the lost temple: a stepped pyramid, pillars up the ramp, stone heads, the doorway the balls roll out of
    { const top = T.pointAt(T.temple.sEnd + 6), [x, , z, yaw] = beside(T.temple.sEnd + 6, -1, 36), y = ground(x, z) - 1;
      one('Temple', merge([0, 1, 2, 3, 4].flatMap(k => [box(46 - k * 8, 5, 46 - k * 8, k % 2 ? 0x8c8c7e : STONE, 0, 2.5 + k * 5, 0), box(46 - k * 8 + 0.6, 0.6, 46 - k * 8 + 0.6, MOSS, 0, 5 + k * 5, 0)]).concat([box(8, 6, 8, STONE, 0, 28, 0), box(10, 1, 10, MOSS, 0, 31.5, 0)])), x, y, z, yaw);
      const h = top.halfWidth + 1;
      one('Temple_Gate', merge([box(2.2, 8, 2.2, STONE, -h - 1, 4, 0), box(2.2, 8, 2.2, STONE, h + 1, 4, 0), box(h * 2 + 5.4, 2.2, 2.6, 0x8c8c7e, 0, 9.1, 0), box(h * 2 + 2, 1.2, 2.2, MOSS, 0, 10.8, 0), ball(1.3, 1, 0xf2c94c, 0, 9.1, 1.3, 1, 1, 0.4)]), top.x, top.y, top.z, top.rotationY); }
    const pillars = [];
    for (let s = T.temple.sStart - 20; s < T.temple.sEnd + 30; s += 11) for (const side of [-1, 1]) { const [x, y, z] = beside(s, side, 1.6); pillars.push([x, y - 0.5, z, 0, 0.8 + r() * 0.5]); }
    herd('Pillars', merge([cyl(0.7, 0.8, 5.4, 8, STONE, 0, 2.7, 0), box(1.9, 0.6, 1.9, 0x8c8c7e, 0, 5.6, 0), box(1.9, 0.5, 1.9, MOSS, 0, 0.25, 0)]), pillars);
    const idol = merge([box(2.6, 3.4, 2.4, STONE, 0, 1.7, 0), box(3.0, 0.7, 2.6, 0x8c8c7e, 0, 3.6, 0), box(0.6, 0.5, 0.3, 0x2a2a26, -0.6, 2.4, 1.2), box(0.6, 0.5, 0.3, 0x2a2a26, 0.6, 2.4, 1.2), box(1.6, 0.4, 0.3, 0x2a2a26, 0, 1.0, 1.2), box(0.5, 1.0, 0.5, 0x8c8c7e, 0, 1.8, 1.3)]);
    herd('Stone_Heads', idol, T.obstacles.filter(ob => ob.kind === 'idol').map(ob => [ob.x, ob.y, ob.z, ob.rotationY + Math.PI, 0.9]));
    // ---------- the giant fig: its roots are in the trail
    { const bend = T.sections.find(q => q.id === 'H'), [x, , z] = beside((bend.sStart + bend.sEnd) / 2, -1, 28), y = ground(x, z);
      one('Giant_Fig', merge([cyl(5, 8, 30, 9, BARK, 0, 15, 0), ...[0, 1, 2, 3, 4, 5, 6].map(k => cyl(0.9, 2.2, 14, 5, BARK, Math.cos(k * 0.9) * 8, 4, Math.sin(k * 0.9) * 8, Math.sin(k * 0.9) * 0.6, -Math.cos(k * 0.9) * 0.6)),
        ball(20, 1, LEAF, 0, 36, 0, 1.3, 0.55, 1.3), ball(13, 1, DARK, 12, 32, 6, 1.2, 0.6, 1.2), ball(13, 1, 0x3a9a46, -11, 33, -7, 1.2, 0.6, 1.2)]), x, y - 1, z); }
    herd('Fig_Roots', merge([cyl(0.7, 1.2, 3.6, 6, BARK, 0, 0.5, 0, Math.PI / 2 - 0.25, 0), ball(1.1, 0, BARK, 0, 0.4, 0, 1.2, 0.8, 1.2)]), T.obstacles.filter(ob => ob.kind === 'root').map((ob, k) => [ob.x, ob.y, ob.z, ob.rotationY + 1.2 + k, 1]));
    // lily pads on the pond
    { const pads = []; for (let s = T.pond.sStart + 5; s < T.pond.sEnd - 5; s += 2.6) { const p = T.pointAt(s, (r() - 0.5) * 11); pads.push([p.x, p.y - 0.27, p.z, r() * 6, 0.5 + r() * 0.6]); }
      herd('Lily_Pads', merge([cyl(1, 1, 0.05, 9, 0x4aa556, 0, 0, 0), cone(0.3, 0.35, 5, 0xff9ec4, 0.3, 0.2, 0.2, Math.PI)]), pads).castShadow = false; }

    // ---------- snakes, going round and round: a head and a tail of links, each put where the track says it is
    { const SCALE = [0x3fc45a, 0x15602a], linkG = [0, 1].map(k => ball(0.78, 1, SCALE[k], 0, 0, 0, 1, 0.72, 1.25));
      const headG = merge([ball(0.95, 1, 0x3fc45a, 0, 0, 0.1, 1, 0.7, 1.35), ball(0.17, 0, 0xffe45c, -0.42, 0.34, 0.7), ball(0.17, 0, 0xffe45c, 0.42, 0.3, 0.6), ball(0.08, 0, 0x15161a, -0.46, 0.34, 0.72), ball(0.08, 0, 0x15161a, 0.46, 0.34, 0.72),
        box(0.12, 0.05, 0.9, 0xe0283a, 0, -0.1, 1.4), box(0.3, 0.05, 0.12, 0xe0283a, 0, -0.1, 1.85, 0.5), box(0.3, 0.05, 0.12, 0xe0283a, 0, -0.1, 1.85, -0.5)]);
      D.push(headG, ...linkG);
      T.snakes.forEach((_, k) => { for (let n = 0; n < T.snake.links; n++) {
        const size = n === 0 ? 1 : 1 - 0.55 * n / T.snake.links, link = new THREE.Mesh(n === 0 ? headG : linkG[n % 2], prop); link.castShadow = true; link.name = n === 0 ? 'Snake_Head' : 'Snake'; link.scale.setScalar(size); group.add(link);
        movers[`snake-${k}-${n}`] = h => { link.position.set(h.x, h.y + 0.45 * size + (n === 0 ? 0.25 : 0.06 * Math.sin(h.slither)), h.z); link.rotation.y = h.rotationY + (n === 0 ? 0 : 0.25 * Math.sin(h.slither)); };
      } }); }

    // ---------- monkeys: the ones that run across the trail, and the ones up in the grove with the coconuts
    const FUR = 0x7a4e2a, FACE = 0xe2b98a;
    const monkeyParts = () => [ball(0.55, 1, FUR, 0, 0.75, 0, 0.9, 1, 1.15), ball(0.4, 1, FUR, 0, 1.35, 0.55), ball(0.25, 1, FACE, 0, 1.3, 0.85, 1, 0.9, 0.6), ball(0.16, 0, FACE, -0.42, 1.45, 0.5), ball(0.16, 0, FACE, 0.42, 1.45, 0.5),
      ...[[-0.4, 0.5], [0.4, 0.5], [-0.4, -0.45], [0.4, -0.45]].map(([x, z]) => cyl(0.11, 0.11, 0.7, 4, FUR, x, 0.35, z)), cyl(0.07, 0.07, 1.3, 4, FUR, 0, 1.2, -0.85, -0.7, 0)];
    const monkeyG = merge(monkeyParts()); D.push(monkeyG);
    T.monkeys.forEach((_, k) => { const m = new THREE.Mesh(monkeyG, prop); m.castShadow = true; m.name = 'Monkey'; group.add(m); movers[`monkey-${k}`] = h => { m.position.set(h.x, h.y + 0.28 * Math.abs(Math.sin(h.hop)), h.z); m.rotation.y = h.rotationY; m.rotation.x = 0.12 * Math.sin(h.hop); }; });
    const perch = merge([cyl(0.3, 0.4, 9, 6, BARK, 0, 4.5, 0), cyl(0.2, 0.25, 4, 5, BARK, 0, 8.4, 1.6, Math.PI / 2, 0), ball(2.6, 0, LEAF, 0, 10.6, 0, 1.2, 0.6, 1.2)]), perches = [], sitters = [];
    T.targets.forEach((target, k) => {
      const side = k % 2 ? 1 : -1, [x, y, z, yaw] = beside(target.s, side, 1.3), turn = yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), p = T.pointAt(target.s, side * (T.pointAt(target.s).halfWidth - 0.4));
      perches.push([x, y - 0.3, z, turn, 1]); sitters.push([p.x, y + 8.3, p.z, turn, 1.1]);
    });
    herd('Monkey_Perches', perch, perches); herd('Monkeys_Up_Trees', merge(monkeyParts()), sitters);
    const nutG = new THREE.IcosahedronGeometry(0.55, 1), nutM = keep(new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.9 })), shadeG = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), burstG = new THREE.IcosahedronGeometry(1, 0); D.push(nutG, shadeG, burstG);
    T.targets.forEach((_, k) => {
      const shadeM = keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })), burstM = keep(new THREE.MeshBasicMaterial({ color: 0xfff3c9, transparent: true, opacity: 0.8, depthWrite: false }));
      const nut = new THREE.Mesh(nutG, nutM), shade = new THREE.Mesh(shadeG, shadeM), burst = new THREE.Mesh(burstG, burstM); nut.name = 'Coconut'; shade.name = 'Coconut_Shadow'; nut.castShadow = true; group.add(nut, shade, burst);
      movers[`coconut-${k}`] = (h, t) => {
        const falling = h.fall >= 0; nut.visible = shade.visible = falling; burst.visible = h.burst >= 0;
        shade.position.set(h.x, h.y + 0.06, h.z); shade.scale.setScalar(T.coconut.radius * (1.05 - 0.55 * Math.max(0, h.fall))); shadeM.opacity = 0.2 + 0.4 * (1 - Math.max(0, h.fall));
        nut.position.set(h.x, h.y + 0.55 + 13 * Math.max(0, h.fall) ** 1.6, h.z); nut.rotation.x = t * 7;
        if (h.burst >= 0) { burst.position.set(h.x, h.y + 0.6, h.z); burst.scale.setScalar(0.8 + h.burst * 2.2); burstM.opacity = 0.8 * (1 - h.burst); }
      };
    });
    // ---------- the stone balls
    const R = T.ballRun.radius, stoneG = new THREE.IcosahedronGeometry(R, 1), stoneM = keep(new THREE.MeshStandardMaterial({ color: 0x8c8c7e, roughness: 1, flatShading: true })); D.push(stoneG);
    T.ballRun.lanes.forEach((_, k) => {
      const stone = new THREE.Mesh(stoneG, stoneM); stone.rotation.order = 'YXZ'; stone.castShadow = true; stone.name = 'Stone_Ball'; group.add(stone);
      movers[`stone-${k}`] = h => { stone.visible = h.fade > 0.01; stone.position.set(h.x, h.y + R, h.z); stone.rotation.set(-h.spin, h.rotationY, 0); stone.scale.setScalar(0.4 + 0.6 * h.fade); };
    });

    const [rope, swings, log, old] = T.platforms;
    for (const [text, s, side] of [['SNAKE!', T.snakes[0] - 22, -1], ['MONKEYS!', T.monkeys[0] - 14, 1], ['NO SIDES!', rope.sStart - 22, -1], ['STONE BALLS!', T.temple.sStart - 14, 1], ['JUMP THE SWINGS', swings.sStart - 26, -1], ['COCONUTS!', T.grove.sStart - 6, 1],
      ['UP THE TREE', T.stair.sStart - 12, -1], ['JUMP OFF!', T.stair.turnS - 4, 1], ['THE LOG', log.sStart - 22, 1], ['OLD BRIDGE', old.sStart - 22, 1], ['POND', T.pond.sStart - 16, -1], ['SNAKES!', T.snakes[1] - 22, 1]]) sign(text, s, side, '#f2c94c', '#3a2a14');
  },
});
