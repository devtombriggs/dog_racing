// The dogs' ratings and what each point of a rating does to their handling.  Shared by the game
// (src/config/dogs.js adds the models, portraits and strides) and the server, which drives the
// computer-controlled dogs with the same numbers a player's dog runs on.

// Each dog is rated 1 to 10.  A 7 is the handling the game was tuned around.
// drift: how good a drifter (shared/drift.js): roughly the reverse of speed, so the slow dogs make their time in the corners
// downhill: the Speed a dog runs on where the road drops (Jimmy on his wheels: downhillSpeed below); most dogs have none
export const DOG_STATS = {
  gsp: { speed: 7.5, acceleration: 7, agility: 7, swimming: 6, drift: 6 },         // Pippa: the all-rounder (second fastest, nothing below 6; Tom, 2026-11-21: 8 ran away with it)
  second_dog: { speed: 9, acceleration: 5, agility: 5, swimming: 4, drift: 4 },    // Meela (her card says 10 for speed: DOG_STATS_SHOWN)
  black_lab: { speed: 7, acceleration: 7, agility: 8, swimming: 10, drift: 7 },    // Poppy
  pablo: { speed: 6, acceleration: 9, agility: 10, swimming: 5, drift: 9 },
  ralph: { speed: 5, acceleration: 10, agility: 9, swimming: 4, drift: 10 },
  enzo: { speed: 6, acceleration: 6, agility: 8, swimming: 4, drift: 9 },
  rocky: { speed: 7, acceleration: 7, agility: 10, swimming: 6, drift: 7 },
  kombu: { speed: 7, acceleration: 8, agility: 9, swimming: 4, drift: 7 },         // (his special is a strong one)
  jazz: { speed: 6.5, acceleration: 9, agility: 10, swimming: 5.5, drift: 8 },         // the Great Dane: Pablo, and a shade better
  baz_naz: { speed: 6, acceleration: 8.5, agility: 9.5, swimming: 5, drift: 9 },       // Baz and Naz, the pug twins: Pablo's speed and swimming, just under him on the rest
  casper: { speed: 6, acceleration: 8.5, agility: 9.5, swimming: 4.5, drift: 8.5 },    // the Patterdale terrier: Pablo, a little less of everything but speed
  // The three dogs from the Shop (Tom, 2026-11-26).  None is better than the free dogs, only different:
  ziggy: { speed: 8.5, acceleration: 7, agility: 6, swimming: 3, drift: 4.5 },          // the whippet: nearly Meela's speed, quicker off the mark, and no swimmer
  barney: { speed: 5.5, acceleration: 10, agility: 9, swimming: 4.5, drift: 9.5 },      // the basset hound: Ralph, a shade better ("similar stats to ralph just slightly better")
  merlin: { speed: 6.5, acceleration: 8, agility: 9, swimming: 5, drift: 8 },           // the Brussels griffon: his card's 7 / 8 / 9, with Jazz's speed
  jimmy: { speed: 4.5, acceleration: 9, agility: 8.5, swimming: 4, drift: 10, downhill: 9 },   // the Chinese crested in his wheel cart: the slowest dog (under Ralph all round), but Meela's speed downhill
};

// What a dog's card says where that is not the number it runs on: Meela is shown as a 10 for speed, and runs as a 9
export const DOG_STATS_SHOWN = { second_dog: { speed: 10 } };
/** the rating written on a dog's card */
export const shownStat = (dogId, key) => DOG_STATS_SHOWN[dogId]?.[key] ?? DOG_STATS[dogId]?.[key];

export const DOG_NAMES = { gsp: 'Pippa', second_dog: 'Meela', black_lab: 'Poppy', pablo: 'Pablo', ralph: 'Ralph', kombu: 'Kombu', rocky: 'Rocky', enzo: 'Enzo', baz_naz: 'Baz & Naz', jazz: 'Jazz', casper: 'Casper', jimmy: 'Jimmy',
  ziggy: 'Ziggy', barney: 'Barney', merlin: 'Merlin' };          // (the Shop's three: names of mine, Tom to change if he likes)

// A short-legged dog changes stride (walk, trot, run, sprint) at lower speeds: its share of the big dogs' speeds
export const DOG_STRIDE_BANDS = { pablo: 0.7, ralph: 0.5, baz_naz: 0.6, casper: 0.7, jimmy: 0.62, barney: 0.55, merlin: 0.62 };

// Every point above or below 7 changes the handling by the share given here.  Raise a share to make
// the dogs feel more different.
export const STAT_EFFECT = {
  speed: 0.06,         // top speed per point
  acceleration: 0.1,   // how quickly speed builds per point
  agilityTurn: 0.14,   // turning speed flat out per point
  agilityTurnSlow: 0.06, // ...and at a walk or trot
  agilityGrip: 0.2,    // how tightly travel follows the nose per point: lower drifts wide
  agilityTurnLoss: 0.2, // speed lost in a turn per point: a less agile dog loses more
  agilityPickup: 0.2   // how quickly the last of its speed comes per point: an agile dog is back up to speed sooner
};

/** The share of top speed a dog loses turning hard at a sprint (HANDLING.turnSpeedLoss, by its agility). */
export function turnSpeedLoss(agility, base) {
  return base * statScale(14 - (agility ?? 7), STAT_EFFECT.agilityTurnLoss);
}

/**
 * How much of its acceleration a dog has at `effort` (0 at an easy run, 1 flat out): speed comes
 * quickly at first and the last of it slowly, more slowly for a less agile dog.  (base: HANDLING.topEndAcceleration)
 */
export function pickupShare(agility, base, effort) {
  const flatOut = Math.min(1, base * statScale(agility, STAT_EFFECT.agilityPickup));
  return 1 + (flatOut - 1) * Math.max(0, Math.min(1, effort));
}

export function statScale(value, perPoint) {
  return Math.max(0.4, 1 + ((value ?? 7) - 7) * perPoint);
}

// Downhill (a dog with a `downhill` rating: Jimmy, whose wheels run away with him).  Where the road drops, his top
// speed is that of a dog with that Speed, times `boost`: none of it on the level, all of it once the road falls `full` in every
// metre, and in between in proportion.  `slope` is the rise per metre forward under the dog (minus is downhill).
// boost: and that much faster again (Tom, 2026-11-21: Meela's speed and a boost on top, fire from his wheels)
export const DOWNHILL = { from: 0.015, full: 0.09, boost: 1.15 };

/** How much of its downhill speed a dog has on this slope: 0 (none, or level, or a climb) to 1 (all of it) */
export function downhillShare(stats, slope) {
  if (!stats?.downhill || !(slope < -DOWNHILL.from)) return 0;
  return Math.min(1, (-slope - DOWNHILL.from) / (DOWNHILL.full - DOWNHILL.from));
}

/** How much faster than its own top speed a dog is on this slope: 1 for a dog with no `downhill`, or on the level or a climb */
export function downhillSpeed(stats, slope) {
  const share = downhillShare(stats, slope);
  if (!share) return 1;
  return 1 + (DOWNHILL.boost * statScale(stats.downhill, STAT_EFFECT.speed) / statScale(stats.speed, STAT_EFFECT.speed) - 1) * share;
}

// In the water (every map): the share of its own top speed a dog keeps, from its Swim rating.  Tom, 2026-11-21: Poppy
// (10) was unplayable at 100 %, and the rest crawled at under half: now she keeps 90 % and a 4 keeps 60 %, a point
// of Swim worth `perPoint` in between.  It is the same however deep the water: wading is swimming
export const SWIM = { worst: 0.6, perPoint: 0.06, best: 0.9 };

/** Share of its top speed a dog keeps in water, from its Swim rating (1 to 10) */
export function swimSpeed(swimming = 4) {
  return Math.min(SWIM.best, Math.max(SWIM.worst, SWIM.worst + SWIM.perPoint * (swimming - 4)));
}

// Real dog speeds at the dogs' scale of 3 (an easy canter and a gallop) and how fast speed builds,
// before each dog's own stats
export const BASE_SPEED = { run: 11, sprint: 17, acceleration: 14 };
