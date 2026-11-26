// The Vets — every dog's least favourite building, and it knows you are coming.  There is no way round
// it: the lap starts on the treadmill outside, which runs in at the front door, and from there it is
// three storeys of the inside of the place, up two flights of stairs, to the one way out: the window at
// the end of the top floor.  Out of it, down into the forecourt, and round on to the treadmill again.
// Nearly everything inside is moving, and nearly all of it is coming for you.  Built by
// shared/trackKit.js; the scenery is src/tracks/vets/VetsTrack.js.
//
// Round the lap:
//   A  The Treadmill        start/finish: a moving belt, in at the front door
//      ---- ground floor
//   B  Reception            in at the door, and round to the right
//   C  The Waiting Room     chairs and pet carriers to weave through; two cones of shame rolling from wall to wall (jump them)
//   D  The Stairs           up a floor, with giant pills bouncing down them at you (jump them)
//      ---- first floor
//   E  The Needle Corridor  syringes flying down it at you, one lane after another: jump them or get out of the way
//   F  The Landing          round the corner
//   G  The Operating Theatre  the operating tables, and vets in masks running at you: nothing jumps a vet, go round
//   H  The Top Stairs       up again, with another vet running down them
//      ---- top floor
//   I  The Kennels          just mopped: slippery.  Mind the buckets
//   J  The Long Ward        trolleys rolling from wall to wall (jump them), drip stands
//   K  The Way Out          one last vet, and the window at the end: run straight out of it
//      ---- outside
//   L  The Forecourt        where you come down, and round to the treadmill
import { makeTrack } from './trackKit.js';

const FLOOR = 0.6, STOREY = 9, FIRST = FLOOR + STOREY, TOP = FLOOR + 2 * STOREY;   // the ground floor is a step up from the forecourt; each floor is 9 m above the last
const DOOR = 9;
const CONE = { period: 7, pause: 0.06, radius: 1.2 };
const PILL = { period: 12, roll: 8, radius: 0.8, lanes: [-3, 0, 3] };
const SYRINGE = { period: 6.4, fly: 4.4, radius: 0.75, lanes: [-3.9, -1.3, 1.3, 3.9], y: 0.55 };
const TROLLEY = { period: 6, pause: 0.05, radius: 1.3 };
const VET = { radius: 1.05 };
const TREADMILL = { speed: 1.3, before: 22 };          // how much faster a dog is on the belt, and how far before the start line it begins

// [x, z, height, width, section].  The front wall is z = 0, and the dogs' right is +x on the way in.
const POINTS = [
  [0, -46, 0, 12, 'A'], [0, -23, 0, 12, 'A'],
  [0, 0, FLOOR, 12, 'B'], [0, 28, FLOOR, 14, 'B'], [16, 54, FLOOR, 14, 'B'],
  [50, 62, FLOOR, 20, 'C'], [85, 62, FLOOR, 20, 'C'], [120, 62, FLOOR, 20, 'C'],
  [150, 64, FLOOR, 13, 'D'], [181, 82, FLOOR + STOREY * 0.33, 12, 'D'], [192, 115, FLOOR + STOREY * 0.74, 12, 'D'], [181, 150, FIRST, 12, 'D'],
  [150, 166, FIRST, 13, 'E'], [115, 168, FIRST, 13, 'E'], [80, 168, FIRST, 13, 'E'], [50, 168, FIRST, 13, 'E'], [20, 168, FIRST, 13, 'E'],
  [-15, 168, FIRST, 12, 'F'], [-50, 172, FIRST, 12, 'F'],
  [-78, 192, FIRST, 20, 'G'], [-85, 224, FIRST, 20, 'G'], [-85, 256, FIRST, 18, 'G'],
  [-85, 284, FIRST, 12, 'H'], [-85, 314, FIRST + STOREY * 0.5, 12, 'H'], [-87, 344, TOP, 12, 'H'],
  [-98, 372, TOP, 18, 'I'], [-128, 392, TOP, 18, 'I'], [-166, 396, TOP, 18, 'I'],
  [-205, 394, TOP, 14, 'J'], [-245, 384, TOP, 14, 'J'], [-268, 350, TOP, 14, 'J'], [-272, 300, TOP, 14, 'J'], [-272, 230, TOP, 14, 'J'], [-272, 160, TOP, 14, 'J'],
  [-262, 102, TOP, 13, 'K'], [-230, 75, TOP, 13, 'K'], [-180, 70, TOP, 13, 'K'], [-125, 70, TOP, 13, 'K'], [-80, 60, TOP, 13, 'K'], [-58, 32, TOP, 13, 'K'], [-54, 0, TOP, 12, 'L'],        // (the last of these is the window: from there on it is the forecourt, 18 m below)
  [-54, -34, 0, 14, 'L'], [-52, -60, 0, 14, 'L'], [-40, -79, 0, 14, 'L'], [-27, -84, 0, 14, 'L'], [-13, -78, 0, 13, 'L'], [-2, -64, 0, 12, 'L'],
];
const firstOf = section => POINTS.findIndex(point => point[4] === section);
const [B, C, D, E, G, H, I, J, K, L] = ['B', 'C', 'D', 'E', 'G', 'H', 'I', 'J', 'K', 'L'].map(firstOf);
const WINDOW = L;                        // the control point in the front wall on the top floor: the road stops there

export const VETS = makeTrack({
  id: 'the_vets', name: 'The Vets',
  controlPoints: POINTS,
  drops: [WINDOW],
  // the front door, the doors between the rooms, the window
  doors: [{ u: B, width: DOOR, depth: 3 }, { u: B + 2.75, width: DOOR }, { u: C + 2.9, width: DOOR }, { u: D + 3.6, width: DOOR }, { u: E + 4.9, width: DOOR }, { u: G, width: DOOR }, { u: G + 2.9, width: DOOR }, { u: I, width: DOOR }, { u: J, width: DOOR }, { u: K, width: DOOR },
    { u: WINDOW - 0.04, width: DOOR, depth: 3 }],
  heightSmoothing: 4,
  rules: { slip: { grip: 0.25, acceleration: 0.65 } },
  sections: {
    A: { name: 'The Treadmill', surface: 'rubber' }, B: { name: 'Reception', surface: 'lino' }, C: { name: 'The Waiting Room', surface: 'lino' },
    D: { name: 'The Stairs', surface: 'steps' }, E: { name: 'The Needle Corridor', surface: 'lino' }, F: { name: 'The Landing', surface: 'lino' },
    G: { name: 'The Operating Theatre', surface: 'tiles' }, H: { name: 'The Top Stairs', surface: 'steps' }, I: { name: 'The Kennels', surface: 'wet floor' },
    J: { name: 'The Long Ward', surface: 'lino' }, K: { name: 'The Way Out', surface: 'lino' }, L: { name: 'The Forecourt', surface: 'paving' },
  },
}, ({ sAtU, pointAt, pingPong, sstep, length }) => {
  const obstacles = [];
  const stand = (id, kind, s, share, radius) => obstacles.push({ id, kind, s, lateral: share * pointAt(s).halfWidth, radius });
  // the belt: from just before the start line to the front door
  const door = sAtU(B), treadmill = { id: 'treadmill', sStart: length - TREADMILL.before, sEnd: door - 1, speed: TREADMILL.speed };
  // the waiting room: a row of chairs down each wall, pet carriers on the floor
  const chairS = sAtU(C + 0.35);
  for (let k = 0; k < 3; k++) { stand(`chairs-l-${k}`, 'chairs', chairS + k * 4.2, 0.78, 1.9); stand(`chairs-r-${k}`, 'chairs', chairS + 30 + k * 4.2, -0.78, 1.9); }
  [[0.9, -0.25], [1.6, 0.3], [2.3, -0.3]].forEach(([u, share], k) => stand(`carrier-${k}`, 'carrier', sAtU(C + u), share, 1.1));
  const cones = [sAtU(C + 0.6), sAtU(C + 1.95)];
  const stairs = { sStart: sAtU(D + 0.3), sEnd: sAtU(D + 3.3) };
  const corridor = { sStart: sAtU(E + 0.15), sEnd: sAtU(E + 4.7) };
  // the theatre: three operating tables down the middle, alternately left and right
  const theatre = { sStart: sAtU(G + 0.15), sEnd: sAtU(G + 2.7) };
  [[0.6, 0.42], [1.35, -0.42], [2.1, 0.42]].forEach(([u, share], k) => stand(`table-${k}`, 'table', sAtU(G + u), share, 2.0));
  const topStairs = { sStart: sAtU(H + 0.1), sEnd: sAtU(H + 1.9) };
  // the kennels: mop buckets, and a wet floor
  const kennels = { sStart: sAtU(I + 0.15), sEnd: sAtU(I + 2.8) };
  [[0.7, 0.4], [1.5, -0.4], [2.2, 0.35]].forEach(([u, share], k) => stand(`bucket-${k}`, 'bucket', sAtU(I + u), share, 0.9));
  // the long ward: drip stands by the beds, and two trolleys loose
  [[1.2, 0.55], [1.7, -0.55], [2.2, 0.55]].forEach(([u, share], k) => stand(`drip-${k}`, 'drip', sAtU(J + u), share, 0.7));
  const trolleys = [sAtU(J + 2.9), sAtU(J + 3.7)];
  const wayOut = { sStart: sAtU(K + 1.2), sEnd: sAtU(K + 4.3) }, windowS = sAtU(WINDOW);
  // the vets: each runs from the far end of its room towards the door the dogs come in at, down a line of its own
  // that wanders a little, turns round out of sight and comes again
  const runs = [
    { from: theatre.sEnd - 4, to: theatre.sStart + 4, lane: -0.5, period: 9, offset: 0 }, { from: theatre.sEnd - 4, to: theatre.sStart + 4, lane: 0.5, period: 9, offset: 4.5 }, { from: theatre.sEnd - 4, to: theatre.sStart + 4, lane: 0, period: 11, offset: 7 },
    { from: topStairs.sEnd - 2, to: topStairs.sStart + 2, lane: 0.3, period: 7.5, offset: 1 },
    { from: wayOut.sEnd, to: wayOut.sStart, lane: -0.35, period: 10, offset: 3 },
  ];

  function hazardsAt(t) {
    const out = [];
    cones.forEach((s, k) => {
      const m = pingPong(t + k * CONE.period / 2, CONE.period, CONE.pause), c = pointAt(s), reach = c.halfWidth - 2.2, p = pointAt(s, -reach + 2 * reach * m.k);
      out.push({ id: `cone-${k}`, kind: 'cone of shame', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY, radius: CONE.radius, height: 1.0, active: true, spin: (2 * reach * m.k) / CONE.radius });
    });
    trolleys.forEach((s, k) => {
      const m = pingPong(t + k * TROLLEY.period * 0.4, TROLLEY.period, TROLLEY.pause), c = pointAt(s), reach = c.halfWidth - 2.3, p = pointAt(s, (-reach + 2 * reach * m.k) * (k % 2 ? -1 : 1));
      out.push({ id: `trolley-${k}`, kind: 'trolley', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY, radius: TROLLEY.radius, height: 1.2, active: true, rattle: t * 14 + k });
    });
    PILL.lanes.forEach((lateral, k) => {
      const ph = (((t + k * PILL.period / 3) % PILL.period) + PILL.period) % PILL.period, rolling = ph < PILL.roll;
      const f = rolling ? ph / PILL.roll : 0, s = stairs.sEnd + (stairs.sStart - stairs.sEnd) * f, c = pointAt(s, lateral);
      out.push({ id: `pill-${k}`, kind: 'pill', x: c.x, y: c.y, z: c.z, rotationY: c.rotationY, radius: PILL.radius, height: 1.1, active: rolling, spin: (stairs.sEnd - s) / PILL.radius, fade: rolling ? Math.min(1, ph * 3, (PILL.roll - ph) * 3) : 0 });
    });
    SYRINGE.lanes.forEach((lateral, k) => {
      // (the order they come in jumps about the corridor, so there is always a way through: 0, 2, 1, 3)
      const turn = [0, 2, 1, 3][k], ph = (((t + turn * SYRINGE.period / 4) % SYRINGE.period) + SYRINGE.period) % SYRINGE.period, flying = ph < SYRINGE.fly;
      const f = flying ? ph / SYRINGE.fly : 0, s = corridor.sEnd + (corridor.sStart - corridor.sEnd) * f, c = pointAt(s, lateral);
      out.push({ id: `syringe-${k}`, kind: 'syringe', x: c.x, y: c.y + SYRINGE.y, z: c.z, rotationY: c.rotationY + Math.PI, radius: SYRINGE.radius, height: 0.9, active: flying, fade: flying ? Math.min(1, ph * 4, (SYRINGE.fly - ph) * 4) : 0 });
    });
    runs.forEach((run, k) => {
      const ph = (((t + run.offset) % run.period) + run.period) % run.period, charge = run.period * 0.72, coming = ph < charge;
      const f = coming ? ph / charge : 1 - (ph - charge) / (run.period - charge), s = run.from + (run.to - run.from) * f, hw = pointAt(s).halfWidth;
      const p = pointAt(s, (run.lane + 0.16 * Math.sin(t * 1.3 + k * 2)) * (hw - 1.6)), yaw = pointAt(s).rotationY;
      // (on the way back to the far end it is no danger: it has given up, and is walking backwards)
      out.push({ id: `vet-${k}`, kind: 'vet', x: p.x, y: p.y, z: p.z, rotationY: yaw + Math.PI, radius: VET.radius, height: 99, active: coming, stride: t * (coming ? 11 : 5) + k, coming });
    });
    return out;
  }
  return {
    obstacles, hazardsAt, strips: [treadmill], autoPickups: { rowEvery: 190, boneEvery: 50, apart: 26 },
    slipAt: s => 0.75 * sstep(kennels.sStart, kennels.sStart + 8, s) * sstep(kennels.sEnd, kennels.sEnd - 8, s),
    keepClear: [[cones[0] - 10, cones[0] + 8], [cones[1] - 10, cones[1] + 8], [stairs.sStart - 6, stairs.sEnd + 6], [corridor.sStart - 4, corridor.sEnd + 4], [theatre.sStart, theatre.sEnd], [topStairs.sStart - 4, topStairs.sEnd + 4],
      ...trolleys.map(s => [s - 10, s + 8]), [wayOut.sStart - 4, windowS], [length - TREADMILL.before - 6, length], [0, door + 4]],
    extras: { enclosed: 'BCDEFGHIJK',       // (walls to the ceiling either side: the camera is kept inside them, game/ChaseCamera.js)
      floor: FLOOR, first: FIRST, top: TOP, storey: STOREY, cones, stairs, corridor, theatre, topStairs, kennels, trolleys, wayOut, windowS, treadmill, pillRun: PILL, syringeRun: SYRINGE, vetRuns: runs,
      hazardZones: { cones, pills: [stairs.sStart, (stairs.sStart + stairs.sEnd) / 2, stairs.sEnd], syringes: [corridor.sStart, corridor.sStart + 40, corridor.sEnd - 40, corridor.sEnd], trolleys,
        vets: [theatre.sStart, (theatre.sStart + theatre.sEnd) / 2, theatre.sEnd, topStairs.sStart, topStairs.sEnd, wayOut.sStart, (wayOut.sStart + wayOut.sEnd) / 2, wayOut.sEnd] } },
  };
});
export default VETS;
