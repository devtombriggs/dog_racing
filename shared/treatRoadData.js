// Treat Road — shared track definition.
//
// Pure JavaScript, no dependencies: import this SAME file in the React client and in the
// Socket.IO server so every player and the server use identical geometry, checkpoints and
// on-track tests. Coordinates are Three.js world space (Y up, metres). The start line is at y = 0.
//
// The centreline is a closed uniform Catmull-Rom spline through CONTROL_POINTS (the same curve
// THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5) produces), resampled every ~2 m.

export const TREAT_ROAD_ID = 'treat_road';
const TARGET_LENGTH = 1600;        // metres along the centreline
const SAMPLE_STEP = 2;             // metres between centreline samples
const EDGE_TOLERANCE = 0.25;       // how far past the edge a dog may be and still count as "on"
const CHECKPOINT_SPACING = 100;    // metres

// [x, z, height, width, section]   (x/z are rescaled so the lap is exactly TARGET_LENGTH)
const CONTROL_POINTS = [
  [-150, 320, 0, 16, 'A'], [50, 320, 0, 16, 'A'], [250, 320, 0, 16, 'A'],
  [470, 270, 3, 15, 'B'], [600, 110, 7, 14, 'B'], [540, -70, 11, 13, 'B'], [650, -240, 15, 12, 'B'], [560, -420, 20, 11, 'B'],
  [390, -500, 28, 10.5, 'C'], [250, -410, 39, 10, 'C'], [110, -500, 50, 10, 'C'], [-30, -410, 61, 10, 'C'], [-170, -500, 72, 10, 'C'],
  [-320, -440, 82, 10, 'C'], [-440, -330, 77, 9.5, 'C'],
  [-425, -205, 72, 8, 'D'], [-500, -115, 68, 8, 'D'], [-425, -30, 64, 8, 'D'], [-500, 55, 60, 8, 'D'], [-445, 140, 57, 8, 'D'],
  [-510, 220, 55, 6, 'E'],
  [-630, 400, 54, 6, 'F'], [-610, 530, 46, 8, 'F'], [-480, 610, 34, 10, 'F'], [-340, 560, 22, 12, 'F'], [-290, 420, 9, 14, 'F'],
];

export const SECTIONS = {
  A: { name: 'Starting Straight', stat: null },
  B: { name: 'Sweeping Sky Curves', stat: null },
  C: { name: 'Biscuit Climb', stat: 'hillClimb' },      // hook for the dog's hill-climbing stat
  D: { name: 'Technical Corners', stat: 'agility' },    // hook for the dog's agility stat
  E: { name: 'Bone Bridge', stat: null },
  F: { name: 'Final Descent', stat: null },
};

function catmullClosed(P, per) {
  const n = P.length, out = [], us = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t, row = [];
      for (let c = 0; c < 4; c++) {
        row.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
      }
      out.push(row); us.push(i + t);
    }
  }
  return { pts: out, us };
}

function smoothPeriodic(a, sigma) {
  const k = Math.ceil(sigma * 3), n = a.length, w = [], out = new Array(n);
  let tot = 0;
  for (let j = -k; j <= k; j++) { const v = Math.exp(-j * j / (2 * sigma * sigma)); w.push(v); tot += v; }
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -k; j <= k; j++) s += a[(i + j + n * 8) % n] * w[j + k];
    out[i] = s / tot;
  }
  return out;
}

function sampleLoop(scale) {
  const P = CONTROL_POINTS.map(p => [p[0] * scale, p[1] * scale, p[2] * 0.55, p[3]]);
  const { pts, us } = catmullClosed(P, 48);
  const m = pts.length, cum = [0];
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const L = cum[m], n = Math.round(L / SAMPLE_STEP);
  const x = [], z = [], y = [], w = [], u = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * L / n;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), a = pts[j], b = pts[(j + 1) % m];
    x.push(a[0] + (b[0] - a[0]) * t); z.push(a[1] + (b[1] - a[1]) * t);
    y.push(a[2] + (b[2] - a[2]) * t); w.push(a[3] + (b[3] - a[3]) * t);
    u.push(us[j] + t / 48);
  }
  const ys = smoothPeriodic(y, 8), ws = smoothPeriodic(w, 5).map(v => Math.min(16, Math.max(6, v)));
  let len = 0;
  for (let i = 0; i < n; i++) { const k = (i + 1) % n; len += Math.hypot(x[k] - x[i], ys[k] - ys[i], z[k] - z[i]); }
  return { x, y: ys, z, w: ws, u, n, len };
}

function buildTrack() {
  let scale = 0.66, raw = sampleLoop(scale);
  for (let it = 0; it < 6; it++) { scale *= TARGET_LENGTH / raw.len; raw = sampleLoop(scale); }

  // rotate the arrays so sample 0 is the start/finish line (halfway along the first straight)
  const N = raw.n;
  let i0 = 0;
  for (let i = 0; i < N; i++) if (Math.abs(raw.u[i] - 0.5) < Math.abs(raw.u[i0] - 0.5)) i0 = i;
  const rot = a => a.slice(i0).concat(a.slice(0, i0));
  const X = rot(raw.x), Y0 = rot(raw.y), Z = rot(raw.z), W = rot(raw.w), U = rot(raw.u);
  const Y = Y0.map(v => v - Y0[0]);

  const S = [0], TX = [], TZ = [], NX = [], NZ = [], GRADE = [], SEC = [], KAPPA = [];
  for (let i = 0; i < N; i++) {
    const k = (i + 1) % N;
    if (i > 0) { const p = i - 1; S.push(S[p] + Math.hypot(X[i] - X[p], Y[i] - Y[p], Z[i] - Z[p])); }
    const a = (i - 1 + N) % N, dx = X[k] - X[a], dz = Z[k] - Z[a], d = Math.hypot(dx, dz);
    TX.push(dx / d); TZ.push(dz / d); NX.push(-dz / d); NZ.push(dx / d);
    GRADE.push((Y[k] - Y[a]) / d);
    SEC.push(CONTROL_POINTS[Math.floor(U[i]) % CONTROL_POINTS.length][4]);
  }
  const LENGTH = S[N - 1] + Math.hypot(X[0] - X[N - 1], Y[0] - Y[N - 1], Z[0] - Z[N - 1]);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, k = (i + 1) % N;
    let dth = Math.atan2(TZ[k], TX[k]) - Math.atan2(TZ[a], TX[a]);
    while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    KAPPA.push(dth / Math.hypot(X[k] - X[a], Z[k] - Z[a]));
  }
  const yawAt = i => Math.atan2(TX[i], TZ[i]);      // rotation.y for a model that faces +Z
  const wrapIndex = i => ((i % N) + N) % N;
  const indexAtS = s => wrapIndex(Math.round((((s % LENGTH) + LENGTH) % LENGTH) / LENGTH * N));

  // Remove 150 m of the winding climb; the remaining road is half the original lap.
  const gapStartIndex = SEC.indexOf('C') + 24;
  const gapEndIndex = gapStartIndex + Math.round(150 / (LENGTH / N));
  const launch = {
    gapStart: S[gapStartIndex], gapEnd: S[gapEndIndex],
    padStart: S[gapStartIndex] - 16, takeoffS: S[gapStartIndex] - 4,
    landingS: S[gapEndIndex] + 12, duration: 2.2, arcHeight: 30,
    exitSpeedMultiplier: 1.35, boostSeconds: 1.25
  };
  const isGap = s => s > launch.gapStart && s < launch.gapEnd;
  const isGapSegment = i => i >= gapStartIndex && i < gapEndIndex;

  /** Shared, deterministic catapult arc, with tangents aligned to both pieces of road. */
  function launchPoint(elapsed, lateral = 0) {
    const t = Math.max(0, Math.min(1, elapsed / launch.duration));
    const a = pointAt(launch.takeoffS, lateral), b = pointAt(launch.landingS, lateral);
    const tangent = Math.hypot(b.x - a.x, b.z - a.z) * 0.55;
    const h0 = 2*t*t*t - 3*t*t + 1, h1 = t*t*t - 2*t*t + t;
    const h2 = -2*t*t*t + 3*t*t, h3 = t*t*t - t*t;
    const dh0 = 6*t*t - 6*t, dh1 = 3*t*t - 4*t + 1;
    const dh2 = -dh0, dh3 = 3*t*t - 2*t;
    const ax = Math.sin(a.rotationY)*tangent, az = Math.cos(a.rotationY)*tangent;
    const bx = Math.sin(b.rotationY)*tangent, bz = Math.cos(b.rotationY)*tangent;
    const dx = dh0*a.x + dh1*ax + dh2*b.x + dh3*bx;
    const dz = dh0*a.z + dh1*az + dh2*b.z + dh3*bz;
    const dy = b.y-a.y + 4*launch.arcHeight*(1-2*t);
    return { x: h0*a.x+h1*ax+h2*b.x+h3*bx,
      y: a.y+(b.y-a.y)*t+4*launch.arcHeight*t*(1-t),
      z: h0*a.z+h1*az+h2*b.z+h3*bz,
      rotationY: Math.atan2(dx,dz), pitch: -Math.atan2(dy, Math.hypot(dx,dz)),
      speed: Math.hypot(dx,dy,dz)/launch.duration };
  }

  /** World position for a distance along the lap and a sideways offset (metres, + = left-hand normal). */
  function pointAt(s, lateral = 0) {
    s = ((s % LENGTH) + LENGTH) % LENGTH;
    const f = s / LENGTH * N, i = Math.floor(f) % N, k = (i + 1) % N, t = f - Math.floor(f);
    const nx = NX[i] + (NX[k] - NX[i]) * t, nz = NZ[i] + (NZ[k] - NZ[i]) * t;
    return {
      x: X[i] + (X[k] - X[i]) * t + nx * lateral, y: Y[i] + (Y[k] - Y[i]) * t, z: Z[i] + (Z[k] - Z[i]) * t + nz * lateral,
      rotationY: Math.atan2(TX[i] + (TX[k] - TX[i]) * t, TZ[i] + (TZ[k] - TZ[i]) * t), index: i,
      halfWidth: (W[i] + (W[k] - W[i]) * t) / 2, section: SEC[i],
    };
  }

  /**
   * Where is (x, z) relative to the road?  Never assumes the dog is on the centreline.
   * hint = the `index` returned last time for this dog (-1 for a full search). With a hint only
   * the nearby stretch of road is searched, so a dog cannot "land" on a different part of the lap.
   */
  function query(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      for (let k = -30; k <= 30; k++) {
        const i = wrapIndex(hint + k), d = (x - X[i]) ** 2 + (z - Z[i]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best < 0) {
      for (let i = 0; i < N; i++) { const d = (x - X[i]) ** 2 + (z - Z[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    let out = null;
    for (const a of [wrapIndex(best - 1), best]) {
      const b = (a + 1) % N, ex = X[b] - X[a], ez = Z[b] - Z[a], e2 = ex * ex + ez * ez;
      const t = Math.min(1, Math.max(0, ((x - X[a]) * ex + (z - Z[a]) * ez) / e2));
      const px = X[a] + ex * t, pz = Z[a] + ez * t, d = Math.hypot(x - px, z - pz);
      if (!out || d < out.distance) {
        const nx = NX[a] + (NX[b] - NX[a]) * t, nz = NZ[a] + (NZ[b] - NZ[a]) * t;
        const segLen = b === 0 ? LENGTH - S[a] : S[b] - S[a];
        out = {
          distance: d, index: t < 0.5 ? a : b, s: (S[a] + segLen * t) % LENGTH, y: Y[a] + (Y[b] - Y[a]) * t,
          halfWidth: (W[a] + (W[b] - W[a]) * t) / 2, lateral: (x - px) * nx + (z - pz) * nz,
          rotationY: yawAt(a), grade: GRADE[a], curvature: KAPPA[a], section: SEC[a],
        };
      }
    }
    out.onTrack = !isGap(out.s) && Math.abs(out.lateral) <= out.halfWidth + EDGE_TOLERANCE && out.distance <= out.halfWidth + EDGE_TOLERANCE + 0.5;
    return out;
  }

  // ordered checkpoints; index 0 is the start/finish line
  const cpCount = Math.round(LENGTH / CHECKPOINT_SPACING), checkpoints = [];
  for (let c = 0; c < cpCount; c++) {
    const i = wrapIndex(Math.round(c * N / cpCount));
    checkpoints.push({ index: c, sampleIndex: i, s: S[i], position: [X[i], Y[i], Z[i]], rotationY: yawAt(i), halfWidth: W[i] / 2, section: SEC[i] });
  }

  // No checkpoint sits in mid-air or under the launch approach. Landing is a required gate.
  const roadCheckpoints = checkpoints.filter(cp => cp.s < launch.padStart - 8 || cp.s > launch.landingS + 20);
  for (const [s, launchLanding] of [[launch.padStart - 8, false], [launch.landingS, true]]) {
    const p = pointAt(s);
    roadCheckpoints.push({ s, launchLanding, sampleIndex: p.index, position: [p.x,p.y,p.z], rotationY: p.rotationY, halfWidth: p.halfWidth, section: p.section });
  }
  roadCheckpoints.sort((a,b) => a.s-b.s).forEach((cp,index) => { cp.index=index; });

  // five dogs, one row, 8 m behind the line
  const gi = wrapIndex(N - 4), spacing = Math.min(2.6, (W[gi] - 3) / 4), startPositions = [];
  for (let k = 0; k < 5; k++) {
    const lat = (2 - k) * spacing;
    startPositions.push({ slot: k, position: [X[gi] + NX[gi] * lat, Y[gi], Z[gi] + NZ[gi] * lat], rotationY: yawAt(gi), s: S[gi] - LENGTH, lateral: lat });
  }

  // decorative bone arches ("treat gates"). boost is off for alpha; flip it on later if wanted.
  const firstOf = sec => SEC.indexOf(sec), lastOf = sec => SEC.lastIndexOf(sec);
  const gateIdx = [0, Math.round((firstOf('B') + lastOf('B')) / 2), firstOf('C') + 20, lastOf('C') - 60, firstOf('D') + 10, firstOf('E') + 6, lastOf('E') - 6, Math.round((firstOf('F') + lastOf('F')) / 2)];
  const gates = gateIdx.filter(i => !isGap(S[i])).map((i, k) => ({ index: i, s: S[i], position: [X[i], Y[i], Z[i]], rotationY: yawAt(i), halfWidth: W[i] / 2, isStartGate: k === 0, boost: false }));

  const sections = [];
  for (let i = 0, st = 0; i <= N; i++) {
    if (i === N || SEC[i] !== SEC[st]) { sections.push({ id: SEC[st], ...SECTIONS[SEC[st]], sStart: S[st], sEnd: i === N ? LENGTH : S[i], firstIndex: st, lastIndex: i - 1 }); st = i; }
  }
  const minY = Math.min(...Y), maxY = Math.max(...Y);

  return {
    id: TREAT_ROAD_ID, name: 'Treat Road', laps: 3, maxDogs: 5, difficulty: 'hard',
    length: LENGTH, sampleCount: N, sampleSpacing: LENGTH / N, minY, maxY,
    samples: { x: X, y: Y, z: Z, width: W, s: S, tangentX: TX, tangentZ: TZ, normalX: NX, normalZ: NZ, grade: GRADE, curvature: KAPPA, section: SEC },
    sections, checkpoints: roadCheckpoints, startPositions, gates, launch,
    roadLength: LENGTH - (launch.gapEnd - launch.gapStart),
    startFinish: { position: [X[0], Y[0], Z[0]], rotationY: yawAt(0), halfWidth: W[0] / 2 },
    rules: {
      hasBarriers: false,
      fallStartsBelow: 1.2,        // a dog this far under the road surface is falling even if it is over the road
      respawnDelaySeconds: 1.0,
      respawnPenaltySeconds: 1.5,
      respawnSpeedMultiplier: 0.55,
      gravity: 24,
      killPlaneY: minY - 120,
    },
    query, pointAt, indexAtS, isGap, isGapSegment, launchPoint,
  };
}

export const TREAT_ROAD = buildTrack();
export default TREAT_ROAD;
