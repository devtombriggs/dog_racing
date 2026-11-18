// How a dog steers, strides and jumps: the tuning numbers the race was balanced around

// The steering and stride numbers are in shared/handling.js (the server drives the computer dogs with them)
export { HANDLING } from '../../shared/handling.js';

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
