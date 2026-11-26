// Dune Dash — a lap of the desert: rolling dunes, soft sand, whirlwinds wandering the flats, tumbleweed, a rocky canyon,
// over the great dune and down the far side, and the sinkhole.  Built by shared/trackKit.js (see there for what each part
// means); the scenery is src/tracks/desert/DesertTrack.js.
//
// Tom, 2026-11-21: "remove that random jump across (too many of these), have a sink hole and put loads more turns in".  So no
// leap any more: bends all the way round (sweepers a drift can be held through, a hairpin, a chicane, S-bends over the
// dunes), the long fast way down the great dune, and the sinkhole in the bowl before home: skirt it either side, and the
// nearer you cut it the more it drags at you; get too near and it swallows you.
//
// Round the lap:
//   A  The Oasis        start/finish under the palms
//   B  The Dune Sea     S-bends up and over dune after dune, with soft sand that drags a dog down to a plod
//   C  Twister Flats    a long, wide sweeping bend, with three whirlwinds wandering across it: nothing jumps a whirlwind
//   D  Rattle Canyon    tumbleweed blowing across the mouth of it (jump it), a hairpin, then a chicane through the boulders
//   E  The Great Dune   the long climb with boulders rolling down it at you, over the crest, and a fast sweeping run down the
//                       far side, where the sandworm comes up through the road (Tom, 2026-11-26: the map "is boring, can we add
//                       something that makes it more exciting?  I trust your advice": so the dune is the set piece now)
//   S  The Sinkhole     a wide bowl of sand with the pit in the middle of it
//   F  Home             a last bend into the oasis
import { makeTrack } from './trackKit.js';

const SOFT_SAND = 0.6;                  // share of top speed in soft sand
const TWISTER = { radius: 2.3, wander: 14 };
const WEED = { period: 5, roll: 3.4, from: 17, to: -17, radius: 0.8 };
// the sinkhole: slowed inside `radius` metres of its middle and dragged towards it, swallowed inside `core`
// the boulders: `count` of them rolling down the climb one after another, each in a different third of the road; too big to jump
// (two at 10 m/s: three at 15 knocked the computer's dogs over twice a lap)
const BOULDER = { count: 2, speed: 10, radius: 1.4, height: 3.4 };
// the sandworm: at each spot it comes up through one third of the road or another every `period` seconds: the sand heaves for
// `rumble` seconds first (that is the warning), then it is up for `up` seconds
const WORM = { period: 5.2, rumble: 1.4, up: 1.7, radius: 1.7 };
const SINKHOLE = { radius: 10, core: 2.6, pull: 6, speed: 0.55 };

// [x, z, height, width, section, name?]: a name marks a point the features below are placed by
const ROUTE = [
  [-120, 160, 0, 16, 'A'], [-40, 160, 0, 16, 'A'], [28, 158, 0, 16, 'A'],
  // the dune sea: S-bends over the dunes
  [86, 138, 3, 15, 'B', 'dunes'], [118, 102, 7, 15, 'B'], [168, 96, 2, 15, 'B'], [204, 64, 7, 15, 'B'], [186, 20, 3, 15, 'B'], [212, -24, 8, 15, 'B'], [196, -70, 2, 15, 'B'],
  // the flats: one long sweeping bend
  [160, -118, 1, 20, 'C', 'flats'], [104, -146, 0, 20, 'C'], [44, -150, 0, 20, 'C'], [-4, -170, 0, 20, 'C'],
  // the canyon: tumbleweed at the mouth, a hairpin, the boulder chicane
  [-48, -196, 2, 12, 'D', 'canyon'], [-96, -190, 3, 12, 'D'], [-118, -158, 3, 12, 'D', 'hairpin'], [-98, -128, 4, 12, 'D'], [-70, -108, 5, 12, 'D', 'rocks'], [-78, -78, 6, 12, 'D'], [-116, -60, 8, 12, 'D'],
  // the great dune: up, over and down
  [-160, -36, 13, 13, 'E'], [-200, -2, 17, 13, 'E', 'crest'], [-236, 40, 11, 14, 'E'], [-246, 82, 5, 14, 'E'],
  // the sinkhole: a wide bowl
  [-228, 118, 1, 26, 'S'], [-196, 142, 0, 28, 'S', 'pit'], [-160, 158, 0, 22, 'F'],
];
const AT = Object.fromEntries(ROUTE.map((p, k) => [p[5], k]).filter(([name]) => name));

export const DESERT = makeTrack({
  id: 'desert_dunes', name: 'Dune Dash',
  controlPoints: ROUTE.map(([x, z, height, width, section]) => [x, z, height, width, section]),
  sections: {
    A: { name: 'The Oasis', surface: 'sand' }, B: { name: 'The Dune Sea', surface: 'sand' }, C: { name: 'Twister Flats', surface: 'sand' },
    D: { name: 'Rattle Canyon', surface: 'rock' }, E: { name: 'The Great Dune', surface: 'sand' }, S: { name: 'The Sinkhole', surface: 'sand' },
    F: { name: 'Home', surface: 'sand' },
  },
  hills: { down: 3.0, downMax: 0.4 },              // (flat out down the far side of the great dune)
}, ({ sAtU, pointAt, pingPong }) => {
  const softS = sAtU(AT.dunes + 0.35), patches = [];
  for (let k = 0; k < 6; k++) {
    const s = softS + k * 40, hw = pointAt(s).halfWidth;
    patches.push({ id: `sand-${k}`, kind: 'soft sand', s, lateral: (k % 2 ? -1 : 1) * hw * 0.45, along: 7, across: hw * 0.5, speed: SOFT_SAND, slowName: 'SOFT SAND — SLOW GOING' });
  }
  // the boulders of the chicane: weave left, right, left
  const rockS = sAtU(AT.rocks - 0.3), obstacles = [];
  for (let k = 0; k < 5; k++) { const s = rockS + k * 13; obstacles.push({ id: `rock-${k}`, kind: 'rock', s, lateral: (k % 2 ? 1 : -1) * pointAt(s).halfWidth * 0.42, radius: 1.2 }); }
  const twisters = [sAtU(AT.flats + 0.6), sAtU(AT.flats + 1.4), sAtU(AT.flats + 2.2)], weeds = [0, 18, 36].map(d => sAtU(AT.canyon - 0.1) + d);
  // the pit, in the middle of the bowl
  const pit = sAtU(AT.pit);
  const sinkholes = [{ id: 'sinkhole', kind: 'sinkhole', s: pit, lateral: 0, ...SINKHOLE }];

  // the great dune: boulders down the climb, the worm on the way down the far side
  const climb = { top: sAtU(AT.crest - 0.12), bottom: sAtU(AT.crest - 2.45) }, run = climb.top - climb.bottom;
  const worms = [sAtU(AT.crest + 0.75), sAtU(AT.crest + 1.55)];
  const THIRDS = [-0.58, 0.58, 0];

  function hazardsAt(t) {
    const out = [];
    for (let k = 0; k < BOULDER.count; k++) {
      const gone = t * BOULDER.speed + k * run / BOULDER.count, trip = Math.floor(gone / run), down = gone - trip * run, s = climb.top - down;
      const c = pointAt(s), p = pointAt(s, THIRDS[(trip + k * 2) % 3] * (c.halfWidth - BOULDER.radius - 0.4)), fade = Math.min(1, down / 8, (run - down) / 8);
      out.push({ id: `boulder-${k}`, kind: 'boulder', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY, radius: BOULDER.radius, height: BOULDER.height, active: fade > 0.5, fade, spin: down / BOULDER.radius });
    }
    worms.forEach((s, k) => {
      const at = t + k * WORM.period * 0.45 + 60, n = Math.floor(at / WORM.period), ph = at - n * WORM.period, c = pointAt(s);
      const p = pointAt(s, THIRDS[(n * 2 + k) % 3] * (c.halfWidth - WORM.radius - 0.6)), since = ph - WORM.rumble;
      // rise: 0 under the sand, 1 right up.  It comes up fast and goes down slower
      const rise = since < 0 ? 0 : since < WORM.up ? Math.min(1, since / 0.3) : Math.max(0, 1 - (since - WORM.up) / 0.7);
      out.push({ id: `worm-${k}`, kind: 'sandworm', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY, radius: WORM.radius, height: 99, active: rise > 0.35, rise,
        rumble: since < 0 ? ph / WORM.rumble : 0, sway: at * 2.3 + k });
    });
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
    patches, obstacles, sinkholes, hazardsAt,
    keepClear: [[twisters[0] - TWISTER.wander - 12, twisters[2] + TWISTER.wander + 12], [weeds[0] - 14, weeds[2] + 12], [climb.bottom - 6, climb.top + 6], ...worms.map(s => [s - 12, s + 12])],
    extras: { farSight: [[climb.bottom, climb.top, 1.6]],
      // (where the computer's dogs look out for something coming: server/bots.js.  Until 2026-11-26 this map had none, and they
      //  ran straight into the whirlwinds)
      hazardZones: { twisters, weeds, boulders: [climb.bottom, (climb.bottom + climb.top) / 2, climb.top], worms },
      boulders: BOULDER, boulderRun: climb, worms, worm: WORM, twisters, twisterWander: TWISTER.wander, weedLanes: weeds, weedRun: WEED, crest: sAtU(AT.crest) },
  };
});
export default DESERT;
