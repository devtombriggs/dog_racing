// How a dog steers, runs and jumps: the numbers the race was balanced around.  Shared by the game
// (which moves the player's own dog) and the server (which drives the computer-controlled dogs).

// ---------------------------------
// HANDLING
// ---------------------------------
// How a dog steers.  A dog at full stretch cannot spin on the spot: it
// carves an arc, leans and bends into it, and has to ease off to turn tight.

export const HANDLING = {
  turnRateSlow: 2.6,    // turning speed at a walk or trot (radians per second)
  turnRateSprint: 1.5,  // turning speed flat out: lower = wider arcs
  steerResponse: 5,     // how quickly a turn builds and fades: lower = heavier
  turnSpeedLoss: 0.3,   // share of top speed lost while turning hard at a sprint (a dog of agility 7: shared/dogStats.js)
  topEndAcceleration: 0.3, // share of its acceleration a dog still has flat out: the last of its speed comes slowly,
                        // so speed lost in a turn takes time to win back (agility 7; more for an agile dog)
  gripSlow: 16,         // how tightly travel follows the nose at low speed
  gripSprint: 5,        // ...and flat out: lower = more drift through a turn
  lean: 0.2,            // body roll into a turn (radians)
  bend: 0.07,           // how far the spine, neck and tail curve into a turn
  fullSteerSpeed: 4,    // below this speed the dog turns less...
  pivotSteer: 0.6,      // ...but never less than this share: it can turn on the spot, so a dog stuck
                        // nose-first against something can turn away without having to move forward
  // Which stride is used at which speed.  These follow a real dog: walk to
  // about 1.5 m/s, trot to about 2.8, canter to about 4.5, then gallop
  // (multiplied by the dogs' scale of 3)
  hillEffect: 0.9,      // how much a slope changes top speed (0 = hills are free)
  walkBelow: 4.6,
  trotBelow: 8.5,
  runBelow: 13.5
};

// Running into a wall (a barrier, a bank, a pillar: anything that stops a dog dead at the edge of the road, where
// there is no soft ground to slow it first).  It costs speed at once, more the squarer the hit, and a dog
// scraping along one is held well under its pace.  It also ends a skid, with nothing for it.
export const WALL = {
  glance: 0.2,       // share of its speed lost touching a wall at a shallow angle...
  square: 0.75,      // ...and running straight into one
  scrape: 0.7,       // share of its top speed it can hold while it is against one
  again: 0.5,        // seconds after a hit before another counts as a new hit
  pinned: 2,         // a dog with its nose against a wall is brought down to this speed (m/s)...
  pinnedBraking: 80, // ...this quickly (m/s², at dead square on)
  softBelow: 0.9,    // ground that already slows a dog to under this share is the penalty there: the wall adds none
};
/** The speed a dog keeps hitting a wall.  squareness: 0 brushing along it, 1 straight into it */
export function speedAfterWall(speed, squareness) {
  const s = Math.max(0, Math.min(1, squareness));
  return speed * (1 - (WALL.glance + (WALL.square - WALL.glance) * s));
}

// A jump: up at `force`, pulled down by `gravity` (about 1.5 m high and 0.9 s in the air)
export const JUMP = { force: 7, gravity: 16 };
// On Frostpeak's black run a normal jump at full speed sails 25 m down the mountain: there the
// dog does a short, snappy hop instead: about 2 m high (clears the padded slalom gates, solid to
// 1.7 m; the snowmen are too tall and must be steered round) and 0.6 s in the air
export const STEEP_JUMP = { force: 12.9, gravity: 41.6, below: -0.12 };
// Where the road drops away under a dog by more than `from` metres at once (shared/trackKit.js `drops`) it falls, this fast
export const DROP = { from: 2.5, gravity: 26 };
