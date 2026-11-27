import { swimSpeed } from './dogStats.js';
// Water Park — shared track definition, rules and moving hazards.
//
// Pure JavaScript, no dependencies: import this SAME file in the React client and the Socket.IO
// server.  It has the same interface as farmData.js and treatRoadData.js (query, pointAt, checkpoints,
// rules, launch, hazardsAt...), so the procedural-track race rules work on it unchanged.
//
// Coordinates: Three.js world space, Y up, metres.  The pool deck is at y = 2.  The trail is a closed
// uniform Catmull-Rom spline through CONTROL_POINTS.
//
// Round the lap:
//   A  Poolside Plaza        start/finish on the tiles
//   B  Ring Lagoon           deep water with a line of rubber rings across it: swim it (Poppy flies
//                            through) or bounce from ring to ring at full pace
//   C  Beach Ball Boulevard  giant beach balls roll across the road and back
//   D  Fountain Square       jets shoot up out of the ground in turn: pick the ones that are off
//   E  The Lazy River        a river that flows the way the race goes: a swim for everyone, a dash for Poppy
//   F  Slide Tower           the long climb to the top of the slide
//   G  The Big Slide         a flume all the way down, far faster than running, off the lip at the bottom...
//   H  Splash Landing        ...over the splash pool, on to the dock, and home
//
// Everything that moves is a pure function of the time since GO (hazardsAt), so the server (which
// decides who is hit) and every player's game (which draws them) agree without sending positions.

export const WATER_PARK_ID = 'water_park';
const SAMPLE_STEP = 2, CHECKPOINT_SPACING = 100;
const START_U = 0.5;                    // where on the spline the start line is (between the first two control points)
const DECK = 2;                         // height of the pool deck

// [x, z, height, width, section, name?]: a name marks a point the features below are placed by.  Tom, 2026-11-21: "more turns
// yet again, the rings you jump on should move and be like a lazy river, if you fall off them you shouldn't be able to bounce
// back on, you need to swim".  So bends all the way round, and the rings drift down the lagoon (RING below)
const ROUTE = [
  [-110, 160, DECK, 16, 'A'], [-30, 160, DECK, 16, 'A'], [50, 160, DECK, 16, 'A'],
  // the lagoon: a lazy S of water
  [124, 172, DECK, 18, 'B', 'lagoon'], [184, 146, DECK, 18, 'B'], [244, 164, DECK, 18, 'B'], [292, 124, DECK, 18, 'B'],
  // the boulevard: a chicane for the beach balls
  [304, 62, DECK, 15, 'C', 'balls'], [282, 6, DECK, 15, 'C'], [306, -46, DECK, 15, 'C'],
  // the fountain square: one long sweep
  [284, -104, DECK, 16, 'D', 'jets'], [244, -160, DECK, 16, 'D'],
  // the lazy river: S-bends with the flow
  [184, -204, DECK, 13, 'E', 'river'], [124, -184, DECK, 13, 'E'], [64, -222, DECK, 13, 'E'], [2, -202, DECK, 13, 'E', 'riverEnd'],
  [-56, -230, 5, 11, 'F'], [-130, -202, 14, 11, 'F'], [-204, -236, 24, 11, 'F'], [-264, -168, 32, 11, 'F'],
  [-282, -98, 34, 9, 'G', 'slide'], [-240, -40, 27, 9, 'G'], [-286, 20, 19, 9, 'G'], [-246, 80, 12, 9, 'G', 'slideEnd'],
  [-190, 158, DECK, 14, 'H'],
];
const AT = Object.fromEntries(ROUTE.map((p, k) => [p[5], k]).filter(([name]) => name));
const CONTROL_POINTS = ROUTE.map(([x, z, height, width, section]) => [x, z, height, width, section]);

export const SECTIONS = {
  A: { name: 'Poolside Plaza', surface: 'tiles' },
  B: { name: 'Ring Lagoon', surface: 'water' },
  C: { name: 'Beach Ball Boulevard', surface: 'tiles' },
  D: { name: 'Fountain Square', surface: 'tiles' },
  E: { name: 'The Lazy River', surface: 'water' },
  F: { name: 'Slide Tower', surface: 'boards' },
  G: { name: 'The Big Slide', surface: 'slide' },
  H: { name: 'Splash Landing', surface: 'boards' },
};

const DOG = 0.7;                        // a dog is kept this far inside a wall or a railing
const WATER_BELOW_DECK = 0.35;          // the water lies this far below the deck
const POOL_DEPTH = 1.7;                 // ...and is this deep in the middle
const POOL_RAMP = 7;                    // metres of slope into and out of each pool
const SWIM_DRAFT = 0.42;                // a swimming dog rides this far below the surface
// Share of top speed a dog keeps swimming, from its swim stat (0.4 = a 4, 1 = a 10): Poppy is not slowed
// at all, and never quicker than on land; the weak swimmers crawl.   10 -> 1   6 -> 0.57   5 -> 0.49   4 -> 0.45
const swimShare = swimming => swimSpeed(swimming * 10);      // (stats here are 0 to 1: shared/dogStats.js swimSpeed)
const RIVER_FLOW = 0.15;                // the Lazy River carries every dog along by this much of its top speed
const SLIDE_SPEED = 1.45;               // share of top speed on the slide
// The rings drift down the lagoon like a lazy river, `flow` m/s, swaying `sway` metres from side to side as they go; at the far end
// each sinks and comes up again at the start.  A dog that falls off can swim to any ring and get back on (Tom, 2026-11-27:
// "finding the rings impossible to jump on... allow you to jump back on them"; from 2026-11-21 until then it could not: only
// from the deck or the shallows at the start)
const RING = { spacing: 13.5, radius: 2.4, zigzag: 1.1, flow: 2.2, sway: 1.5, swayPeriod: 6 };
// A ring throws a dog up at `force` (falling back at `gravity`: 0.8 s in the air, nearly 2 m up) and on at
// `pace` whatever dog it is: exactly the speed that comes down on the next ring, which has drifted on meanwhile
const BOUNCE = { force: 9.5, gravity: 24 };
BOUNCE.pace = RING.spacing / (2 * BOUNCE.force / BOUNCE.gravity) + RING.flow;

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
    rx.push(a[0] + (b[0] - a[0]) * t); rz.push(a[1] + (b[1] - a[1]) * t); ry.push(Math.max(DECK, a[2] + (b[2] - a[2]) * t)); rw.push(a[3] + (b[3] - a[3]) * t); ru.push(us[j] + t / 48);
  }
  ry = smoothPeriodic(ry, 6); rw = smoothPeriodic(rw, 4);
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

  // ---------- the water: Ring Lagoon and the Lazy River
  const pools = [
    // (the lagoon flows too now, like a lazy river, at the rings' pace: a swimmer is carried along as the rings are)
    { id: 'lagoon', name: 'Ring Lagoon', sStart: sAtU(AT.lagoon + 0.05), sEnd: sAtU(AT.balls - 0.55), flow: RING.flow / 17 },
    { id: 'river', name: 'The Lazy River', sStart: sAtU(AT.river + 0.25), sEnd: sAtU(AT.riverEnd - 0.3), flow: RIVER_FLOW },
  ];
  const poolAt = s => pools.find(pool => along(s, pool.sStart) >= 0 && along(s, pool.sEnd) <= 0) ?? null;
  /** how deep the water is at s (0 out of the pools; it shelves in and out at each end) */
  const depthAt = s => { const pool = poolAt(s); return pool ? POOL_DEPTH * sstep(0, POOL_RAMP, along(s, pool.sStart)) * sstep(0, POOL_RAMP, -along(s, pool.sEnd)) : 0; };

  // the rubber rings drifting down the lagoon: land on one and it bounces the dog on to the next.  Where each is depends on the
  // race clock (setClock: the server for each room, the game each frame), so everyone has them in the same places
  let clock = 0;
  const setClock = t => { clock = t; };
  const ringRun = { sStart: pools[0].sStart + 4, count: Math.floor((pools[0].sEnd - 6 - pools[0].sStart - 4) / RING.spacing) };
  ringRun.span = ringRun.count * RING.spacing;
  /** every ring at t seconds: { id, s, lateral, x, y, z, radius, rise } (rise: 0 under the water, 1 floating) */
  function ringsAt(t = clock) {
    const out = [];
    for (let k = 0; k < ringRun.count; k++) {
      const along = ((k * RING.spacing + RING.flow * t) % ringRun.span + ringRun.span) % ringRun.span, s = ringRun.sStart + along;
      const lateral = (k % 2 ? 1 : -1) * RING.zigzag + RING.sway * Math.sin(2 * Math.PI * (t / RING.swayPeriod + k * 0.37)), p = pointAt(s, lateral);
      // (it sinks over the last few metres and comes up again over the first)
      const rise = Math.min(1, along / 3, (ringRun.span - along) / 3);
      out.push({ id: `ring-${k}`, s, lateral, x: p.x, y: p.y - WATER_BELOW_DECK, z: p.z, radius: RING.radius, rise });
    }
    return out;
  }
  const rings = ringsAt(0);
  /** The ring a dog at (x, z) is on at t seconds, or null.  (swimming: whether it is in the water; it gets on all the same) */
  const ringAt = (x, z, swimming = false, t = clock) => ringsAt(t).find(ring => ring.rise > 0.6 && (x - ring.x) ** 2 + (z - ring.z) ** 2 <= ring.radius ** 2) ?? null;

  // ---------- the slide, and the jump off the end of it over the splash pool
  const gapStartIndex = indexAtS(sAtU(AT.slideEnd + 0.12)), gapEndIndex = indexAtS(sAtU(AT.slideEnd + 0.8));
  const launch = {
    gapStart: S[gapStartIndex], gapEnd: S[gapEndIndex],
    padStart: S[gapStartIndex] - 16, takeoffS: S[gapStartIndex] - 4,
    landingS: S[gapEndIndex] + 10, duration: 1.9, arcHeight: 9,
    exitSpeedMultiplier: 1.3, boostSeconds: 1.25
  };
  const isGap = s => s > launch.gapStart && s < launch.gapEnd;
  const isGapSegment = i => i >= gapStartIndex && i < gapEndIndex;
  const slide = { sStart: sAtU(AT.slide) + 8, sEnd: launch.gapStart };
  const onSlide = s => along(s, slide.sStart) >= 0 && along(s, slide.sEnd) <= 0;

  /** The flight off the end of the slide: the same curve for the server and every game. */
  function launchPoint(elapsed, lateral = 0) {
    const t = Math.max(0, Math.min(1, elapsed / launch.duration));
    const a = pointAt(launch.takeoffS, lateral), b = pointAt(launch.landingS, lateral);
    const tangent = Math.hypot(b.x - a.x, b.z - a.z) * 0.55;
    const h0 = 2 * t * t * t - 3 * t * t + 1, h1 = t * t * t - 2 * t * t + t, h2 = -2 * t * t * t + 3 * t * t, h3 = t * t * t - t * t;
    const dh0 = 6 * t * t - 6 * t, dh1 = 3 * t * t - 4 * t + 1, dh2 = -dh0, dh3 = 3 * t * t - 2 * t;
    const ax = Math.sin(a.rotationY) * tangent, az = Math.cos(a.rotationY) * tangent, bx = Math.sin(b.rotationY) * tangent, bz = Math.cos(b.rotationY) * tangent;
    const dx = dh0 * a.x + dh1 * ax + dh2 * b.x + dh3 * bx, dz = dh0 * a.z + dh1 * az + dh2 * b.z + dh3 * bz;
    const dy = b.y - a.y + 4 * launch.arcHeight * (1 - 2 * t);
    return { x: h0 * a.x + h1 * ax + h2 * b.x + h3 * bx, y: a.y + (b.y - a.y) * t + 4 * launch.arcHeight * t * (1 - t), z: h0 * a.z + h1 * az + h2 * b.z + h3 * bz,
      rotationY: Math.atan2(dx, dz), pitch: -Math.atan2(dy, Math.hypot(dx, dz)), speed: Math.hypot(dx, dy, dz) / launch.duration };
  }

  function nearestSample(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    if (hint >= 0) for (let k = -30; k <= 30; k++) { const i = wrapIndex(hint + k), d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best >= 0 && bd < 30 * 30) return best;
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
    const depth = depthAt(p.s), pool = depth > 0 ? poolAt(p.s) : null, waterY = p.trackY - WATER_BELOW_DECK;
    const q = {
      index: i, s: p.s, lateral: p.lateral, halfWidth: hw, distance: p.distance, trackY: p.trackY,
      grade: GRADE[p.a], curvature: KAPPA[p.a], rotationY: yawAt(p.a), section: sec,
      surface: pool ? 'water' : onSlide(p.s) ? 'slide' : 'deck', slide: !pool && onSlide(p.s),
      fall: false, blocked: false, clampX: x, clampZ: z,
      // the bottom of the pool where there is one, the deck everywhere else
      y: pool ? waterY - depth : p.trackY,
      waterDepth: depth, waterY, inWater: depth > 0.05, movement: depth > 0.5 ? 'swim' : depth > 0.05 ? 'wade' : 'run',
      flow: pool?.flow ?? 0,
    };
    // walls and railings all the way round: the only way off is the end of the slide
    const limit = hw - 0.3 - DOG * 0.5;
    if (Math.abs(p.lateral) > limit) {
      const sgn = p.lateral >= 0 ? 1 : -1;
      q.blocked = true; q.clampX = p.px + p.nx * sgn * limit; q.clampZ = p.pz + p.nz * sgn * limit;
    }
    q.onTrack = !isGap(p.s);                                   // "supported": what the race rules look at
    q.dogY = q.movement === 'swim' ? waterY - SWIM_DRAFT : q.y;    // where to draw the dog (it floats when swimming)
    return q;
  }

  /**
   * One speed multiplier for where the dog is.  stats are 0..1 (0.5 = an average dog).  airborne: the
   * dog is off the ground (bouncing from ring to ring): the water does not slow it.
   */
  function speedFactor(q, stats = {}, airborne = false) {
    const stamina = stats.stamina ?? 0.5; let f = 1;
    if (q.slide) return SLIDE_SPEED;
    if (q.grade > 0) f *= 1 - Math.min(0.3, q.grade * 1.8 * (1.5 - stamina));
    else f *= 1 + Math.min(0.06, -q.grade * 0.7);
    if (q.inWater && !airborne) f *= swimShare(stats.swimming ?? 0.5) + q.flow * clamp01(q.waterDepth / 0.6);      // (wading or swimming, the same)
    return f;
  }

  // ---------- everything that moves, as a function of the seconds since GO
  // Each hazard: { id, kind, x, y, z, rotationY, radius, height, active }.  A dog whose middle comes
  // within radius (plus its own) of an active one is knocked over.
  const ballsS = [0, 23, 46].map(d => sAtU(AT.balls + 0.25) + d);
  const BALLS = { period: 6.5, pause: 0.08, radius: 1.7 };
  const jetRows = [0, 1, 2, 3, 4].map(k => sAtU(AT.jets + 0.15) + k * 14);
  const JETS = { period: 3.6, on: 0.4, radius: 1.3, lanes: [-0.62, 0, 0.62] };
  const pingPong = (t, period, pause) => {            // 0 -> 1 -> 0 with a rest at each end
    const ph = ((t % period) + period) % period / period, move = 0.5 - pause;
    if (ph < move) return { k: sstep(0, 1, ph / move), dir: 1 };
    if (ph < 0.5) return { k: 1, dir: 1 };
    if (ph < 0.5 + move) return { k: 1 - sstep(0, 1, (ph - 0.5) / move), dir: -1 };
    return { k: 0, dir: -1 };
  };
  const jets = jetRows.flatMap((s, row) => JETS.lanes.map((lane, j) => {
    const p = pointAt(s, lane * pointAt(s).halfWidth);
    return { id: `jet-${row}-${j}`, row, lane: j, s, x: p.x, y: p.y, z: p.z, radius: JETS.radius, offset: j / 3 + row * 0.19 };
  }));

  function hazardsAt(t) {
    const out = [];
    // the beach balls: across the road and back, one after another
    ballsS.forEach((s, k) => {
      const reach = pointAt(s).halfWidth + 5, m = pingPong(t + k * BALLS.period / 3, BALLS.period, BALLS.pause), lat = -reach + 2 * reach * m.k, c = pointAt(s, lat);
      out.push({ id: `beachball-${k}`, kind: 'beachball', x: c.x, y: c.y + BALLS.radius, z: c.z, rotationY: c.rotationY + Math.PI / 2, radius: BALLS.radius, height: 9, active: true, spin: -lat / BALLS.radius });
    });
    // the fountain jets: each one on for part of its turn, its neighbours out of step with it
    for (const jet of jets) {
      const ph = (((t / JETS.period + jet.offset) % 1) + 1) % 1;
      // (power: 0 off, 1 full height; it is only dangerous once it is well up)
      const power = ph < JETS.on ? Math.min(1, ph / 0.05, (JETS.on - ph) / 0.05) : 0;
      out.push({ id: jet.id, kind: 'jet', x: jet.x, y: jet.y, z: jet.z, rotationY: 0, radius: jet.radius, height: 9, active: power > 0.5, power,
        warning: ph > 1 - 0.12 });                              // about to come on
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

  // ---------- checkpoints, the grid
  const cpCount = Math.round(LENGTH / CHECKPOINT_SPACING), every = [];
  for (let c = 0; c < cpCount; c++) { const i = wrapIndex(Math.round(c * N / cpCount)); every.push({ sampleIndex: i, s: S[i], position: [X[i], Y[i], Z[i]], rotationY: yawAt(i), halfWidth: W[i] / 2, section: SEC[i] }); }
  // None in mid-air or on the run up to the jump; the landing is a gate every dog must come down on.
  const checkpoints = every.filter(cp => cp.s < launch.padStart - 8 || cp.s > launch.landingS + 20);
  for (const [s, launchLanding] of [[launch.padStart - 8, false], [launch.landingS, true]]) {
    const p = pointAt(s);
    checkpoints.push({ s, launchLanding, sampleIndex: p.index, position: [p.x, p.y, p.z], rotationY: p.rotationY, halfWidth: p.halfWidth, section: p.section });
  }
  checkpoints.sort((a, b) => a.s - b.s).forEach((cp, index) => { cp.index = index; });
  const gi = wrapIndex(N - 4), spacing = Math.min(2.6, (W[gi] - 3) / 4), startPositions = [];
  for (let k = 0; k < 5; k++) { const lat = (2 - k) * spacing; startPositions.push({ slot: k, position: [X[gi] + NX[gi] * lat, Y[gi], Z[gi] + NZ[gi] * lat], rotationY: yawAt(gi), s: S[gi] - LENGTH, lateral: lat }); }
  // (the sixth dog: a row back, in the middle)
  { const g6 = wrapIndex(N - 6); startPositions.push({ slot: 5, position: [X[g6], Y[g6], Z[g6]], rotationY: yawAt(g6), s: S[g6] - LENGTH, lateral: 0 }); }
  const sections = [];
  for (let i = 0, st = 0; i <= N; i++) if (i === N || SEC[i] !== SEC[st]) { sections.push({ id: SEC[st], ...SECTIONS[SEC[st]], sStart: S[st], sEnd: i === N ? LENGTH : S[i], firstIndex: st, lastIndex: i - 1 }); st = i; }

  return {
    id: WATER_PARK_ID, name: 'Water Park', laps: 3, maxDogs: 5, length: LENGTH, sampleCount: N, sampleSpacing: LENGTH / N, deckY: DECK,
    samples: { x: X, y: Y, z: Z, width: W, s: S, u: U, tangentX: TX, tangentZ: TZ, normalX: NX, normalZ: NZ, grade: GRADE, curvature: KAPPA, section: SEC },
    sections, checkpoints, startPositions,
    startFinish: { position: [X[0], Y[0], Z[0]], rotationY: yawAt(0), halfWidth: W[0] / 2 },
    pools, rings, ringRun, ring: RING, slide, launch, jets,
    water: { belowDeck: WATER_BELOW_DECK, depth: POOL_DEPTH },
    // where each moving hazard lives, for keeping pickups clear of them and for the computer dogs
    hazardZones: { balls: ballsS, jets: [jetRows[0], jetRows.at(-1)] },
    ballLanes: ballsS, ballRadius: BALLS.radius,
    rules: {
      hasBarriers: true, fallStartsBelow: 2.6, respawnDelaySeconds: 1.0, respawnPenaltySeconds: 1.5, respawnSpeedMultiplier: 0.55, gravity: 24, killPlaneY: -60,
      hazardStunMs: 1100,
      bounce: BOUNCE,
    },
    query, pointAt, indexAtS, sAtU, isGap, isGapSegment, launchPoint, speedFactor, depthAt, poolAt, ringAt, ringsAt, setClock, hazardsAt, hazardHit,
  };
}

export const WATER_PARK = buildTrack();
export default WATER_PARK;
