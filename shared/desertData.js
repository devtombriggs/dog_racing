// Dune Dash — a lap of the desert: rolling dunes, soft sand, whirlwinds wandering the flats,
// tumbleweed, a rocky canyon, and a leap off the top of the great dune.  Built by shared/trackKit.js
// (see there for what each part means); the scenery is src/tracks/desert/DesertTrack.js.
//
// Round the lap:
//   A  The Oasis        start/finish under the palms
//   B  The Dune Sea     up and over dune after dune, with soft sand that drags a dog down to a plod
//   C  Twister Flats    wide and flat, with three whirlwinds wandering across it: nothing jumps a whirlwind
//   D  Rattle Canyon    tumbleweed blowing across the mouth of it (jump it), then boulders to weave through
//   E  The Great Dune   the long climb, and the leap off the crest over the ravine
//   F  Home             down to the oasis again
import { makeTrack } from './trackKit.js';

const SOFT_SAND = 0.6;                  // share of top speed in soft sand
const TWISTER = { radius: 2.3, wander: 14 };
const WEED = { period: 5, roll: 3.4, from: 17, to: -17, radius: 0.8 };

export const DESERT = makeTrack({
  id: 'desert_dunes', name: 'Dune Dash',
  // [x, z, height, width, section]
  controlPoints: [
    [-120, 160, 0, 16, 'A'], [-40, 160, 0, 16, 'A'], [40, 160, 0, 16, 'A'],
    [120, 150, 2, 15, 'B'], [190, 110, 7, 15, 'B'], [215, 40, 2, 15, 'B'], [185, -25, 8, 15, 'B'], [215, -90, 3, 15, 'B'],
    [190, -160, 1, 20, 'C'], [110, -195, 0, 20, 'C'], [20, -190, 0, 20, 'C'],
    [-60, -170, 2, 11, 'D'], [-120, -120, 4, 11, 'D'], [-100, -50, 6, 11, 'D'], [-150, 0, 9, 11, 'D'],
    [-215, 30, 16, 13, 'E'], [-240, 95, 16, 13, 'E'],
    [-200, 150, 0, 16, 'F'],
  ],
  sections: {
    A: { name: 'The Oasis', surface: 'sand' }, B: { name: 'The Dune Sea', surface: 'sand' }, C: { name: 'Twister Flats', surface: 'sand' },
    D: { name: 'Rattle Canyon', surface: 'rock' }, E: { name: 'The Great Dune', surface: 'sand' }, F: { name: 'Home', surface: 'sand' },
  },
}, ({ sAtU, pointAt, pingPong, launchBetween }) => {
  const launch = launchBetween(15.3, 15.85, { duration: 2.0, arcHeight: 9 });
  const softS = sAtU(3.35), patches = [];
  for (let k = 0; k < 6; k++) {
    const s = softS + k * 42, hw = pointAt(s).halfWidth;
    patches.push({ id: `sand-${k}`, kind: 'soft sand', s, lateral: (k % 2 ? -1 : 1) * hw * 0.45, along: 7, across: hw * 0.5, speed: SOFT_SAND, slowName: 'SOFT SAND — SLOW GOING' });
  }
  const rockS = sAtU(11.7), obstacles = [];
  for (let k = 0; k < 6; k++) { const s = rockS + k * 15; obstacles.push({ id: `rock-${k}`, kind: 'rock', s, lateral: (k % 2 ? 1 : -1) * pointAt(s).halfWidth * 0.42, radius: 1.2 }); }
  const twisters = [sAtU(8.35), sAtU(9.0), sAtU(9.65)], weeds = [0, 20, 40].map(d => sAtU(10.3) + d);

  function hazardsAt(t) {
    const out = [];
    // the whirlwinds: each wanders from side to side of the flats, and up and down them a little
    twisters.forEach((base, k) => {
      const m = pingPong(t + k * 2.7, 8 + k, 0.04), s = base + TWISTER.wander * Math.sin(t * 0.5 + k * 2), c = pointAt(s);
      const p = pointAt(s, (-1 + 2 * m.k) * (c.halfWidth - 2.6));
      out.push({ id: `twister-${k}`, kind: 'twister', x: p.x, y: p.y, z: p.z, rotationY: t * 6 + k, radius: TWISTER.radius, height: 99, active: true });
    });
    // tumbleweed blowing across, one after another
    weeds.forEach((s, k) => {
      const ph = (((t + k * WEED.period / 3) % WEED.period) + WEED.period) % WEED.period, rolling = ph < WEED.roll;
      const lat = WEED.from + (WEED.to - WEED.from) * (rolling ? ph / WEED.roll : 0), c = pointAt(s, lat);
      out.push({ id: `weed-${k}`, kind: 'tumbleweed', x: c.x, y: c.y + 0.25 * Math.abs(Math.sin(ph * 7)), z: c.z, rotationY: c.rotationY, radius: WEED.radius, height: 1.0, active: rolling,
        spin: -lat / WEED.radius, fade: rolling ? Math.min(1, ph * 3, (WEED.roll - ph) * 3) : 0 });
    });
    return out;
  }
  return {
    launch, patches, obstacles, hazardsAt,
    keepClear: [[twisters[0] - TWISTER.wander - 12, twisters[2] + TWISTER.wander + 12], [weeds[0] - 14, weeds[2] + 12]],
    extras: { twisters, twisterWander: TWISTER.wander, weedLanes: weeds, weedRun: WEED },
  };
});
export default DESERT;
