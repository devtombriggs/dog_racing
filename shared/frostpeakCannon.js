// Frostpeak's cannon, shared by the server (which decides when a dog is fired and where it lands)
// and the game (which flies the dog), plus where the black run and its slalom obstacles are.
//
// The numbers come from the map build (frostpeak_alpine_circuit/generate_frostpeak.py writes them
// into frostpeak.json), so the flight lines up with the cannon barrel in the model.
import frostpeak from './frostpeak.json' with { type: 'json' };

const C = frostpeak.cannon;

// Three.js axes: forward for a yaw r is (sin r, cos r); the dog's left is (cos r, -sin r).
const forwardOf = r => [Math.sin(r), Math.cos(r)];
const leftOf = r => [Math.cos(r), -Math.sin(r)];

/** Where a point is relative to a spot facing yaw r: metres ahead, metres to the left. */
function local(x, z, origin, r) {
  const dx = x - origin[0], dz = z - origin[2];
  const [fx, fz] = forwardOf(r), [lx, lz] = leftOf(r);
  return { along: dx * fx + dz * fz, lateral: dx * lx + dz * lz };
}

const padLength = C.takeoffS - C.padStartS;

/**
 * The cannon flight, t seconds after firing.  x/z is a Hermite curve from the barrel to the landing
 * with the road's heading at both ends; height climbs from the barrel to the top of the slope with an
 * extra arc on top.  A dog fired off-centre drifts to the middle of the barrel's line early in the flight.
 */
function launchPoint(elapsed, lateral = 0) {
  const t = Math.max(0, Math.min(1, elapsed / C.duration));
  const drift = 1 - Math.min(1, t / 0.3);
  const offset = lateral * drift * drift * (3 - 2 * drift);
  const [lx, lz] = leftOf(C.takeoffRotationY);
  const a = { x: C.takeoff[0] + lx * offset, y: C.takeoff[1], z: C.takeoff[2] + lz * offset };
  const b = { x: C.landing[0], y: C.landing[1], z: C.landing[2] };
  const tangent = Math.hypot(b.x - a.x, b.z - a.z) * C.tangent;
  const [afx, afz] = forwardOf(C.takeoffRotationY), [bfx, bfz] = forwardOf(C.landingRotationY);
  const h0 = 2 * t ** 3 - 3 * t ** 2 + 1, h1 = t ** 3 - 2 * t ** 2 + t;
  const h2 = -2 * t ** 3 + 3 * t ** 2, h3 = t ** 3 - t ** 2;
  const dh0 = 6 * t ** 2 - 6 * t, dh1 = 3 * t ** 2 - 4 * t + 1, dh2 = -dh0, dh3 = 3 * t ** 2 - 2 * t;
  const ax = afx * tangent, az = afz * tangent, bx = bfx * tangent, bz = bfz * tangent;
  const dx = dh0 * a.x + dh1 * ax + dh2 * b.x + dh3 * bx;
  const dz = dh0 * a.z + dh1 * az + dh2 * b.z + dh3 * bz;
  const dy = b.y - a.y + 4 * C.arcHeight * (1 - 2 * t);
  return {
    x: h0 * a.x + h1 * ax + h2 * b.x + h3 * bx,
    y: a.y + (b.y - a.y) * t + 4 * C.arcHeight * t * (1 - t),
    z: h0 * a.z + h1 * az + h2 * b.z + h3 * bz,
    rotationY: Math.atan2(dx, dz), pitch: -Math.atan2(dy, Math.hypot(dx, dz)),
    speed: Math.hypot(dx, dy, dz) / C.duration,
  };
}

/**
 * Did a dog moving from `from` to `to` run off the end of the launch pad into the barrel?
 * Returns the sideways offset to fire it with, or null.  A dog jumping across the pad still goes.
 */
function cannonFired(from, to) {
  const a = local(from[0], from[2], C.takeoff, C.takeoffRotationY);
  const b = local(to[0], to[2], C.takeoff, C.takeoffRotationY);
  if (!(a.along >= -padLength - 3 && a.along < 0 && b.along >= 0 && b.along <= 12)) return null;
  if (Math.abs(b.lateral) > C.padHalfWidth + 0.8 || Math.abs(a.lateral) > C.padHalfWidth + 0.8) return null;
  if (to[1] < C.takeoff[1] - 1.5 || to[1] > C.takeoff[1] + 3) return null;
  return Math.max(-C.padHalfWidth, Math.min(C.padHalfWidth, b.lateral));
}

/** The black run: where it starts (the landing) and ends, and the solid slalom obstacles on it. */
export const FROSTPEAK_SKI_SLOPE = frostpeak.skiSlope;
export const FROSTPEAK_SLALOM = frostpeak.slalomObstacles;

/** Shaped like a procedural track's launch, so the game can fly it with the same code. */
export const FROSTPEAK_CANNON = {
  launch: {
    duration: C.duration, arcHeight: C.arcHeight,
    exitSpeedMultiplier: C.exitSpeedMultiplier, boostSeconds: C.boostSeconds,
  },
  takeoff: C.takeoff, landing: C.landing, takeoffRotationY: C.takeoffRotationY, landingRotationY: C.landingRotationY,
  padLength, padHalfWidth: C.padHalfWidth,
  launchPoint, cannonFired,
};
