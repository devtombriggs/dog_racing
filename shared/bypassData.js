// Bypass Dash — a lap of the roads round a town: out of the services, down the motorway among the traffic, through the
// roadworks, round the roundabout, under the motorway and across the dual carriageway.  Built by shared/trackKit.js (see there
// for what each part means); the scenery is src/tracks/bypass/BypassTrack.js.
//
// Tom, 2026-11-26: it takes Squelch Hollow's place ("maybe some motorway crossing map?").  He agreed the plan: run with the
// traffic and weave between the lorries and cars in their lanes; a crossing where the traffic goes across your path and you
// pick your gap, with a footbridge over it; roadworks, an underpass and a service station.  No boost pads (his say-so: the
// Golden Bones do that).
//
// Round the lap:
//   A  Paws Services    start/finish on the forecourt of the service station
//   B  The Slip Road    a sweeping bend down on to the motorway
//   C  The Motorway     three lanes of cars and lorries going your way, slower than a dog: weave between them (nothing here can be jumped)
//   D  The Roadworks    off at the junction: barriers to weave through and wet tar that slows a dog
//   E  The Roundabout   all the way round it (it had a short cut across the grass in the middle, for a dog on a Golden Bone: Tom,
//                       2026-11-26, "remove the shortcuts for now, they all don't feel right")
//   F  The Underpass    narrow, under the motorway
//   G  The Crossing     four lanes of traffic going ACROSS the road, two each way: pick your gaps.  Or take the footbridge: narrow, a
//                       little longer, and nothing on it can hit you
//   H  The Hard Shoulder  a last bend back to the services
import { makeTrack } from './trackKit.js';

// What the traffic is: a hazard's radius and height (nothing is low enough to jump: a jump is 1.5 m), and how long it is drawn.
// A lorry is two circles, cab and trailer.
const CAR = { radius: 1.25, height: 2.2, long: 4.2 };
const LORRY = { radius: 1.5, height: 3.6, long: 8, apart: 3.4 };
// The motorway: cars every `gap` metres in each lane, at `speed` m/s (a dog runs at about 17)
const MOTORWAY = { speed: 7, gap: 46, lanes: [-0.62, 0, 0.62], fade: 14 };
// The crossing: cars `gap` metres apart crossing the road at `speed` m/s; `reach`: how far either side of the middle of the road they run
const CROSSING = { speed: 12, gap: 36, reach: 54, lanes: 4, apart: 17 };
const TAR = 0.6;                        // share of top speed on wet tar
const BRIDGE_SIDE = 1;                  // which side of the road the footbridge is on: the outside of the crossing's bend

// (an arc: n points `r` metres round from (cx, cz), from angle a0 to a1 in degrees)
const arc = (cx, cz, r, a0, a1, n, height, width, section, name) => Array.from({ length: n }, (_, k) => { const a = (a0 + (a1 - a0) * k / (n - 1)) * Math.PI / 180;
  return [cx + r * Math.cos(a), cz + r * Math.sin(a), height, width, section, k === 0 ? name : undefined]; });

// [x, z, height, width, section, name?]: a name marks a point the features below are placed by
const ROUTE = [
  [-120, 160, 4, 18, 'A'], [-40, 160, 4, 18, 'A'], [30, 158, 4, 18, 'A'],
  [92, 140, 4.5, 14, 'B', 'slip'], [132, 96, 5.5, 16, 'B'],
  [146, 40, 6, 22, 'C', 'motorway'], [134, -20, 6, 22, 'C'], [148, -80, 6, 22, 'C'], [138, -136, 5.5, 22, 'C', 'motorwayEnd'],
  [108, -186, 4.5, 13, 'D', 'works'], [74, -232, 4, 13, 'D'], [54, -278, 4, 13, 'D'],
  // the roundabout: a little more than half way round it, 45 m out from the middle
  ...arc(0, -322, 45, 6, -184, 9, 4, 14, 'E', 'roundabout'),
  [-52, -268, 2, 11, 'F', 'underpass'], [-76, -216, 0, 11, 'F'], [-114, -166, 2, 12, 'F'],
  [-156, -112, 4, 18, 'G', 'crossing'], [-184, -44, 4, 18, 'G'], [-192, 30, 4, 18, 'G', 'crossingEnd'],
  [-186, 96, 4, 15, 'H'], [-162, 144, 4, 16, 'H'],
];
const AT = Object.fromEntries(ROUTE.map((p, k) => [p[5], k]).filter(([name]) => name));
const ROUNDABOUT = { x: 0, z: -322, radius: 45 };

export const BYPASS = makeTrack({
  id: 'bypass_dash', name: 'Bypass Dash',
  controlPoints: ROUTE.map(([x, z, height, width, section]) => [x, z, height, width, section]),
  // the underpass: no wider than this, all the way under
  doors: [{ u: AT.underpass + 1, width: 9, depth: 34 }],
  sections: {
    A: { name: 'Paws Services', surface: 'tarmac' }, B: { name: 'The Slip Road', surface: 'tarmac' }, C: { name: 'The Motorway', surface: 'tarmac' },
    D: { name: 'The Roadworks', surface: 'tarmac' }, E: { name: 'The Roundabout', surface: 'tarmac' }, F: { name: 'The Underpass', surface: 'concrete' },
    G: { name: 'The Crossing', surface: 'tarmac' }, H: { name: 'The Hard Shoulder', surface: 'tarmac' },
  },
}, ({ sAtU, pointAt, along, length }) => {
  // ---------- the motorway: where its traffic runs, from the foot of the slip road to the junction
  const road = { sStart: sAtU(AT.motorway - 0.35), sEnd: sAtU(AT.motorwayEnd + 0.1) };
  const roadLong = road.sEnd - road.sStart, perLane = Math.floor(roadLong / MOTORWAY.gap);
  // (every vehicle on it: which lane, where in the queue, and whether it is a lorry)
  const traffic = [];
  MOTORWAY.lanes.forEach((lane, l) => { for (let k = 0; k < perLane; k++) traffic.push({ id: `mway-${l}-${k}`, lane, start: (k + l * 0.37) * roadLong / perLane, lorry: (k + l) % 3 === 0, hue: (k * 3 + l * 5) % 6 }); });

  // ---------- the roadworks: barriers to weave through, then wet tar
  const worksS = sAtU(AT.works - 0.3), obstacles = [], patches = [];
  for (let k = 0; k < 5; k++) { const s = worksS + k * 15; obstacles.push({ id: `barrier-${k}`, kind: 'barrier', s, lateral: (k % 2 ? 1 : -1) * pointAt(s).halfWidth * 0.42, radius: 1.0 }); }
  for (let k = 0; k < 2; k++) { const s = worksS + 84 + k * 18, hw = pointAt(s).halfWidth; patches.push({ id: `tar-${k}`, kind: 'wet tar', s, lateral: (k % 2 ? -1 : 1) * hw * 0.48, along: 5, across: hw * 0.42, speed: TAR, slowName: 'WET TAR' }); }

  // ---------- the roundabout: where it begins, and how far round the lap it goes
  const round = { sStart: sAtU(AT.roundabout + 0.2), sEnd: sAtU(AT.roundabout + 7.8) };

  // ---------- the crossing: four lanes across the road, and the footbridge over them
  const laneS = Array.from({ length: CROSSING.lanes }, (_, k) => sAtU(AT.crossing + 0.55) + k * CROSSING.apart);
  const perCrossing = Math.round(2 * CROSSING.reach / CROSSING.gap);
  const crossers = [];
  laneS.forEach((s, l) => { for (let k = 0; k < perCrossing; k++) crossers.push({ id: `cross-${l}-${k}`, s, dir: l < CROSSING.lanes / 2 ? 1 : -1, start: (k + l * 0.29) * 2 * CROSSING.reach / perCrossing, lorry: (k + l) % 4 === 3, hue: (k * 2 + l * 3) % 6 }); });
  const bridge = { id: 'footbridge', name: 'The Footbridge', sStart: laneS[0] - 62, sEnd: laneS.at(-1) + 62, side: BRIDGE_SIDE, offset: 15, half: 2.3, rise: 6, ramp: 0.24, bots: 0.4 };

  const wrap = (v, span) => ((v % span) + span) % span;
  function hazardsAt(t) {
    const out = [];
    // (how high it is: as high as the middle of the road there.  Under the footbridge it is still down on the road)
    const put = (id, kind, s, lateral, heading, size, show, extra) => { const p = pointAt(s, lateral); out.push({ id, kind, x: p.x, y: pointAt(s).y, z: p.z, rotationY: heading, radius: size.radius, height: size.height, active: show > 0.5, show, ...extra }); };
    // the motorway's traffic: along the road, your way, slower than you.  (It comes on at the top and goes off at the junction:
    // `show` fades it in and out there, and it hits nothing until it is all there)
    for (const v of traffic) {
      const d = wrap(v.start + MOTORWAY.speed * t, roadLong), s = road.sStart + d, c = pointAt(s), lateral = v.lane * c.halfWidth;
      const show = Math.min(1, d / MOTORWAY.fade, (roadLong - d) / MOTORWAY.fade);
      if (v.lorry) { put(`${v.id}-a`, 'lorry', s + LORRY.apart / 2, lateral, c.rotationY, LORRY, show, { hue: v.hue, cab: true }); put(`${v.id}-b`, 'lorry', s - LORRY.apart / 2, lateral, c.rotationY, LORRY, show, { hue: v.hue, hidden: true }); }
      else put(v.id, 'car', s, lateral, c.rotationY, CAR, show, { hue: v.hue });
    }
    // the crossing's: across the road, two lanes one way and two the other
    for (const v of crossers) {
      const lateral = v.dir * (wrap(v.start + CROSSING.speed * t, 2 * CROSSING.reach) - CROSSING.reach), c = pointAt(v.s);
      const show = Math.min(1, (CROSSING.reach - Math.abs(lateral)) / 8), heading = c.rotationY - v.dir * Math.PI / 2;
      // (a lorry across the road is two circles side by side across it)
      if (v.lorry) { put(`${v.id}-a`, 'lorry', v.s, lateral + v.dir * LORRY.apart / 2, heading, LORRY, show, { hue: v.hue, cab: true }); put(`${v.id}-b`, 'lorry', v.s, lateral - v.dir * LORRY.apart / 2, heading, LORRY, show, { hue: v.hue, hidden: true }); }
      else put(v.id, 'car', v.s, lateral, heading, CAR, show, { hue: v.hue });
    }
    return out;
  }

  // ---------- Treat Boxes and Golden Bones: laid out by hand, so that there are bones between the lanes of the crossing (the
  // reward for not taking the footbridge)
  const hw = s => pointAt(s).halfWidth;
  const rows = [70, sAtU(AT.slip + 0.9), patches.at(-1).s + 32, sAtU(AT.underpass + 2.4), sAtU(AT.crossingEnd + 0.75)];
  const bones = [
    [sAtU(AT.slip + 0.1), 0], [sAtU(AT.motorway + 0.9), 0.3 * hw(sAtU(AT.motorway + 0.9))], [sAtU(AT.motorway + 2.1), -0.3 * hw(sAtU(AT.motorway + 2.1))],
    [round.sStart - 14, 0], [round.sEnd + 30, 0],
    [laneS[0] + CROSSING.apart / 2, -2.5], [laneS[1] + CROSSING.apart / 2, 2.5], [laneS[2] + CROSSING.apart / 2, -2.5],
    [sAtU(AT.crossingEnd + 1.5), 0],
  ];
  void along; void length;
  return {
    obstacles, patches, branches: [bridge], hazardsAt,
    extras: {
      pickups: { rows, bones },
      motorway: { ...road, traffic, speed: MOTORWAY.speed }, crossing: { lanes: laneS, crossers, reach: CROSSING.reach, speed: CROSSING.speed }, bridge, roundabout: { ...ROUNDABOUT, ...round },
      sizes: { car: CAR, lorry: LORRY },
      // (where the computer's dogs keep a look out: all down the motorway, and at each lane of the crossing)
      hazardZones: { motorway: Array.from({ length: Math.ceil(roadLong / 40) + 1 }, (_, k) => road.sStart + k * 40), crossing: laneS },
    },
  };
});
export default BYPASS;
