// Where Treat Boxes and Golden Bones go on every map.  Shared by the game and the server, so the
// crates the server tracks are exactly the crates players see.
//
// Each map gets a "path": its lap length, pointAt(s, lateral) on the racing line, and the stretches
// pickups must keep clear of (jumps, tunnels, water, bridges, ice...).  Spots are then picked near
// target fractions of the lap, on the straightest clear stretch nearby.
import frostpeak from './frostpeak.json' with { type: 'json' };
import wendover from './wendoverPath.json' with { type: 'json' };
import { TREAT_ROAD } from './treatRoadData.js';
import { MODBURY_HEIGHTS } from './modburyData.js';

const START_CLEAR = 60;        // metres either side of the start/finish line kept clear
const MIN_GAP = 70;            // metres between any two pickup spots

/** A closed polyline [[x, y, z, halfWidth?], ...] in driving order, starting at the start line. */
function polylinePath(points, defaultHalfWidth) {
  const n = points.length, S = [0];
  for (let i = 1; i <= n; i++) {
    const a = points[i - 1], b = points[i % n];
    S.push(S[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const length = S[n];
  function pointAt(s, lateral = 0) {
    s = ((s % length) + length) % length;
    let i = 0;
    while (i < n - 1 && S[i + 1] <= s) i++;
    const a = points[i], b = points[(i + 1) % n], t = (s - S[i]) / ((S[i + 1] - S[i]) || 1);
    const tx = b[0] - a[0], tz = b[2] - a[2], tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;     // left-hand normal, as on the procedural tracks
    const hw = (a[3] ?? defaultHalfWidth) + ((b[3] ?? defaultHalfWidth) - (a[3] ?? defaultHalfWidth)) * t;
    return {
      x: a[0] + tx * t + nx * lateral, y: a[1] + (b[1] - a[1]) * t, z: a[2] + tz * t + nz * lateral,
      rotationY: Math.atan2(tx, tz), halfWidth: hw,
    };
  }
  return { length, pointAt };
}

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
    ],
  },
  wendover: {
    ...polylinePath(wendover.points, wendover.halfWidth),
    hazards: wendover.hazards.map(h => h.range),
  },
  frostpeak: {
    ...polylinePath(frostpeak.centerline.points.map(([x, y, z, hw]) => [x, y, z, hw])),
    hazards: [
      ...frostpeak.obstacles.map(o => around(o.s, 35)),
      [frostpeak.bridge.sStart - 30, frostpeak.bridge.sEnd + 30],
      ...frostpeak.iceZones.map(z => [z.sStart - 20, z.sEnd + 20]),
    ],
  },
};

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
  frostpeak:       { rows: [0.06, 0.20, 0.34, 0.49, 0.62, 0.76, 0.90],
                     bones: [0.13, 0.27, 0.41, 0.55, 0.69, 0.83, 0.96], even: true },
  modbury_heights: { rows: [0.05, 0.17, 0.30, 0.42, 0.54, 0.66, 0.79, 0.91],
                     bones: [0.11, 0.23, 0.36, 0.48, 0.60, 0.72, 0.85, 0.97], even: true },
};

/** { mapId: [s, ...] } for box rows and for bones */
export const BOX_ROW_S = {}, BONE_S = {};
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
  } else {
    BOX_ROW_S[mapId] = pickSpots(path, plan.rows, taken, 0.08, plan.even);
    BONE_S[mapId] = pickSpots(path, plan.bones, taken, 0.08, plan.even);
  }
}

/** Golden Bone spots: ground positions, alternating sides of the racing line. */
export const GOLDEN_BONE_SPOTS = Object.fromEntries(Object.entries(BONE_S).map(([mapId, list]) => {
  const path = PICKUP_PATHS[mapId];
  return [mapId, list.map((s, n) => {
    const c = path.pointAt(s), p = path.pointAt(s, (n % 2 ? -0.45 : 0.45) * c.halfWidth);
    return { s, x: p.x, y: p.y, z: p.z };
  })];
}));
