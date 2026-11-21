// Wendover Woods — a lap of a real wood (Tom, 2026-11-21: "completely revamp this please to an actual woods and make it a fun
// map").  It used to be a model built in Blender; now it is generated like the newer maps (shared/trackKit.js), so every corner
// is shaped for drifting.  The scenery is src/tracks/wendover/WendoverWoodsTrack.js.
//
// Round the lap:
//   A  The Clearing      start/finish by the log cabin
//   B  Bluebell Run      flowing S-bends downhill through the bluebells; deer cross the path (they are too big to jump)
//   C  The Hollow Log    straight through a giant fallen tree, hollow inside: narrow, and dark
//   F  The Beck          a stream across the path, deep enough to swim (Poppy's)
//   D  The Old Oak       a hairpin round the biggest tree in the wood
//   E  Ridge Climb       up a long sweeping bend to the ridge; the Treetop Walk cuts the inside of it, up in the branches:
//                        narrow and quicker, if you can hold the line
//   G  The Long Drift    off the ridge and all the way down one long sweeping bend: hold a drift the whole way
//   H  The Fallen Log    a tree down across the path: the ramp in front of it throws you over (or you run into it)
//   I  Home              a last bend into the clearing
import { makeTrack } from './trackKit.js';

const PAD = { speed: 1.4, hold: 1.4 };
const KICKER = { speed: 1.3, hold: 1.0, hop: 8.4 };
const DEER = { period: 7, pause: 0.12, radius: 1.1, height: 2.2 };
const LOG = { radius: 0.75, height: 0.95, spacing: 1.5 };

// (a hairpin: five points round a half circle `r` metres from (cx, cz), on the side `way` (+1 east, -1 west))
const hairpin = (cx, cz, r, way, height, width, section, name) => [90, 45, 0, -45, -90].map(deg => [cx + way * r * Math.cos(deg * Math.PI / 180), cz + r * Math.sin(deg * Math.PI / 180), height, width, section, deg === 0 ? name : undefined]);

// (an arc: n points `r` metres round from (cx, cz), from angle a0 to a1 in degrees, the height easing from h0 to h1)
const arc = (cx, cz, r, a0, a1, n, h0, h1, width, section, name) => Array.from({ length: n }, (_, k) => { const a = (a0 + (a1 - a0) * k / (n - 1)) * Math.PI / 180, f = k / (n - 1);
  return [cx + r * Math.cos(a), cz + r * Math.sin(a), h0 + (h1 - h0) * f, width, section, k === 0 ? name : undefined]; });

// [x, z, height, width, section, name?]
const ROUTE = [
  [-90, 222, 10, 16, 'A'], [-10, 224, 10, 16, 'A'], [64, 216, 10, 16, 'A'],
  [122, 192, 9, 14, 'B', 'bluebells'], [158, 146, 8, 14, 'B'], [130, 100, 7, 14, 'B', 'deer'], [166, 54, 6, 14, 'B'],
  [172, 6, 5, 11, 'C', 'log'], [164, -46, 5, 11, 'C', 'logEnd'],
  [124, -94, 4, 13, 'F', 'beck'], [62, -104, 4, 13, 'F'],
  ...hairpin(4, -130, 26, -1, 5, 12, 'D', 'oak'),
  [56, -158, 6, 13, 'E'], [112, -182, 8, 14, 'E', 'bend'], [108, -226, 10, 14, 'E'], [44, -244, 12, 14, 'E'], [-14, -220, 14, 14, 'E'], [-76, -248, 16, 14, 'E'], [-140, -226, 18, 14, 'E', 'ridge'],
  // the long drift: one bend of 150 degrees, 80 m round, all the way down off the ridge
  ...arc(-185, -95, 80, -100, -250, 6, 18, 10, 15, 'G', 'drift'),
  [-190, 34, 10, 14, 'G', 'driftEnd'], [-214, 84, 9, 14, 'H'], [-194, 128, 9, 14, 'H', 'fallen'], [-150, 186, 10, 15, 'I'],
];
const AT = Object.fromEntries(ROUTE.map((p, k) => [p[5], k]).filter(([name]) => name));

// (the whole wood is moved so that the start line is where it always was: at the origin, running along +x, at height 0)
const ORIGIN = { x: -49.7, z: 225.7, y: 10 };
export const WENDOVER_WOODS = makeTrack({
  id: 'wendover', name: 'Wendover Woods',
  controlPoints: ROUTE.map(([x, z, height, width, section]) => [x - ORIGIN.x, z - ORIGIN.z, height - ORIGIN.y, width, section]),
  heightSmoothing: 5,
  hills: { down: 2.4, downMax: 0.3 },              // (the long drift down off the ridge is quick)
  // the hollow log: no wider than this inside, all the way through
  doors: [{ u: AT.log + 0.5, width: 9, depth: 44 }],
  sections: {
    A: { name: 'The Clearing', surface: 'grass' }, B: { name: 'Bluebell Run', surface: 'earth' }, C: { name: 'The Hollow Log', surface: 'bark' },
    F: { name: 'The Beck', surface: 'pebbles' }, D: { name: 'The Old Oak', surface: 'earth' }, E: { name: 'Ridge Climb', surface: 'earth' },
    G: { name: 'The Long Drift', surface: 'earth' }, H: { name: 'The Fallen Log', surface: 'earth' }, I: { name: 'Home', surface: 'grass' },
  },
}, ({ sAtU, pointAt, pingPong }) => {
  // the beck: deep enough to swim in the middle
  const beck = { sStart: sAtU(AT.beck - 0.1), sEnd: sAtU(AT.beck + 0.55), depth: 0.75, ramp: 6 };
  const hollow = { sStart: sAtU(AT.log + 0.5) - 22, sEnd: sAtU(AT.log + 0.5) + 22 };
  // the Treetop Walk: across the inside of the long bend up to the ridge, up in the branches
  const treetop = { id: 'treetop-walk', name: 'The Treetop Walk', sStart: sAtU(AT.bend - 1.2), sEnd: sAtU(AT.bend + 1.6), side: -1, offset: 20, half: 2.2, rise: 5, ramp: 0.25 };
  // the fallen log across the path, and the kicker ramp in front of it
  const logS = sAtU(AT.fallen) - 4, kickerS = logS - 9;
  const strips = [
    { id: 'kicker-log', sStart: kickerS, sEnd: kickerS + 5, ...KICKER },
    // pads out of the hairpin, up the ridge, and out of the long drift
    { id: 'pad-oak', sStart: sAtU(AT.oak + 2.4), sEnd: sAtU(AT.oak + 2.4) + 12, ...PAD },
    { id: 'pad-ridge-0', sStart: sAtU(AT.ridge - 1.4), sEnd: sAtU(AT.ridge - 1.4) + 12, ...PAD },
    { id: 'pad-ridge-1', sStart: sAtU(AT.ridge - 0.6), sEnd: sAtU(AT.ridge - 0.6) + 12, ...PAD },
    { id: 'pad-drift', sStart: sAtU(AT.driftEnd - 0.3), sEnd: sAtU(AT.driftEnd - 0.3) + 12, ...PAD },
    { id: 'pad-home', sStart: sAtU(AT.fallen + 0.6), sEnd: sAtU(AT.fallen + 0.6) + 12, ...PAD },
    // and the Treetop Walk has a mega pad of its own: the reward for the narrow line
    { id: 'pad-treetop', sStart: (treetop.sStart + treetop.sEnd) / 2 - 6, sEnd: (treetop.sStart + treetop.sEnd) / 2 + 6, branch: treetop.id, speed: 1.8, hold: 2, mega: true },
  ];
  const deerS = [sAtU(AT.deer - 0.3), sAtU(AT.deer + 0.4)];
  function hazardsAt(t) {
    const out = [];
    deerS.forEach((s, k) => {
      const m = pingPong(t + k * 3.1, DEER.period, DEER.pause), c = pointAt(s), reach = c.halfWidth - 1.4, lat = (-reach + 2 * reach * m.k) * (k % 2 ? -1 : 1), p = pointAt(s, lat);
      out.push({ id: `deer-${k}`, kind: 'deer', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY + (m.dir * (k % 2 ? -1 : 1) > 0 ? Math.PI / 2 : -Math.PI / 2), radius: DEER.radius, height: DEER.height, active: true, trot: t * 8 + k });
    });
    // the fallen log, right across the path: jump it
    const c = pointAt(logS);
    for (let lat = -c.halfWidth + 0.6; lat <= c.halfWidth - 0.6; lat += LOG.spacing) { const p = pointAt(logS, lat); out.push({ id: `log-${out.length}`, kind: 'log', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY, radius: LOG.radius, height: LOG.height, active: true }); }
    return out;
  }
  return {
    water: [beck], branches: [treetop], strips, hazardsAt, autoPickups: { rowEvery: 240, boneEvery: 105, first: 62 },          // (the first row of boxes on the start straight)
    keepClear: [[treetop.sStart - 4, treetop.sEnd + 4], [hollow.sStart - 6, hollow.sEnd + 4], [deerS[0] - 16, deerS[1] + 16], [kickerS - 10, logS + 22]],
    extras: { beck, hollow, treetop, fallenLog: { s: logS, radius: LOG.radius }, kicker: kickerS, deer: deerS, oak: [4 - 30 - ORIGIN.x, -130 - ORIGIN.z], hazardZones: { deer: deerS, log: [logS] } },
  };
});
export default WENDOVER_WOODS;
