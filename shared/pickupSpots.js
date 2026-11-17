// Where Treat Boxes and Golden Bones go on every map.  Shared by the game and the server, so the
// crates the server tracks are exactly the crates players see.
//
// Each map gets a "path": its lap length, pointAt(s, lateral) on the racing line, and the stretches
// pickups must keep clear of (jumps, tunnels, water, bridges, ice...).  Spots are then picked near
// target fractions of the lap, on the straightest clear stretch nearby.
import { WENDOVER } from './wendoverData.js';
import { polylinePath } from './polylinePath.js';
import frostpeak from './frostpeak.json' with { type: 'json' };
import wendover from './wendoverPath.json' with { type: 'json' };
import { TREAT_ROAD } from './treatRoadData.js';
import { MODBURY_HEIGHTS } from './modburyData.js';

const START_CLEAR = 60;        // metres either side of the start/finish line kept clear
const MIN_GAP = 70;            // metres between any two pickup spots


const around = (s, pad) => [s - pad, s + pad];

export const PICKUP_PATHS = {
  treat_road: {
    length: TREAT_ROAD.length, pointAt: TREAT_ROAD.pointAt,
    hazards: [[TREAT_ROAD.launch.padStart - 30, TREAT_ROAD.launch.landingS + 30], ...TREAT_ROAD.gates.map(g => around(g.s, 15))],
  },
  modbury_heights: {
    length: MODBURY_HEIGHTS.length, pointAt: MODBURY_HEIGHTS.pointAt,
    hazards: [
      [MODBURY_HEIGHTS.waterCrossing.sStart - 30, MODBURY_HEIGHTS.waterCrossing.sEnd + 30],
      [MODBURY_HEIGHTS.exposedEdge.sStart - 10, MODBURY_HEIGHTS.exposedEdge.sEnd + 10],
      [MODBURY_HEIGHTS.samples.s[MODBURY_HEIGHTS.boardwalk.firstIndex] - 15, MODBURY_HEIGHTS.samples.s[MODBURY_HEIGHTS.boardwalk.lastIndex] + 15],
      // nothing to steer for on the run-up to a broken bridge, or on the landing
      ...MODBURY_HEIGHTS.chasms.map(c => [c.ravineStart - 35, c.ravineEnd + 20]),
    ],
  },
  wendover: {
    ...polylinePath(wendover.points, wendover.halfWidth),
    hazards: [
      ...wendover.hazards.map(h => h.range),
      ...WENDOVER.pools.map(p => [p.sStart - 8, p.sEnd + 8]),
      ...WENDOVER.tunnels.flatMap(t => [around(t.entryS, 12), around(t.exitS, 16)])
    ],
  },
  frostpeak: frostpeakPath(),
};

// Frostpeak: keep pickups off the cannon (run-in, flight, landing), the boost pads and the logs.
// The map file's `s` values are measured in 3D, so the 88 m cannon climb would put them out of step
// with this flat path: hazards are found from their positions instead.
function frostpeakPath() {
  const path = polylinePath(frostpeak.centerline.points.map(([x, y, z, hw]) => [x, y, z, hw]));
  const sOf = ([x, , z]) => {
    let best = 0, bestD = Infinity;
    for (let s = 0; s < path.length; s += 1) {
      const p = path.pointAt(s), d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  };
  const c = frostpeak.cannon;
  const takeoffS = sOf(c.takeoff), landingS = sOf(c.landing);
  return {
    ...path,
    hazards: [
      [takeoffS - (c.takeoffS - c.padStartS) - 30, landingS + 30],
      ...frostpeak.obstacles.map(o => around(sOf(o.position), 35)),
      ...frostpeak.iceZones.map(z => [z.sStart - 20, z.sEnd + 20]),
    ],
    // the black run, and the slalom obstacles on it (s, lateral as a share of the half width)
    runStartS: takeoffS - (c.takeoffS - c.padStartS),
    slope: { topS: sOf(frostpeak.skiSlope.top), bottomS: sOf(frostpeak.skiSlope.bottom) },
    slalom: frostpeak.slalomObstacles.map(o => {
      const os = sOf(o.position), p = path.pointAt(os);
      // polylinePath's lateral is to the right of the way the race goes; this is the same measure
      const lat = ((o.position[0] - p.x) * -Math.cos(p.rotationY) + (o.position[2] - p.z) * Math.sin(p.rotationY)) / p.halfWidth;
      return { s: os, lateral: lat, radius: o.radius };
    }),
  };
}

// Frostpeak's black run is the party: 30 golden bones zig-zagging down it and a dozen rows of
// Treat Boxes, so the whole field is boosting and throwing balls all the way down.  The rest of
// the lap (village and forest) keeps a few of each.
function frostpeakPickups(path) {
  const { topS, bottomS } = path.slope;
  const clearOfSlalom = (s, lateral, gap) => path.slalom.every(o =>
    lapDistance(s, o.s, path.length) > gap || Math.abs(o.lateral - lateral) > 0.55);
  const spread = (a, b, n) => Array.from({ length: n }, (_, k) => a + (b - a) * (k + 0.5) / n);
  // box rows span the road, so they keep 9 m clear of every obstacle
  const rows = spread(topS + 25, bottomS - 15, 12).map(s => {
    for (const d of [0, 6, -6, 12, -12, 18, -18, 24, -24]) {
      if (path.slalom.every(o => lapDistance(s + d, o.s, path.length) > 9)) return s + d;
    }
    return s;
  });
  const bones = [], laterals = [];
  spread(topS + 15, bottomS - 5, 30).forEach((s, n) => {
    let lateral = n % 2 ? -0.45 : 0.45;               // left, right, left... a slalom of bones
    for (const d of [0, 4, -4, 8, -8]) {
      if (rows.some(r => lapDistance(s + d, r, path.length) < 5)) continue;
      if (clearOfSlalom(s + d, lateral, 6)) { bones.push(s + d); laterals.push(lateral); return; }
      if (clearOfSlalom(s + d, -lateral, 6)) { bones.push(s + d); laterals.push(-lateral); return; }
    }
    bones.push(s); laterals.push(0.8 * lateral);
  });
  // village and forest: before the cannon
  const before = (a, b, n) => spread(a, b, n);
  const forestRows = before(START_CLEAR + 40, path.runStartS - 50, 4).map(s => nudgeClear(path, s));
  const forestBones = before(START_CLEAR + 80, path.runStartS - 30, 3).map(s => nudgeClear(path, s))
    .map(s => (forestRows.some(r => lapDistance(s, r, path.length) < 30) ? nudgeClear(path, s - 45) : s));
  return {
    rows: [...forestRows, ...rows],
    bones: [...forestBones, ...bones],
    laterals: [...forestBones.map((_, n) => (n % 2 ? -0.45 : 0.45)), ...laterals],
  };
}

function nudgeClear(path, s) {
  for (let d = 0; d < 200; d += 5) {
    if (isClear(path, s + d)) return s + d;
    if (isClear(path, s - d)) return s - d;
  }
  return s;
}

function lapDistance(a, b, length) {
  const d = Math.abs(a - b) % length;
  return Math.min(d, length - d);
}

function isClear(path, s) {
  if (lapDistance(s, 0, path.length) < START_CLEAR) return false;
  return !path.hazards.some(([a, b]) => {
    const mid = (a + b) / 2, half = (b - a) / 2;
    return lapDistance(s, mid, path.length) <= half;
  });
}

function bendiness(path, s) {           // heading change across 30 m of road, radians
  const a = path.pointAt(s - 15), b = path.pointAt(s), c = path.pointAt(s + 15);
  let d = Math.abs(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z));
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/** For each target fraction, the straightest clear spot within `window` (share of the lap) of it,
 *  keeping MIN_GAP from spots already taken (taken = s values, extended in place). */
function pickSpots(path, fractions, taken, window = 0.08, even = false) {
  return fractions.map(f => (even ? pickNear(path, f, taken, window / 2) : null) ?? pickNear(path, f, taken, window) ?? (() => {
    throw new Error(`no clear pickup spot near ${(f * 100).toFixed(0)} % of the lap`);
  })());
}

// Stay close to the target where possible (keeps pickups evenly spread), else look further
function pickNear(path, f, taken, window) {
  {
    const target = path.length * f;
    let best = null, bestScore = Infinity;
    for (let d = -window * path.length; d <= window * path.length; d += 5) {
      const s = ((target + d) % path.length + path.length) % path.length;
      if (!isClear(path, s) || taken.some(t => lapDistance(s, t, path.length) < MIN_GAP)) continue;
      // straightness of the 60 m leading up to it matters most: the dog should see it coming
      const score = bendiness(path, s) + bendiness(path, s - 30) + 0.5 * bendiness(path, s + 30) + Math.abs(d) / path.length;
      if (score < bestScore) { bestScore = score; best = s; }
    }
    if (best !== null) taken.push(best);
    return best;
  }
}

// Treat Road keeps the rows it has always had (the IDs are in use); every other map is picked.
function treatRoadRowS(fraction) {
  const T = TREAT_ROAD;
  let s = T.length * fraction;
  for (let guard = 0; guard < 200; guard++) {
    const inJump = s > T.launch.padStart - 30 && s < T.launch.landingS + 30;
    const nearGate = T.gates.some(gate => Math.abs(gate.s - s) < 15);
    if (!inJump && !nearGate) break;
    s += 10;
  }
  return s % T.length;
}

const PLAN = {
  //                 box-row targets (3 boxes across)           single-bone targets
  treat_road:      { rows: null,                                bones: [0.08, 0.255, 0.52, 0.71] },
  wendover:        { rows: [0.19, 0.60, 0.72],                  bones: [0.05, 0.31, 0.45, 0.88] },
  // the two long courses get more, so there is always something coming up
  // (even: stay near each target where the road allows, so they are spread along the lap)
  frostpeak:       { custom: true },   // see frostpeakPickups(): 4 rows + 3 bones before the cannon, 12 rows + 30 bones on the black run
  modbury_heights: { rows: [0.05, 0.17, 0.30, 0.42, 0.54, 0.66, 0.79, 0.91],
                     bones: [0.11, 0.23, 0.36, 0.48, 0.60, 0.72, 0.85, 0.97], even: true,
                     // The Cliff Climb (340 to 960 m) is a long slow pull: more to go for on the way up.
                     // These are distances round the lap in metres, fitted between the spots above (which
                     // stay exactly where they were) so that something comes up about every 75 m of the climb.
                     extra: { rows: [448, 880], bones: [370, 522, 795, 955] } },
};

/** { mapId: [s, ...] } for box rows and for bones */
export const BOX_ROW_S = {}, BONE_S = {};
const BONE_LATERAL = {};          // optional: which side of the road each bone sits (share of the half width)
for (const [mapId, plan] of Object.entries(PLAN)) {
  const path = PICKUP_PATHS[mapId], taken = [];
  if (mapId === 'treat_road') {
    BOX_ROW_S[mapId] = [0.15, 0.33, 0.58, 0.82].map(treatRoadRowS);
    taken.push(...BOX_ROW_S[mapId]);
    // the bones keep their own nudge rule too, so they stay where they were
    BONE_S[mapId] = plan.bones.map(f => {
      let s = path.length * f;
      for (let guard = 0; guard < 200 && !isClear(path, s); guard++) s += 10;
      return s % path.length;
    });
  } else if (mapId === 'frostpeak') {
    const f = frostpeakPickups(path);
    BOX_ROW_S[mapId] = f.rows;
    BONE_S[mapId] = f.bones;
    BONE_LATERAL[mapId] = f.laterals;
  } else {
    BOX_ROW_S[mapId] = pickSpots(path, plan.rows, taken, 0.08, plan.even);
    BONE_S[mapId] = pickSpots(path, plan.bones, taken, 0.08, plan.even);
    if (plan.extra) {              // placed exactly where asked: it is an error if one is on a hazard or crowds another
      const place = list => list.map(s => {
        if (!isClear(path, s) || taken.some(t => lapDistance(s, t, path.length) < MIN_GAP)) {
          throw new Error(`${mapId}: no room for an extra pickup at ${s} m`);
        }
        taken.push(s);
        return s;
      });
      BOX_ROW_S[mapId].push(...place(plan.extra.rows));
      BONE_S[mapId].push(...place(plan.extra.bones));
    }
  }
}

/** Golden Bone spots: ground positions, alternating sides of the racing line. */
export const GOLDEN_BONE_SPOTS = Object.fromEntries(Object.entries(BONE_S).map(([mapId, list]) => {
  const path = PICKUP_PATHS[mapId];
  return [mapId, list.map((s, n) => {
    const c = path.pointAt(s), p = path.pointAt(s, (BONE_LATERAL[mapId]?.[n] ?? (n % 2 ? -0.45 : 0.45)) * c.halfWidth);
    return { s, x: p.x, y: p.y, z: p.z };
  })];
}));

// ---------------------------------
// Where on the racing line is (x, z)?  Used to tell which way the race goes there (wrong-way
// check) and to put a lost dog back on the line facing forwards.
// ---------------------------------
const LINE_STEP = 4;               // metres between samples
const lineSamples = {};

function samplesFor(mapId) {
  if (!lineSamples[mapId]) {
    const path = PICKUP_PATHS[mapId], list = [];
    for (let s = 0; s < path.length; s += LINE_STEP) list.push({ s, ...path.pointAt(s) });
    lineSamples[mapId] = list;
  }
  return lineSamples[mapId];
}

/** The nearest point on the racing line to (x, z): { s, x, y, z, rotationY, halfWidth, distance }.
 *  hintS (where the dog was last time) keeps the answer on the same stretch where the course
 *  doubles back on itself; the whole lap is searched if that stretch is not close by. */
export function racingLineAt(mapId, x, z, hintS = null) {
  const path = PICKUP_PATHS[mapId];
  if (!path) return null;
  const samples = samplesFor(mapId);
  const nearest = (list) => {
    let best = null, bestD = Infinity;
    for (const p of list) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best && { ...best, distance: Math.sqrt(bestD) };
  };
  if (hintS !== null) {
    const window = samples.filter(p => lapDistance(p.s, hintS, path.length) <= 80);
    const local = nearest(window);
    if (local && local.distance <= local.halfWidth + 25) return local;
  }
  return nearest(samples);
}
