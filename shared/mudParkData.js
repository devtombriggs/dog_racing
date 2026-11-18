// Squelch Hollow Mud Run — shared track definition, rules and moving hazards.
//
// Pure JavaScript, no dependencies: import this SAME file in the React client and the Socket.IO
// server.  It has the same interface as petMallData.js and farmData.js (query, pointAt, checkpoints,
// rules, launch, hazardsAt...), so the procedural-track race rules work on it unchanged.
//
// A mud run in the pouring rain.  Everything is wet, so a dog slides a little everywhere (slipAt),
// and a lot on the clay.  Coordinates: Three.js world space, Y up, metres.  The trail is a closed
// uniform Catmull-Rom spline through CONTROL_POINTS.
//
// Round the lap:
//   A  The Paddock          start/finish on wet grass
//   B  The Slip 'n' Slide   bend after bend of wet clay: a dog goes where it was going, not where it points
//   C  Bog Hollow           deep mud that drags a dog down to a plod, a firm line between the patches; then
//                           a marshal's quad bike sliding across the track and back
//   D  Log Roll             logs come rolling down the bank and across: jump them; then stacks of tyres to weave through
//   E  Welly Hill           the long wet climb
//   F  The Mudslide         all the way down again on your belly, fast and with no grip to speak of
//   H  The Mud Pit          off the lip at the bottom, over the pit, and down in the splash zone
//
// Everything that moves is a pure function of the time since GO (hazardsAt), so the server (which
// decides who is hit) and every player's game (which draws them) agree without sending positions.

export const MUD_PARK_ID = 'mud_park';
const SAMPLE_STEP = 2, CHECKPOINT_SPACING = 100;
const START_U = 0.5;                    // where on the spline the start line is (between the first two control points)
const DECK = 0;                         // the lowest the trail goes

// [x, z, height, width, section]
const CONTROL_POINTS = [
  [-90, 150, 0, 16, 'A'], [-10, 150, 0, 16, 'A'], [70, 150, 0, 16, 'A'],
  [150, 140, 0, 14, 'B'], [215, 95, 0.5, 14, 'B'], [190, 25, 1, 14, 'B'], [250, -35, 1.5, 14, 'B'],
  [255, -110, 2, 16, 'C'], [205, -170, 2, 16, 'C'],
  [130, -195, 3, 14, 'D'], [50, -185, 5, 14, 'D'],
  [-30, -200, 10, 11, 'E'], [-110, -190, 18, 11, 'E'], [-175, -150, 24, 11, 'E'],
  [-215, -90, 24, 11, 'F'], [-190, -25, 17, 11, 'F'], [-225, 35, 9, 11, 'F'],
  [-180, 110, 0, 16, 'H'],
];

export const SECTIONS = {
  A: { name: 'The Paddock', surface: 'wet grass' },
  B: { name: 'The Slip ’n’ Slide', surface: 'wet clay' },
  C: { name: 'Bog Hollow', surface: 'mud' },
  D: { name: 'Log Roll', surface: 'mud' },
  E: { name: 'Welly Hill', surface: 'mud' },
  F: { name: 'The Mudslide', surface: 'slide' },
  H: { name: 'The Mud Pit', surface: 'mud' },
};

const DOG = 0.7;                        // a dog is kept this far inside the tape, and from the middle of anything solid, plus its radius
const BOG_SPEED = 0.55;                 // share of top speed in the deep mud
const SLIDE_SPEED = 1.35;               // share of top speed down the mudslide
// How slippery it is, 0 (dry road) to 1 (wet clay): the wetter, the more a dog carries on the way it
// was going when it turns, and the slower it picks up speed.
const SLIP = { everywhere: 0.25, clay: 1, slide: 0.85 };

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

  // ---------- the clay, the mudslide, and the leap off the bottom of it over the mud pit
  const clay = { sStart: sAtU(3.0) - 10, sEnd: sAtU(6.9) };
  const gapStartIndex = indexAtS(sAtU(16.15)), gapEndIndex = indexAtS(sAtU(16.8));
  const launch = {
    gapStart: S[gapStartIndex], gapEnd: S[gapEndIndex],
    padStart: S[gapStartIndex] - 16, takeoffS: S[gapStartIndex] - 4,
    landingS: S[gapEndIndex] + 10, duration: 1.8, arcHeight: 8,
    exitSpeedMultiplier: 1.3, boostSeconds: 1.25
  };
  const isGap = s => s > launch.gapStart && s < launch.gapEnd;
  const isGapSegment = i => i >= gapStartIndex && i < gapEndIndex;
  const slide = { sStart: sAtU(14.0) + 8, sEnd: launch.gapStart };
  const within = (s, zone) => along(s, zone.sStart) >= 0 && along(s, zone.sEnd) <= 0;
  /** How slippery the ground is at s: 0 (grips) to 1 (wet clay). */
  const slipAt = s => (within(s, clay) ? SLIP.clay : within(s, slide) ? SLIP.slide : SLIP.everywhere);

  /** The leap off the bottom of the mudslide: the same curve for the server and every game. */
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

  // ---------- things standing in the trail, and the deep mud lying in it
  const obstacles = [];
  const tyresS = sAtU(10.0) - 6;
  for (let k = 0; k < 6; k++) {
    const p = pointAt(tyresS + k * 12.5), lateral = (k % 2 ? 1 : -1) * p.halfWidth * 0.42, q = pointAt(tyresS + k * 12.5, lateral);
    obstacles.push({ id: `tyres-${k}`, kind: 'tyres', s: tyresS + k * 12.5, lateral, x: q.x, y: q.y, z: q.z, radius: 1.15, rotationY: p.rotationY });
  }
  const mud = [];
  const bogS = sAtU(7.05) + 8;
  for (let k = 0; k < 5; k++) {
    const s = bogS + k * 16, p = pointAt(s), lateral = (k % 2 ? -1 : 1) * p.halfWidth * 0.45, q = pointAt(s, lateral);
    mud.push({ id: `bog-${k}`, s, lateral, x: q.x, y: q.y, z: q.z, along: 6, across: p.halfWidth * 0.5, rotationY: p.rotationY });
  }
  const mudAt = (s, lateral) => mud.some(patch => ((along(s, patch.s) / patch.along) ** 2 + ((lateral - patch.lateral) / patch.across) ** 2) < 1);

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
    const onSlide = within(p.s, slide);
    const q = {
      index: i, s: p.s, lateral: p.lateral, halfWidth: hw, distance: p.distance, trackY: p.trackY,
      grade: GRADE[p.a], curvature: KAPPA[p.a], rotationY: yawAt(p.a), section: sec,
      surface: onSlide ? 'slide' : within(p.s, clay) ? 'clay' : 'mud', slide: onSlide, slippery: slipAt(p.s),
      mud: false, fall: false, blocked: false, clampX: x, clampZ: z, y: p.trackY,
      waterDepth: 0, inWater: false, movement: 'run',
    };
    // marshals' tape and banks all the way round: the only way off is the bottom of the mudslide
    const limit = hw - 0.3 - DOG * 0.5;
    let px = x, pz = z;
    if (Math.abs(p.lateral) > limit) {
      const sgn = p.lateral >= 0 ? 1 : -1;
      q.blocked = true; px = p.px + p.nx * sgn * limit; pz = p.pz + p.nz * sgn * limit;
    }
    for (const o of obstacles) {
      const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz), keep = o.radius + DOG;
      if (d < keep) { q.blocked = true; const ux = d > 1e-6 ? dx / d : p.nx, uz = d > 1e-6 ? dz / d : p.nz; px = o.x + ux * keep; pz = o.z + uz * keep; }
    }
    q.clampX = px; q.clampZ = pz;
    if (!q.blocked && mudAt(p.s, p.lateral)) { q.mud = true; q.surface = 'bog'; q.slowName = 'DEEP MUD — SLOW GOING'; }
    q.onTrack = !isGap(p.s);                                   // "supported": what the race rules look at
    q.dogY = q.y;
    return q;
  }

  /** One speed multiplier for where the dog is.  stats are 0..1 (0.5 = an average dog). */
  function speedFactor(q, stats = {}) {
    if (q.slide) return SLIDE_SPEED;
    const stamina = stats.stamina ?? 0.5; let f = q.mud ? BOG_SPEED : 1;
    if (q.grade > 0) f *= 1 - Math.min(0.3, q.grade * 1.8 * (1.5 - stamina));
    else f *= 1 + Math.min(0.06, -q.grade * 0.7);
    return f;
  }

  // ---------- everything that moves, as a function of the seconds since GO
  // Each hazard: { id, kind, x, y, z, rotationY, radius, height, active }.  A dog whose middle comes
  // within radius (plus its own) of an active one is knocked over, unless it is more than `height`
  // above it (a jump clears a log; nothing clears the quad bike).
  const pingPong = (t, period, pause) => {            // 0 -> 1 -> 0 with a rest at each end; dir: +1 going out, -1 coming back
    const ph = ((t % period) + period) % period / period, move = 0.5 - pause;
    if (ph < move) return { k: sstep(0, 1, ph / move), dir: 1 };
    if (ph < 0.5) return { k: 1, dir: 1 };
    if (ph < 0.5 + move) return { k: 1 - sstep(0, 1, (ph - 0.5) / move), dir: -1 };
    return { k: 0, dir: -1 };
  };
  const quadS = sAtU(8.45), QUAD = { period: 9, pause: 0.08, radius: 1.5, reach: 22 };
  const logsS = [0, 22, 44].map(d => sAtU(9.05) + d), LOGS = { period: 6, roll: 4, from: 22, to: -16, radius: 0.75 };

  function hazardsAt(t) {
    const out = [];
    // the quad bike, sliding across the track and back
    {
      const m = pingPong(t, QUAD.period, QUAD.pause), lat = -QUAD.reach + 2 * QUAD.reach * m.k, c = pointAt(quadS, lat);
      out.push({ id: 'quad', kind: 'quad', x: c.x, y: c.y, z: c.z, rotationY: Math.atan2(c.nx, c.nz) + (m.dir > 0 ? 0 : Math.PI) + 0.25 * Math.sin(t * 3), radius: QUAD.radius, height: 9, active: true });
    }
    // the logs rolling down the bank and across, one after another
    logsS.forEach((s, k) => {
      const ph = (((t + k * LOGS.period / 3) % LOGS.period) + LOGS.period) % LOGS.period, rolling = ph < LOGS.roll;
      const lat = LOGS.from + (LOGS.to - LOGS.from) * (rolling ? ph / LOGS.roll : 0), c = pointAt(s, lat);
      out.push({ id: `log-${k}`, kind: 'log', x: c.x, y: c.y, z: c.z, rotationY: c.rotationY, radius: LOGS.radius, height: 1.0, active: rolling,
        spin: -lat / LOGS.radius, fade: rolling ? Math.min(1, ph * 3, (LOGS.roll - ph) * 3) : 0 });
    });
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
  // None in mid-air or on the run up to the leap; the landing is a gate every dog must come down on.
  const checkpoints = every.filter(cp => cp.s < launch.padStart - 8 || cp.s > launch.landingS + 20);
  for (const [s, launchLanding] of [[launch.padStart - 8, false], [launch.landingS, true]]) {
    const p = pointAt(s);
    checkpoints.push({ s, launchLanding, sampleIndex: p.index, position: [p.x, p.y, p.z], rotationY: p.rotationY, halfWidth: p.halfWidth, section: p.section });
  }
  checkpoints.sort((a, b) => a.s - b.s).forEach((cp, index) => { cp.index = index; });
  const gi = wrapIndex(N - 4), spacing = Math.min(2.6, (W[gi] - 3) / 4), startPositions = [];
  for (let k = 0; k < 5; k++) { const lat = (2 - k) * spacing; startPositions.push({ slot: k, position: [X[gi] + NX[gi] * lat, Y[gi], Z[gi] + NZ[gi] * lat], rotationY: yawAt(gi), s: S[gi] - LENGTH, lateral: lat }); }
  const sections = [];
  for (let i = 0, st = 0; i <= N; i++) if (i === N || SEC[i] !== SEC[st]) { sections.push({ id: SEC[st], ...SECTIONS[SEC[st]], sStart: S[st], sEnd: i === N ? LENGTH : S[i], firstIndex: st, lastIndex: i - 1 }); st = i; }

  return {
    id: MUD_PARK_ID, name: 'Squelch Hollow Mud Run', laps: 3, maxDogs: 5, length: LENGTH, sampleCount: N, sampleSpacing: LENGTH / N,
    samples: { x: X, y: Y, z: Z, width: W, s: S, u: U, tangentX: TX, tangentZ: TZ, normalX: NX, normalZ: NZ, grade: GRADE, curvature: KAPPA, section: SEC },
    sections, checkpoints, startPositions,
    startFinish: { position: [X[0], Y[0], Z[0]], rotationY: yawAt(0), halfWidth: W[0] / 2 },
    obstacles, mud, clay, slide, launch,
    // where each moving hazard lives, for keeping pickups clear of them and for the computer dogs
    hazardZones: { quad: quadS, logs: logsS },
    quadLane: { s: quadS, reach: QUAD.reach }, logLanes: logsS, logRun: { from: LOGS.from, to: LOGS.to, radius: LOGS.radius },
    rules: { hasBarriers: true, fallStartsBelow: 2.0, respawnDelaySeconds: 1.0, respawnPenaltySeconds: 1.5, respawnSpeedMultiplier: 0.55, gravity: 24, killPlaneY: -60, hazardStunMs: 1100,
      // what the wet does to a dog: at slippery = 1 it keeps this share of its grip and of its acceleration
      slip: { grip: 0.2, acceleration: 0.6 } },
    query, pointAt, indexAtS, sAtU, isGap, isGapSegment, launchPoint, speedFactor, slipAt, hazardsAt, hazardHit,
  };
}

export const MUD_PARK = buildTrack();
export default MUD_PARK;
