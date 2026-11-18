// Special abilities: each dog's own move, from a rare Treat Box item ("special").  The rules, shared by
// the server (which decides), the game (which draws and moves its own dog) and the tests.
//
//   Ralph  — Rocket Paws:    fire out of all four paws; for 15 seconds he flies over everyone, fast, and nothing can hit him
//   Pablo  — Pack Rush:      two friends and a sled; 10 seconds of fast, steerable ride that knocks over any dog it runs into
//   Meela  — Zoomies:        5 seconds of low whirling spin with a wide reach; knocks over any dog she spins into
//   Pippa  — Pheasant Flush: one pheasant for every other dog, ahead or behind; each flies its dog down and knocks it over
//   Poppy  — Surf's Up:      belly-flops onto her own wave: the fastest of the lot, but it steers itself for five
//                            seconds, so it only hits who happens to be in the way
//
// The dog in first place never gets one; for everyone else the chance rises the further back they are.
// Nothing knocks a dog out of its special: while it lasts, whatever is thrown, dropped or driven at
// the dog (another dog's special included) bounces off.  A fall or a catapult still ends it.

export const SPECIAL_ITEM = 'special';

export const SPECIALS = {
  ralph: { kind: 'jet', name: 'Rocket Paws', durationMs: 15000, speed: 1.5, flyHeight: 3.2, immune: true },
  pablo: { kind: 'sled', name: 'Pack Rush', durationMs: 10000, speed: 1.65, hitRadius: 2.2, reach: 6 },
  second_dog: { kind: 'zoomies', name: 'Zoomies', durationMs: 5000, speed: 1.35, hitRadius: 3.0, reach: 0 },
  gsp: { kind: 'flush', name: 'Pheasant Flush', durationMs: 900 },
  black_lab: { kind: 'wave', name: 'Surf’s Up', durationMs: 5000, speed: 1.9, hitRadius: 2.8, reach: 2, steerLocked: true },
};

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

export function specialFor(dog) {
  return SPECIALS[dog] ?? null;
}

/**
 * Does a dog using a ramming special (sled, zoomies, wave) touch another dog?  The special reaches
 * from the user's middle to `reach` ahead of it (Pablo's team runs in front of him), `hitRadius` wide.
 * owner/other: [x, y, z] of their feet; rotationY: the way the user faces.
 */
export function specialTouches(spec, ownerPosition, rotationY, otherPosition) {
  if (!spec?.hitRadius) return false;
  if (Math.abs(otherPosition[1] - ownerPosition[1]) > SPECIAL_HIT.clearHeight) return false;
  const fx = Math.sin(rotationY), fz = Math.cos(rotationY);
  const dx = otherPosition[0] - ownerPosition[0], dz = otherPosition[2] - ownerPosition[2];
  const along = Math.max(0, Math.min(spec.reach ?? 0, dx * fx + dz * fz));
  return Math.hypot(dx - fx * along, dz - fz * along) <= spec.hitRadius;
}

/** How long one of Pippa's pheasants takes to reach a dog `distance` away. */
export function pheasantFlightMs(distance) {
  return Math.round(Math.max(PHEASANT.minFlightMs, Math.min(PHEASANT.maxFlightMs, 500 + distance / PHEASANT.speed * 1000)));
}
