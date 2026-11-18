// The firework: how it finds its way up the road to the dog in first place.  Used by the server
// (which flies it) and the tests; the game only draws where the server says it is.
//
// It follows the middle of the road (the same racing line the pickups are placed on) until it is
// close behind the leader, then leaves the line and goes straight for them.
import { PICKUP_PATHS } from './pickupSpots.js';
import { FIREWORK, distanceToSegment } from './items.js';

const SAMPLE_EVERY = 2;          // metres between the points a dog's place on the road is measured from
const routes = new Map();

/** A map's road as the firework flies it: { length, pointAt(s), sAt([x, y, z]) }.  s = metres round the lap. */
export function fireworkRoute(mapId) {
  if (routes.has(mapId)) return routes.get(mapId);
  const path = PICKUP_PATHS[mapId];
  if (!path) return null;
  const count = Math.ceil(path.length / SAMPLE_EVERY);
  const samples = Array.from({ length: count }, (_, i) => path.pointAt(i * SAMPLE_EVERY));
  const route = {
    length: path.length,
    pointAt: s => path.pointAt(s),
    // The nearest point of the road to a position (height counts for half, to tell apart two stretches
    // of road that pass over one another without losing a dog that is in the air)
    sAt([x, y, z]) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < count; i++) {
        const p = samples[i], dy = Number.isFinite(p.y) && Number.isFinite(y) ? (p.y - y) * 0.5 : 0;
        const d = (p.x - x) ** 2 + (p.z - z) ** 2 + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best * SAMPLE_EVERY;
    },
  };
  routes.set(mapId, route);
  return route;
}

/**
 * One step of a firework's flight.  f = { s, position: [x, y, z], yaw, homing }; target = [x, y, z] of
 * the leader's feet, or null (nobody to chase: it just flies on up the road).
 * Returns the new { s, position, yaw, homing, arrived }: arrived means it has reached the leader.
 */
export function stepFirework(f, route, target, dt) {
  const move = FIREWORK.speed * dt;
  let homing = f.homing && !!target;
  const aim = target ? [target[0], target[1] + FIREWORK.height, target[2]] : null;
  const away = aim ? Math.hypot(aim[0] - f.position[0], aim[1] - f.position[1], aim[2] - f.position[2]) : Infinity;
  if (target && !homing) {
    const gap = (((route.sAt(target) - f.s) % route.length) + route.length) % route.length;      // road still to cover
    homing = gap <= FIREWORK.homeWithin || gap >= route.length - FIREWORK.homeWithin || away <= FIREWORK.homeWithin;
  }
  if (!homing) {
    const s = (f.s + move) % route.length, p = route.pointAt(s);
    return { s, position: [p.x, (Number.isFinite(p.y) ? p.y : f.position[1] - FIREWORK.height) + FIREWORK.height, p.z], yaw: p.rotationY, homing: false, arrived: false };
  }
  const yaw = Math.atan2(aim[0] - f.position[0], aim[2] - f.position[2]);
  if (away <= move) return { s: f.s, position: aim, yaw, homing: true, arrived: true };
  const k = move / away;
  return {
    s: f.s, yaw, homing: true, arrived: false,
    position: [f.position[0] + (aim[0] - f.position[0]) * k, f.position[1] + (aim[1] - f.position[1]) * k, f.position[2] + (aim[2] - f.position[2]) * k],
  };
}

/** Did a firework flying from `from` to `to` pass close enough to a dog (feet at `dog`) to knock it over? */
export function fireworkPasses(from, to, dog) {
  return distanceToSegment(dog, from, to) <= FIREWORK.radius && Math.abs(to[1] - FIREWORK.height - dog[1]) <= 3;
}

/** Is a dog (feet at `dog`) caught in the burst of a firework going off at `position`? */
export function inFireworkBlast(position, dog) {
  return Math.hypot(position[0] - dog[0], position[2] - dog[2]) <= FIREWORK.blastRadius
    && Math.abs(position[1] - FIREWORK.height - dog[1]) <= 4;
}
