// Modbury Heights — shared track + terrain definition.
//
// Pure JavaScript, no dependencies: import this SAME file in the React client and the Socket.IO
// server. It exposes the same interface as treatRoadData.js (query, pointAt, checkpoints, rules...)
// so the Treat Road race rules (treatRoadRace.js: fall -> respawn -> penalty, checkpoints, laps)
// work on this track unchanged.
//
// Coordinates: Three.js world space, Y up, metres. Sea level is y = 0. The sea is towards +Z.
// The trail is a closed uniform Catmull-Rom spline (same curve as THREE.CatmullRomCurve3(pts, true)).

export const MODBURY_ID = 'modbury_heights';
export const SEA_LEVEL = 0;
const SAMPLE_STEP = 2, CHECKPOINT_SPACING = 100, EDGE_TOLERANCE = 0.25;

// [x, z, height, width, section, exposedCliffEdge]
const CONTROL_POINTS = [
  [-150, 5, 1.5, 16, 'A'], [0, 8, 1.5, 16, 'A'], [150, 5, 1.5, 16, 'A'], [250, 0, 1.7, 15, 'A'],
  [330, -30, 4, 12, 'B'], [378, -110, 11, 10.5, 'B'], [312, -190, 20, 10.5, 'B'], [382, -270, 30, 10.5, 'B'], [316, -350, 40, 10.5, 'B'], [368, -425, 50, 10.5, 'B'],
  [275, -470, 56, 9.6, 'C'], [160, -390, 60, 9.6, 'C'], [118, -260, 57, 9.6, 'C'], [140, -150, 59, 9.6, 'C'],
  [60, -97, 58, 9.6, 'C', 1], [-60, -93, 57, 9.6, 'C', 1], [-180, -98, 58, 9.6, 'C', 1], [-290, -93, 56, 9.6, 'C'],
  [-390, -120, 51, 10, 'D'], [-450, -200, 43, 10, 'D'], [-540, -240, 34, 10, 'D'], [-620, -190, 25, 10, 'D'], [-600, -110, 16, 10, 'D'], [-660, -40, 8, 11, 'D'],
  [-640, 30, 2, 12, 'E'], [-580, 62, 0.9, 12, 'E'], [-500, 68, -0.95, 12, 'E'], [-430, 62, 0.8, 12, 'E'],
  [-370, 52, 1.0, 12, 'F'], [-300, 30, 1.6, 10.5, 'F'], [-225, 8, 2.0, 10.5, 'F'],
];
const BOARDWALK_U = [29.25, 30.0];      // spline parameter range covered by the wooden boardwalk (section F)

// Ravines cut across the clifftop trail, each crossed by a wooden bridge with its middle missing: the
// dog has to jump the break or it falls into the ravine (and goes back to its last checkpoint).
//   s: distance round the lap to the middle of the break;  gap: how wide the break is, metres.
// Each sits 60 m or more after a checkpoint (room to get back up to speed after a fall) on a straight.
// A jump at a sprint carries about 13 m, so the timing is forgiving; the wider ones are later in the lap.
// The third and fourth are on the exposed cliff edge, where the ravine is cut right through to the sea.
const CHASMS = [
  { s: 1070, gap: 6 }, { s: 1175, gap: 6.5 }, { s: 1570, gap: 7 }, { s: 1680, gap: 7 }, { s: 1975, gap: 7.5 },
];
const RAVINE_HALF = 9;                  // the ravine (and its bridge) reaches this far either side of the middle of the break
const RAVINE_DEPTH = 15;
const GAP_LIP = 0.8;                    // a dog this close to either broken end still counts as on the planks

export const SECTIONS = {
  A: { name: 'Beach Start', stat: null, surface: 'wet sand' },
  B: { name: 'The Cliff Climb', stat: 'stamina', surface: 'dirt' },
  C: { name: 'Modbury Heights', stat: null, surface: 'gravel' },
  D: { name: 'Coastal Descent', stat: null, surface: 'dirt' },
  E: { name: "Smuggler's Cove", stat: 'swimming', surface: 'sand / shallow water' },
  F: { name: 'Beach Return', stat: null, surface: 'sand / boardwalk' },
};
// how far a dog may stray off the trail on each side before the natural boundary, per section
const SIDE = { A: { shoulder: 12, bank: 0 }, F: { shoulder: 10, bank: 0 }, E: { shoulder: 9, bank: 0 }, B: { shoulder: 2.5, bank: 1 }, D: { shoulder: 2.5, bank: 1 }, C: { shoulder: 4, bank: 1 } };

// ---------- deterministic noise (identical on every machine)
const NT = 256, TAB = new Float32Array(NT * NT);
{ let a = 20261116; for (let i = 0; i < TAB.length; i++) { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; TAB[i] = ((t ^ t >>> 14) >>> 0) / 4294967296; } }
function vnoise(x, y) {
  const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = ((xf % NT) + NT) % NT, x1 = (x0 + 1) % NT, y0 = ((yf % NT) + NT) % NT, y1 = (y0 + 1) % NT;
  return (TAB[x0 * NT + y0] * (1 - u) + TAB[x1 * NT + y0] * u) * (1 - v) + (TAB[x0 * NT + y1] * (1 - u) + TAB[x1 * NT + y1] * u) * v;
}
export function fbm(x, y, oct = 3) { let s = 0, a = 1, f = 1, tot = 0; for (let o = 0; o < oct; o++) { s += a * (vnoise(x * f + o * 17, y * f + o * 9) * 2 - 1); tot += a; a *= 0.5; f *= 2; } return s / tot; }
const clamp01 = t => Math.min(1, Math.max(0, t));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

// ---------- the natural landscape (before the trail is cut into it)
/** Z of the waterline at a given X. The cove is the notch around x = -505; the headland is at x = -345. */
export function shorelineZ(x) { return 46 + 6 * Math.sin(x / 70) + 25 * bump(x, -345, 60) - 34 * bump(x, -505, 85); }
function lowland(x, z) {             // beach and sea bed
  let h = Math.max(-8, Math.min(3.2, (shorelineZ(x) - z) * 0.045));
  if (h > 0.5) h += 1.2 * (0.5 + 0.5 * fbm(x / 24, z / 24, 3)) * sstep(0.5, 2.6, h);   // dunes at the back of the beach
  return h;
}
function plateau(x, z) { return 57 + 7 * fbm(x / 170, z / 170, 3) + 1.5 * fbm(x / 37, z / 37, 2) + 34 * sstep(-480, -700, z); }
function natural(x, z) {
  const L = lowland(x, z);
  const cliffZ = -55 + 5 * Math.sin(x / 37) + 60 * bump(x, -345, 45);                    // foot of the cliff
  const run = 30 + 300 * sstep(170, 300, x) + 240 * sstep(-330, -430, x);                // sheer in the middle, long slopes at both ends
  return L + (plateau(x, z) - L) * sstep(cliffZ, cliffZ - run, z);
}

// ---------- trail centreline
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
function smoothPeriodic(a, sigma) {
  const k = Math.ceil(sigma * 3), n = a.length, w = [], out = new Array(n); let tot = 0;
  for (let j = -k; j <= k; j++) { const v = Math.exp(-j * j / (2 * sigma * sigma)); w.push(v); tot += v; }
  for (let i = 0; i < n; i++) { let s = 0; for (let j = -k; j <= k; j++) s += a[(i + j + n * 8) % n] * w[j + k]; out[i] = s / tot; }
  return out;
}

function buildTrack() {
  const { pts, us } = catmullClosed(CONTROL_POINTS, 48), m = pts.length, cum = [0];
  for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % m]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
  const N = Math.round(cum[m] / SAMPLE_STEP);
  let rx = [], rz = [], ry = [], rw = [], ru = [];
  for (let i = 0, j = 0; i < N; i++) {
    const s = i * cum[m] / N; while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), a = pts[j], b = pts[(j + 1) % m];
    rx.push(a[0] + (b[0] - a[0]) * t); rz.push(a[1] + (b[1] - a[1]) * t); ry.push(a[2] + (b[2] - a[2]) * t); rw.push(a[3] + (b[3] - a[3]) * t); ru.push(us[j] + t / 48);
  }
  ry = smoothPeriodic(ry, 7); rw = smoothPeriodic(rw, 5);
  let i0 = 0; for (let i = 0; i < N; i++) if (Math.abs(ru[i] - 1) < Math.abs(ru[i0] - 1)) i0 = i;     // start line on the beach
  const rot = a => a.slice(i0).concat(a.slice(0, i0));
  const X = rot(rx), Y = rot(ry), Z = rot(rz), W = rot(rw), U = rot(ru);

  const S = [0], TX = [], TZ = [], NX = [], NZ = [], GRADE = [], SEC = [], KAPPA = [];
  for (let i = 0; i < N; i++) {
    const k = (i + 1) % N, a = (i - 1 + N) % N;
    if (i > 0) S.push(S[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1], Z[i] - Z[i - 1]));
    const dx = X[k] - X[a], dz = Z[k] - Z[a], d = Math.hypot(dx, dz);
    TX.push(dx / d); TZ.push(dz / d); NX.push(-dz / d); NZ.push(dx / d); GRADE.push((Y[k] - Y[a]) / d);
    SEC.push(CONTROL_POINTS[Math.floor(U[i]) % CONTROL_POINTS.length][4]);
  }
  const LENGTH = S[N - 1] + Math.hypot(X[0] - X[N - 1], Y[0] - Y[N - 1], Z[0] - Z[N - 1]);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, k = (i + 1) % N; let dth = Math.atan2(TZ[k], TX[k]) - Math.atan2(TZ[a], TX[a]);
    while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    KAPPA.push(dth / Math.hypot(X[k] - X[a], Z[k] - Z[a]));
  }

  // per-side behaviour: index 0 = +normal side ("left"), 1 = -normal side ("right")
  const sh = [[], []], bankRaw = [[], []], dropRaw = [[], []], BOARD = [];
  for (let i = 0; i < N; i++) {
    const cfg = SIDE[SEC[i]], exposed = !!CONTROL_POINTS[Math.floor(U[i]) % CONTROL_POINTS.length][5];
    const seaward = NZ[i] > 0 ? 0 : 1;                           // which side faces the sea (+Z)
    for (let sd = 0; sd < 2; sd++) {
      const drop = exposed && sd === seaward;
      sh[sd].push(drop ? 0 : cfg.shoulder); bankRaw[sd].push(drop ? 0 : cfg.bank); dropRaw[sd].push(drop ? 1 : 0);
    }
    const uu = U[i]; BOARD.push(uu >= BOARDWALK_U[0] && uu <= BOARDWALK_U[1]);
  }
  const SH = [smoothPeriodic(sh[0], 4), smoothPeriodic(sh[1], 4)], BANK = [smoothPeriodic(bankRaw[0], 5), smoothPeriodic(bankRaw[1], 5)], DROPW = [smoothPeriodic(dropRaw[0], 5), smoothPeriodic(dropRaw[1], 5)];
  for (let i = 0; i < N; i++) for (let sd = 0; sd < 2; sd++) if (dropRaw[sd][i]) SH[sd][i] = 0;      // an exposed edge has no shoulder at all

  const wrapIndex = i => ((i % N) + N) % N, yawAt = i => Math.atan2(TX[i], TZ[i]);
  const indexAtS = s => wrapIndex(Math.round((((s % LENGTH) + LENGTH) % LENGTH) / LENGTH * N));

  // the ravines: each starts and ends on a trail sample, so the trail surface can stop exactly there
  const chasms = CHASMS.map((c, index) => {
    const firstIndex = indexAtS(c.s - RAVINE_HALF), lastIndex = indexAtS(c.s + RAVINE_HALF);
    return { index, s: c.s, gap: c.gap, gapStart: c.s - c.gap / 2, gapEnd: c.s + c.gap / 2, firstIndex, lastIndex,
      ravineStart: S[firstIndex], ravineEnd: S[lastIndex], depth: RAVINE_DEPTH };
  });
  const chasmAt = s => { for (const c of chasms) if (s >= c.ravineStart && s <= c.ravineEnd) return c; return null; };

  // coarse buckets so terrain lookups only test nearby trail samples
  const CELL = 50, REACH = 95, buckets = new Map();
  for (let i = 0; i < N; i++) {
    const cx0 = Math.floor((X[i] - REACH) / CELL), cx1 = Math.floor((X[i] + REACH) / CELL), cz0 = Math.floor((Z[i] - REACH) / CELL), cz1 = Math.floor((Z[i] + REACH) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const key = cx * 100000 + cz; let l = buckets.get(key); if (!l) buckets.set(key, l = []); l.push(i); }
  }

  /** Project (x, z) onto the trail near sample `best`. */
  function project(x, z, best) {
    let out = null;
    for (const a of [wrapIndex(best - 1), best]) {
      const b = (a + 1) % N, ex = X[b] - X[a], ez = Z[b] - Z[a], t = clamp01(((x - X[a]) * ex + (z - Z[a]) * ez) / (ex * ex + ez * ez));
      const px = X[a] + ex * t, pz = Z[a] + ez * t, d = Math.hypot(x - px, z - pz);
      if (!out || d < out.distance) {
        const nx = NX[a] + (NX[b] - NX[a]) * t, nz = NZ[a] + (NZ[b] - NZ[a]) * t;
        out = { a, b, t, px, pz, nx, nz, distance: d, lateral: (x - px) * nx + (z - pz) * nz, trackY: Y[a] + (Y[b] - Y[a]) * t, halfWidth: (W[a] + (W[b] - W[a]) * t) / 2 };
      }
    }
    return out;
  }
  function heightFromProjection(x, z, p) {
    const i = p.t < 0.5 ? p.a : p.b, sd = p.lateral >= 0 ? 0 : 1, a = Math.abs(p.lateral), hw = p.halfWidth;
    let H = p.trackY - 0.25; const k = sstep(hw + 1, hw + 24, p.distance);
    H += (natural(x, z) - H) * k;
    const ex = DROPW[sd][i];
    if (ex > 0.01) {                                             // exposed cliff edge: the ground really does fall away
      const e = a - hw - 0.6;
      if (e > 0) { const cut = Math.max(Math.min(H, p.trackY - 0.25 - 48 * sstep(0, 13, e)), lowland(x, z)); H += (cut - H) * ex; }
    }
    const segLen = p.b === 0 ? LENGTH - S[p.a] : S[p.b] - S[p.a], sHere = S[p.a] + segLen * p.t, ravine = chasmAt(sHere);
    // how far into a ravine this point is: 0 at its ends (where the trail stops), 1 across its floor
    const cut = ravine ? sstep(0, 4.5, Math.min(sHere - ravine.ravineStart, ravine.ravineEnd - sHere)) : 0;
    const bk = BANK[sd][i] * (1 - cut);
    if (bk > 0.01) H += 1.3 * bk * Math.exp(-(((a - hw - SH[sd][i] - 1.6) / 1.3) ** 2));     // grassy bank = the visible natural boundary
    if (cut > 0) {
      // across the trail and well out to either side; on an exposed edge it is cut right through to the cliff face
      const reach = ex > 0.01 ? 1 : sstep(hw + 34, hw + 12, a);
      H = Math.max(H - ravine.depth * cut * reach, Math.min(H, lowland(x, z)));
    }
    return Math.max(-8, H);
  }
  /** Height of the landscape (trail cut included) at any point. Used to build the terrain mesh and for dogs off the trail. */
  function terrainHeight(x, z) {
    const list = buckets.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL));
    if (!list) return Math.max(-8, natural(x, z));
    let best = -1, bd = Infinity;
    for (let k = 0; k < list.length; k++) { const i = list[k], d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    return heightFromProjection(x, z, project(x, z, best));
  }

  /**
   * Everything gameplay needs to know about a position. Never assumes the dog is on the centreline.
   * hint = `index` from this dog's previous query (-1 = search the whole lap).
   */
  function query(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    if (hint >= 0) for (let k = -30; k <= 30; k++) { const i = wrapIndex(hint + k), d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best < 0) for (let i = 0; i < N; i++) { const d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    const p = project(x, z, best), i = p.t < 0.5 ? p.a : p.b, sd = p.lateral >= 0 ? 0 : 1, a = Math.abs(p.lateral), hw = p.halfWidth;
    const segLen = p.b === 0 ? LENGTH - S[p.a] : S[p.b] - S[p.a], limit = hw + SH[sd][i];
    const q = {
      index: i, s: (S[p.a] + segLen * p.t) % LENGTH, lateral: p.lateral, halfWidth: hw, distance: p.distance, trackY: p.trackY,
      grade: GRADE[p.a], curvature: KAPPA[p.a], rotationY: yawAt(p.a), section: SEC[p.a],
      exposedEdge: dropRaw[sd][i] === 1, onBoardwalk: BOARD[i] && a <= hw + EDGE_TOLERANCE,
      surface: 'trail', fall: false, blocked: false, clampX: x, clampZ: z, y: p.trackY,
    };
    const ravine = chasmAt(q.s);
    if (ravine) {
      // a bridge over a ravine: railed, so the dog cannot leave by the side; the planks are missing in the middle
      q.surface = 'bridge'; q.onBridge = true; q.exposedEdge = false;
      const rail = hw - 0.25;
      if (a > rail) { const sgn = sd === 0 ? 1 : -1; q.blocked = true; q.clampX = p.px + p.nx * sgn * rail; q.clampZ = p.pz + p.nz * sgn * rail; }
      q.gap = q.s > ravine.gapStart + GAP_LIP && q.s < ravine.gapEnd - GAP_LIP;      // nothing under it here: see rules.gapClearance
      q.chasm = ravine.index;
    } else if (a > hw + EDGE_TOLERANCE) {
      if (dropRaw[sd][i] === 1) { q.fall = true; q.surface = 'air'; q.y = terrainHeight(x, z); }
      else if (a > limit) {                                      // natural boundary (bank, rocks, dunes): slide along it
        q.blocked = true; q.surface = 'shoulder';
        const s = sd === 0 ? 1 : -1; q.clampX = p.px + p.nx * s * limit; q.clampZ = p.pz + p.nz * s * limit; q.y = terrainHeight(q.clampX, q.clampZ);
      } else { q.surface = 'shoulder'; q.y = heightFromProjection(x, z, p); }
    }
    q.onTrack = !q.fall;                                         // "supported" — what the race rules look at
    q.waterDepth = Math.max(0, SEA_LEVEL - q.y);
    q.inWater = q.waterDepth > 0.05;
    q.movement = q.waterDepth > 0.5 ? 'swim' : q.inWater ? 'wade' : 'run';
    q.dogY = q.movement === 'swim' ? SEA_LEVEL - 0.42 : q.y;     // where to draw the dog (it floats when swimming)
    return q;
  }

  function pointAt(s, lateral = 0) {
    s = ((s % LENGTH) + LENGTH) % LENGTH;
    const f = s / LENGTH * N, i = Math.floor(f) % N, k = (i + 1) % N, t = f - Math.floor(f);
    const nx = NX[i] + (NX[k] - NX[i]) * t, nz = NZ[i] + (NZ[k] - NZ[i]) * t;
    return { x: X[i] + (X[k] - X[i]) * t + nx * lateral, y: Y[i] + (Y[k] - Y[i]) * t, z: Z[i] + (Z[k] - Z[i]) * t + nz * lateral,
      rotationY: Math.atan2(TX[i] + (TX[k] - TX[i]) * t, TZ[i] + (TZ[k] - TZ[i]) * t), index: i, halfWidth: (W[i] + (W[k] - W[i]) * t) / 2, section: SEC[i] };
  }

  /**
   * Passive stat effects, as one speed multiplier. stats are 0..1 (0.5 = average dog).
   *   stamina  — keeps speed on climbs (not a resource; there is no bar and nothing runs out)
   *   swimming — keeps speed in water
   */
  function speedFactor(q, stats = {}) {
    const stamina = stats.stamina ?? 0.5, swimming = stats.swimming ?? 0.5; let f = 1;
    if (q.grade > 0) f *= 1 - Math.min(0.5, q.grade * 2.4 * (1.5 - stamina));        // 10 % climb: -24 % average, -12 % for a top climber
    else f *= 1 + Math.min(0.08, -q.grade * 0.8);                                     // small natural boost downhill
    if (q.inWater) f *= 1 - clamp01(q.waterDepth / 0.6) * (0.5 - 0.3 * swimming);     // deep wade/swim: -35 % average, -20 % for a strong swimmer
    if (q.surface === 'shoulder') f *= 0.72;                                          // soft sand / long grass off the trail
    return f;
  }

  const cpCount = Math.round(LENGTH / CHECKPOINT_SPACING), checkpoints = [];
  for (let c = 0; c < cpCount; c++) { const i = wrapIndex(Math.round(c * N / cpCount)); checkpoints.push({ index: c, sampleIndex: i, s: S[i], position: [X[i], Y[i], Z[i]], rotationY: yawAt(i), halfWidth: W[i] / 2, section: SEC[i] }); }
  const gi = wrapIndex(N - 4), spacing = Math.min(2.6, (W[gi] - 3) / 4), startPositions = [];
  for (let k = 0; k < 5; k++) { const lat = (2 - k) * spacing; startPositions.push({ slot: k, position: [X[gi] + NX[gi] * lat, Y[gi], Z[gi] + NZ[gi] * lat], rotationY: yawAt(gi), s: S[gi] - LENGTH, lateral: lat }); }
  // (the sixth dog: a row back, in the middle)
  { const g6 = wrapIndex(N - 6); startPositions.push({ slot: 5, position: [X[g6], Y[g6], Z[g6]], rotationY: yawAt(g6), s: S[g6] - LENGTH, lateral: 0 }); }
  const sections = [];
  for (let i = 0, st = 0; i <= N; i++) if (i === N || SEC[i] !== SEC[st]) { sections.push({ id: SEC[st], ...SECTIONS[SEC[st]], sStart: S[st], sEnd: i === N ? LENGTH : S[i], firstIndex: st, lastIndex: i - 1 }); st = i; }
  const wet = []; for (let i = 0; i < N; i++) if (Y[i] < SEA_LEVEL - 0.05) wet.push(i);
  const exposedIdx = []; for (let i = 0; i < N; i++) if (dropRaw[0][i] || dropRaw[1][i]) exposedIdx.push(i);
  const boardIdx = []; for (let i = 0; i < N; i++) if (BOARD[i]) boardIdx.push(i);

  return {
    id: MODBURY_ID, name: 'Modbury Heights', laps: 3, maxDogs: 5, difficulty: 'medium', seaLevel: SEA_LEVEL,
    length: LENGTH, sampleCount: N, sampleSpacing: LENGTH / N, minY: Math.min(...Y), maxY: Math.max(...Y),
    samples: { x: X, y: Y, z: Z, width: W, s: S, tangentX: TX, tangentZ: TZ, normalX: NX, normalZ: NZ, grade: GRADE, curvature: KAPPA, section: SEC,
      shoulder: SH, bank: BANK, exposed: dropRaw, boardwalk: BOARD },
    sections, checkpoints, startPositions,
    startFinish: { position: [X[0], Y[0], Z[0]], rotationY: yawAt(0), halfWidth: W[0] / 2 },
    waterCrossing: { firstIndex: wet[0], lastIndex: wet[wet.length - 1], sStart: S[wet[0]], sEnd: S[wet[wet.length - 1]], maxDepth: SEA_LEVEL - Math.min(...wet.map(i => Y[i])) },
    exposedEdge: { firstIndex: exposedIdx[0], lastIndex: exposedIdx[exposedIdx.length - 1], sStart: S[exposedIdx[0]], sEnd: S[exposedIdx[exposedIdx.length - 1]] },
    // the ravines with their broken bridges: [{ s, gap, gapStart, gapEnd, ravineStart, ravineEnd, firstIndex, lastIndex, depth }]
    chasms,
    boardwalk: { firstIndex: boardIdx[0], lastIndex: boardIdx[boardIdx.length - 1] },
    // gapClearance: over a bridge's missing middle (query().gap) a dog lower than this above the deck falls;
    // a dog in mid-jump is higher and carries over
    rules: { hasBarriers: false, fallStartsBelow: 1.5, respawnDelaySeconds: 1.0, respawnPenaltySeconds: 1.5, respawnSpeedMultiplier: 0.55, gravity: 24, killPlaneY: -60,
      gapClearance: 0.2 },
    query, pointAt, indexAtS, terrainHeight, naturalHeight: (x, z) => Math.max(-8, natural(x, z)), speedFactor, shorelineZ,
  };
}

export const MODBURY_HEIGHTS = buildTrack();
export default MODBURY_HEIGHTS;
