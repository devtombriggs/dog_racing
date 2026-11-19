// The Yorkshire Dales — a lap of open hill country: out of the village and through the buttercup
// meadows, up a fell, along the tops, down the other side as fast as a dog can go, through the beck,
// across the sheep pasture, up a second fell, into the cave in the limestone scar at the top of it and out through the waterfall.  Every climb
// has boost pads up it; every descent is quicker than the flat.  Built by shared/trackKit.js; the
// scenery is src/tracks/dales/DalesTrack.js.
//
// Round the lap:
//   A  The Village Green   start/finish between the cottages
//   B  Buttercup Meadow    flat and wide, flowers either side
//   C  The Long Pull       the climb up Cheese Fell: boost pads, and wheels of cheese rolling down at you (jump them)
//   D  The Tops            over the summit
//   E  The Swoop           the long fast way down
//   F  The Beck            a ford: wade it
//   G  Sheep Pasture       two flocks wandering across the lane (a jump clears a sheep)
//   H  Heather Bank        the second climb, with boost pads
//   I  The Scar            into the cliff: a cave down through the limestone, out through a waterfall and across its pool
//   J  The Lane            down between the walls and home
import { makeTrack } from './trackKit.js';

const FELLS = [{ x: 235, z: -200, high: 40, wide: 110 }, { x: -290, z: -150, high: 46, wide: 115 }, { x: 40, z: 520, high: 60, wide: 170 }, { x: -620, z: 260, high: 70, wide: 190 }, { x: 600, z: 320, high: 55, wide: 200 }, { x: 0, z: -620, high: 80, wide: 220 }];
/** how high the ground is at (x, z), before the road is laid on it: the fells, and a little roll everywhere */
export const dalesHill = (x, z) => FELLS.reduce((h, f) => h + f.high * Math.exp(-((x - f.x) ** 2 + (z - f.z) ** 2) / (2 * f.wide * f.wide)), 0) + 1.2 + 1.2 * Math.sin(x / 47) * Math.cos(z / 61);

const CLIMB_PAD = { speed: 1.5, hold: 1.6 };            // a boost pad on a climb: half as fast again, for a second and a half after it
const CHEESE = { period: 12, roll: 9, radius: 0.85, lanes: [-3.4, 0, 3.4] };      // (three wheels, one after another, each down its own line)
const SHEEP = { period: 9, pause: 0.08, radius: 0.95 };

const at = (x, z, width, section) => [x, z, dalesHill(x, z), width, section];
export const DALES = makeTrack({
  id: 'yorkshire_dales', name: 'Yorkshire Dales',
  controlPoints: [
    at(-70, 200, 15, 'A'), at(0, 202, 15, 'A'), at(70, 198, 15, 'A'),
    at(140, 188, 17, 'B'), at(215, 150, 17, 'B'), at(265, 85, 17, 'B'),
    at(280, 5, 14, 'C'), at(272, -75, 14, 'C'), at(252, -145, 14, 'C'),
    at(225, -205, 15, 'D'), at(165, -232, 15, 'D'),
    at(100, -205, 15, 'E'), at(45, -150, 15, 'E'), at(5, -90, 15, 'E'),
    at(-30, -30, 15, 'F'), at(-85, 5, 15, 'F'),
    at(-145, 12, 17, 'G'), at(-195, -15, 17, 'G'),
    at(-232, -62, 14, 'H'), at(-258, -112, 14, 'H'), at(-300, -160, 14, 'H'),
    at(-355, -140, 14, 'I'), at(-392, -70, 14, 'I'),
    at(-385, 30, 14, 'J'), at(-335, 115, 14, 'J'), at(-250, 172, 14, 'J'), at(-155, 198, 15, 'A'),
  ],
  heightSmoothing: 5,
  hills: { down: 3.2, downMax: 0.45 },        // a descent is worth up to nearly half as much speed again
  sections: {
    A: { name: 'The Village Green', surface: 'lane' }, B: { name: 'Buttercup Meadow', surface: 'grass' }, C: { name: 'The Long Pull', surface: 'lane' },
    D: { name: 'The Tops', surface: 'limestone' }, E: { name: 'The Swoop', surface: 'grass' }, F: { name: 'The Beck', surface: 'pebbles' },
    G: { name: 'Sheep Pasture', surface: 'grass' }, H: { name: 'Heather Bank', surface: 'lane' }, I: { name: 'The Scar', surface: 'limestone' },
    J: { name: 'The Lane', surface: 'lane' },
  },
}, ({ sAtU, pointAt, pingPong }) => {
  // the cave: the lane goes into the face of the scar and down through it (roof: how high the cave is; cover: how much hill is
  // over the lane), and comes out under the waterfall, into the pool the water has dug
  const cave = { sStart: sAtU(21.0), sEnd: sAtU(22.0), roof: 8, cover: 17 };
  const plunge = { sStart: cave.sEnd + 1, sEnd: cave.sEnd + 27, depth: 0.42, ramp: 6 };
  const strips = [];
  const pads = (u0, u1, apart) => { for (let s = sAtU(u0); s < sAtU(u1); s += apart) strips.push({ id: `pad-${strips.length}`, sStart: s, sEnd: s + 12, ...CLIMB_PAD }); };
  const pull = { sStart: sAtU(6.0), sEnd: sAtU(8.8) }, bank = { sStart: sAtU(17.3), sEnd: sAtU(20.0) };
  pads(6.0, 8.8, 46); pads(17.3, 20.0, 46);
  const ford = { sStart: sAtU(14.15), sEnd: sAtU(14.75), depth: 0.42, ramp: 7 };
  const flocks = [sAtU(15.9), sAtU(16.75)];
  // a boulder or two on the tops, and a couple of milk churns in the lane
  const obstacles = [];
  [[9.35, 0.5, 'boulder', 1.3], [9.75, -0.45, 'boulder', 1.3], [10.2, 0.4, 'boulder', 1.3], [23.4, 0.5, 'churn', 0.8], [24.3, -0.5, 'churn', 0.8]].forEach(([u, share, kind, radius], k) => { const s = sAtU(u); obstacles.push({ id: `${kind}-${k}`, kind, s, lateral: share * pointAt(s).halfWidth, radius }); });

  function hazardsAt(t) {
    const out = [];
    CHEESE.lanes.forEach((lateral, k) => {
      const ph = (((t + k * CHEESE.period / 3) % CHEESE.period) + CHEESE.period) % CHEESE.period, rolling = ph < CHEESE.roll;
      const f = rolling ? ph / CHEESE.roll : 0, s = pull.sEnd + (pull.sStart - pull.sEnd) * f, c = pointAt(s, lateral);
      out.push({ id: `cheese-${k}`, kind: 'cheese', x: c.x, y: c.y, z: c.z, rotationY: c.rotationY, radius: CHEESE.radius, height: 1.1, active: rolling,
        spin: (pull.sEnd - s) / CHEESE.radius, fade: rolling ? Math.min(1, ph * 3, (CHEESE.roll - ph) * 3) : 0 });
    });
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
    strips, water: [ford, plunge], obstacles, hazardsAt, autoPickups: { rowEvery: 250, boneEvery: 105 },
    keepClear: [[pull.sStart - 8, pull.sEnd + 8], [flocks[0] - 14, flocks[1] + 18], [cave.sStart - 8, cave.sStart + 6], [cave.sEnd - 14, cave.sEnd + 2]],
    extras: { pull, bank, ford, flocks, cave, plunge, cheeseRun: CHEESE, hazardZones: { cheese: [pull.sStart, (pull.sStart + pull.sEnd) / 2, pull.sEnd], sheep: flocks } },
  };
});
export default DALES;
