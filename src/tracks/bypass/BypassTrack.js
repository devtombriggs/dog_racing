// Bypass Dash — the look of it: tarmac, white lines and crash barriers, the service station at the start, cars and lorries on
// the motorway and across the crossing, the roadworks' barriers and cones, the roundabout with its grass and the big bone in the
// middle, the underpass, the footbridge, street lamps and hedges.  The track itself is shared/bypassData.js; the parts every
// kit map shares are in ../trackKit3d.js.
import * as THREE from 'three';
import { BYPASS as T } from '../../../shared/bypassData.js';
import { createKitWorld, rng, box, cyl, ball, cone, merge, band, span } from '../trackKit3d.js';

const S = T.samples;
const TARMAC = [0x3b3e44, 0x373a40], GRASS = 0x5f9448, CONCRETE = 0x9a9c9f;
const HUES = [0xd8342c, 0x2c6fd8, 0xf2c230, 0xf4f4f0, 0x2f9a56, 0x8a4fd0];      // what colour a car is (its `hue`)
// the lie of the land: nearly flat, a little below the roads (which are on a low bank, the motorway highest)
const land = (x, z) => 3.45 + 0.2 * Math.sin(x / 90 + 1) * Math.cos(z / 70);

export const createBypass = () => createKitWorld(T, {
  name: 'BypassDash', sunDirection: [0.4, 0.8, 0.35],
  sky: { top: 0x5fa4e6, horizon: 0xdfeaf0, clouds: 0xffffff, cloudCount: 16 },
  ground: { color: 0x558a41, y: -0.6 },             // (below the underpass, the lowest the road goes)
  road: { color: i => (S.section[i] === 'F' ? (i % 4 < 2 ? 0x77797c : 0x707275) : TARMAC[Math.floor(i / 3) % 2]), side: 0x4c7a3c, skirt: { out: 2.5, drop: 0.7 }, roughness: 0.9 },
  // crash barriers: a steel rail on posts
  edges: [{ height: 0.85, every: 3, size: [64, 32], cutout: true, draw(g) { g.clearRect(0, 0, 64, 32); g.fillStyle = '#6f7379'; g.fillRect(0, 12, 6, 20); g.fillStyle = '#c3c7cc'; g.fillRect(0, 4, 64, 9); g.fillStyle = '#9da1a7'; g.fillRect(0, 8, 64, 2); } }],
  start: { text: 'BYPASS DASH', color: 0x4a4d52, background: '#1f5fbf', ink: '#ffffff' },
  patches: { color: 0x17181a, roughness: 0.05 },           // wet tar
  // the footbridge's deck
  branch: { color: i => (i % 5 < 1 ? 0x8f9296 : CONCRETE),
    edges: [{ height: 1.0, every: 2, size: [64, 32], cutout: true, draw(g) { g.clearRect(0, 0, 64, 32); g.fillStyle = '#e8eaec'; g.fillRect(0, 0, 5, 32); g.fillRect(0, 3, 64, 4); g.fillRect(0, 16, 64, 3); } }] },
  env: { fog: [0xdbe7ee, 170, 1500], background: 0xdbe7ee, exposure: 1.0 },
  lights: { hemi: [0xeef5ff, 0x6a8a52, 1.5], sun: [0xfff3da, 2.2] },

  build({ group, D, movers, herd, clear, beside, add, keep, prop, terrain }) {
    const r = rng(404), field = new THREE.Color();
    const ground = terrain({ size: 1000, cell: 8, centre: [-20, -80], height: land, blend: 26, aloft: s => s > T.bridge.sStart && s < T.bridge.sEnd,       // (the land does not climb to the footbridge)
      color: (x, z) => { const n = 0.5 + 0.5 * Math.sin(x * 0.07) * Math.cos(z * 0.09); return field.setRGB(0.3 + 0.05 * n, 0.5 + 0.07 * n, 0.24 + 0.03 * n); } });
    // nothing is planted on the footbridge or the lines the crossing's traffic runs along
    const off = [];
    for (const b of T.branches) for (let s = b.sStart; s <= b.sEnd; s += 3) { const br = T.branchAt(s); if (br) { const p = T.pointAt(s, br.side * br.centre); off.push([p.x, p.z, br.half + 5]); } }
    for (const s of T.crossing.lanes) for (let lat = -T.crossing.reach - 6; lat <= T.crossing.reach + 6; lat += 5) { const p = T.pointAt(s, lat); off.push([p.x, p.z, 7]); }
    off.push([T.roundabout.x, T.roundabout.z, T.roundabout.radius]);
    const free = (x, z, margin) => clear(x, z, margin) && off.every(([ox, oz, keepOff]) => (x - ox) ** 2 + (z - oz) ** 2 > keepOff * keepOff);

    // ---------- white lines: dashes between the motorway's lanes and down the middle of the other roads
    const paint = keep(new THREE.MeshBasicMaterial({ color: 0xf2f2ea, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const line = (name, s0, s1, share, dashed = true) => { const [a, b] = span(T, s0, s1); add(name, band(T, a, b, i => ({ lat: share * S.width[i] / 2 - 0.13, y: S.y[i] + 0.05 }), i => ({ lat: share * S.width[i] / 2 + 0.13, y: S.y[i] + 0.05 }), { skip: dashed ? i => Math.floor(i / 2) % 3 === 2 : null }), paint); };
    for (const share of [-0.31, 0.31]) line('Lane_Lines', T.motorway.sStart - 30, T.motorway.sEnd + 10, share);
    for (const sec of T.sections.filter(each => 'ABDEGH'.includes(each.id))) line('Centre_Line', sec.sStart + 2, sec.sEnd - 2, 0);
    // (solid lines across the road either side of each lane of the crossing: where the traffic runs)
    for (const s of T.crossing.lanes) for (const d of [-3.4, 3.4]) { const c = T.pointAt(s + d), g = new THREE.PlaneGeometry(c.halfWidth * 2 - 0.6, 0.3).rotateX(-Math.PI / 2); D.push(g); const m = new THREE.Mesh(g, paint); m.position.set(c.x, c.y + 0.05, c.z); m.rotation.y = c.rotationY; m.name = 'Crossing_Line'; group.add(m); }

    // ---------- the crossing: the dual carriageway the traffic comes along, either side of the road
    { const lanes = T.crossing.lanes, mid = (lanes[0] + lanes.at(-1)) / 2, wide = lanes.at(-1) - lanes[0] + 12, c = T.pointAt(mid), long = T.crossing.reach * 2 + 8;
      const g = new THREE.PlaneGeometry(long, wide).rotateX(-Math.PI / 2); D.push(g);
      const m = new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))); m.position.set(c.x, c.y - 0.04, c.z); m.rotation.y = c.rotationY; m.receiveShadow = true; m.name = 'Dual_Carriageway'; group.add(m);
      // (a hedge and a tunnel mouth at each end, where the traffic comes from and goes to)
      const mouths = []; for (const side of [-1, 1]) { const p = T.pointAt(mid, side * (T.crossing.reach + 4)); mouths.push([p.x, c.y, p.z, c.rotationY, 1]); }
      herd('Crossing_Mouths', merge([box(3, 6, wide + 6, 0x5b5e63, 0, 3, 0), box(3.4, 1, wide + 8, 0x3f7a35, 0, 6.5, 0), ...[-2, -1, 0, 1, 2].map(k => ball(2.2, 1, 0x3f7a35, 0, 7.2, k * (wide / 5)))]), mouths); }

    // ---------- the service station at the start: a canopy over the pumps, the shop, and the sign
    { const [x, y, z, yaw] = beside(-34, 1, 16);
      const station = merge([box(26, 0.6, 12, 0x1f5fbf, 0, 6, 0), box(26.4, 0.9, 12.4, 0xf4f4f0, 0, 6.7, 0), ...[-10, 10].flatMap(px => [-4, 4].map(pz => cyl(0.3, 0.3, 6, 8, 0xd9dcdf, px, 3, pz))),
        ...[-6, 0, 6].map(px => box(1.1, 1.8, 0.7, 0xd8342c, px, 0.9, 0)), ...[-6, 0, 6].map(px => box(1.3, 0.3, 0.9, 0x2a2c30, px, 1.95, 0)),
        box(20, 5, 8, 0xe9e4d6, 0, 2.5, 14), box(20.6, 0.5, 8.6, 0x1f5fbf, 0, 5.2, 14), box(4, 2.6, 0.2, 0x9fd3f2, -4, 1.6, 9.9), box(4, 2.6, 0.2, 0x9fd3f2, 4, 1.6, 9.9), box(2, 3, 0.2, 0x2a2c30, 0, 1.5, 9.9)]);
      herd('Service_Station', station, [[x, y - 0.1, z, yaw, 1]]);
 }

    // ---------- street lamps all the way round, and hedges and trees behind the barriers
    const lamps = [];
    for (let s = 20; s < T.length - 10; s += 44) { const side = Math.floor(s / 44) % 2 ? 1 : -1, [x, y, z, yaw] = beside(s, side, 1.6); if (free(x, z, 0.5) && !T.branchAt(s)) lamps.push([x, y, z, yaw + (side > 0 ? Math.PI : 0), 1]); }
    herd('Street_Lamps', merge([cyl(0.14, 0.2, 8, 6, 0x6f7379, 0, 4, 0), box(2.4, 0.16, 0.2, 0x6f7379, 1.1, 8, 0), box(0.9, 0.2, 0.4, 0xfff2b8, 2.0, 7.9, 0)]), lamps);
    const scatter = (count, margin, far, make) => { const list = []; let tries = 0; while (list.length < count && tries++ < count * 30) { const x = -20 - far + r() * far * 2, z = -80 - far + r() * far * 2; if (free(x, z, margin)) list.push(make(x, ground(x, z), z)); } return list; };
    herd('Trees', merge([cyl(0.35, 0.5, 4, 6, 0x6b4a2c, 0, 2, 0), ball(2.8, 1, 0x3f8a3a, 0, 5.6, 0, 1, 1.1, 1), ball(2, 1, 0x4a9a44, 1.2, 6.6, 0.6)]), scatter(260, 9, 440, (x, y, z) => [x, y - 0.2, z, r() * 6.28, 0.8 + r() * 0.7]));
    herd('Poplars', merge([cyl(0.25, 0.35, 3, 6, 0x6b4a2c, 0, 1.5, 0), ball(1.5, 1, 0x2f7a3a, 0, 6, 0, 1, 3.2, 1)]), scatter(140, 8, 440, (x, y, z) => [x, y - 0.2, z, r() * 6.28, 0.8 + r() * 0.6]));
    herd('Bushes', ball(1.3, 1, 0x4a8a3c, 0, 0.7, 0, 1.3, 0.8, 1.1), scatter(360, 3.5, 420, (x, y, z) => [x, y, z, r() * 6.28, 0.7 + r() * 0.9])).castShadow = false;

    // ---------- the roadworks: red and white barriers to weave through, and cones along the edges
    herd('Barriers', merge([box(2.0, 0.9, 0.7, 0xd8342c, 0, 0.45, 0), box(0.6, 0.92, 0.72, 0xf4f4f0, -0.5, 0.45, 0), box(0.6, 0.92, 0.72, 0xf4f4f0, 0.5, 0.45, 0), cyl(0.12, 0.12, 0.5, 6, 0xffb21a, 0, 1.15, 0), ball(0.2, 1, 0xffd23a, 0, 1.5, 0)]),
      T.obstacles.map((ob, k) => [ob.x, ob.y, ob.z, ob.rotationY + Math.PI / 2 + (k % 2 ? 0.25 : -0.25), 1]));
    { const cones = [], first = T.obstacles[0].s - 22, last = T.mud.at(-1).s + 14;
      for (let s = first; s < last; s += 5) for (const side of [-1, 1]) { const c = T.pointAt(s), p = T.pointAt(s, side * (c.halfWidth - 0.75)); cones.push([p.x, p.y, p.z, 0, 1]); }
      herd('Cones', merge([cone(0.26, 0.75, 8, 0xff6a1a, 0, 0.4, 0), cyl(0.2, 0.22, 0.12, 8, 0xf4f4f0, 0, 0.42, 0), box(0.6, 0.06, 0.6, 0xff6a1a, 0, 0.03, 0)]), cones).castShadow = false; }

    // ---------- the roundabout: the grass in the middle, a kerb round it, chevrons facing the way in, and the big bone
    { const R = T.roundabout, y = T.pointAt((R.sStart + R.sEnd) / 2).y, inner = R.radius - 8;
      const island = add('Roundabout_Grass', new THREE.CircleGeometry(inner, 48).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: GRASS, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
      island.position.set(R.x, y - 0.03, R.z); island.receiveShadow = true;
      const kerb = add('Roundabout_Kerb', new THREE.TorusGeometry(inner, 0.25, 6, 64).rotateX(Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.8 }))); kerb.position.set(R.x, y + 0.05, R.z);
      const bone = merge([cyl(0.9, 0.9, 9, 10, 0xfff1c9, 0, 6, 0, 0, Math.PI / 2), ...[-4.5, 4.5].flatMap(px => [-0.9, 0.9].map(pz => ball(1.5, 1, 0xfff1c9, px, 6, pz))), cyl(0.5, 0.8, 5, 8, CONCRETE, 0, 2.5, 0), cyl(2.2, 2.6, 0.8, 12, CONCRETE, 0, 0.4, 0)]);
      off.push([R.x, R.z, 6]);
      herd('Roundabout_Bone', bone, [[R.x, y, R.z, T.pointAt((R.sStart + R.sEnd) / 2).rotationY, 1]]);
      const flowers = []; for (let k = 0; k < 90; k++) { const a = r() * 6.28, d = 6 + r() * (inner - 9), x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d; if (off.filter(each => each[2] < 20).every(([ox, oz, keepOff]) => (x - ox) ** 2 + (z - oz) ** 2 > keepOff * keepOff)) flowers.push([x, y, z, a, 0.7 + r() * 0.7]); }
      herd('Roundabout_Flowers', merge([ball(0.22, 0, 0xffd23a, 0, 0.3, 0), ball(0.22, 0, 0xff5a8a, 0.4, 0.25, 0.2), ball(0.2, 0, 0xffffff, -0.3, 0.28, 0.3)]), flowers).castShadow = false; }

    // ---------- the underpass: concrete walls and the road over the top of it
    { const door = T.doors[0], c = T.pointAt(door.s), long = door.depth, half = door.width / 2 + 0.6;
      const tunnel = merge([box(1.4, 6.4, long, CONCRETE, -half - 0.7, 3.2, 0), box(1.4, 6.4, long, CONCRETE, half + 0.7, 3.2, 0), box(64, 1.4, long - 2, 0x7d8084, 0, 6.6, 0), box(64, 0.25, long - 3, 0x33363b, 0, 7.4, 0),
        box(64, 1, 0.4, 0xc3c7cc, 0, 8, long / 2 - 1.3), box(64, 1, 0.4, 0xc3c7cc, 0, 8, -long / 2 + 1.3),
        // (banks of earth either side of the mouth, up to the road above)
        ...[-1, 1].flatMap(side => [box(26, 6, long - 2, 0x4c7a3c, side * (half + 14.4), 3, 0)]),
        ...[-12, -4, 4, 12].map(z => box(1.6, 0.12, 0.5, 0xfff2b8, 0, 5.85, z))]);
      herd('Underpass', tunnel, [[c.x, c.y, c.z, c.rotationY, 1]]); }

    // ---------- the footbridge: pillars under it, and steps painted up the ramps
    { const B = T.bridge, pillars = [];
      for (let s = B.sStart + 10; s < B.sEnd - 10; s += 11) { const br = T.branchAt(s); if (!br || br.lift < 2.5) continue; const p = T.pointAt(s, br.side * br.centre), nearLane = T.crossing.lanes.some(lane => Math.abs(lane - s) < 4.5); if (!nearLane) pillars.push([p.x, p.y, p.z, 0, 1, br.lift]); }
      const g = cyl(0.45, 0.55, 1, 8, CONCRETE, 0, -0.5, 0); D.push(g);
      const mesh = new THREE.InstancedMesh(g, prop, pillars.length), o = new THREE.Object3D();
      pillars.forEach(([x, y, z, , , lift], k) => { o.position.set(x, y - 0.3, z); o.scale.set(1, lift + 0.4, 1); o.updateMatrix(); mesh.setMatrixAt(k, o.matrix); });
      mesh.name = 'Footbridge_Pillars'; mesh.castShadow = true; group.add(mesh); D.push(mesh); }

    // ---------- the traffic.  A car: body, cabin, wheels; a lorry: cab and a long box.  Each is drawn nose first along +z.
    const carG = HUES.map(hue => merge([box(1.9, 0.7, 4.2, hue, 0, 0.75, 0), box(1.7, 0.65, 2.1, hue, 0, 1.4, -0.25), box(1.72, 0.5, 0.1, 0x9fd3f2, 0, 1.42, 0.82), box(1.72, 0.5, 0.1, 0x9fd3f2, 0, 1.42, -1.32),
      ...[-1.3, 1.3].flatMap(z => [-0.95, 0.95].map(x => cyl(0.38, 0.38, 0.3, 10, 0x1c1d20, x, 0.38, z, 0, Math.PI / 2))), box(0.5, 0.16, 0.06, 0xfff2b8, -0.6, 0.85, 2.12), box(0.5, 0.16, 0.06, 0xfff2b8, 0.6, 0.85, 2.12), box(0.5, 0.16, 0.06, 0xd8342c, -0.6, 0.85, -2.12), box(0.5, 0.16, 0.06, 0xd8342c, 0.6, 0.85, -2.12)]));
    const lorryG = HUES.map(hue => merge([box(2.5, 2.2, 2.2, hue, 0, 1.6, 2.9), box(2.3, 0.9, 0.1, 0x9fd3f2, 0, 2.1, 4.02), box(2.6, 2.9, 5.6, 0xeceae2, 0, 2.1, -1.1), box(2.62, 0.5, 5.62, hue, 0, 1.0, -1.1),
      ...[3.0, -0.2, -3.0].flatMap(z => [-1.2, 1.2].map(x => cyl(0.5, 0.5, 0.4, 10, 0x1c1d20, x, 0.5, z, 0, Math.PI / 2))), box(0.6, 0.2, 0.06, 0xfff2b8, -0.8, 0.9, 4.02), box(0.6, 0.2, 0.06, 0xfff2b8, 0.8, 0.9, 4.02)]));
    D.push(...carG, ...lorryG);
    const vehicle = (id, lorry, hue) => {
      const mesh = new THREE.Mesh((lorry ? lorryG : carG)[hue], prop); mesh.castShadow = true; mesh.name = lorry ? 'Lorry' : 'Car'; group.add(mesh);
      // (a lorry is two hazards, the front one `apart / 2` ahead of its middle: it is drawn from that one)
      const back = lorry ? T.sizes.lorry.apart / 2 : 0;
      movers[lorry ? `${id}-a` : id] = h => { mesh.visible = h.show > 0.03; mesh.position.set(h.x - Math.sin(h.rotationY) * back, h.y, h.z - Math.cos(h.rotationY) * back); mesh.rotation.y = h.rotationY; mesh.scale.setScalar(Math.max(0.001, h.show)); };
    };
    for (const v of T.motorway.traffic) vehicle(v.id, v.lorry, v.hue);
    for (const v of T.crossing.crossers) vehicle(v.id, v.lorry, v.hue);

  },
});
