// The dogs' ratings and what each point of a rating does to their handling.  Shared by the game
// (src/config/dogs.js adds the models, portraits and strides) and the server, which drives the
// computer-controlled dogs with the same numbers a player's dog runs on.

// Each dog is rated 1 to 10.  A 7 is the handling the game was tuned around.
export const DOG_STATS = {
  gsp: { speed: 8, acceleration: 8, agility: 7, swimming: 6 },           // Pippa
  second_dog: { speed: 9, acceleration: 7, agility: 5, swimming: 4 },    // Meela
  black_lab: { speed: 7, acceleration: 7, agility: 8, swimming: 10 },    // Poppy
  pablo: { speed: 7, acceleration: 9, agility: 10, swimming: 5 },
  ralph: { speed: 6, acceleration: 10, agility: 9, swimming: 4 },
  rocky: { speed: 8, acceleration: 8, agility: 8, swimming: 6 },          // (Pippa's, with more agility)
  kombu: { speed: 7, acceleration: 8, agility: 9, swimming: 4 },         // (a shade under Pablo: his special is a strong one)
};

export const DOG_NAMES = { gsp: 'Pippa', second_dog: 'Meela', black_lab: 'Poppy', pablo: 'Pablo', ralph: 'Ralph', kombu: 'Kombu', rocky: 'Rocky' };

// A short-legged dog changes stride (walk, trot, run, sprint) at lower speeds: its share of the big dogs' speeds
export const DOG_STRIDE_BANDS = { pablo: 0.7, ralph: 0.5 };

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

// Real dog speeds at the dogs' scale of 3 (an easy canter and a gallop) and how fast speed builds,
// before each dog's own stats
export const BASE_SPEED = { run: 11, sprint: 17, acceleration: 14 };
