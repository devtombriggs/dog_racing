// Neon Nexus — the longest track in the game, and the fastest: five kilometres of road in the sky
// over a city of the future, there and back across it four times, never a circle, with boost pads
// all the way.  Four times a lap a second road leaves the main one and joins it again further on, and
// a dog may take either.  One of the two is always the longer way round, and that one has a trail of
// Golden Bones down it.  Mega boost pads (2.6 times top speed, and the boost stays with the dog for three
// seconds after the pad) run all the way round wherever there is one road; where there are two, the mega
// pads are on the longer and ordinary boost pads on the other.  Three times the road stops and there are only
// platforms sliding from side to side: jump from one to the next, and a dog that drops between them starts the
// crossing again.  Three catapults fire the dogs on round the map: over the second hairpin, up the ramp, and
// (the accelerator) 260 m back across the city to the start.  A lap is about two minutes; three laps.  Built by shared/trackKit.js; the scenery
// is src/tracks/neon/NeonTrack.js.
//
// Round the lap:
//   A  Launch Deck        start/finish
//   B  The High Road      a second road climbs away to the left over the city: longer, with the bones
//   C  The Hook           a long hairpin.  A cut-through dives under the inside of it: here the main road is
//                         the longer way, and has the bones
//   D  The Climb          boost pads, and two platform crossings
//   E  The Turn           the second hairpin: a catapult fires the dogs right over it
//   F  The Low Road       a second road drops away to the right: longer, with the bones
//   G  The Loop           the third hairpin and another cut-through, over the top of the inside of it
//   H  The Ramp           the third crossing, and a catapult up the long climb to the accelerator
//   I  The Accelerator    a boost pad into the rings, and a shot right across the city
//   J  Touchdown          the landing deck, and home
import { makeTrack } from './trackKit.js';

// Boost pads.  The boost stays with the dog for `hold` seconds after the pad (shared/items.js PAD_KICK), so a run of
// them is one long boost.  A mega pad is the fast one; where there are two roads one has mega pads and the other the ordinary ones
const MEGA = { speed: 2.6, hold: 3, mega: true }, PAD = { speed: 1.8, hold: 3 };
// A platform crossing: a break to jump, a platform, a break, a platform... each platform slides from side to side,
// a little behind the one before it (step: the share of a swing), so the three move like a snake and there is always a line across
const CROSSING = { gap: 8, pad: 40, pads: 3, half: 3.4, reach: 4.2, period: 9, step: 0.07 };       // (long enough to land on at a mega boost and jump again)
const BONE_EVERY = 50;                  // metres between the bones down a long road
// A catapult: what every one of them does to a dog on landing
const FLIGHT = { exitSpeedMultiplier: 2.2, boostSeconds: 3, pad: 30, landing: 14 };

export const NEON = makeTrack({
  id: 'neon_nexus', name: 'Neon Nexus', laps: 3,          // (a lap is as long as three of most tracks, and is run in about two minutes)
  // [x, z, height, width, section]
  controlPoints: [
    [-400, 390, 20, 16, 'A'], [-200, 390, 20, 16, 'A'],
    [0, 390, 20, 16, 'B'], [200, 390, 20, 16, 'B'], [400, 390, 18, 16, 'B'],
    [492, 352, 16, 16, 'C'], [530, 260, 14, 16, 'C'], [492, 168, 12, 16, 'C'],
    [400, 130, 12, 16, 'D'], [200, 130, 16, 16, 'D'], [0, 130, 22, 16, 'D'], [-200, 130, 28, 16, 'D'],
    [-292, 92, 30, 16, 'E'], [-330, 0, 30, 16, 'E'], [-292, -92, 30, 16, 'E'],
    [-200, -130, 30, 16, 'F'], [0, -130, 26, 16, 'F'], [200, -130, 22, 16, 'F'], [400, -130, 18, 16, 'F'],
    [492, -168, 18, 16, 'G'], [530, -260, 18, 16, 'G'], [492, -352, 18, 16, 'G'],
    [400, -390, 18, 16, 'H'], [200, -390, 24, 16, 'H'], [0, -390, 30, 16, 'H'], [-200, -390, 36, 16, 'H'], [-400, -390, 40, 16, 'H'],
    [-492, -352, 40, 14, 'I'], [-530, -260, 40, 14, 'I'], [-530, -130, 40, 14, 'I'], [-530, 0, 30, 14, 'I'],
    [-530, 130, 20, 16, 'J'], [-530, 260, 20, 16, 'J'], [-492, 352, 20, 16, 'J'],
  ],
  sections: {
    A: { name: 'Launch Deck', surface: 'deck' }, B: { name: 'The High Road', surface: 'deck' }, C: { name: 'The Hook', surface: 'deck' },
    D: { name: 'The Climb', surface: 'deck' }, E: { name: 'The Turn', surface: 'deck' }, F: { name: 'The Low Road', surface: 'deck' },
    G: { name: 'The Loop', surface: 'deck' }, H: { name: 'The Ramp', surface: 'deck' }, I: { name: 'The Accelerator', surface: 'deck' },
    J: { name: 'Touchdown', surface: 'deck' },
  },
}, ({ sAtU, launchBetween, sstep }) => {
  // the catapults: run on to the pad and be fired on round the map.  The accelerator is the first of them
  const launches = [
    { id: 'accelerator', ...launchBetween(29.0, 31.0, { ...FLIGHT, duration: 3.4, arcHeight: 42, pad: 34 }) },
    { id: 'catapult-turn', ...launchBetween(11.3, 14.7, { ...FLIGHT, duration: 3.6, arcHeight: 34 }) },       // right over the second hairpin
    { id: 'catapult-ramp', ...launchBetween(24.7, 26.4, { ...FLIGHT, duration: 3.0, arcHeight: 28 }) },
  ];
  // the second roads.  side: +1 leaves to the dogs' left.  kind: whether the second road is the longer or the shorter
  // of the two.  bots: the share of the computer's dogs that take it
  const branch = (id, name, u0, u1, side, offset, half, rise, ramp, kind) => ({ id, name, sStart: sAtU(u0), sEnd: sAtU(u1), side, offset, half, rise, ramp, kind, bots: 0.5 });
  const branches = [
    branch('high-road', 'The High Road', 1.2, 3.4, 1, 56, 6, 12, 0.3, 'long'),
    branch('hook-cut', 'The Cut-Through', 3.7, 8.3, -1, 24, 5, -8, 0.2, 'short'),
    branch('low-road', 'The Low Road', 15.1, 17.4, -1, 56, 6, -12, 0.3, 'long'),
    branch('loop-cut', 'The Flyover', 17.7, 22.3, -1, 24, 5, 10, 0.2, 'short'),
  ];
  const spread = ([a, b], n) => Array.from({ length: n }, (_, k) => a + (b - a) * (k + 0.5) / n);
  /** how far from the middle of the main road the middle of a second road is at s */
  const centreOf = (b, s) => { const t = (s - b.sStart) / (b.sEnd - b.sStart); return b.side * b.offset * sstep(0, b.ramp, t) * sstep(0, b.ramp, 1 - t); };

  // the platform crossings
  const crossing = (id, u) => {
    const sStart = sAtU(u), pads = [];
    for (let k = 0; k < CROSSING.pads; k++) { const s0 = sStart + CROSSING.gap + k * (CROSSING.pad + CROSSING.gap); pads.push({ s0, s1: s0 + CROSSING.pad, half: CROSSING.half, reach: CROSSING.reach, period: CROSSING.period, phase: k * CROSSING.step }); }
    return { id, sStart, sEnd: pads.at(-1).s1 + CROSSING.gap, pads };
  };
  const platforms = [crossing('crossing-climb-1', 8.9), crossing('crossing-climb-2', 10.0), crossing('crossing-ramp', 23.3)];

  // boost pads.  Mega pads wherever there is one road, about as far apart as one lasts (but none into a crossing: a
  // dog has to be able to land on a platform).  Where there are two roads, mega pads down the longer and ordinary pads down the other
  const strips = [];
  const pad = (u, kind, length = 18) => { const at = sAtU(u); strips.push({ id: `pad-${strips.length}`, sStart: at, sEnd: at + length, ...kind }); };
  for (const u of [0.25, 0.8, 3.55, 8.4, 9.72, 10.85, 17.55, 22.5, 22.95, 24.15, 27.0, 27.8, 31.7, 32.4, 33.1]) pad(u, MEGA);
  pad(28.5, MEGA, 30);                                              // into the accelerator
  for (const b of branches) {
    const long = b.kind === 'long', apart = [b.sStart + 45, b.sEnd - 45], count = Math.round((apart[1] - apart[0]) / 105);
    for (const s of spread(apart, count)) {
      strips.push({ id: `pad-${strips.length}`, sStart: s, sEnd: s + 18, ...(long ? PAD : MEGA) });                    // the main road
      strips.push({ id: `pad-${strips.length}`, sStart: s, sEnd: s + 18, branch: b.id, ...(long ? MEGA : PAD) });      // the second road beside it
    }
  }

  // Treat Boxes: on both roads in the middle of every pair, and here and there between
  const mid = b => (b.sStart + b.sEnd) / 2;
  const rows = [0.95, 8.6, 22.75, 27.25, 28.1, 32.75].map(sAtU).concat(branches.map(mid));
  // Golden Bones: a trail of them down the longer road of every pair, from side to side of it; one or two elsewhere
  const bones = [];
  [0.7, 22.4, 24.3, 27.55, 33.0].forEach((u, k) => bones.push([sAtU(u), (k % 2 ? -1 : 1) * 3.6]));
  const trails = [];
  for (const b of branches) {
    const onBranch = b.kind === 'long', ends = onBranch ? 75 : 45, from = b.sStart + ends, to = b.sEnd - ends, count = Math.round((to - from) / BONE_EVERY), trail = [];
    for (const [k, s] of spread([from, to], count).entries()) {
      if (Math.abs(s - mid(b)) < 9) continue;                    // (the boxes are there)
      trail.push([s, (onBranch ? centreOf(b, s) : 0) + (k % 2 ? -1 : 1) * (onBranch ? b.half * 0.42 : 3.4)]);
    }
    bones.push(...trail); trails.push({ id: b.id, onBranch, bones: trail });
  }
  return { launches, branches, platforms, strips, extras: { crossing: CROSSING, trails, pickups: { rows, bones } } };
});
export default NEON;
