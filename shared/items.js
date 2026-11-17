// Items from Treat Boxes: the rules and the geometry, shared by the server (which decides), the game
// (which draws) and the tests.
//
//   ball  — tennis ball thrown straight ahead; knocks over the first dog it reaches
//   toy   — rubber chew toy dropped behind you; stays on the road until a dog runs into it, then it is gone
//   bone  — golden bone: a speed boost for the dog that uses it
//   frisbee — red frisbee: chases down the dog directly ahead of you (whoever is there right now) and
//             knocks just that dog over; the tennis ball is the straight shot, this is the homing one
//
// A dog holds one item at a time.  Running through a box while holding one still takes the box,
// but gives nothing; a new item can only come after the held one is used.

export const ITEM_IDS = ['ball', 'toy', 'bone', 'frisbee'];

export const ITEM_NAMES = { ball: 'Tennis Ball', toy: 'Chew Toy', bone: 'Golden Bone', frisbee: 'Red Frisbee' };

export const BALL = {
  speed: 45,            // m/s, roughly 2.5x a sprinting dog
  duration: 2.6,        // seconds in flight (about 115 m)
  launchAhead: 2.5,     // starts this far in front of the thrower
  height: 1.3,          // flies at this height above where it was thrown
  radius: 1.6,          // hits a dog whose centre comes this close
};

export const TOY = {
  dropBehind: 3.5,      // lands this far behind the dog that drops it
  radius: 1.3,
  ownerGraceMs: 1500,   // the dropper cannot trip on it straight away
  jumpClear: 1.0,       // a dog this high off the road at the toy jumps clean over it
  maxPerRoom: 24,       // oldest goes when more are dropped
};

export const FRISBEE = {
  speed: 34,            // m/s: faster than a sprinting dog, catchable only by a boosted one for a while
  turnRate: 3.4,        // radians per second it can turn to follow its target round corners
  duration: 6.0,        // seconds before it gives up
  launchAhead: 2.5,
  height: 1.0,          // flies this far above the dog it is chasing
  climbRate: 6,         // how quickly it matches its target's height (per second, as a share of the gap):
                        // quick enough to follow a dog down Frostpeak's black run
  radius: 1.7,          // hits a dog whose centre comes this close (flat), at about chest height
  tickMs: 50,           // the server moves it (and tells everyone where it is) this often
};

export const HIT = {
  ballStunMs: 1100,     // how long a hit dog is knocked about
  toyStunMs: 1500,
  immuneMs: 1500,       // a hit dog cannot be hit again for this long
};

/**
 * The odds of each item from a Treat Box, by place in the race (kart-racer style: the further back
 * you are, the more likely a golden bone).  The leader (or a solo racer) never gets a bone or a
 * frisbee; last place never gets a chew toy.  `behind` runs 0 (2nd) .. 1 (last) for everyone else:
 *   bone 40 % in 2nd, rising to 70 % in last;  frisbee 25 % (20 % in last);  the rest is split
 *   between ball and chew toy (last place: 10 % ball).
 *   e.g. 5 racers: 1st never a bone, 2nd 40 %, 3rd 50 %, 4th 60 %, last 70 % bone.
 */
export function itemOdds(place, racers) {
  if (place <= 1 || racers <= 1) return { ball: 0.5, toy: 0.5, bone: 0, frisbee: 0 };   // nobody ahead to lock on to
  const behind = racers <= 2 ? 1 : (place - 2) / (racers - 2);
  const bone = place >= racers ? 0.7 : 0.4 + 0.3 * behind;
  if (place >= racers) return { ball: 0.1, toy: 0, bone, frisbee: 0.2 };
  const frisbee = 0.25;
  return { ball: (1 - bone - frisbee) / 2, toy: (1 - bone - frisbee) / 2, bone, frisbee };
}

/** Which items a dog can be given, from its place in the race. */
export function itemChoices(place, racers) {
  const odds = itemOdds(place, racers);
  return ITEM_IDS.filter(id => odds[id] > 0);
}

export function rollItem(place, racers, random = Math.random) {
  const odds = itemOdds(place, racers);
  let r = random();
  for (const id of ITEM_IDS) {
    if (odds[id] <= 0) continue;
    if (r < odds[id]) return id;
    r -= odds[id];
  }
  return itemChoices(place, racers).at(-1);
}

export function forwardOf(rotationY) {
  return [Math.sin(rotationY), 0, Math.cos(rotationY)];
}

/**
 * Where a thrown ball is, t seconds after the throw.  It flies straight the way the thrower faced.
 * Normally it stays at the height it was thrown from; a ball marked `ground` (Frostpeak's steep
 * black run) skims BALL.height above the ground instead, so it follows the slope down (or up).
 * groundAt(x, z) gives the ground height there.
 */
export function ballPositionAt(ball, t, groundAt = null) {
  const d = Math.max(0, Math.min(t, BALL.duration)) * BALL.speed;
  const x = ball.origin[0] + ball.direction[0] * d, z = ball.origin[2] + ball.direction[2] * d;
  const ground = ball.ground && groundAt ? groundAt(x, z) : null;
  return [x, Number.isFinite(ground) ? ground + BALL.height : ball.origin[1], z];
}

/** Flat distance from point p to the segment a-b (x/z only). */
export function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + dx * t), p[2] - (a[2] + dz * t));
}

/**
 * One step of a frisbee's chase: turn towards the target (at most turnRate), fly on, and ease its
 * height towards the target's.  f = { position: [x, y, z], yaw }; target = [x, y, z] or null (no
 * target: it flies straight).  Returns the new { position, yaw }.
 */
export function stepFrisbee(f, target, dt) {
  let yaw = f.yaw, y = f.position[1];
  if (target) {
    const want = Math.atan2(target[0] - f.position[0], target[2] - f.position[2]);
    const turn = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
    yaw += Math.max(-FRISBEE.turnRate * dt, Math.min(FRISBEE.turnRate * dt, turn));
    y += (target[1] + FRISBEE.height - y) * Math.min(1, FRISBEE.climbRate * dt);
  }
  const d = FRISBEE.speed * dt;
  return { position: [f.position[0] + Math.sin(yaw) * d, y, f.position[2] + Math.cos(yaw) * d], yaw };
}

/** Does a frisbee at `position` hit a dog standing at `dog` ([x, y, z] of its feet)? */
export function frisbeeHits(position, dog) {
  return Math.hypot(position[0] - dog[0], position[2] - dog[2]) <= FRISBEE.radius
    && Math.abs(position[1] - (dog[1] + FRISBEE.height)) <= 2.5;
}
