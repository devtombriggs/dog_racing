// Wendover Woods — a lap of a real wood (Tom, 2026-11-21: "completely revamp this please to an actual woods and make it a fun
// map").  It used to be a model built in Blender; now it is generated like the newer maps (shared/trackKit.js), so every corner
// is shaped for drifting.  The scenery is src/tracks/wendover/WendoverWoodsTrack.js.
//
// Tom, 2026-11-26: "the same length but a lot faster to complete.  This should be our flagship map.  Lets add a speed tunnel,
// some hills with speed boosts on, 2 seperate paths you can take" and fallen trees to jump, steep downhills, muddy puddles
// ("make sure you can avoid puddles etc"), narrow trails opening into fields, natural ramps and stream crossings.
//
// Round the lap:
//   A  The Clearing      start/finish in a wide field by the log cabin
//   B  Bluebell Run      S-bends steeply downhill through the bluebells, boost pads on the way; deer cross the path (too big to jump)
//   C  The Speed Tunnel  straight through a giant fallen tree, hollow inside: narrow, dark, and its whole floor is a boost
//   F  The Beck          a stream across the path: a boost pad and then a natural ramp, both right across the path, throw a dog over it
//                        (Tom, 2026-11-26: the ramp was on one half only, and a dog that came out of the bend on the other half missed
//                        the jump and its boost).  A dog too slow to clear it swims the rest (Poppy's).
//                        Then a fallen tree over half the path: round it or over it
//   D  The Old Oak       a hairpin round the biggest tree in the wood
//   E  The Fork          two paths round one long bend.  The High Path, up in the branches on the inside: shorter, narrow, a mega
//                        boost, and two fallen trees that have to be jumped.  The Low Path: wide, ordinary boosts, and muddy puddles
//                        to weave round (never more than half the path: there is always a dry line)
//   R  The Ridge         rolling hills, a boost pad on the way up each
//   G  The Long Drift    off the ridge and all the way down one long sweeping bend: hold a drift the whole way
//   H  The Fallen Log    a tree down across the path: the ramp in front of it throws you over (or you run into it)
//   I  The Narrow Trail  squeezed between the trees, and out into the clearing
import { makeTrack } from './trackKit.js';

const PAD = { speed: 1.5, hold: 2 };
const MEGA = { speed: 1.8, hold: 2.2, mega: true };
const TUNNEL = { speed: 1.7, hold: 2 };                 // the whole floor of the Speed Tunnel
const KICKER = { speed: 1.3, hold: 1.0, hop: 8.4 };
const DEER = { period: 7, pause: 0.12, radius: 1.1, height: 2.2 };
const LOG = { radius: 0.75, height: 0.95, spacing: 1.5 };
// (the smaller trees, jumped without a ramp: low enough that a jump a little early or late still clears one)
const TRUNK = { radius: 0.6, height: 0.8, spacing: 1.2 };
const PUDDLE = { kind: 'puddle', speed: 0.6, slowName: 'MUDDY PUDDLE' };
const TUNNEL_LENGTH = 86;

// (a hairpin: five points round a half circle `r` metres from (cx, cz), on the side `way` (+1 east, -1 west))
const hairpin = (cx, cz, r, way, height, width, section, name) => [90, 45, 0, -45, -90].map(deg => [cx + way * r * Math.cos(deg * Math.PI / 180), cz + r * Math.sin(deg * Math.PI / 180), height, width, section, deg === 0 ? name : undefined]);

// (an arc: n points `r` metres round from (cx, cz), from angle a0 to a1 in degrees, the height easing from h0 to h1)
const arc = (cx, cz, r, a0, a1, n, h0, h1, width, section, name) => Array.from({ length: n }, (_, k) => { const a = (a0 + (a1 - a0) * k / (n - 1)) * Math.PI / 180, f = k / (n - 1);
  return [cx + r * Math.cos(a), cz + r * Math.sin(a), h0 + (h1 - h0) * f, width, section, k === 0 ? name : undefined]; });

// [x, z, height, width, section, name?]
const ROUTE = [
  [-90, 222, 16, 20, 'A'], [-10, 224, 16, 20, 'A'], [64, 216, 16, 18, 'A'],
  [120, 194, 14, 14, 'B', 'bluebells'], [150, 156, 10.5, 14, 'B'], [140, 116, 7, 14, 'B', 'deer'], [162, 78, 3.5, 14, 'B'],
  [172, 36, 2, 11, 'C', 'log'], [166, -11, 2, 11, 'C'], [160, -58, 2, 11, 'C', 'logEnd'],
  [124, -94, 1.5, 13, 'F', 'beck'], [62, -104, 1.5, 13, 'F', 'trunk'],
  ...hairpin(4, -130, 26, -1, 2, 12, 'D', 'oak'),
  // the fork: in from the oak, half a circle 55 m round, and out along the foot of the ridge, climbing all the way
  [52, -160, 3, 14, 'E', 'fork'],
  ...arc(95, -215, 55, 90, -90, 7, 4, 13, 14, 'E', 'bend'),
  [40, -264, 15, 14, 'E', 'forkEnd'],
  // the ridge: over three hills
  [-12, -246, 19, 14, 'R', 'hill0'], [-64, -262, 16, 14, 'R'], [-112, -244, 21, 14, 'R', 'hill1'], [-156, -222, 18, 14, 'R', 'ridge'],
  // the long drift: one bend of 150 degrees, 80 m round, all the way down off the ridge
  ...arc(-185, -95, 80, -100, -250, 6, 22, 11, 15, 'G', 'drift'),
  [-190, 34, 10, 14, 'G', 'driftEnd'], [-214, 84, 10, 14, 'H'], [-194, 128, 10.5, 13, 'H', 'fallen'],
  [-166, 170, 13, 8.5, 'I', 'trail'], [-134, 204, 15.5, 9, 'I'],
];
const AT = Object.fromEntries(ROUTE.map((p, k) => [p[5], k]).filter(([name]) => name));

// (the whole wood is moved so that the start line is where it always was: at the origin, running along +x, at height 0: most
// of the lap is below it (`deck`: how low the kit lets a road go).  SCALE: the plan drawn a little smaller, which keeps the lap
// the length it was, 1.79 km)
const SCALE = 0.96, ORIGIN = { x: -50.52, z: 215.63, y: 16 };
export const WENDOVER_WOODS = makeTrack({
  id: 'wendover', name: 'Wendover Woods',
  deck: -ORIGIN.y,
  controlPoints: ROUTE.map(([x, z, height, width, section]) => [x * SCALE - ORIGIN.x, z * SCALE - ORIGIN.z, height - ORIGIN.y, width, section]),
  heightSmoothing: 5,
  hills: { down: 3.2, downMax: 0.35 },             // (Bluebell Run and the long drift off the ridge are quick)
  // the Speed Tunnel: no wider than this inside, all the way through
  doors: [{ u: AT.log + 1, width: 9, depth: TUNNEL_LENGTH }],
  sections: {
    A: { name: 'The Clearing', surface: 'grass' }, B: { name: 'Bluebell Run', surface: 'earth' }, C: { name: 'The Speed Tunnel', surface: 'bark' },
    F: { name: 'The Beck', surface: 'pebbles' }, D: { name: 'The Old Oak', surface: 'earth' }, E: { name: 'The Fork', surface: 'earth' }, R: { name: 'The Ridge', surface: 'earth' },
    G: { name: 'The Long Drift', surface: 'earth' }, H: { name: 'The Fallen Log', surface: 'earth' }, I: { name: 'The Narrow Trail', surface: 'grass' },
  },
}, ({ sAtU, pointAt, pingPong }) => {
  const pad = (id, s, more = PAD, long = 12) => ({ id, sStart: s, sEnd: s + long, ...more });
  // the beck: a short pool, deep enough to swim in the middle; the ramp, right across the path, throws a quick dog right over it,
  // and the boost pad in front of the ramp (in line with it, where it can be seen) makes sure of the speed
  const beckS = sAtU(AT.beck + 0.3), beck = { sStart: beckS, sEnd: beckS + 14, depth: 0.75, ramp: 3.5 };
  const beckRamp = { id: 'kicker-beck', sStart: beckS - 6.5, sEnd: beckS - 1.5, ...KICKER }, beckPad = { id: 'pad-beck', sStart: beckRamp.sStart - 13, sEnd: beckRamp.sStart - 1, ...PAD };
  const mid = sAtU(AT.log + 1), hollow = { sStart: mid - TUNNEL_LENGTH / 2, sEnd: mid + TUNNEL_LENGTH / 2 };
  // the fork.  The High Path is the second road: on the inside of the bend, up in the branches (`treetop`, as the scenery knows it)
  const treetop = { id: 'treetop-walk', name: 'The High Path', sStart: sAtU(AT.fork - 0.35), sEnd: sAtU(AT.forkEnd - 0.1), side: -1, offset: 21, half: 3, rise: 5, ramp: 0.22 };
  const forkLong = treetop.sEnd - treetop.sStart, forkAt = share => treetop.sStart + forkLong * share;
  // ...two fallen trees right across it (jump them), a mega pad before each
  const highTrunks = [0.38, 0.68].map(forkAt);
  // ...and the Low Path is the road itself: puddles, on one side and then the other
  const patches = [0.2, 0.34, 0.48, 0.62, 0.76].map((share, k) => { const s = forkAt(share), hw = pointAt(s).halfWidth; return { id: `puddle-${k}`, s, lateral: (k % 2 ? -1 : 1) * hw * 0.5, along: 5, across: hw * 0.4, ...PUDDLE }; });
  // fallen trees over half the path (round them or over them): after the beck, and out of the long drift
  const halfTrunks = [{ s: sAtU(AT.trunk + 0.45), side: 1 }, { s: sAtU(AT.driftEnd + 0.45), side: -1 }];
  // the fallen log right across the path, and the kicker ramp in front of it
  const logS = sAtU(AT.fallen) - 4, kickerS = logS - 9;
  const strips = [
    { id: 'kicker-log', sStart: kickerS, sEnd: kickerS + 5, ...KICKER },
    beckPad, beckRamp,
    // out of the clearing, and down Bluebell Run once the deer are behind (nobody is fired at a deer)
    pad('pad-clearing', sAtU(AT.bluebells - 0.9)), pad('pad-bluebell', sAtU(AT.deer + 0.95)),
    // the Speed Tunnel: its whole floor
    { id: 'pad-tunnel', sStart: hollow.sStart + 4, sEnd: hollow.sEnd - 4, ...TUNNEL },
    pad('pad-oak', sAtU(AT.oak + 2.3)),
    // the Low Path's own (right across the road: a dog on the High Path is not on them)
    pad('pad-low-0', forkAt(0.27)), pad('pad-low-1', forkAt(0.69)),
    // and the High Path has mega pads: the reward for the narrow line and the jumps
    ...[0.25, 0.51].map((share, k) => ({ id: `pad-treetop-${k}`, sStart: forkAt(share) - 6, sEnd: forkAt(share) + 6, branch: treetop.id, ...MEGA })),
    // the ridge: one on the way up each hill
    pad('pad-ridge-0', sAtU(AT.forkEnd + 0.35)), pad('pad-ridge-1', sAtU(AT.hill0 + 1.3)), pad('pad-ridge-2', sAtU(AT.hill1 + 0.9)),
    pad('pad-drift-0', sAtU(AT.drift + 1.2)), pad('pad-drift-1', sAtU(AT.drift + 3.4)), pad('pad-drift', sAtU(AT.driftEnd - 0.4)),
    pad('pad-home', sAtU(AT.fallen + 0.45)), pad('pad-trail', sAtU(AT.trail + 0.9)),
  ];
  const deerS = [sAtU(AT.deer - 0.3), sAtU(AT.deer + 0.4)];
  // the trees over half the path: `trunk`, so that the computer's dogs jump them on sight (a `log` is the planned jump off the ramp)
  for (const t of halfTrunks) { const hw = pointAt(t.s).halfWidth; t.from = t.side > 0 ? 0.5 : -hw + 0.6; t.to = t.side > 0 ? hw - 0.6 : -0.5; }
  // ...and the two on the High Path, from rail to rail
  const highSpans = highTrunks.map(s => ({ s, from: treetop.side * treetop.offset - treetop.half + 0.5, to: treetop.side * treetop.offset + treetop.half - 0.5 }));
  const trunks = [...halfTrunks.map(t => ({ s: t.s, from: t.from, to: t.to })), ...highSpans];
  // (what never moves is worked out once, the first time it is asked for: the High Path is not there to stand on until the track is made)
  let still = null;
  function fallen() {
    still = [];
    const across = (kind, id, s, from, to, size = LOG) => { const c = pointAt(s), count = Math.max(1, Math.round((to - from) / size.spacing)); for (let k = 0; k <= count; k++) { const p = pointAt(s, from + (to - from) * k / count); still.push({ id: `${id}-${k}`, kind, x: p.x, y: p.y, z: p.z, rotationY: c.rotationY, radius: size.radius, height: size.height, active: true }); } };
    // the fallen log, right across the path: jump it
    const hw = pointAt(logS).halfWidth; across('log', 'log', logS, -hw + 0.6, hw - 0.6);
    trunks.forEach((t, k) => across('trunk', `trunk-${k}`, t.s, t.from, t.to, TRUNK));
    return still;
  }
  function hazardsAt(t) {
    const out = [];
    deerS.forEach((s, k) => {
      const m = pingPong(t + k * 3.1, DEER.period, DEER.pause), c = pointAt(s), reach = c.halfWidth - 1.4, lat = (-reach + 2 * reach * m.k) * (k % 2 ? -1 : 1), p = pointAt(s, lat);
      out.push({ id: `deer-${k}`, kind: 'deer', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY + (m.dir * (k % 2 ? -1 : 1) > 0 ? Math.PI / 2 : -Math.PI / 2), radius: DEER.radius, height: DEER.height, active: true, trot: t * 8 + k });
    });
    return out.concat(still ?? fallen());
  }
  return {
    water: [beck], branches: [treetop], strips, patches, hazardsAt, autoPickups: { rowEvery: 240, boneEvery: 105, first: 62 },          // (the first row of boxes on the start straight)
    keepClear: [[hollow.sStart - 6, hollow.sEnd + 4], [deerS[0] - 16, deerS[1] + 16], [kickerS - 10, logS + 22], [beckPad.sStart - 10, beck.sEnd + 10], ...trunks.map(t => [t.s - 14, t.s + 14])],
    extras: { beck, beckRamp, hollow, treetop, trunks, trunkSize: TRUNK, fallenLog: { s: logS, radius: LOG.radius }, kicker: kickerS, deer: deerS, oak: [(4 - 30) * SCALE - ORIGIN.x, -130 * SCALE - ORIGIN.z],
      clearing: { x: -30 * SCALE - ORIGIN.x, z: 222 * SCALE - ORIGIN.z, radius: 60 },
      hazardZones: { deer: deerS, log: [logS], trunk: trunks.map(t => t.s) } },
  };
});
export default WENDOVER_WOODS;
