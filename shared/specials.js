// Special abilities: each dog's own move, from a rare Treat Box item ("special").  The rules, shared by
// the server (which decides), the game (which draws and moves its own dog) and the tests.
//
//   Ralph  — Rocket Paws:    fire out of all four paws; for 15 seconds he flies over everyone, fast, and nothing can hit him
//   Pablo  — Pack Rush:      two friends and a sled; 10 seconds of fast, steerable ride that knocks over any dog it runs into
//   Meela  — Zoomies:        5 seconds of low whirling spin with a wide reach; knocks over any dog she spins into
//   Pippa  — Pheasant Flush: one pheasant for every other dog, ahead or behind; each flies its dog down and knocks it over
//   Enzo   — Belly Bounce:   ten seconds of bounding up the road on his belly, a burst of speed on every bounce, squashing any dog he lands on
//   Rocky  — Sheep Stampede: five sheep charge up the road, each knocking over the first dog it reaches
//   Kombu  — Kelp Dive:      seaweed pulls him under and puts him down further up the road: further the further back he is
//   Baz & Naz — Trip Wire:   the twins run out to the two edges of the road with their rope tight between them, faster, straight
//                            through whatever is standing in the way; any dog the rope reaches is tripped unless it jumps it
//   Jazz   — Earthquake:     one great stomp shakes the whole map: every other dog, however far off, can barely move for five seconds
//   Casper — Try Time:       on with his rugby shirt and up on his back legs, the ball in his front paws: six seconds flat out,
//                            knocking over any dog in his way; then he dives back on to all fours and the ball flies up the
//                            road at the dog in first place, knocking over any dog it passes
//   Jimmy  — Dragon Dance:   turns into a dragon, much faster, and sends fireworks up the road after the leader, two seconds
//                            apart: five of them and seven seconds from last place, one fewer and a second less for each place
//                            nearer the front
//   Poppy  — Surf's Up:      belly-flops onto her own wave: the fastest of the lot, but it steers itself for five
//                            seconds, so it only hits who happens to be in the way
//
// The dog in first place never gets one; for everyone else the chance rises the further back they are.
// Nothing knocks a dog out of its special: while it lasts, whatever is thrown, dropped or driven at
// the dog (another dog's special included) bounces off.  A fall or a catapult still ends it.

import { BASE_SPEED, DOG_STATS, STAT_EFFECT, statScale } from './dogStats.js';

export const SPECIAL_ITEM = 'special';

export const SPECIALS = {
  // Ralph flies for `durationMs` from last place, and `lessPerPlaceMs` less for every place nearer the front
  // (of six: 15, 13.5, 12, 10.5 and 9 seconds from 2nd): specialDurationMs below
  ralph: { kind: 'jet', name: 'Rocket Paws', durationMs: 15000, lessPerPlaceMs: 1500, speed: 1.5, flyHeight: 3.2, immune: true },
  pablo: { kind: 'sled', name: 'Pack Rush', durationMs: 10000, speed: 1.65, hitRadius: 2.2, reach: 6 },
  second_dog: { kind: 'zoomies', name: 'Zoomies', durationMs: 5000, speed: 1.35, hitRadius: 3.0, reach: 0 },
  gsp: { kind: 'flush', name: 'Pheasant Flush', durationMs: 900 },
  // Enzo bounds up the road on his belly: each bounce starts with a burst of speed (bounce.kick on top of
  // `speed`, fading through the bounce), and any dog he comes down on is squashed (`landing`: he has to be
  // this close to the ground to squash one; a dog he is sailing over is safe)
  enzo: { kind: 'bounce', name: 'Belly Bounce', durationMs: 10000, speed: 1.3, hitRadius: 2.6, reach: 1.5, landing: 0.9,
    bounce: { height: 2.4, seconds: 0.85, kick: 0.45 } },
  // (Rocky's is a flock the server runs up the road: SHEEP below has the rules)
  rocky: { kind: 'sheep', name: 'Sheep Stampede', durationMs: 10000 },
  // (Kombu's is over in a moment: the server moves him; shared/specials.js KELP has the rules)
  kombu: { kind: 'kelp', name: 'Kelp Dive', durationMs: 1100 },
  // Baz and Naz: the rope is `rope.reach` thick up and down the road and as wide as the road is; a dog more than
  // `rope.clear` above it has jumped it.  ghost: whatever stands on the road does not stop them (the walls still do).
  // Like Poppy's wave it steers itself (Tom, 2026-11-21), but straight up the middle of the road (`wander` 0), so the
  // rope reaches both edges and they come out of it in the middle
  baz_naz: { kind: 'rope', name: 'Trip Wire', durationMs: 6000, speed: 1.4, ghost: true, steerLocked: true, wander: 0, rope: { reach: 1.4, clear: 0.9, edge: 0.9, span: 14 } },
  // Jazz: over in a moment for her (the stomp); QUAKE below has what it does to everyone else
  jazz: { kind: 'quake', name: 'Earthquake', durationMs: 900 },
  // Casper charges for `durationMs`, knocking over any dog he runs into (`hitRadius` round him, `reach` in front); when
  // the time is up (`pass`) the ball goes up the road after the leader: a Treat Box firework in every way but its looks
  // (shared/firework.js), so it knocks over any dog it passes on the way.  If Casper is leading, it has nobody to go for
  casper: { kind: 'rugby', name: 'Try Time', durationMs: 6000, speed: 1.5, hitRadius: 2.0, reach: 1.5, pass: true },
  // (steerLocked: the special steers the dog up the road by itself, weaving `wander` of the half width to each side)
  // Jimmy: a dragon for `durationMs` from last place (far enough at this speed to cover what Poppy's wave covers), and
  // `lessPerPlaceMs` less for every place nearer the front; `fireworks`: how many he sends after the leader from last
  // place, how far apart, and how many fewer for each place nearer the front (dragonFireworks below).  They are the
  // Treat Box firework (shared/firework.js, FIREWORK in shared/items.js) in every way but who lights them
  jimmy: { kind: 'dragon', name: 'Dragon Dance', durationMs: 7000, lessPerPlaceMs: 1000, speed: 1.6, fireworks: { count: 5, everyMs: 2000, lessPerPlace: 1 } },
  black_lab: { kind: 'wave', name: 'Surf’s Up', durationMs: 5000, speed: 1.9, hitRadius: 2.8, reach: 2, steerLocked: true, wander: 0.5 },
};

// Kombu's Kelp Dive: seaweed comes up out of the ground, pulls him under, and puts him down further up
// the road.  How far goes by his place in the race: from last of six, as far as Poppy travels on her wave
// (her top speed, times the wave's, for as long as it lasts: about 160 m); a place nearer the front, a good
// deal less each time, down to under a third of it from 2nd (about 48 m), so that a Kombu who is already
// well up does not jump the whole field.  Whoever is in between is passed, the leader included.  He is
// put down on plain road (never in a jump, a pool or a hazard: a little short of it instead), and on the
// last lap never nearer the finish than `beforeFinish`.
const wave = SPECIALS.black_lab;
export const KELP = {
  seconds: 1.1,          // how long he is under
  distance: BASE_SPEED.sprint * statScale(DOG_STATS.black_lab.speed, STAT_EFFECT.speed) * wave.speed * wave.durationMs / 1000,
  fromSecond: 0.3,       // the share of that distance he goes from 2nd place...
  perPlace: 0.175,       // ...and how much more of it for each place further back (all of it from 6th)
  beforeFinish: 20,      // metres short of the finish line he stops, on the last lap
  worthIt: 5,            // if it would move him on less than this he is not moved (he gets a golden bone's dash instead)
  boostSeconds: 1.0, speedMultiplier: 1.2,     // the dash he comes up with
};

/** How far up the road the Kelp Dive takes Kombu from this place in the race (1 = leading) */
export function kelpDistance(place) {
  return KELP.distance * Math.max(KELP.fromSecond, Math.min(1, KELP.fromSecond + KELP.perPlace * (place - 2)));
}

// Rocky's Sheep Stampede: five sheep set off up the road from just in front of him, side by side
// around where he is on the road, faster than any dog, each veering towards the nearest dog in front of
// it.  Each knocks over the first dog it reaches (never Rocky) and is gone; any that reach nobody are gone after ten seconds.  They clear chew toys out of
// their way.  Rocky himself carries on as he was: the special does nothing to him.
export const SHEEP = {
  count: 5,
  seconds: 10,
  speed: 27,             // m/s (a sprinting dog does about 17)
  ahead: 3,              // metres in front of Rocky that they start
  spacing: 1.5,          // metres between one sheep and the next, across the road
  stagger: 1.2,          // ...and how far the outer ones start behind the middle one
  edge: 0.8,             // how close to the edge of the road they will run
  sees: 35,              // a sheep goes for the nearest dog this far up the road in front of it...
  steer: 4.5,            // ...moving across the road towards it at this many m/s
  hitRadius: 1.5, hitHeight: 1.7,      // a dog this close is hit (one jumping clean over is not)
  tickMs: 50,
};

// Jazz's Earthquake: she rears and stomps, and the ground shakes right round the map.  Every other dog still racing
// keeps only `speed` of its pace for `seconds`, wherever it is, and whether or not it is in the middle of its own
// special (Enzo bouncing, Pablo on his sled: all of them have paws on the ground).  Not a dog that is off the ground
// or out of reach: Ralph flying, one under a golden collar's shield, one down a burrow or under the kelp.  Jazz
// herself runs on as she was.
export const QUAKE = {
  seconds: 5,            // the longest any dog is slowed (the leader)
  // how long each place is slowed, from 1st (Tom, 2026-11-21: a dog well back and trying to catch up is not held as long);
  // 7th and further back get the last of them
  secondsByPlace: [5, 4, 3, 2.5, 2, 1],
  speed: 0.25,           // the share of its speed a shaken dog keeps
  stompAt: 0.45,         // seconds into her stomp that her paws come down (when the ring goes out and the screen shakes)
  stompSeconds: 0.9,
};

/** How long Jazz's Earthquake slows the dog in `place` (1 = leading), whatever place Jazz is in */
export function quakeSeconds(place) {
  const byPlace = QUAKE.secondsByPlace;
  return byPlace[Math.min(Math.max(1, place ?? 1), byPlace.length) - 1];
}

/** Enzo's Belly Bounce at `seconds` since it began: { height (m off the ground), speed (multiplier) } */
export function bellyBounce(spec, seconds) {
  const b = spec.bounce, phase = (seconds % b.seconds) / b.seconds;
  return { height: b.height * 4 * phase * (1 - phase), speed: spec.speed * (1 + b.kick * (1 - phase)), phase };
}

export const SPECIAL_HIT = {
  stunMs: 1300,         // how long a dog hit by a special is knocked about
  clearHeight: 3,       // a dog this far above or below the special is not touched
};

// Pippa's birds: the server times each one (it knows where every dog is) and says when it lands
export const PHEASANT = {
  speed: 46,            // game units a second, about 2.7x a sprinting dog
  minFlightMs: 900,     // even the nearest dog gets to see it coming
  maxFlightMs: 4000,
};

/**
 * The chance that a Treat Box gives the special instead of an ordinary item, by place in the race.
 * First place (and a solo racer, who is first) never gets it.  2nd gets 10 %, rising evenly to 30 %
 * for last; with only two racers the one behind is last: 30 %.
 *   e.g. 5 racers: 0, 10, 17, 23, 30 %.
 */
export function specialChance(place, racers) {
  if (place <= 1 || racers <= 1) return 0;
  const behind = racers <= 2 ? 1 : Math.min(1, (place - 2) / (racers - 2));
  return 0.1 + 0.2 * behind;
}

/**
 * How long a dog's special lasts, used from this place (1 = leading) in a race of this many dogs: all of
 * `durationMs` from last, and for a special with `lessPerPlaceMs` (Ralph's) that much less for each place
 * nearer the front.
 */
export function specialDurationMs(spec, place, racers) {
  return spec.lessPerPlaceMs ? Math.max(3000, spec.durationMs - spec.lessPerPlaceMs * Math.max(0, racers - place)) : spec.durationMs;
}

/** How many fireworks Jimmy's Dragon Dance sends, used from this place (1 = leading) in a race of this many dogs: never fewer than one */
export function dragonFireworks(spec, place, racers) {
  return spec?.fireworks ? Math.max(1, spec.fireworks.count - spec.fireworks.lessPerPlace * Math.max(0, racers - place)) : 0;
}

export function specialFor(dog) {
  return SPECIALS[dog] ?? null;
}

/**
 * Does a dog using a ramming special (sled, zoomies, wave) touch another dog?  The special reaches
 * from the user's middle to `reach` ahead of it (Pablo's team runs in front of him), `hitRadius` wide.
 * owner/other: [x, y, z] of their feet; rotationY: the way the user faces.
 */
export function specialTouches(spec, ownerPosition, rotationY, otherPosition) {
  if (spec?.rope) {
    // (the twins' rope, without knowing the road: straight out to both sides of them, `span` each way)
    const dy = otherPosition[1] - ownerPosition[1];
    if (dy > spec.rope.clear || dy < -SPECIAL_HIT.clearHeight) return false;
    const fx = Math.sin(rotationY), fz = Math.cos(rotationY), dx = otherPosition[0] - ownerPosition[0], dz = otherPosition[2] - ownerPosition[2];
    return Math.abs(dx * fx + dz * fz) <= spec.rope.reach && Math.abs(dx * fz - dz * fx) <= spec.rope.span;
  }
  if (!spec?.hitRadius) return false;
  if (Math.abs(otherPosition[1] - ownerPosition[1]) > SPECIAL_HIT.clearHeight) return false;
  if (spec.landing && ownerPosition[1] - otherPosition[1] > spec.landing) return false;      // (Enzo, still up in the air)
  const fx = Math.sin(rotationY), fz = Math.cos(rotationY);
  const dx = otherPosition[0] - ownerPosition[0], dz = otherPosition[2] - ownerPosition[2];
  const along = Math.max(0, Math.min(spec.reach ?? 0, dx * fx + dz * fz));
  return Math.hypot(dx - fx * along, dz - fz * along) <= spec.hitRadius;
}

/**
 * The twins' rope across a road: does it reach a dog?  Both are given as places on the road
 * ({ s: metres round the lap, y: height }); the rope is as wide as the road, so across does not come into it.
 */
export function ropeTrips(spec, owner, other, lapLength) {
  if (!spec?.rope) return false;
  const gap = Math.abs(other.s - owner.s) % lapLength, dy = other.y - owner.y;
  return Math.min(gap, lapLength - gap) <= spec.rope.reach && dy <= spec.rope.clear && dy >= -SPECIAL_HIT.clearHeight;
}

/** In a special that goes through things (`ghost`), is this block (a track's query) something on the road, not its edge? */
export function ghostsThrough(spec, ground) {
  return Boolean(spec?.ghost && ground?.blocked && Math.abs(ground.lateral) < ground.halfWidth - 1);
}

/** How long one of Pippa's pheasants takes to reach a dog `distance` away. */
export function pheasantFlightMs(distance) {
  return Math.round(Math.max(PHEASANT.minFlightMs, Math.min(PHEASANT.maxFlightMs, 500 + distance / PHEASANT.speed * 1000)));
}
