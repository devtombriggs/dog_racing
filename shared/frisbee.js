// The red frisbee: how it finds its way to the dog it was thrown at.  Used by the server (which flies it)
// and the tests; the game only draws where the server says it is.
//
// Tom, 2026-11-24: it "should never come back on itself" and "should follow the track round, not fly
// through the map".  So, like the firework (shared/firework.js), it flies up the middle of the road, and
// only leaves the road for the last FRISBEE.homeWithin metres, straight at its dog.  It never turns back:
// a dog that is behind it (the frisbee went past, or the thrower overtook that dog) is not chased, and it
// flies on up the road until its time runs out.
import { FRISBEE } from './items.js';

const SETTLE = 3;          // how quickly it eases from where it was thrown onto the middle of the road (per second)

const wrap = (s, length) => ((s % length) + length) % length;
const lift = (p, fallback) => (Number.isFinite(p.y) ? p.y : fallback) + FRISBEE.height;

/** Is the target (feet at `target`) in front of a frisbee at `position` flying the way `yaw` points? */
function inFront(position, yaw, target) {
  return Math.sin(yaw) * (target[0] - position[0]) + Math.cos(yaw) * (target[2] - position[2]) > 0;
}

/** How far up the road (metres, from s) a dog is; more than half a lap counts as behind */
export function roadAhead(route, s, position) {
  return wrap(route.sAt(position) - s, route.length);
}

/**
 * A frisbee as it leaves the thrower's paw: on the road the thrower is on, eased onto its middle as it goes.
 * position: where it starts ([x, y, z]); yaw: the way the thrower faces.
 */
export function launchFrisbee(route, position, yaw) {
  const s = route.sAt(position), p = route.pointAt(s);
  return { s, position, yaw, homing: false, lost: false, offset: [position[0] - p.x, position[1] - lift(p, position[1] - FRISBEE.height), position[2] - p.z] };
}

/**
 * One step of a frisbee's flight.  f = { s, position, yaw, homing, lost, offset }; target = [x, y, z] of the
 * feet of the dog it is after, or null.  Returns the new f.
 */
export function stepFrisbee(f, route, target, dt) {
  const move = FRISBEE.speed * dt;
  let { homing, lost } = f;
  if (target && !lost && !homing) {
    const gap = roadAhead(route, f.s, target), away = Math.hypot(target[0] - f.position[0], target[2] - f.position[2]);
    homing = (gap <= FRISBEE.homeWithin && away <= FRISBEE.homeWithin * 1.5) || (away <= FRISBEE.homeWithin && inFront(f.position, f.yaw, target) && gap < route.length / 2);
  }
  if (homing && target && !lost) {
    const aim = [target[0], target[1] + FRISBEE.height, target[2]];
    const dx = aim[0] - f.position[0], dy = aim[1] - f.position[1], dz = aim[2] - f.position[2], away = Math.hypot(dx, dy, dz);
    // it went past (the dog dodged, or pulled alongside and dropped back): it does not turn round
    if (away > FRISBEE.radius * 2 && !inFront(f.position, f.yaw, target) && Math.hypot(dx, dz) > FRISBEE.radius * 2) {
      lost = true;
    } else {
      const yaw = Math.atan2(dx, dz);
      const k = Math.min(1, move / Math.max(away, 1e-6));
      return { ...f, homing: true, lost: false, yaw, position: [f.position[0] + dx * k, f.position[1] + dy * k, f.position[2] + dz * k] };
    }
  }
  if (lost && f.homing) {                       // back onto the road from wherever it was
    return stepFrisbee({ ...launchFrisbee(route, f.position, f.yaw), lost: true }, route, null, dt);
  }
  const s = wrap(f.s + move, route.length), p = route.pointAt(s), keep = Math.exp(-SETTLE * dt);
  const offset = f.offset.map(v => v * keep);
  const position = [p.x + offset[0], lift(p, f.position[1] - FRISBEE.height) + offset[1], p.z + offset[2]];
  return { ...f, s, position, yaw: Math.atan2(position[0] - f.position[0], position[2] - f.position[2]), homing: false, lost, offset };
}
