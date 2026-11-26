// Pet Mall Mayhem — shared track definition, rules and moving hazards.
//
// Pure JavaScript, no dependencies: import this SAME file in the React client and the Socket.IO
// server.  It has the same interface as waterParkData.js and farmData.js (query, pointAt, checkpoints,
// rules, launch, hazardsAt...), so the procedural-track race rules work on it unchanged.
//
// A big pet shopping mall on the day every cage came open.  Coordinates: Three.js world space, Y up,
// metres; the ground floor is y = 0 and the upper gallery y = 9.  The trail is a closed uniform
// Catmull-Rom spline through CONTROL_POINTS.
//
// Round the lap:
//   A  The Grand Atrium     start/finish under the dome
//   B  Cat Alley            escaped cats dash across the aisle and back: jump them or wait
//   C  The Aquarium         a narrow glass tunnel, and puddles from the burst tanks that slow a dog down
//   D  Trolley Run          runaway shopping trolleys roll across, then towers of tins to weave through
//   E  The Escalator        it is running: up to the gallery faster than a dog can sprint
//   F  The Upper Gallery    hamsters in their exercise balls roll from side to side: over them or round them
//   H  The Big Leap         off the end of the gallery, over the atrium fountain, down on to the dog beds
//
// Everything that moves is a pure function of the time since GO (hazardsAt), so the server (which
// decides who is hit) and every player's game (which draws them) agree without sending positions.

export const PET_MALL_ID = 'pet_mall';
const SAMPLE_STEP = 2, CHECKPOINT_SPACING = 100;
const START_U = 0.5;                    // where on the spline the start line is (between the first two control points)
const DECK = 0;                         // the ground floor
const GALLERY = 9;                      // the upper floor

// [x, z, height, width, section]
// (Tom, 2026-11-26: more bends.  The lap was one big oval with a single tight corner; the same eighteen places, in the same
// order, now weave: an S through Cat Alley, another inside the Aquarium, a kink in the Trolley Run and an S along the Upper
// Gallery.  Everything on the lap is placed by these places' numbers, so it has all moved with them)
const CONTROL_POINTS = [
  [-100, 140, 0, 18, 'A'], [-20, 140, 0, 18, 'A'], [60, 140, 0, 18, 'A'],
  [134, 116, 0, 14, 'B'], [208, 146, 0, 14, 'B'],
  [264, 82, 0, 11, 'C'], [247, 8, 0, 11, 'C'], [278, -58, 0, 11, 'C'],
  [222, -132, 0, 15, 'D'], [134, -124, 0, 15, 'D'], [52, -160, 0, 15, 'D'],
  [-30, -150, 1.5, 11, 'E'], [-105, -140, 6.5, 11, 'E'], [-165, -110, GALLERY, 11, 'E'],
  [-212, -52, GALLERY, 12, 'F'], [-191, 6, GALLERY, 12, 'F'], [-212, 66, GALLERY, 12, 'F'],
  [-170, 125, 0, 16, 'H'],
];

export const SECTIONS = {
  A: { name: 'The Grand Atrium', surface: 'tiles' },
  B: { name: 'Cat Alley', surface: 'tiles' },
  C: { name: 'The Aquarium', surface: 'wet tiles' },
  D: { name: 'Trolley Run', surface: 'tiles' },
  E: { name: 'The Escalator', surface: 'escalator' },
  F: { name: 'The Upper Gallery', surface: 'carpet' },
  H: { name: 'The Big Leap', surface: 'dog beds' },
};

const DOG = 0.7;                        // a dog is kept this far inside a wall, and from the middle of anything solid, plus its radius
const PUDDLE_SPEED = 0.65;              // share of top speed through a puddle
const ESCALATOR_SPEED = 1.25;           // share of top speed on the moving stairs

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

  // ---------- the escalator, and the leap off the end of the gallery
  const escalator = { sStart: sAtU(11.0) - 6, sEnd: sAtU(13.0) - 4 };
  const onEscalator = s => along(s, escalator.sStart) >= 0 && along(s, escalator.sEnd) <= 0;
  const gapStartIndex = indexAtS(sAtU(16.15)), gapEndIndex = indexAtS(sAtU(16.8));
  const launch = {
    gapStart: S[gapStartIndex], gapEnd: S[gapEndIndex],
    padStart: S[gapStartIndex] - 16, takeoffS: S[gapStartIndex] - 4,
    landingS: S[gapEndIndex] + 10, duration: 1.7, arcHeight: 7,
    exitSpeedMultiplier: 1.3, boostSeconds: 1.25
  };
  const isGap = s => s > launch.gapStart && s < launch.gapEnd;
  const isGapSegment = i => i >= gapStartIndex && i < gapEndIndex;

  /** The leap off the end of the gallery: the same curve for the server and every game. */
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

  // ---------- things standing in the aisle, and puddles lying in it
  const obstacles = [];
  const tinsS = sAtU(9.45);
  for (let k = 0; k < 6; k++) {
    const p = pointAt(tinsS + k * 13), lateral = (k % 2 ? 1 : -1) * p.halfWidth * 0.42, q = pointAt(tinsS + k * 13, lateral);
    obstacles.push({ id: `tins-${k}`, kind: 'tins', s: tinsS + k * 13, lateral, x: q.x, y: q.y, z: q.z, radius: 1.1, rotationY: p.rotationY });
  }
  // (called mud, as the farm's wallows are: the computer dogs and the speed rules know the word)
  const mud = [];
  const puddleS = sAtU(5.55);
  for (let k = 0; k < 4; k++) {
    const s = puddleS + k * 17, p = pointAt(s), lateral = (k % 2 ? -1 : 1) * p.halfWidth * 0.42, q = pointAt(s, lateral);
    mud.push({ id: `puddle-${k}`, s, lateral, x: q.x, y: q.y, z: q.z, along: 5, across: p.halfWidth * 0.48, rotationY: p.rotationY });
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
    const q = {
      index: i, s: p.s, lateral: p.lateral, halfWidth: hw, distance: p.distance, trackY: p.trackY,
      grade: GRADE[p.a], curvature: KAPPA[p.a], rotationY: yawAt(p.a), section: sec,
      surface: 'floor', escalator: onEscalator(p.s), mud: false, fall: false, blocked: false, clampX: x, clampZ: z, y: p.trackY,
      waterDepth: 0, inWater: false, movement: 'run',
    };
    // shop fronts and glass all the way round: the only way off is the end of the gallery
    const limit = hw - 0.3 - DOG * 0.5;
    let px = x, pz = z;
    if (Math.abs(p.lateral) > limit) {
      const sgn = p.lateral >= 0 ? 1 : -1;
      q.blocked = true; px = p.px + p.nx * sgn * limit; pz = p.pz + p.nz * sgn * limit;
    }
    // things standing in the aisle push the dog out to their edge
    for (const o of obstacles) {
      const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz), keep = o.radius + DOG;
      if (d < keep) { q.blocked = true; const ux = d > 1e-6 ? dx / d : p.nx, uz = d > 1e-6 ? dz / d : p.nz; px = o.x + ux * keep; pz = o.z + uz * keep; }
    }
    q.clampX = px; q.clampZ = pz;
    if (!q.blocked && mudAt(p.s, p.lateral)) { q.mud = true; q.surface = 'puddle'; q.slowName = 'PUDDLE — SLOW GOING'; }
    q.onTrack = !isGap(p.s);                                   // "supported": what the race rules look at
    q.dogY = q.y;
    return q;
  }

  /** One speed multiplier for where the dog is. */
  function speedFactor(q) {
    if (q.escalator) return ESCALATOR_SPEED;
    return (q.mud ? PUDDLE_SPEED : 1) * (q.grade < 0 ? 1 + Math.min(0.06, -q.grade * 0.7) : 1);
  }

  // ---------- everything that moves, as a function of the seconds since GO
  // Each hazard: { id, kind, x, y, z, rotationY, radius, height, active }.  A dog whose middle comes
  // within radius (plus its own) of one is knocked over, unless it is more than `height` above it (a
  // jump clears a cat or a hamster ball; nothing clears a trolley).
  const pingPong = (t, period, pause) => {            // 0 -> 1 -> 0 with a rest at each end; dir: +1 going out, -1 coming back
    const ph = ((t % period) + period) % period / period, move = 0.5 - pause;
    if (ph < move) return { k: sstep(0, 1, ph / move), dir: 1 };
    if (ph < 0.5) return { k: 1, dir: 1 };
    if (ph < 0.5 + move) return { k: 1 - sstep(0, 1, (ph - 0.5) / move), dir: -1 };
    return { k: 0, dir: -1 };
  };
  const catsS = [sAtU(3.25), sAtU(3.25) + 26], CATS = { each: 3, period: 5.5, pause: 0.07, spacing: 2.6, radius: 0.6 };
  const trolleysS = [0, 22, 44].map(d => sAtU(8.15) + d), TROLLEYS = { period: 6.5, pause: 0.08, radius: 1.3 };
  const hamstersS = [0, 1, 2, 3].map(k => sAtU(14.25) + k * 24), HAMSTERS = { radius: 0.95, swing: 0.62 };

  function hazardsAt(t) {
    const out = [];
    // the cats: three in file across the aisle and back, at two places
    catsS.forEach((s, lane) => {
      const reach = pointAt(s).halfWidth + 3, m = pingPong(t + lane * 2.1, CATS.period, CATS.pause);
      for (let k = 0; k < CATS.each; k++) {
        const lat = -reach + 2 * reach * m.k - m.dir * k * CATS.spacing, c = pointAt(s + (k % 2 ? 1.2 : -1.2), lat);
        out.push({ id: `cat-${lane}-${k}`, kind: 'cat', x: c.x, y: c.y, z: c.z, rotationY: Math.atan2(c.nx, c.nz) + (m.dir > 0 ? 0 : Math.PI),
          radius: CATS.radius, height: 0.9, active: true, bob: Math.abs(Math.sin(t * 9 + k + lane)) * 0.18 });
      }
    });
    // the trolleys: across the aisle and back, one after another
    trolleysS.forEach((s, k) => {
      const reach = pointAt(s).halfWidth + 4, m = pingPong(t + k * TROLLEYS.period / 3, TROLLEYS.period, TROLLEYS.pause), lat = -reach + 2 * reach * m.k, c = pointAt(s, lat);
      out.push({ id: `trolley-${k}`, kind: 'trolley', x: c.x, y: c.y, z: c.z, rotationY: Math.atan2(c.nx, c.nz) + (m.dir > 0 ? 0 : Math.PI), radius: TROLLEYS.radius, height: 9, active: true, roll: lat });
    });
    // the hamsters: each in its ball, rolling from one side of the gallery to the other and back
    hamstersS.forEach((s, k) => {
      const c0 = pointAt(s), phase = t * 1.25 + k * 1.7, lat = Math.sin(phase) * HAMSTERS.swing * c0.halfWidth, c = pointAt(s, lat);
      out.push({ id: `hamster-${k}`, kind: 'hamster', x: c.x, y: c.y, z: c.z, rotationY: c0.rotationY, radius: HAMSTERS.radius, height: 1.0, active: true, roll: lat / HAMSTERS.radius });
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
  // (the sixth dog: a row back, in the middle)
  { const g6 = wrapIndex(N - 6); startPositions.push({ slot: 5, position: [X[g6], Y[g6], Z[g6]], rotationY: yawAt(g6), s: S[g6] - LENGTH, lateral: 0 }); }
  const sections = [];
  for (let i = 0, st = 0; i <= N; i++) if (i === N || SEC[i] !== SEC[st]) { sections.push({ id: SEC[st], ...SECTIONS[SEC[st]], sStart: S[st], sEnd: i === N ? LENGTH : S[i], firstIndex: st, lastIndex: i - 1 }); st = i; }

  return {
    enclosed: 'ABCDEFH',            // shop fronts either side all the way round: the camera is kept inside them (game/ChaseCamera.js)
    id: PET_MALL_ID, name: 'Pet Mall Mayhem', laps: 3, maxDogs: 5, length: LENGTH, sampleCount: N, sampleSpacing: LENGTH / N, galleryY: GALLERY,
    samples: { x: X, y: Y, z: Z, width: W, s: S, u: U, tangentX: TX, tangentZ: TZ, normalX: NX, normalZ: NZ, grade: GRADE, curvature: KAPPA, section: SEC },
    sections, checkpoints, startPositions,
    startFinish: { position: [X[0], Y[0], Z[0]], rotationY: yawAt(0), halfWidth: W[0] / 2 },
    obstacles, mud, escalator, launch,
    // where each moving hazard lives, for keeping pickups clear of them and for the computer dogs
    hazardZones: { cats: catsS, trolleys: trolleysS, hamsters: [hamstersS[0], hamstersS.at(-1)] },
    catLanes: catsS, trolleyLanes: trolleysS, hamsterLanes: hamstersS, hamsterRadius: HAMSTERS.radius,
    rules: { hasBarriers: true, fallStartsBelow: 2.0, respawnDelaySeconds: 1.0, respawnPenaltySeconds: 1.5, respawnSpeedMultiplier: 0.55, gravity: 24, killPlaneY: -60, hazardStunMs: 1100 },
    query, pointAt, indexAtS, sAtU, isGap, isGapSegment, launchPoint, speedFactor, hazardsAt, hazardHit,
  };
}

export const PET_MALL = buildTrack();
export default PET_MALL;
