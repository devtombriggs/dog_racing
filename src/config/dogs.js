// The dogs: who they are, how they are rated and what each rating does to their handling
import * as THREE from 'three';

export const DOGS = {
  gsp: {
    name: 'Pippa (German Shorthaired Pointer)',
    displayName: 'Pippa',
    breed: 'German Shorthaired Pointer',
    portrait: '/portraits/pippa.png?v=2',
    accent: '#ff72dd',
    model: '/models/gsp_female.glb',
    stats: { speed: 8, acceleration: 8, agility: 7, swimming: 6 },
    scale: 3,
    // Speed (model metres per second) at which each stride plays at its
    // natural rhythm: the top of the speed band that stride is used in
    // Ground speed (model metres per second) of each captured stride: at
    // this speed the paws neither slip nor skate (gsp_female/clip_info.json)
    gaitSpeed: {
      Walk: 1.23,
      Trot: 2.09,
      Run: 3.66,
      Sprint: 5.7
    }
  },
  second_dog: {
    name: 'Meela (Greyhound)',
    displayName: 'Meela',
    breed: 'Greyhound',
    portrait: '/portraits/meela.png?v=2',
    accent: '#cf88ff',
    model: '/models/meela_greyhound.glb',
    stats: { speed: 10, acceleration: 9, agility: 5, swimming: 4 },
    scale: 3,
    // meela_greyhound/clip_info.json
    gaitSpeed: {
      Walk: 1.52,
      Trot: 2.587,
      Run: 3.9,
      Sprint: 5.5
    }
  },
  black_lab: {
    name: 'Poppy (Black Labrador)',
    displayName: 'Poppy',
    breed: 'Black Labrador',
    portrait: '/portraits/poppy.png?v=2',
    accent: '#55aaff',
    model: '/models/black_lab.glb',
    stats: { speed: 7, acceleration: 7, agility: 8, swimming: 10 },
    scale: 3,
    // black_lab/clip_info.json
    gaitSpeed: {
      Walk: 1.21,
      Trot: 2.05,
      Run: 3.6,
      Sprint: 5.6
    }
  },
  pablo: {
    name: 'Pablo (Alaskan Klee Kai)',
    displayName: 'Pablo',
    breed: 'Alaskan Klee Kai',
    portrait: '/portraits/pablo.png?v=2',
    accent: '#63efff',
    model: '/models/pablo.glb',
    stats: { speed: 7, acceleration: 9, agility: 10, swimming: 5 },
    scale: 3,
    size: 0.7,
    strideBands: 0.7,
    maxStrideRate: 1.6,
    cameraOffset: [0, 3.1, -6.4],
    cameraLookHeight: 1.3,
    // pablo_klee_kai/clip_info.json (exported at 70% of the build frame)
    gaitSpeed: {
      Walk: 0.844,
      Trot: 1.436,
      Run: 2.518,
      Sprint: 3.919
    }
  },
  ralph: {
    name: 'Ralph (Dachshund)',
    displayName: 'Ralph',
    breed: 'Dachshund',
    portrait: '/portraits/ralph.png?v=2',
    accent: '#ffad57',
    model: '/models/ralph.glb',
    stats: { speed: 6, acceleration: 10, agility: 9, swimming: 4 },
    scale: 3,
    // A dachshund stands about a third as tall as the pointer.  `size`
    // scales the collision rays (so he fits the small-dog tunnel), and the
    // speeds at which he changes stride: short legs break into a gallop
    // much sooner.  His legs also turn over faster than a big dog's can.
    size: 0.45,
    strideBands: 0.5,
    maxStrideRate: 2.0,
    cameraOffset: [0, 2.6, -5.6],
    cameraLookHeight: 0.9,
    // ralph_dachshund/clip_info.json
    gaitSpeed: {
      Walk: 0.39,
      Trot: 0.66,
      Run: 1.16,
      Sprint: 1.8
    }
  }
};

// ---------------------------------
// DOG STATS
// ---------------------------------
// Each dog is rated 1 to 10 (see `stats` in DOGS).  A 7 is the handling the
// game was tuned around; every point above or below changes it by the share
// given here.  Raise a share to make the dogs feel more different.

export const STAT_EFFECT = {
  speed: 0.06,         // top speed per point
  acceleration: 0.1,   // how quickly speed builds per point
  agilityTurn: 0.14,   // turning speed flat out per point
  agilityTurnSlow: 0.06, // ...and at a walk or trot
  agilityGrip: 0.2     // how tightly travel follows the nose per point: lower drifts wide
};

// Water slows a dog to this share of its top speed: a 4 or below is slowed
// more than by off-track ground, a 10 swims at close to full speed
export const WATER_SPEED = [0.4, 0.95];
export const WATER_ACCELERATION = [0.5, 1];

// One colour per seat in a game (the server gives each player a `slot`)
export const PLAYER_COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#b197fc', '#63e6be'];

export function playerColor(player) {
  return PLAYER_COLORS[(player?.slot ?? 0) % PLAYER_COLORS.length];
}

export const STAT_LABELS = [
  ['speed', 'Speed'],
  ['acceleration', 'Accel'],
  ['agility', 'Agility'],
  ['swimming', 'Swim']
];

export function statScale(value, perPoint) {
  return Math.max(0.4, 1 + ((value ?? 7) - 7) * perPoint);
}

export function swimShare(swimming, [poor, strong]) {
  return THREE.MathUtils.lerp(
    poor,
    strong,
    THREE.MathUtils.clamp(((swimming ?? 4) - 4) / 6, 0, 1)
  );
}
