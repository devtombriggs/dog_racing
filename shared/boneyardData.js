// The Boneyard — where every dog's buried bones ended up, and some far bigger ones.  It is raining,
// the ground is mud, and half the lap is under brown water.  The lap is not a circle: from above it
// is a bone, down one side of the shaft, round the two knuckles at the end, back up the other side,
// and round the two knuckles at this end.  There are Golden Bones the whole way round.  Built by
// shared/trackKit.js; the scenery is src/tracks/boneyard/BoneyardTrack.js.
//
// Round the lap:
//   A  The Spine           start/finish, under the ribs: a long puddle to wade, then the first swim
//   B  East Knuckle        up over a mound of bones: sticky mud, and a great bone rolling across (jump it)
//   C  The Jaws            the notch between the knuckles: mud spouts go off under you (keep off the bubbles)
//   D  Skull Mound         the second knuckle: more mud, another rolling bone
//   E  The Bog             back up the other side: a swim, then a puddle
//   F  West Knuckle        mud, and a rolling bone
//   G  The Dig             the notch at this end: more mud spouts
//   H  Dog's Hoard         the last knuckle, and home
import { makeTrack } from './trackKit.js';

const MUD = 0.6;                                      // share of top speed in the sticky mud
const ROLLER = { period: 6, roll: 4, from: 19, to: -19, radius: 0.75, half: 3.2 };       // a great bone rolling across: jump it
const SPOUT = { period: 5.5, warn: 1.6, blow: 1.3, radius: 1.9 };                        // a mud spout: bubbles, then goes off
const WET = 0.28;                                     // how slippery the whole place is in the rain

const HALF = [[-180, 45, 0, 'A'], [-90, 45, 0, 'A'], [0, 45, 0, 'A'], [90, 45, 0, 'A'], [180, 45, 0, 'A'],
  [235, 72, 2.5, 'B'], [280, 96, 5, 'B'], [324, 82, 3, 'B'],
  [338, 40, 1, 'C'], [306, 0, 0, 'C'], [338, -40, 1, 'C'],
  [324, -82, 3, 'D'], [280, -96, 6, 'D'], [235, -72, 2.5, 'D']];
const OTHER = { A: 'E', B: 'F', C: 'G', D: 'H' };
export const BONEYARD = makeTrack({
  id: 'boneyard', name: 'The Boneyard',
  // [x, z, height, width, section]: one half of the bone, and the same again turned right round
  controlPoints: [...HALF.map(([x, z, y, sec]) => [x, z, y, sec === 'C' ? 13 : 15, sec]), ...HALF.map(([x, z, y, sec]) => [-x, -z, y, sec === 'C' ? 13 : 15, OTHER[sec]])],
  heightSmoothing: 5,
  rules: { slip: { grip: 0.2, acceleration: 0.6 } },
  sections: {
    A: { name: 'The Spine', surface: 'mud' }, B: { name: 'East Knuckle', surface: 'mud' }, C: { name: 'The Jaws', surface: 'mud' }, D: { name: 'Skull Mound', surface: 'mud' },
    E: { name: 'The Bog', surface: 'mud' }, F: { name: 'West Knuckle', surface: 'mud' }, G: { name: 'The Dig', surface: 'mud' }, H: { name: 'Dog’s Hoard', surface: 'mud' },
  },
}, ({ sAtU, pointAt }) => {
  const pool = (u0, u1, depth) => ({ sStart: sAtU(u0), sEnd: sAtU(u1), depth, ramp: depth > 0.5 ? 10 : 6 });
  const water = [pool(1.45, 2.05, 0.4), pool(2.9, 3.65, 1.3), pool(14.75, 15.6, 1.3), pool(17.45, 18.0, 0.4)];
  const patches = [];
  for (const [u0, n] of [[5.5, 2], [11.5, 2], [19.5, 2], [25.5, 2]]) for (let k = 0; k < n; k++) {
    const s = sAtU(u0) + k * 44, hw = pointAt(s).halfWidth;
    patches.push({ id: `mud-${patches.length}`, kind: 'sticky mud', s, lateral: (k % 2 ? -1 : 1) * hw * 0.45, along: 6, across: hw * 0.48, speed: MUD, slowName: 'STICKY MUD — SLOW GOING' });
  }
  const rollers = [6.55, 12.55, 20.55].map(sAtU);
  const spouts = [[8.5, 0.45], [9.0, -0.5], [9.5, 0.45], [22.5, -0.45], [23.0, 0.5], [23.5, -0.45]].map(([u, share]) => ({ s: sAtU(u), lateral: share * pointAt(sAtU(u)).halfWidth }));

  function hazardsAt(t) {
    const out = [];
    rollers.forEach((s, k) => {
      const ph = (((t + k * ROLLER.period / 3) % ROLLER.period) + ROLLER.period) % ROLLER.period, rolling = ph < ROLLER.roll;
      const lat = ROLLER.from + (ROLLER.to - ROLLER.from) * (rolling ? ph / ROLLER.roll : 0), c = pointAt(s);
      // (a bone is long: it knocks a dog over anywhere along its length, so it is three hazards in a row)
      for (let n = -1; n <= 1; n++) { const p = pointAt(s + n * ROLLER.half * 0.62, lat); out.push({ id: `roller-${k}-${n + 1}`, kind: 'rolling bone', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY, radius: ROLLER.radius + 0.5, height: 1.1, active: rolling,
        spin: -lat / ROLLER.radius, fade: rolling ? Math.min(1, ph * 3, (ROLLER.roll - ph) * 3) : 0 }); }
    });
    spouts.forEach((spout, k) => {
      const ph = (((t + k * 1.9) % SPOUT.period) + SPOUT.period) % SPOUT.period, p = pointAt(spout.s, spout.lateral);
      const warn = ph < SPOUT.warn, blow = !warn && ph < SPOUT.warn + SPOUT.blow;
      out.push({ id: `spout-${k}`, kind: 'mud spout', x: p.x, y: p.y, z: p.z, rotationY: 0, radius: SPOUT.radius, height: 99, active: blow, warn: warn ? ph / SPOUT.warn : 0, blow: blow ? (ph - SPOUT.warn) / SPOUT.blow : -1 });
    });
    return out;
  }

  return {
    water, patches, hazardsAt, slipAt: () => WET,
    // Golden Bones all the way round, from side to side of the road, wherever there is nothing else
    autoPickups: { rowEvery: 215, boneEvery: 19, apart: 19, pairs: true },
    keepClear: [...rollers.map(s => [s - 12, s + 12]), ...spouts.map(sp => [sp.s - 9, sp.s + 9])],
    extras: { rollers, rollerRun: ROLLER, spouts, spoutRun: SPOUT, hazardZones: { rollers, spouts: spouts.map(sp => sp.s) } },
  };
});
export default BONEYARD;
