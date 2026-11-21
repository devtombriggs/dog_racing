import { swimSpeed } from './dogStats.js';
// A generated track from a short description: the shared code behind Dune Dash, the Speed Bowl,
// Kombu's House and Neon Nexus (shared/desertData.js, speedBowlData.js, kombuHouseData.js, neonData.js).
//
// Pure JavaScript, no dependencies: the SAME file runs in the game and on the server.  What it makes
// has the same interface as mudParkData.js and the other hand-written tracks (query, pointAt,
// checkpoints, rules, launch, hazardsAt...), so the procedural-track race rules work on it unchanged.
//
//   export const MY_TRACK = makeTrack({
//     id, name, laps,                       // laps: how many laps a race here is (3 if left out)
//     startU,                               // where on the spline the start line is (control point number, fractions between)
//     controlPoints: [[x, z, height, width, section], ...],     // a closed loop, in the order it is raced
//     sections: { A: { name, surface }, ... },
//     doors: [{ u, width, depth }],         // doorways: the road is only `width` wide for `depth` metres there
//     drops: [k],                           // the road stops dead at control point k and carries on at the height of the next one,
//                                           // straight below: a dog that runs off the end falls to it (a window, the end of a stair)
//     lifts: [k],                           // the same step in the road at control point k, but UP: the floor of a lift shaft.  It needs
//                                           // a launch over it with `lift: true` (kit.launchBetween), which carries a dog straight up the shaft
//     hills: { down, downMax },             // how much a descent adds to a dog's speed (little, unless this says more)
//     rules: { ... },                       // anything to add to (or change in) the usual rules
//   }, kit => ({                            // kit: pointAt, sAtU, along, within, pingPong, launchBetween, length ...
//     launch,                               // kit.launchBetween(u0, u1, {...}): a leap or a cannon over a gap in the road
//     obstacles: [{ id, kind, s, lateral, radius }],            // solid things standing on the road
//     patches: [{ id, kind, s, lateral, along, across, speed, slowName }],   // something lying on the road that slows a dog
//     strips: [{ id, sStart, sEnd, latMin, latMax, speed }],     // boost pads: faster while a dog is on one
//                                           // (hold: seconds the boost stays with the dog after the pad; quick: how much faster its speed builds
//                                           //  meanwhile; branch: the id of the second road it lies on; mega: drawn as a mega pad)
//     water: [{ sStart, sEnd, depth, ramp }],                    // a pool right across the road: dogs wade, then swim
//     dividers: [{ sStart, sEnd, half, taper }],                 // an island down the middle: the road is two roads for a while
//     branches: [{ id, sStart, sEnd, side, offset, half, rise, ramp }],   // a second road that leaves the main one on `side` (+1 the
//                                           // dogs' left), runs `offset` metres from its middle (and `rise` metres above it), and joins it again
//     platforms: [{ id, sStart, sEnd, pads: [{ s0, s1, half, reach, period, phase }] }],   // a stretch with no road at all, only
//                                           // platforms sliding from side to side: a dog over nothing falls, and starts the crossing again
//     slipAt: s => 0..1,                    // how slippery (leave out for a dry track)
//     hazardsAt: t => [{ id, kind, x, y, z, rotationY, radius, height, active }],   // everything that moves, t = seconds since GO
//     keepClear: [[s0, s1], ...],           // stretches with no pickups or burrow mouths, besides the ones worked out here
//     autoPickups: { rowEvery, boneEvery }, // lay the Treat Boxes and Golden Bones out by rule (see shared/pickupSpots.js `exact`)
//     extras: { ... },                      // anything else the scenery or the tests want to read
//   }));
//
// Everything that moves is a pure function of the time since GO (hazardsAt), so the server (which
// decides who is hit) and every player's game (which draws them) agree without sending positions.

const SAMPLE_STEP = 2;
const DOG = 0.7;                        // a dog is kept this far inside the edge, and from the middle of anything solid, plus its radius
const SWIM_DRAFT = 0.42;                // a swimming dog rides this far below the surface
const WATER_BELOW_ROAD = 0.3;           // the water lies this far below the road either side of a pool
// Share of top speed a dog keeps swimming, from its swim stat (0.4 = a 4, 1 = a 10): the same rule as the Water Park
const swimShare = swimming => swimSpeed(swimming * 10);      // (stats here are 0 to 1: shared/dogStats.js swimSpeed)

export const clamp01 = t => Math.min(1, Math.max(0, t));
export const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** 0 -> 1 -> 0 with a rest at each end; dir: +1 going out, -1 coming back */
export const pingPong = (t, period, pause) => {
  const ph = ((t % period) + period) % period / period, move = 0.5 - pause;
  if (ph < move) return { k: sstep(0, 1, ph / move), dir: 1 };
  if (ph < 0.5) return { k: 1, dir: 1 };
  if (ph < 0.5 + move) return { k: 1 - sstep(0, 1, (ph - 0.5) / move), dir: -1 };
  return { k: 0, dir: -1 };
};

function catmullClosed(P, per) {
  const n = P.length, out = [], us = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t, row = [];
      for (let c = 0; c < 4; c++) row.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
      out.push(row); us.push(i + t);
    }
  }
  return { pts: out, us };
}
/** cuts: sample numbers the smoothing does not reach across (each is the first sample past a drop) */
function smoothPeriodic(a, sigma, cuts = null) {
  const k = Math.ceil(sigma * 3), n = a.length, w = [], out = new Array(n); let tot = 0;
  for (let j = -k; j <= k; j++) { const v = Math.exp(-j * j / (2 * sigma * sigma)); w.push(v); tot += v; }
  for (let i = 0; i < n; i++) {
    if (!cuts?.size) { let s = 0; for (let j = -k; j <= k; j++) s += a[(i + j + n * 8) % n] * w[j + k]; out[i] = s / tot; continue; }
    let s = a[i] * w[k], sum = w[k];
    for (let j = 1; j <= k && !cuts.has((i + j) % n); j++) { s += a[(i + j) % n] * w[j + k]; sum += w[j + k]; }
    for (let j = -1; j >= -k && !cuts.has((i + j + 1 + n * 8) % n); j--) { s += a[(i + j + n * 8) % n] * w[j + k]; sum += w[j + k]; }
    out[i] = s / sum;
  }
  return out;
}

export function makeTrack(def, features = () => ({})) {
  const CP = def.controlPoints, DECK = def.deck ?? 0, START_U = def.startU ?? 0.5;
  // how much faster a dog is going downhill: the share of top speed gained per unit of slope, and the most it can gain
  const HILLS = { down: 0.7, downMax: 0.06, ...(def.hills ?? {}) };
  const { pts, us } = catmullClosed(CP, 48), m = pts.length, cum = [0];
  for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % m]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const N = Math.round(cum[m] / SAMPLE_STEP);
  let rx = [], rz = [], ry = [], rw = [], ru = [];
  for (let i = 0, j = 0; i < N; i++) {
    const s = i * cum[m] / N; while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), a = pts[j], b = pts[(j + 1) % m];
    rx.push(a[0] + (b[0] - a[0]) * t); rz.push(a[1] + (b[1] - a[1]) * t); ry.push(Math.max(DECK, a[2] + (b[2] - a[2]) * t)); rw.push(a[3] + (b[3] - a[3]) * t); ru.push(us[j] + t / 48);
  }
  // drops: up to control point k the road is as high as that point says, and from there on as low as the next one says,
  // with nothing between (and no hump before the edge or dip after it, which the curve would otherwise put there)
  const cuts = new Set();
  for (const k of [...(def.drops ?? []), ...(def.lifts ?? [])]) {
    const h = j => Math.max(DECK, CP[((j % CP.length) + CP.length) % CP.length][2]), ease = (a, b, t) => a + (b - a) * t * t * (3 - 2 * t);
    let first = -1;
    for (let i = 0; i < N; i++) {
      const u = ru[i];
      if (u >= k - 1 && u < k) ry[i] = ease(h(k - 1), h(k), u - (k - 1));
      else if (u >= k && u < k + 1) { ry[i] = h(k + 1); if (first < 0) first = i; }
      else if (u >= k + 1 && u < k + 2) ry[i] = ease(h(k + 1), h(k + 2), u - (k + 1));
    }
    cuts.add(first);
  }
  ry = smoothPeriodic(ry, def.heightSmoothing ?? 6, cuts); rw = smoothPeriodic(rw, 4);
  // doorways: the road is no wider than `width` for `depth` metres at spline place u, however wide it is either side
  for (const door of def.doors ?? []) {
    let at = 0; for (let i = 0; i < N; i++) if (Math.abs(ru[i] - door.u) < Math.abs(ru[at] - door.u)) at = i;
    const reach = Math.max(0, Math.round((door.depth ?? 4) / 2 / (cum[m] / N)));
    for (let k = -reach; k <= reach; k++) { const i = (at + k + N) % N; rw[i] = Math.min(rw[i], door.width); }
  }
  let i0 = 0; for (let i = 0; i < N; i++) if (Math.abs(ru[i] - START_U) < Math.abs(ru[i0] - START_U)) i0 = i;
  const rot = a => a.slice(i0).concat(a.slice(0, i0));
  const X = rot(rx), Y = rot(ry), Z = rot(rz), W = rot(rw), U = rot(ru);

  const S = [0], TX = [], TZ = [], NX = [], NZ = [], GRADE = [], SEC = [], KAPPA = [];
  for (let i = 0; i < N; i++) {
    const k = (i + 1) % N, a = (i - 1 + N) % N;
    if (i > 0) S.push(S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]));
    const dx = X[k] - X[a], dz = Z[k] - Z[a], d = Math.hypot(dx, dz);
    TX.push(dx / d); TZ.push(dz / d); NX.push(-dz / d); NZ.push(dx / d); GRADE.push((Y[k] - Y[a]) / d);
    SEC.push(CP[Math.floor(U[i]) % CP.length][4]);
  }
  const LENGTH = S[N - 1] + Math.hypot(X[0] - X[N - 1], Z[0] - Z[N - 1]);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, k = (i + 1) % N; let dth = Math.atan2(TZ[k], TX[k]) - Math.atan2(TZ[a], TX[a]);
    while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    KAPPA.push(dth / Math.hypot(X[k] - X[a], Z[k] - Z[a]));
  }
  const wrapIndex = i => ((i % N) + N) % N, yawAt = i => Math.atan2(TX[i], TZ[i]);
  const wrapS = s => ((s % LENGTH) + LENGTH) % LENGTH;
  const indexAtS = s => wrapIndex(Math.round(wrapS(s) / LENGTH * N));
  /** distance round the lap of a place given as a spline parameter (control point number, fractions between) */
  const sAtU = u => { let best = 0; for (let i = 0; i < N; i++) if (Math.abs(U[i] - u) < Math.abs(U[best] - u)) best = i; return S[best]; };
  /** signed distance from s0 forward to s (shortest way round the lap) */
  const along = (s, s0) => { let d = wrapS(s - s0); if (d > LENGTH / 2) d -= LENGTH; return d; };
  const within = (s, zone) => along(s, zone.sStart) >= 0 && along(s, zone.sEnd) <= 0;

  function pointAt(s, lateral = 0) {
    s = wrapS(s);
    const f = s / LENGTH * N, i = Math.floor(f) % N, k = (i + 1) % N, t = f - Math.floor(f);
    const nx = NX[i] + (NX[k] - NX[i]) * t, nz = NZ[i] + (NZ[k] - NZ[i]) * t;
    const halfWidth = (W[i] + (W[k] - W[i]) * t) / 2;
    let y = Y[i] + (Y[k] - Y[i]) * t;
    if (branches.length && Math.abs(lateral) > halfWidth) { const br = branchAt(s, halfWidth); if (br && onBranch(br, br.side * lateral, halfWidth)) y += br.lift; }
    return { x: X[i] + (X[k] - X[i]) * t + nx * lateral, y, z: Z[i] + (Z[k] - Z[i]) * t + nz * lateral,
      rotationY: Math.atan2(TX[i] + (TX[k] - TX[i]) * t, TZ[i] + (TZ[k] - TZ[i]) * t), index: i, halfWidth, section: SEC[i],
      nx, nz };
  }

  // ---------- branches: a second road beside the main one for a while
  // The middle of the main road is always the lap's own line (checkpoints, rescues and the racing line
  // are on it), so a branch is only ever somewhere else a dog may run: it leaves the main road's edge,
  // runs beside it at a distance (and a height) of its own, and comes back.  Inside a bend it is the
  // shorter way round; outside one, or on a straight, the longer.
  let branches = [];
  const blendOf = (b, s) => { const t = along(s, b.sStart) / (b.sEnd - b.sStart); return sstep(0, b.ramp, t) * sstep(0, b.ramp, 1 - t); };
  /** The branch beside the road at s, if there is one: { branch, side, centre, half, open, lift, slope } (centre: metres from the middle of the main road) */
  function branchAt(s, halfWidth) {
    for (const b of branches) {
      if (!within(s, b)) continue;
      const hw = halfWidth ?? pointAt(s).halfWidth, blend = blendOf(b, s), centre = b.offset * blend, from = (hw + b.half + 1) / b.offset;
      return { branch: b, id: b.id, side: b.side, centre, half: b.half, open: centre - b.half > hw,       // open: there is a gap between the two roads
        lift: b.rise * sstep(from, Math.min(1, from + 0.5), blend), slope: b.offset * (blendOf(b, s + 1) - blendOf(b, s - 1)) / 2 };
    }
    return null;
  }
  /** Is a place L metres to the branch's side of the middle on the branch (not the main road)? */
  const onBranch = (br, L, hw) => (br.open ? L > (hw + br.centre - br.half) / 2 : L > hw);
  /** A distance across the road at s, moved to the nearest place a dog can stand (keeping `edge` in from every edge). */
  function holdLateral(s, lateral, edge = 0.65) {
    const hw = pointAt(s).halfWidth, limit = Math.max(0, hw - edge), br = branches.length ? branchAt(s, hw) : null;
    if (!br) return Math.max(-limit, Math.min(limit, lateral));
    const L = br.side * lateral, lo = br.centre - br.half + edge, hi = Math.max(limit, br.centre + br.half - edge);
    if (L < -limit) return -br.side * limit;
    if (!br.open) return br.side * Math.min(L, hi);
    if (L <= limit) return lateral;
    if (L < lo) return br.side * (L - limit < lo - L ? limit : lo);
    return br.side * Math.min(L, hi);
  }

  /** A leap (or a cannon shot) over a gap in the road between two places on the spline. */
  const launchBetween = (u0, u1, { duration = 1.8, arcHeight = 8, exitSpeedMultiplier = 1.3, boostSeconds = 1.25, pad = 16, landing = 10, takeoff = 4, lift = false } = {}) => {
    const gapStartIndex = indexAtS(sAtU(u0)), gapEndIndex = indexAtS(sAtU(u1));
    return { gapStartIndex, gapEndIndex, gapStart: S[gapStartIndex], gapEnd: S[gapEndIndex], padStart: S[gapStartIndex] - pad, takeoffS: S[gapStartIndex] - takeoff,
      landingS: S[gapEndIndex] + landing, duration, arcHeight, exitSpeedMultiplier, boostSeconds, ...(lift ? { lift: true } : {}) };
  };

  // ---------- what this track has on it
  const parts = features({ length: LENGTH, sampleCount: N, pointAt, sAtU, along, within, wrapS, indexAtS, launchBetween, pingPong, sstep, clamp01 });
  // (a track may have more than one leap: `launches`.  `launch` is the first of them)
  const launches = (parts.launches ?? (parts.launch ? [parts.launch] : [])).map((l, index) => ({ ...l, index }));
  const launch = launches[0] ?? null;
  const isGap = s => launches.some(l => s > l.gapStart && s < l.gapEnd);
  const isGapSegment = i => launches.some(l => i >= l.gapStartIndex && i < l.gapEndIndex);
  const place = (o, lateral = o.lateral ?? 0) => { const c = pointAt(o.s), q = pointAt(o.s, lateral); return { ...o, lateral, x: q.x, y: q.y, z: q.z, rotationY: o.rotationY ?? c.rotationY }; };
  const obstacles = (parts.obstacles ?? []).map(o => place(o));
  const patches = (parts.patches ?? []).map(o => place(o));
  const strips = parts.strips ?? [], water = parts.water ?? [], dividers = parts.dividers ?? [];
  branches = (parts.branches ?? []).map(b => ({ ramp: 0.3, rise: 0, half: 6, ...b }));
  // ---------- moving platforms.  Where each one is depends on the race clock: whoever asks (the server for
  // each room, the game each frame) says what time it is first with setClock.
  const platforms = (parts.platforms ?? []).map(zone => ({ ...zone, pads: zone.pads.map((pad, k) => ({ id: `${zone.id}-${k}`, ...pad })) }));
  const PAD_LIP = 0.8;                 // a dog this far off the edge of a platform (or of the road's broken end) still counts as on it
  let clock = 0;
  const setClock = t => { clock = t; };
  /** how far to the dogs' left of the middle of the road the middle of a platform is at t seconds */
  const padLateral = (pad, t = clock) => pad.reach * Math.sin(2 * Math.PI * (t / pad.period + pad.phase));
  /** where a platform is at t seconds: { x, y, z, rotationY, lateral } */
  const padAt = (pad, t = clock) => { const lateral = padLateral(pad, t), c = pointAt((pad.s0 + pad.s1) / 2), p = pointAt((pad.s0 + pad.s1) / 2, lateral); return { x: p.x, y: c.y, z: p.z, rotationY: c.rotationY, lateral }; };
  /** is there nothing under (s, lateral) at t seconds? */
  function overNothing(s, lateral, t = clock) {
    for (const zone of platforms) {
      if (!(along(s, zone.sStart) > PAD_LIP && along(s, zone.sEnd) < -PAD_LIP)) continue;
      return !zone.pads.some(pad => along(s, pad.s0) > -PAD_LIP && along(s, pad.s1) < PAD_LIP && Math.abs(lateral - padLateral(pad, t)) < pad.half + PAD_LIP);
    }
    return false;
  }
  // ---------- drops: where the road stops and carries on lower down.  { s, index, top, bottom, height }
  const drops = (def.drops ?? []).map(k => { let i = 0; while (!(U[i] >= k && U[i] < k + 1 && !(U[wrapIndex(i - 1)] >= k && U[wrapIndex(i - 1)] < k + 1))) i++; const top = Y[wrapIndex(i - 1)]; return { s: S[i], index: i, top, bottom: Y[i], height: top - Y[i] }; });
  const isHole = s => platforms.some(zone => along(s, zone.sStart) >= 0 && along(s, zone.sEnd) < 0);
  const patchAt = (s, lateral) => patches.find(patch => ((along(s, patch.s) / patch.along) ** 2 + ((lateral - patch.lateral) / patch.across) ** 2) < 1) ?? null;
  // (a pad with `branch` lies on that second road, right across it; any other lies on the main road)
  const stripAt = (s, lateral, lane) => strips.find(strip => within(s, strip) && (strip.branch ? lane?.id === strip.branch : !(lane && strip.latMin == null && strip.latMax == null) && lateral >= (strip.latMin ?? -Infinity) && lateral <= (strip.latMax ?? Infinity))) ?? null;
  /** how deep the water is at s (0 on dry road): a pool shelves in and out over its `ramp` */
  const depthAt = s => { for (const pool of water) if (within(s, pool)) return pool.depth * sstep(0, pool.ramp ?? 10, along(s, pool.sStart)) * sstep(0, pool.ramp ?? 10, -along(s, pool.sEnd)); return 0; };
  /** half the width of the island down the middle of the road at s (0 where the road is one road) */
  const dividerAt = s => { for (const d of dividers) if (within(s, d)) return d.half * sstep(0, d.taper ?? 16, along(s, d.sStart)) * sstep(0, d.taper ?? 16, -along(s, d.sEnd)); return 0; };
  const slipAt = parts.slipAt ?? null;

  /** The leap: the same curve for the server and every game. */
  function launchPoint(elapsed, lateral = 0, which = 0) {
    const launch = launches[which?.index ?? which] ?? launches[0];
    const t = Math.max(0, Math.min(1, elapsed / launch.duration));
    const a = pointAt(launch.takeoffS, lateral), b = pointAt(launch.landingS, lateral);
    if (launch.lift) {
      // a lift: in at the bottom, straight up the shaft (slowly at first, then fast), and out at the top
      const IN = 0.16, OUT = 0.86, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, flat = Math.hypot(b.x - a.x, b.z - a.z) / 2, rise = b.y - a.y;
      const k = t < IN ? 0.5 * (t / IN) : t > OUT ? 0.5 + 0.5 * (t - OUT) / (1 - OUT) : 0.5, up = clamp01((t - IN) / (OUT - IN)), e = up * up * (3 - 2 * up);
      const x = k < 0.5 ? a.x + (mx - a.x) * k * 2 : mx + (b.x - mx) * (k - 0.5) * 2, z = k < 0.5 ? a.z + (mz - a.z) * k * 2 : mz + (b.z - mz) * (k - 0.5) * 2;
      const speed = t < IN ? flat / (IN * launch.duration) : t > OUT ? flat / ((1 - OUT) * launch.duration) : Math.abs(rise) * 6 * up * (1 - up) / ((OUT - IN) * launch.duration);
      return { x, y: a.y + rise * e, z, rotationY: t < 0.5 ? a.rotationY : b.rotationY, pitch: 0, speed, rising: t >= IN && t <= OUT };
    }
    const tangent = Math.hypot(b.x - a.x, b.z - a.z) * 0.55;
    const h0 = 2 * t * t * t - 3 * t * t + 1, h1 = t * t * t - 2 * t * t + t, h2 = -2 * t * t * t + 3 * t * t, h3 = t * t * t - t * t;
    const dh0 = 6 * t * t - 6 * t, dh1 = 3 * t * t - 4 * t + 1, dh2 = -dh0, dh3 = 3 * t * t - 2 * t;
    const ax = Math.sin(a.rotationY) * tangent, az = Math.cos(a.rotationY) * tangent, bx = Math.sin(b.rotationY) * tangent, bz = Math.cos(b.rotationY) * tangent;
    const dx = dh0 * a.x + dh1 * ax + dh2 * b.x + dh3 * bx, dz = dh0 * a.z + dh1 * az + dh2 * b.z + dh3 * bz;
    const dy = b.y - a.y + 4 * launch.arcHeight * (1 - 2 * t);
    return { x: h0 * a.x + h1 * ax + h2 * b.x + h3 * bx, y: a.y + (b.y - a.y) * t + 4 * launch.arcHeight * t * (1 - t), z: h0 * a.z + h1 * az + h2 * b.z + h3 * bz,
      rotationY: Math.atan2(dx, dz), pitch: -Math.atan2(dy, Math.hypot(dx, dz)), speed: Math.hypot(dx, dy, dz) / launch.duration };
  }

  const NEAR = 30 + Math.max(0, ...branches.map(b => b.offset + b.half));
  function nearestSample(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    let edge = false;
    if (hint >= 0) for (let k = -30; k <= 30; k++) { const i = wrapIndex(hint + k), d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; edge = Math.abs(k) === 30; } }
    // (a dog on a branch is a long way from the middle of the main road, but still beside the same stretch of it)
    if (best >= 0 && !edge && bd < NEAR * NEAR) return best;
    best = -1; bd = Infinity;
    for (let i = 0; i < N; i++) { const d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function project(x, z, best) {
    let out = null;
    for (const a of [wrapIndex(best - 1), best]) {
      const b = (a + 1) % N, ex = X[b] - X[a], ez = Z[b] - Z[a], t = clamp01(((x - X[a]) * ex + (z - Z[a]) * ez) / (ex * ex + ez * ez));
      const px = X[a] + ex * t, pz = Z[a] + ez * t, d = Math.hypot(x - px, z - pz);
      if (!out || d < out.distance) {
        const nx = NX[a] + (NX[b] - NX[a]) * t, nz = NZ[a] + (NZ[b] - NZ[a]) * t, segLen = b === 0 ? LENGTH - S[a] : S[b] - S[a];
        out = { a, b, t, px, pz, nx, nz, distance: d, lateral: (x - px) * nx + (z - pz) * nz, trackY: Y[a] + (Y[b] - Y[a]) * t,
          halfWidth: (W[a] + (W[b] - W[a]) * t) / 2, s: (S[a] + segLen * t) % LENGTH };
      }
    }
    return out;
  }

  /** Everything gameplay needs to know about a position.  hint = `index` from this dog's last query (-1: search). */
  function query(x, z, hint = -1) {
    const p = project(x, z, nearestSample(x, z, hint)), i = p.t < 0.5 ? p.a : p.b, hw = p.halfWidth, sec = SEC[p.a];
    // a branch beside the road here: which of the two roads is this on, and where may a dog stand?
    const br = branches.length ? branchAt(p.s, hw) : null;
    let held = null, lane = null, yaw = yawAt(p.a);
    if (br) {
      const L = br.side * p.lateral, safe = holdLateral(p.s, p.lateral) * br.side;
      if (Math.abs(safe - L) > 1e-9) held = br.side * safe;
      if (onBranch(br, safe, hw)) {
        p.trackY += br.lift; lane = { id: br.id, centre: br.side * br.centre, half: br.half };
        const k = br.side * br.slope; yaw = Math.atan2(TX[p.a] + k * NX[p.a], TZ[p.a] + k * NZ[p.a]);
      }
    }
    const depth = depthAt(p.s), waterY = p.trackY - WATER_BELOW_ROAD;
    const q = {
      index: i, s: p.s, lateral: p.lateral, halfWidth: hw, distance: p.distance, trackY: p.trackY, lane,
      grade: GRADE[p.a], curvature: KAPPA[p.a], rotationY: yaw, section: sec,
      surface: depth > 0.05 ? 'water' : def.sections[sec]?.surface ?? 'road', slippery: slipAt ? slipAt(p.s) : 0,
      mud: false, boost: 0, fall: false, blocked: false, clampX: x, clampZ: z,
      // the bottom of the pool where there is one, the road everywhere else
      y: depth > 0 ? waterY - depth : p.trackY,
      waterDepth: depth, waterY, inWater: depth > 0.05, movement: depth > 0.5 ? 'swim' : depth > 0.05 ? 'wade' : 'run', flow: 0,
    };
    // walls all the way round: the only way off is a leap
    const limit = hw - 0.3 - DOG * 0.5;
    let px = x, pz = z, lateral = p.lateral;
    if (br) { if (held !== null) { lateral = held; q.blocked = true; } }
    else if (Math.abs(lateral) > limit) { lateral = Math.sign(lateral) * limit; q.blocked = true; }
    // ...and round the island, where the road is two roads
    const island = dividerAt(p.s);
    if (island > 0 && Math.abs(lateral) < island + 0.3 + DOG * 0.5) { lateral = (lateral >= 0 ? 1 : -1) * (island + 0.3 + DOG * 0.5); q.blocked = true; }
    if (q.blocked) { px = p.px + p.nx * lateral; pz = p.pz + p.nz * lateral; }
    for (const o of obstacles) {
      const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz), keep = o.radius + DOG;
      if (d < keep) { q.blocked = true; const ux = d > 1e-6 ? dx / d : p.nx, uz = d > 1e-6 ? dz / d : p.nz; px = o.x + ux * keep; pz = o.z + uz * keep; }
    }
    q.clampX = px; q.clampZ = pz;
    if (!q.blocked) {
      // (what lies on the main road is not on the branch beside it: a boost pad there says which it is on by its latMin and latMax)
      const patch = lane ? null : patchAt(p.s, p.lateral), strip = patch ? null : stripAt(p.s, p.lateral, lane);
      if (patch) { q.mud = true; q.mudSpeed = patch.speed ?? 0.55; q.surface = patch.kind ?? 'mud'; q.slowName = patch.slowName; }
      if (strip?.hold) { q.kick = strip; q.surface = 'boost'; }       // a pad whose boost stays with the dog for `hold` seconds after it
      else if (strip) { q.boost = strip.speed ?? 1.35; q.surface = 'boost'; }
    }
    if (platforms.length) q.gap = overNothing(p.s, lateral);     // nothing under it: see rules.gapClearance
    q.onTrack = !isGap(p.s);                                   // "supported": what the race rules look at
    q.dogY = q.movement === 'swim' ? waterY - SWIM_DRAFT : q.y;    // where to draw the dog (it floats when swimming)
    return q;
  }

  /**
   * One speed multiplier for where the dog is.  stats are 0..1 (0.5 = an average dog).  airborne: the
   * dog is off the ground: nothing lying on the road slows or speeds it.
   */
  function speedFactor(q, stats = {}, airborne = false) {
    const stamina = stats.stamina ?? 0.5; let f = 1;
    if (q.grade > 0) f *= 1 - Math.min(0.3, q.grade * 1.8 * (1.5 - stamina));
    else f *= 1 + Math.min(HILLS.downMax, -q.grade * HILLS.down);
    if (airborne) return f;
    if (q.mud) f *= q.mudSpeed ?? 0.55;
    if (q.boost) f *= q.boost;
    if (q.inWater) f *= swimShare(stats.swimming ?? 0.5);      // (wading or swimming, the same: Tom, 2026-11-21)
    return f;
  }

  // ---------- everything that moves, as a function of the seconds since GO
  // Each hazard: { id, kind, x, y, z, rotationY, radius, height, active }.  A dog whose middle comes
  // within radius (plus its own) of an active one is knocked over, unless it is more than `height`
  // above it (a jump clears a low one).  On a hill "above it" is measured from the ground each is on: a cheese
  // rolling down at a dog is further up the slope, so its foot is already above the dog's, and a jump that
  // clears it by its own height has cleared it.
  const hazardsAt = parts.hazardsAt ?? (() => []);
  function hazardHit(position, t) {
    for (const h of hazardsAt(t)) {
      if (!h.active || position[1] - h.y > h.height) continue;
      if (Math.hypot(position[0] - h.x, position[2] - h.z) > h.radius + DOG) continue;
      // (only where both are plainly on the same stretch of road: not one floor above another)
      const under = query(position[0], position[2]).trackY, foot = query(h.x, h.z).trackY;
      const dogUp = position[1] - under, hazardUp = h.y - foot;
      if (Math.abs(under - foot) < 3 && dogUp > -0.5 && Math.abs(hazardUp) < 0.6 && dogUp - Math.max(0, hazardUp) > h.height) continue;
      return h;
    }
    return null;
  }

  // ---------- checkpoints, the grid
  const cpCount = Math.max(4, Math.round(LENGTH / (def.checkpointSpacing ?? 100))), every = [];
  for (let c = 0; c < cpCount; c++) { const i = wrapIndex(Math.round(c * N / cpCount)); every.push({ sampleIndex: i, s: S[i], position: [X[i], Y[i], Z[i]], rotationY: yawAt(i), halfWidth: W[i] / 2, section: SEC[i] }); }
  let checkpoints = every;
  for (const launch of launches) {
    // None in mid-air or on the run up to the leap; the landing is a gate every dog must come down on.
    checkpoints = checkpoints.filter(cp => cp.s < launch.padStart - 8 || cp.s > launch.landingS + 20);
    for (const [s, launchLanding] of [[launch.padStart - 8, false], [launch.landingS, true]]) {
      const p = pointAt(s);
      checkpoints.push({ s, launchLanding, sampleIndex: p.index, position: [p.x, p.y, p.z], rotationY: p.rotationY, halfWidth: p.halfWidth, section: p.section });
    }
  }
  // none where a dog is still in the air after a drop
  for (const drop of drops) checkpoints = checkpoints.filter(cp => !(along(cp.s, drop.s - 6) > 0 && along(cp.s, drop.s + 45) < 0));
  // the same at a platform crossing: none on it, and one just before it, which is where a dog that falls starts again
  for (const zone of platforms) {
    checkpoints = checkpoints.filter(cp => !(along(cp.s, zone.sStart - 45) > 0 && along(cp.s, zone.sEnd + 8) < 0));
    const s = zone.sStart - 16, p = pointAt(s);
    checkpoints.push({ s, sampleIndex: p.index, position: [p.x, p.y, p.z], rotationY: p.rotationY, halfWidth: p.halfWidth, section: p.section });
  }
  checkpoints.sort((a, b) => a.s - b.s).forEach((cp, index) => { cp.index = index; });
  // (a dog on a branch passes a checkpoint from a long way off to the side)
  for (const cp of checkpoints) { const br = branches.length ? branchAt(cp.s, cp.halfWidth) : null; if (br) cp.radius = Math.max(cp.halfWidth, br.centre + br.half) + 8; }
  const gi = wrapIndex(N - 4), spacing = Math.min(2.6, (W[gi] - 3) / 4), startPositions = [];
  for (let k = 0; k < 5; k++) { const lat = (2 - k) * spacing; startPositions.push({ slot: k, position: [X[gi] + NX[gi] * lat, Y[gi], Z[gi] + NZ[gi] * lat], rotationY: yawAt(gi), s: S[gi] - LENGTH, lateral: lat }); }
  // (the sixth dog: a row back, in the middle)
  { const g6 = wrapIndex(N - 6); startPositions.push({ slot: 5, position: [X[g6], Y[g6], Z[g6]], rotationY: yawAt(g6), s: S[g6] - LENGTH, lateral: 0 }); }
  // (the doorways, as distances round the lap, for the scenery and for the computer's dogs)
  const doors = (def.doors ?? []).map(door => ({ ...door, s: sAtU(door.u) }));
  const sections = [];
  for (let i = 0, st = 0; i <= N; i++) if (i === N || SEC[i] !== SEC[st]) { sections.push({ id: SEC[st], ...def.sections[SEC[st]], sStart: S[st], sEnd: i === N ? LENGTH : S[i], firstIndex: st, lastIndex: i - 1 }); st = i; }

  // stretches to keep pickups and burrow mouths out of: the leap, the pools' edges, wherever the road
  // divides or joins, and round everything standing or lying on it
  const around = (s, pad) => [s - pad, s + pad];
  const pickupHazards = [
    ...launches.map(l => [l.padStart - 30, l.landingS + 30]),
    ...water.map(pool => [pool.sStart - 8, pool.sEnd + 8]),
    ...dividers.flatMap(d => [around(d.sStart + (d.taper ?? 16) / 2, (d.taper ?? 16) / 2 + 8), around(d.sEnd - (d.taper ?? 16) / 2, (d.taper ?? 16) / 2 + 8)]),
    ...obstacles.map(o => around(o.s, 10)), ...patches.map(patch => around(patch.s, patch.along + 6)), ...(def.doors ?? []).map(door => around(sAtU(door.u), 9)),
    // (where a branch leaves the road and where it joins it again)
    ...branches.flatMap(b => { const d = (b.sEnd - b.sStart) * b.ramp * 0.45; return [[b.sStart - 6, b.sStart + d], [b.sEnd - d, b.sEnd + 6]]; }),
    ...platforms.map(zone => [zone.sStart - 34, zone.sEnd + 16]),
    ...drops.map(drop => [drop.s - 14, drop.s + 50]),
    ...(parts.keepClear ?? []),
  ];
  // Treat Boxes and Golden Bones laid out by rule (autoPickups: { rowEvery, boneEvery } metres): round the lap, a row or a
  // bone wherever the road is clear and the last one is far enough behind.  -> { rows: [s], bones: [[s, metres across]] }
  let autoPickups = null;
  if (parts.autoPickups) {
    const { rowEvery = 240, boneEvery = 110, apart = 38, from = 42, pairs = false } = parts.autoPickups, rows = [], bones = [];       // (pairs: two bones side by side each time)
    const free = s => !pickupHazards.some(([a, b]) => s > a - 5 && s < b + 5);
    let lastRow = from - rowEvery * 0.55, lastBone = from - boneEvery, last = -Infinity;
    for (let s = from; s < LENGTH - 32; s += 3) {
      if (!free(s) || s - last < apart) continue;
      if (s - lastRow >= rowEvery) { rows.push(s); lastRow = last = s; }
      else if (s - lastBone >= boneEvery) { const lat = 0.42 * pointAt(s).halfWidth; if (pairs) bones.push([s, lat], [s, -lat]); else bones.push([s, (bones.length % 2 ? -1 : 1) * lat]); lastBone = last = s; }
    }
    autoPickups = { rows, bones };
  }
  /** Where across the road a row of Treat Boxes goes at s (on both roads, where there are two) */
  const boxLanes = s => { const hw = pointAt(s).halfWidth, br = branches.length ? branchAt(s, hw) : null;
    return br?.open ? [-0.5 * hw, 0.5 * hw, br.side * (br.centre - br.half * 0.45), br.side * (br.centre + br.half * 0.45)] : (parts.boxLanes ?? [-0.66, 0, 0.66]).map(lane => lane * hw); };

  return {
    id: def.id, name: def.name, laps: def.laps ?? 3, length: LENGTH, sampleCount: N, sampleSpacing: LENGTH / N,
    samples: { x: X, y: Y, z: Z, width: W, s: S, u: U, tangentX: TX, tangentZ: TZ, normalX: NX, normalZ: NZ, grade: GRADE, curvature: KAPPA, section: SEC },
    sections, checkpoints, startPositions,
    startFinish: { position: [X[0], Y[0], Z[0]], rotationY: yawAt(0), halfWidth: W[0] / 2 },
    obstacles, mud: patches, strips, water, dividers, branches, doors, platforms, drops, pickupHazards, boxLanes,
    ...(launch ? { launch, launches, launchPoint } : {}),
    ...(autoPickups ? { pickups: autoPickups } : {}),
    ...(parts.extras ?? {}),
    rules: { hasBarriers: true, fallStartsBelow: 2.0, respawnDelaySeconds: 1.0, respawnPenaltySeconds: 1.5, respawnSpeedMultiplier: 0.55, gravity: 24, killPlaneY: -60, hazardStunMs: 1100, gapClearance: 0.2, ...(def.rules ?? {}) },
    query, pointAt, indexAtS, sAtU, along, within, isGap, isGapSegment, depthAt, dividerAt, setClock, padAt, padLateral, isHole, isHoleSegment: i => isHole(S[i]), branchAt, holdLateral, speedFactor, hazardsAt, hazardHit,
    ...(slipAt ? { slipAt } : {}),
  };
}
