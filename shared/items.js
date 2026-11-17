// Items from Treat Boxes: the rules and the geometry, shared by the server (which decides), the game
// (which draws) and the tests.
//
//   ball  — tennis ball thrown straight ahead; knocks over the first dog it reaches
//   toy   — rubber chew toy dropped behind you; stays on the road until a dog runs into it, then it is gone
//   bone  — golden bone: a speed boost for the dog that uses it
//
// A dog holds one item at a time.  Running through a box while holding one still takes the box,
// but gives nothing; a new item can only come after the held one is used.

export const ITEM_IDS = ['ball', 'toy', 'bone'];

export const ITEM_NAMES = { ball: 'Tennis Ball', toy: 'Chew Toy', bone: 'Golden Bone' };

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

export const HIT = {
  ballStunMs: 1100,     // how long a hit dog is knocked about
  toyStunMs: 1500,
  immuneMs: 1500,       // a hit dog cannot be hit again for this long
};

/** Which items a dog can be given, from its place in the race. */
export function itemChoices(place, racers) {
  if (place === 1 || racers <= 1) return ['ball', 'toy'];   // the leader (or a solo racer): no speed boost
  if (place >= racers) return ['ball', 'bone'];             // last place: no chew toys
  return ITEM_IDS;
}

export function rollItem(place, racers, random = Math.random) {
  const choices = itemChoices(place, racers);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}

export function forwardOf(rotationY) {
  return [Math.sin(rotationY), 0, Math.cos(rotationY)];
}

/** Where a thrown ball is, t seconds after the throw. */
export function ballPositionAt(ball, t) {
  const d = Math.max(0, Math.min(t, BALL.duration)) * BALL.speed;
  return [ball.origin[0] + ball.direction[0] * d, ball.origin[1], ball.origin[2] + ball.direction[2] * d];
}

/** Flat distance from point p to the segment a-b (x/z only). */
export function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + dx * t), p[2] - (a[2] + dz * t));
}
