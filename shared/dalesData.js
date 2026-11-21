// The Yorkshire Dales — a lap of open hill country: out of the village and through the buttercup meadows, zig-zag up
// Cheese Fell, round the tops, down the other side as fast as a dog can go, through the beck, across the sheep pasture,
// up the heather, into the cave in the limestone scar, out through the waterfall and down the stream.  Every climb has
// boost pads up it; every descent is quicker than the flat.  Built by shared/trackKit.js; the scenery is
// src/tracks/dales/DalesTrack.js.
//
// Tom, 2026-11-21: "bit boring, it needs to play faster ... more turns, too many straights", and a stream after the
// waterfall with boosts on little rocks.  So: bends all the way round (no straight much over 140 m; sweepers a drift can
// be held through, two hairpins, S-bends), a steady climb, more speed downhill, a shortcut, and the stream.
//
// Round the lap:
//   A  The Village Green   start/finish between the cottages
//   B  Buttercup Meadow    wide sweeping S-bends to drift through
//   C  The Long Pull       zig-zags up Cheese Fell at a steady slope, two hairpins, boost pads on the legs, and wheels of
//                          cheese rolling down at you (jump them).  The goat path: a narrow dirt track across the inside of
//                          the first hairpin, a third shorter, but tight, and a cheese of its own comes down it
//   D  The Tops            a long sweep round the summit, boulders to weave through
//   E  The Swoop           fast bends all the way down
//   F  The Beck            a ford: wade it
//   G  Sheep Pasture       twistier: two flocks wandering across the lane (a jump clears a sheep)
//   H  Heather Bank        the second climb, with boost pads
//   I  The Scar            into the cliff: a cave down through the limestone, out through a waterfall and across its pool
//   K  The Stream          down the beck from the pool, ankle deep, rocks in a zig-zag down it: each one a boost
//   J  The Lane            a last sweep left and right between the walls, and home
import { makeTrack } from './trackKit.js';

const FELLS = [{ x: 235, z: -200, high: 40, wide: 110 }, { x: -290, z: -150, high: 46, wide: 115 }, { x: 40, z: 520, high: 60, wide: 170 }, { x: -620, z: 260, high: 70, wide: 190 }, { x: 600, z: 320, high: 55, wide: 200 }, { x: 0, z: -620, high: 80, wide: 220 }];
/** how high the ground is at (x, z), before the road is laid on it: the fells, and a little roll everywhere */
export const dalesHill = (x, z) => FELLS.reduce((h, f) => h + f.high * Math.exp(-((x - f.x) ** 2 + (z - f.z) ** 2) / (2 * f.wide * f.wide)), 0) + 1.2 + 1.2 * Math.sin(x / 47) * Math.cos(z / 61);

const CLIMB_PAD = { speed: 1.55, hold: 1.6 };           // a boost pad on a climb: half as fast again and more, for a second and a half after it
const CHEESE = { period: 12, roll: 9, radius: 0.85, lanes: [-3.4, 0, 3.4] };      // (three wheels, one after another, each down its own line)
// The goat path: a narrow way across the inside of the first hairpin, `offset` metres from the middle of the road.  Shorter by
// about a dog's length a second, but tight (a dog has to ease off or drift it tight) and a cheese of its own comes down it
const GOAT_PATH = { offset: 15, half: 1.8, ramp: 0.25, cheese: { period: 7, roll: 3.2 } };
// The stream: out of the waterfall's pool and down the beck, ankle deep (it does not slow a dog).  Flat rocks stick out of it in a
// zig-zag down the stream, each a boost (`every` metres apart, `long` metres up the stream, `wide` across): hop rock to rock and fly
const STREAM = { every: 17, long: 4, wide: 3.2, out: 0.52, rock: { speed: 1.4, hold: 0.9 } };
const SHEEP = { period: 9, pause: 0.08, radius: 0.95 };

// The lap, as control points [x, z, width, section, name?]: a name marks a point the features below are placed by
// (a hairpin: five points round a half circle `r` metres from (cx, cz), on the side `way` (+1 east, -1 west))
const hairpin = (cx, cz, r, way, width, section, name) => [90, 45, 0, -45, -90].map(deg => [cx + way * r * Math.cos(deg * Math.PI / 180), cz + r * Math.sin(deg * Math.PI / 180), width, section, deg === 0 ? name : undefined]);
const HAIRPIN1_CENTRE = [268, 10];
const ROUTE = [
  [-62, 199, 16, 'A'], [0, 203, 16, 'A'], [56, 197, 16, 'A'],
  // Buttercup Meadow: wide sweeping S-bends to drift through
  [116, 166, 16, 'B'], [168, 192, 16, 'B'], [220, 166, 16, 'B'], [222, 104, 16, 'B'],
  // the Long Pull: zig-zags up Cheese Fell, a hairpin at each end
  [226, 50, 13, 'C', 'pullStart'], ...hairpin(...HAIRPIN1_CENTRE, 26, 1, 13, 'C', 'hairpin1'),
  ...hairpin(226, -42, 26, -1, 13, 'C', 'hairpin2'), [272, -72, 13, 'C', 'pullEnd'],
  // the Tops: round the summit
  [304, -110, 14, 'D'], [268, -162, 14, 'D', 'tops'], [206, -200, 14, 'D'], [150, -212, 15, 'D'],
  // the Swoop: long fast bends down the fell
  [100, -196, 15, 'E'], [64, -168, 15, 'E'], [62, -128, 15, 'E'], [38, -98, 15, 'E'], [10, -60, 15, 'E'],
  // the Beck: a bend down to the ford and a bend out of it
  [-28, -36, 14, 'F', 'ford'], [-66, -30, 14, 'F'], [-92, 0, 14, 'F'],
  // Sheep Pasture: twisty, along the foot of the fell at a gentle slope (Tom, 2026-11-21: the sheep could not be jumped on the hill)
  [-112, 36, 12, 'G'], [-148, 60, 12, 'G', 'flock1'], [-186, 50, 12, 'G'], [-222, 58, 12, 'G', 'flock2'], [-248, 36, 12, 'G', 'pastureEnd'],
  // Heather Bank, the Scar and the cave
  [-262, 4, 13, 'H'], [-286, -40, 13, 'H'], [-304, -88, 13, 'H'], [-316, -128, 13, 'H', 'bankEnd'],
  [-355, -140, 13, 'I', 'caveIn'], [-392, -70, 13, 'I', 'caveOut'],
  // the Stream: down the beck from the waterfall, rock to rock
  [-394, -14, 14, 'K', 'streamStart'], [-370, 34, 14, 'K'], [-390, 84, 14, 'K'], [-358, 124, 14, 'K', 'streamEnd'],
  // the Lane home: a last sweep left and right into the village
  [-300, 148, 13, 'J', 'lane'], [-238, 172, 14, 'J'], [-178, 166, 14, 'J'], [-120, 196, 15, 'A'],
];
const AT = Object.fromEntries(ROUTE.map((p, k) => [p[4], k]).filter(([name]) => name));
const STEADY = [[AT.pullStart, AT.pullEnd], [AT.ford, AT.pastureEnd]];
// The road lies on the ground, except where it climbs at one steady slope from one point to another (cut into the fell where
// that is steeper, built up where it dips): up the zig-zags, so no hairpin is a wall, and from the ford across the pasture, so
// the sheep stand on gentle ground and can be jumped
function roadHeight(k) {
  const ground = j => dalesHill(ROUTE[j][0], ROUTE[j][1]);
  const zone = STEADY.find(([from, to]) => k > from && k < to);
  if (!zone) return ground(k);
  const [from, to] = zone, far = j => { let d = 0; for (let n = from; n < j; n++) d += Math.hypot(ROUTE[n + 1][0] - ROUTE[n][0], ROUTE[n + 1][1] - ROUTE[n][1]); return d; };
  return ground(from) + (ground(to) - ground(from)) * far(k) / far(to);
}export const DALES = makeTrack({
  id: 'yorkshire_dales', name: 'Yorkshire Dales',
  controlPoints: ROUTE.map(([x, z, width, section], k) => [x, z, roadHeight(k), width, section]),
  heightSmoothing: 5,
  hills: { down: 3.6, downMax: 0.5 },         // a descent is worth up to half as much speed again (Tom, 2026-11-21: the Dales should play faster)
  sections: {
    A: { name: 'The Village Green', surface: 'lane' }, B: { name: 'Buttercup Meadow', surface: 'grass' }, C: { name: 'The Long Pull', surface: 'lane' },
    D: { name: 'The Tops', surface: 'limestone' }, E: { name: 'The Swoop', surface: 'grass' }, F: { name: 'The Beck', surface: 'pebbles' },
    G: { name: 'Sheep Pasture', surface: 'grass' }, H: { name: 'Heather Bank', surface: 'lane' }, I: { name: 'The Scar', surface: 'limestone' },
    J: { name: 'The Lane', surface: 'lane' }, K: { name: 'The Stream', surface: 'pebbles' },
  },
}, ({ sAtU, pointAt, pingPong, branchAt }) => {
  // the cave: the lane goes into the face of the scar and down through it (roof: how high the cave is; cover: how much hill is
  // over the lane), and comes out under the waterfall, into the pool the water has dug
  const cave = { sStart: sAtU(AT.caveIn), sEnd: sAtU(AT.caveOut), roof: 8, cover: 17 };
  const plunge = { sStart: cave.sEnd + 1, sEnd: cave.sEnd + 27, depth: 0.42, ramp: 6 };
  const strips = [];
  // (a pad only where the road really climbs: the zig-zags have a dip or two)
  const climbing = s => pointAt(s + 9).y - pointAt(s + 3).y > 6 * 0.02;
  const pads = (u0, u1, apart) => { for (let s = sAtU(u0); s < sAtU(u1); s += apart) if (climbing(s)) strips.push({ id: `pad-${strips.length}`, sStart: s, sEnd: s + 12, ...CLIMB_PAD }); };
  const pull = { sStart: sAtU(AT.pullStart), sEnd: sAtU(AT.pullEnd) }, bank = { sStart: sAtU(AT.flock2 + 0.45), sEnd: sAtU(AT.bankEnd) };
  pads(AT.pullStart, AT.pullEnd, 46); pads(AT.flock2 + 0.45, AT.bankEnd, 40);       // (the bank starts climbing just past the second flock)
  const ford = { sStart: sAtU(AT.ford - 0.3), sEnd: sAtU(AT.ford + 0.3), depth: 0.42, ramp: 7 };
  const flocks = [sAtU(AT.flock1), sAtU(AT.flock2)];
  // the goat path across the inside of the first hairpin: which side is the inside is worked out from where the bend's middle is
  const bend = { s: sAtU(AT.hairpin1), from: sAtU(AT.hairpin1 - 2) - 12, to: sAtU(AT.hairpin1 + 2) + 12 };
  const apex = pointAt(bend.s), [cx, cz] = HAIRPIN1_CENTRE, inside = Math.sign((cx - apex.x) * apex.nx + (cz - apex.z) * apex.nz);
  const goatPath = { id: 'goat-path', sStart: bend.from, sEnd: bend.to, side: inside, offset: GOAT_PATH.offset, half: GOAT_PATH.half, ramp: GOAT_PATH.ramp };
  // the stream, and its rocks
  const stream = { sStart: plunge.sEnd + 4, sEnd: sAtU(AT.streamEnd) };
  for (let s = stream.sStart + 8, k = 0; s < stream.sEnd - 6; s += STREAM.every, k++) {
    const middle = (k % 2 ? 1 : -1) * STREAM.out * pointAt(s).halfWidth;
    strips.push({ id: `rock-${k}`, kind: 'rock', sStart: s, sEnd: s + STREAM.long, latMin: middle - STREAM.wide / 2, latMax: middle + STREAM.wide / 2, ...STREAM.rock });
  }
  // a boulder or two on the tops, and a couple of milk churns in the lane
  const obstacles = [];
  [[AT.tops - 0.35, 0.5, 'boulder', 1.3], [AT.tops + 0.05, -0.45, 'boulder', 1.3], [AT.tops + 0.5, 0.4, 'boulder', 1.3], [AT.lane + 0.3, 0.5, 'churn', 0.8], [AT.lane + 1.0, -0.5, 'churn', 0.8]].forEach(([u, share, kind, radius], k) => { const s = sAtU(u); obstacles.push({ id: `${kind}-${k}`, kind, s, lateral: share * pointAt(s).halfWidth, radius }); });

  function hazardsAt(t) {
    const out = [];
    CHEESE.lanes.forEach((lateral, k) => {
      const ph = (((t + k * CHEESE.period / 3) % CHEESE.period) + CHEESE.period) % CHEESE.period, rolling = ph < CHEESE.roll;
      const f = rolling ? ph / CHEESE.roll : 0, s = pull.sEnd + (pull.sStart - pull.sEnd) * f, c = pointAt(s, lateral);
      out.push({ id: `cheese-${k}`, kind: 'cheese', x: c.x, y: c.y, z: c.z, rotationY: c.rotationY, radius: CHEESE.radius, height: 1.1, active: rolling,
        spin: (pull.sEnd - s) / CHEESE.radius, fade: rolling ? Math.min(1, ph * 3, (CHEESE.roll - ph) * 3) : 0 });
    });
    {   // the goat path's own cheese, down it from the top
      const g = GOAT_PATH.cheese, ph = ((t % g.period) + g.period) % g.period, rolling = ph < g.roll, f = rolling ? ph / g.roll : 0;
      const s = goatPath.sEnd - 6 + (goatPath.sStart + 6 - (goatPath.sEnd - 6)) * f, br = branchAt(s), c = pointAt(s, br ? br.side * br.centre : 0);
      out.push({ id: 'cheese-goat', kind: 'cheese', x: c.x, y: c.y, z: c.z, rotationY: c.rotationY, radius: CHEESE.radius, height: 1.1, active: rolling && Boolean(br),
        spin: (goatPath.sEnd - s) / CHEESE.radius, fade: rolling ? Math.min(1, ph * 3, (g.roll - ph) * 3) : 0 });
    }
    flocks.forEach((s, k) => {
      for (let n = 0; n < 3; n++) {
        const m = pingPong(t + k * 4 + n * 0.9, SHEEP.period, SHEEP.pause), c = pointAt(s + n * 3.2), reach = c.halfWidth - 1.6;
        const p = pointAt(s + n * 3.2, (-reach + 2 * reach * m.k) * (k % 2 ? -1 : 1));
        out.push({ id: `sheep-${k}-${n}`, kind: 'sheep', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY + (m.dir * (k % 2 ? -1 : 1) > 0 ? Math.PI / 2 : -Math.PI / 2), radius: SHEEP.radius, height: 1.2, active: true, trot: t * 9 + n });
      }
    });
    return out;
  }
  return {
    strips, water: [ford, plunge], branches: [goatPath], obstacles, hazardsAt, autoPickups: { rowEvery: 250, boneEvery: 105 },
    keepClear: [[pull.sStart - 8, pull.sEnd + 8], [stream.sStart, stream.sEnd], [flocks[0] - 14, flocks[1] + 18], [cave.sStart - 8, cave.sStart + 6], [cave.sEnd - 14, cave.sEnd + 2]],
    extras: { pull, bank, ford, flocks, cave, plunge, stream, goatPath, cheeseRun: CHEESE, hazardZones: { cheese: [pull.sStart, (pull.sStart + pull.sEnd) / 2, pull.sEnd], sheep: flocks } },
  };
});
export default DALES;
