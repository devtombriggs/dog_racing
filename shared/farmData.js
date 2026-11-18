// Muddy Paws Farm — shared track definition, rules and moving hazards.
//
// Pure JavaScript, no dependencies beyond the noise function: import this SAME file in the React
// client and the Socket.IO server.  It has the same interface as modburyData.js (query, pointAt,
// checkpoints, rules...), so the procedural-track race rules work on it unchanged.
//
// Coordinates: Three.js world space, Y up, metres.  The lap runs east along the farmyard on the
// south side (+Z), north up the east side, west along the top and south down the west side, so the
// outside of the lap is always on the dog's left (+lateral).  The trail is a closed uniform Catmull-Rom spline through CONTROL_POINTS.
//
// Round the lap:
//   A  The Farmyard      start/finish in front of the farmhouse
//   B  The Big Red Barn  straight through it, doors open at both ends: walls either side
//   C  Hay Bale Alley    round bales standing in the road to weave through
//   D  The Orchard       a flock of sheep ambles across the road and back
//   E  Windmill Corner   the sails sweep low over the inside of the bend: cut the corner at your peril
//   F  Tractor Lane      a tractor and trailer drive across the road and back
//   G  The Pig Pen       mud wallows (slow) with pigs trotting round them
//   H  The Maize Maze    a narrow path between walls of corn, a scarecrow standing in the middle of it
//   I  Bale Hill         round bales come rolling down the hill and across the road
//   J  The Duck Pond     a plank bridge with its middle missing: jump it or go for a swim
//
// Everything that moves is a pure function of the time since GO (hazardsAt), so the server (which
// decides who is hit) and every player's game (which draws them) agree without sending positions.
import { fbm } from './modburyData.js';

export const FARM_ID = 'farmyard';
const SAMPLE_STEP = 2, CHECKPOINT_SPACING = 100;
const START_U = 0.45;                   // where on the spline the start line is (between the first two control points)

// [x, z, height, width, section]
const CONTROL_POINTS = [
  [-90, 160, 0, 15, 'A'], [-20, 160, 0, 15, 'A'], [50, 160, 0, 15, 'A'],
  [120, 158, 0, 10, 'B'], [185, 145, 0, 12, 'B'],
  [240, 105, 0, 13, 'C'], [262, 30, 0.5, 13, 'C'],
  [245, -50, 1, 13, 'D'], [262, -125, 1.5, 13, 'D'],
  [230, -195, 2, 14, 'E'],
  [160, -240, 2, 13, 'F'], [80, -232, 1.5, 13, 'F'],
  [0, -250, 1, 16, 'G'], [-80, -238, 1, 16, 'G'],
  [-150, -225, 1.5, 8.5, 'H'], [-200, -170, 2, 8.5, 'H'], [-170, -110, 2.5, 12, 'H'], [-215, -55, 3, 8.5, 'H'], [-250, 0, 4, 9, 'H'],
  [-282, 65, 6, 13, 'I'], [-262, 125, 3, 13, 'I'],
  [-225, 160, 0.5, 9, 'J'], [-160, 162, 0, 10, 'J'],
];

export const SECTIONS = {
  A: { name: 'The Farmyard', surface: 'cobbles' },
  B: { name: 'The Big Red Barn', surface: 'straw' },
  C: { name: 'Hay Bale Alley', surface: 'dirt' },
  D: { name: 'The Orchard', surface: 'dirt' },
  E: { name: 'Windmill Corner', surface: 'dirt' },
  F: { name: 'Tractor Lane', surface: 'dirt' },
  G: { name: 'The Pig Pen', surface: 'mud' },
  H: { name: 'The Maize Maze', surface: 'dirt' },
  I: { name: 'Bale Hill', surface: 'grass' },
  J: { name: 'The Duck Pond', surface: 'planks' },
};
// how far a dog may stray past the edge of the road before the fence (or the corn) stops it
const VERGE = { A: 3.5, B: 2.5, C: 2.5, D: 2.5, E: 2.5, F: 2.5, G: 2, H: 0.3, I: 3, J: 2 };
const DOG = 0.7;                        // a dog is kept this far from the middle of anything solid, plus its radius

const BARN = { u: 3.0, half: 17, inside: 4.5 };                 // walls this far either side of the middle
const POND = { u: 21.5, gap: 6.5, half: 13, depth: 3.4, radius: 12.5 };
const GAP_LIP = 0.8;
const MUD_SPEED = 0.6, VERGE_SPEED = 0.78;

const clamp01 = t => Math.min(1, Math.max(0, t));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

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
  for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % m]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const N = Math.round(cum[m] / SAMPLE_STEP);
  let rx = [], rz = [], ry = [], rw = [], ru = [];
  for (let i = 0, j = 0; i < N; i++) {
    const s = i * cum[m] / N; while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), a = pts[j], b = pts[(j + 1) % m];
    rx.push(a[0] + (b[0] - a[0]) * t); rz.push(a[1] + (b[1] - a[1]) * t); ry.push(a[2] + (b[2] - a[2]) * t); rw.push(a[3] + (b[3] - a[3]) * t); ru.push(us[j] + t / 48);
  }
  ry = smoothPeriodic(ry, 8); rw = smoothPeriodic(rw, 4);
  let i0 = 0; for (let i = 0; i < N; i++) if (Math.abs(ru[i] - START_U) < Math.abs(ru[i0] - START_U)) i0 = i;
  const rot = a => a.slice(i0).concat(a.slice(0, i0));
  const X = rot(rx), Y = rot(ry), Z = rot(rz), W = rot(rw), U = rot(ru);

  const S = [0], TX = [], TZ = [], NX = [], NZ = [], GRADE = [], SEC = [], KAPPA = [];
  for (let i = 0; i < N; i++) {
    const k = (i + 1) % N, a = (i - 1 + N) % N;
    if (i > 0) S.push(S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]));
    const dx = X[k] - X[a], dz = Z[k] - Z[a], d = Math.hypot(dx, dz);
    TX.push(dx / d); TZ.push(dz / d); NX.push(-dz / d); NZ.push(dx / d); GRADE.push((Y[k] - Y[a]) / d);
    SEC.push(CONTROL_POINTS[Math.floor(U[i]) % CONTROL_POINTS.length][4]);
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

  function pointAt(s, lateral = 0) {
    s = wrapS(s);
    const f = s / LENGTH * N, i = Math.floor(f) % N, k = (i + 1) % N, t = f - Math.floor(f);
    const nx = NX[i] + (NX[k] - NX[i]) * t, nz = NZ[i] + (NZ[k] - NZ[i]) * t;
    return { x: X[i] + (X[k] - X[i]) * t + nx * lateral, y: Y[i] + (Y[k] - Y[i]) * t, z: Z[i] + (Z[k] - Z[i]) * t + nz * lateral,
      rotationY: Math.atan2(TX[i] + (TX[k] - TX[i]) * t, TZ[i] + (TZ[k] - TZ[i]) * t), index: i, halfWidth: (W[i] + (W[k] - W[i]) * t) / 2, section: SEC[i],
      nx, nz };
  }

  // ---------- the fixed features, placed by distance round the lap
  const barnS = sAtU(BARN.u);
  const barn = { s: barnS, start: barnS - BARN.half, end: barnS + BARN.half, inside: BARN.inside, ...pointAt(barnS) };
  const pondS = sAtU(POND.u), pondFirst = indexAtS(pondS - POND.half), pondLast = indexAtS(pondS + POND.half);
  // the pond's broken bridge, described the way Modbury's ravines are so the same code draws the map marks
  const chasms = [{ index: 0, s: pondS, gap: POND.gap, gapStart: pondS - POND.gap / 2, gapEnd: pondS + POND.gap / 2,
    firstIndex: pondFirst, lastIndex: pondLast, ravineStart: S[pondFirst], ravineEnd: S[pondLast], depth: POND.depth }];
  const pond = { ...pointAt(pondS), s: pondS, radius: POND.radius, depth: POND.depth, waterDrop: 0.9 };
  const onBridge = s => along(s, chasms[0].ravineStart) >= 0 && along(s, chasms[0].ravineEnd) <= 0;

  // things standing in the road: round hay bales to weave through, and the scarecrow in the maize
  const obstacles = [];
  const baleS = sAtU(4.2);
  for (let k = 0; k < 6; k++) {
    const p = pointAt(baleS + k * 12.5), lateral = (k % 2 ? 1 : -1) * p.halfWidth * 0.42, q = pointAt(baleS + k * 12.5, lateral);
    obstacles.push({ id: `bale-${k}`, kind: 'bale', s: baleS + k * 12.5, lateral, x: q.x, y: q.y, z: q.z, radius: 1.3, rotationY: p.rotationY + k * 0.7 });
  }
  { const s = sAtU(16.0), p = pointAt(s); obstacles.push({ id: 'scarecrow', kind: 'scarecrow', s, lateral: 0, x: p.x, y: p.y, z: p.z, radius: 0.8, rotationY: p.rotationY + Math.PI }); }

  // the pig pen's mud wallows: oval patches alternating sides of the road, with a dry line between them
  const mud = [];
  const mudS = sAtU(12.05) + 14;          // (clear of the checkpoint just before it: a dog put back there is not put in with a pig)
  for (let k = 0; k < 5; k++) {
    const s = mudS + k * 17, p = pointAt(s), lateral = (k % 2 ? -1 : 1) * p.halfWidth * 0.45, q = pointAt(s, lateral);
    mud.push({ id: `mud-${k}`, s, lateral, x: q.x, y: q.y, z: q.z, along: 6.5, across: p.halfWidth * 0.5, rotationY: p.rotationY });
  }
  const mudAt = (s, lateral) => mud.some(patch => ((along(s, patch.s) / patch.along) ** 2 + ((lateral - patch.lateral) / patch.across) ** 2) < 1);

  // ---------- the landscape
  const hillAt = (x, z) => 13 * Math.exp(-((((x + 352) / 85) ** 2) + (((z - 70) / 110) ** 2)));
  const natural = (x, z) => 1.2 * fbm(x / 90, z / 90, 3) + 0.4 * fbm(x / 25 + 7, z / 25, 2) + hillAt(x, z);

  const CELL = 40, REACH = 60, buckets = new Map();
  for (let i = 0; i < N; i++) {
    const cx0 = Math.floor((X[i] - REACH) / CELL), cx1 = Math.floor((X[i] + REACH) / CELL), cz0 = Math.floor((Z[i] - REACH) / CELL), cz1 = Math.floor((Z[i] + REACH) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const key = cx * 100000 + cz; let l = buckets.get(key); if (!l) buckets.set(key, l = []); l.push(i); }
  }
  function nearestSample(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    if (hint >= 0) for (let k = -30; k <= 30; k++) { const i = wrapIndex(hint + k), d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best >= 0 && bd < 30 * 30) return best;
    const list = buckets.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL));
    if (list) { best = -1; bd = Infinity; for (let k = 0; k < list.length; k++) { const i = list[k], d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
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
  /** Height of the ground (road cut in, pond dug out) at any point: for the terrain mesh and the scenery. */
  function terrainHeight(x, z) {
    const far = !buckets.has(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL));
    let H = natural(x, z);
    if (!far) {
      const p = project(x, z, nearestSample(x, z));
      H += (p.trackY - 0.12 - H) * sstep(p.halfWidth + 26, p.halfWidth + 1.5, p.distance);
    }
    const d = Math.hypot(x - pond.x, z - pond.z);
    return H - pond.depth * sstep(pond.radius + 0.5, pond.radius - 6, d);
  }

  /** Everything gameplay needs to know about a position.  hint = `index` from this dog's last query (-1: search). */
  function query(x, z, hint = -1) {
    const p = project(x, z, nearestSample(x, z, hint)), i = p.t < 0.5 ? p.a : p.b, a = Math.abs(p.lateral), hw = p.halfWidth, sec = SEC[p.a];
    const q = {
      index: i, s: p.s, lateral: p.lateral, halfWidth: hw, distance: p.distance, trackY: p.trackY,
      grade: GRADE[p.a], curvature: KAPPA[p.a], rotationY: yawAt(p.a), section: sec,
      surface: 'trail', fall: false, onTrack: true, blocked: false, clampX: x, clampZ: z, y: p.trackY,
      gap: false, onBridge: false, inBarn: false, mud: false, waterDepth: 0, inWater: false, movement: 'run',
    };
    // the sides: a fence beyond the verge; the barn's walls; the bridge's rails
    let limit = hw + VERGE[sec];
    if (along(p.s, barn.start) >= 0 && along(p.s, barn.end) <= 0) { q.inBarn = true; limit = barn.inside; }
    if (onBridge(p.s)) {
      q.onBridge = true; q.surface = 'bridge'; limit = hw - 0.25;
      q.gap = along(p.s, chasms[0].gapStart) > GAP_LIP && along(p.s, chasms[0].gapEnd) < -GAP_LIP;
      q.chasm = 0;
    }
    let px = x, pz = z;
    if (a > limit) {
      const sgn = p.lateral >= 0 ? 1 : -1;
      q.blocked = true; px = p.px + p.nx * sgn * limit; pz = p.pz + p.nz * sgn * limit;
    } else if (a > hw + 0.25 && !q.onBridge && !q.inBarn) q.surface = 'verge';
    // things standing in the road push the dog out to their edge
    for (const o of obstacles) {
      const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz), keep = o.radius + DOG;
      if (d < keep) {
        q.blocked = true;
        const ux = d > 1e-6 ? dx / d : p.nx, uz = d > 1e-6 ? dz / d : p.nz;
        px = o.x + ux * keep; pz = o.z + uz * keep;
      }
    }
    q.clampX = px; q.clampZ = pz;
    if (!q.blocked && !q.onBridge && mudAt(p.s, p.lateral)) { q.mud = true; q.surface = 'mud'; }
    q.dogY = q.y;
    return q;
  }

  /** One speed multiplier for where the dog is.  stats are 0..1 (0.5 = an average dog). */
  function speedFactor(q, stats = {}) {
    const stamina = stats.stamina ?? 0.5; let f = 1;
    if (q.grade > 0) f *= 1 - Math.min(0.3, q.grade * 1.8 * (1.5 - stamina));
    else f *= 1 + Math.min(0.06, -q.grade * 0.7);
    if (q.mud) f *= MUD_SPEED;
    if (q.surface === 'verge') f *= VERGE_SPEED;
    return f;
  }

  // ---------- everything that moves, as a function of the seconds since GO
  // Each hazard: { id, kind, x, y, z, rotationY, radius, height, active }.  A dog whose middle comes
  // within radius (plus its own) of an active one is knocked over, unless it is more than `height`
  // above it (a jump clears the pigs and the sheep; nothing clears a tractor or a rolling bale).
  const pingPong = (t, period, pause) => {            // 0 -> 1 -> 0 with a rest at each end; dir: +1 going out, -1 coming back
    const ph = ((t % period) + period) % period / period, move = 0.5 - pause;
    if (ph < move) return { k: sstep(0, 1, ph / move), dir: 1, turning: 0 };
    if (ph < 0.5) return { k: 1, dir: 1, turning: (ph - move) / pause };
    if (ph < 0.5 + move) return { k: 1 - sstep(0, 1, (ph - 0.5) / move), dir: -1, turning: 0 };
    return { k: 0, dir: -1, turning: (ph - 0.5 - move) / pause };
  };
  const tractorS = sAtU(10.5), sheepS = sAtU(6.55), millS = sAtU(9.0), pigsS = mud.map(patch => patch.s), balesS = sAtU(19.35);
  const TRACTOR = { reach: 24, period: 13, pause: 0.07, trailer: 4.4 };
  const SHEEP = { count: 5, reach: 15, period: 17, pause: 0.06, spacing: 3.4 };
  const MILL = { period: 12, blades: 4, window: 0.36, hubHeight: 8.2, bladeLength: 7.4 };       // window: radians either side of straight down
  const BALES = { count: 3, period: 7.5, from: 26, to: -18, spacing: 15, roll: 5 };              // seconds to cross; then it waits at the top
  const millBase = pointAt(millS), millSide = -1;                                                   // the mill stands on the inside of the bend
  const mill = { s: millS, side: millSide, ...pointAt(millS, millSide * (millBase.halfWidth + 0.6)), hubHeight: MILL.hubHeight, bladeLength: MILL.bladeLength,
    blades: MILL.blades, period: MILL.period, towerLateral: millSide * (millBase.halfWidth + 0.6), axisYaw: millBase.rotationY };
  const millZone = pointAt(millS, millSide * (millBase.halfWidth - 1.7));
  {                                                   // its tower is solid: it stands just behind the sails, at the edge of the road
    const tower = pointAt(millS - 3.4, millSide * (millBase.halfWidth + 2.2));
    mill.tower = { x: tower.x, y: tower.y, z: tower.z, radius: 2.4 };
    obstacles.push({ id: 'mill', kind: 'mill', s: millS - 3.4, lateral: millSide * (millBase.halfWidth + 2.2), x: tower.x, y: tower.y, z: tower.z, radius: 2.4, rotationY: millBase.rotationY });
  }

  function hazardsAt(t) {
    const out = [];
    // the tractor and its trailer, across the road and back
    {
      const m = pingPong(t, TRACTOR.period, TRACTOR.pause), lat = -TRACTOR.reach + 2 * TRACTOR.reach * m.k, c = pointAt(tractorS, lat);
      const yaw = Math.atan2(c.nx, c.nz) + (m.dir > 0 ? 0 : Math.PI) + (m.turning ? Math.PI * sstep(0, 1, m.turning) : 0);
      out.push({ id: 'tractor', kind: 'tractor', x: c.x, y: terrainHeight(c.x, c.z), z: c.z, rotationY: yaw, radius: 2.0, height: 9, active: true });
      const tx = c.x - Math.sin(yaw) * TRACTOR.trailer, tz = c.z - Math.cos(yaw) * TRACTOR.trailer;
      out.push({ id: 'trailer', kind: 'trailer', x: tx, y: terrainHeight(tx, tz), z: tz, rotationY: yaw, radius: 1.8, height: 9, active: true });
    }
    // the sheep, in file across the road and back
    {
      const m = pingPong(t, SHEEP.period, SHEEP.pause);
      for (let k = 0; k < SHEEP.count; k++) {
        const lead = -SHEEP.reach + 2 * SHEEP.reach * m.k, lat = lead - m.dir * k * SHEEP.spacing * (1 - 0.5 * (m.turning || 0)), c = pointAt(sheepS + (k % 2 ? 1.6 : -1.6), lat);
        out.push({ id: `sheep-${k}`, kind: 'sheep', x: c.x, y: terrainHeight(c.x, c.z), z: c.z, rotationY: Math.atan2(c.nx, c.nz) + (m.dir > 0 ? 0 : Math.PI),
          radius: 0.95, height: 1.2, active: true, bob: Math.abs(Math.sin(t * 7 + k)) * 0.12 });
      }
    }
    // the pigs: one trotting round each mud wallow
    pigsS.forEach((s, k) => {
      const patch = mud[k], dir = k % 2 ? -1 : 1, ang = dir * (t * 0.85 + k * 1.9), r = 3.3;
      const fx = Math.sin(patch.rotationY), fz = Math.cos(patch.rotationY), sx = Math.cos(patch.rotationY), sz = -Math.sin(patch.rotationY);
      const ox = Math.cos(ang) * r * 1.25, oz = Math.sin(ang) * r * 0.8;                 // an oval, longer along the road
      const x = patch.x + fx * ox + sx * oz, z = patch.z + fz * ox + sz * oz;
      const vx = -Math.sin(ang) * 1.25 * dir, vz = Math.cos(ang) * 0.8 * dir;
      out.push({ id: `pig-${k}`, kind: 'pig', x, y: patch.y, z, rotationY: Math.atan2(fx * vx + sx * vz, fz * vx + sz * vz), radius: 0.85, height: 1.0, active: true });
    });
    // the windmill's sails: dangerous on the inside of the road whenever one is passing the bottom
    {
      const angle = (t / MILL.period) * Math.PI * 2, step = Math.PI * 2 / MILL.blades;
      let nearest = Infinity;
      for (let b = 0; b < MILL.blades; b++) { const d = Math.abs(Math.atan2(Math.sin(angle + b * step), Math.cos(angle + b * step))); nearest = Math.min(nearest, d); }
      out.push({ id: 'sails', kind: 'sails', x: millZone.x, y: millZone.y, z: millZone.z, rotationY: mill.axisYaw, radius: 2.3, height: 9, active: nearest < MILL.window, angle });
    }
    // the bales rolling down Bale Hill, one after another
    for (let k = 0; k < BALES.count; k++) {
      const ph = (((t + k * BALES.period / BALES.count) % BALES.period) + BALES.period) % BALES.period, rolling = ph < BALES.roll;
      const lat = BALES.from + (BALES.to - BALES.from) * (rolling ? ph / BALES.roll : 0), c = pointAt(balesS + (k - 1) * BALES.spacing, lat);
      out.push({ id: `rolling-${k}`, kind: 'rolling', x: c.x, y: terrainHeight(c.x, c.z) + 1.35, z: c.z, rotationY: c.rotationY + Math.PI / 2, radius: 1.35, height: 9,
        active: rolling, spin: -lat / 1.35, fade: rolling ? Math.min(1, ph * 3, (BALES.roll - ph) * 3) : 0 });
    }
    return out;
  }
  /** Is a dog at position [x, y, z] hit by a hazard?  Returns the hazard, or null. */
  function hazardHit(position, t) {
    for (const h of hazardsAt(t)) {
      if (!h.active || position[1] - h.y > h.height) continue;
      if (Math.hypot(position[0] - h.x, position[2] - h.z) <= h.radius + DOG) return h;
    }
    return null;
  }

  const cpCount = Math.round(LENGTH / CHECKPOINT_SPACING), checkpoints = [];
  for (let c = 0; c < cpCount; c++) { const i = wrapIndex(Math.round(c * N / cpCount)); checkpoints.push({ index: c, sampleIndex: i, s: S[i], position: [X[i], Y[i], Z[i]], rotationY: yawAt(i), halfWidth: W[i] / 2, section: SEC[i] }); }
  const gi = wrapIndex(N - 4), spacing = Math.min(2.6, (W[gi] - 3) / 4), startPositions = [];
  for (let k = 0; k < 5; k++) { const lat = (2 - k) * spacing; startPositions.push({ slot: k, position: [X[gi] + NX[gi] * lat, Y[gi], Z[gi] + NZ[gi] * lat], rotationY: yawAt(gi), s: S[gi] - LENGTH, lateral: lat }); }
  const sections = [];
  for (let i = 0, st = 0; i <= N; i++) if (i === N || SEC[i] !== SEC[st]) { sections.push({ id: SEC[st], ...SECTIONS[SEC[st]], sStart: S[st], sEnd: i === N ? LENGTH : S[i], firstIndex: st, lastIndex: i - 1 }); st = i; }

  return {
    id: FARM_ID, name: 'Muddy Paws Farm', laps: 3, maxDogs: 5, length: LENGTH, sampleCount: N, sampleSpacing: LENGTH / N,
    samples: { x: X, y: Y, z: Z, width: W, s: S, u: U, tangentX: TX, tangentZ: TZ, normalX: NX, normalZ: NZ, grade: GRADE, curvature: KAPPA, section: SEC },
    sections, checkpoints, startPositions,
    startFinish: { position: [X[0], Y[0], Z[0]], rotationY: yawAt(0), halfWidth: W[0] / 2 },
    barn, pond, chasms, obstacles, mud, mill,
    // where each moving hazard lives, for keeping pickups clear of them and for the scenery
    hazardZones: { tractor: tractorS, sheep: sheepS, mill: millS, bales: balesS, pigs: [pigsS[0], pigsS.at(-1)] },
    tractorLane: { s: tractorS, reach: TRACTOR.reach }, sheepLane: { s: sheepS, reach: SHEEP.reach }, baleRun: { s: balesS, from: BALES.from, to: BALES.to, spacing: BALES.spacing },
    verge: VERGE,
    rules: { hasBarriers: true, fallStartsBelow: 1.5, respawnDelaySeconds: 1.0, respawnPenaltySeconds: 1.5, respawnSpeedMultiplier: 0.55, gravity: 24, killPlaneY: -60,
      gapClearance: 0.2, hazardStunMs: 1100 },
    query, pointAt, indexAtS, sAtU, terrainHeight, naturalHeight: natural, speedFactor, hazardsAt, hazardHit,
  };
}

export const FARMYARD = buildTrack();
export default FARMYARD;
