// How a dog steers, strides and jumps: the tuning numbers the race was balanced around

// ---------------------------------
// HANDLING
// ---------------------------------
// How a dog steers.  A dog at full stretch cannot spin on the spot: it
// carves an arc, leans and bends into it, and has to ease off to turn tight.

export const HANDLING = {
  turnRateSlow: 2.6,    // turning speed at a walk or trot (radians per second)
  turnRateSprint: 1.5,  // turning speed flat out: lower = wider arcs
  steerResponse: 5,     // how quickly a turn builds and fades: lower = heavier
  turnSpeedLoss: 0.22,  // share of top speed lost while turning hard at a sprint
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

// The rigs' sideways bone axis points so that a negative turn bends the body left
export const BEND_SIGN = -1;

// Bones that curve into a turn, and how much each one takes
export const BEND_BONES = [
  ['spine1', 0.6],
  ['spine2', 0.8],
  ['chest', 0.8],
  ['neck1', 1.1],
  ['neck2', 1.1],
  ['head', 0.9],
  ['hips', 0.7],
  ['tail1', 1.4],
  ['tail2', 1.2],
  ['tail3', 1.0]
];

export const TOTAL_LAPS = 3;

export const GAITS = new Set(['Walk', 'Trot', 'Run', 'Sprint']);

// Above this speed a jump is a running leap: no crouch first, no pause after
export const RUNNING_JUMP_SPEED = 3.0;
