/** A closed polyline [[x, y, z, halfWidth?], ...] in driving order, starting at the start line. */
export function polylinePath(points, defaultHalfWidth) {
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

