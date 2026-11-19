// The dogs: who they are, how they are rated and what each rating does to their handling
import * as THREE from 'three';
import { DOG_STATS, DOG_NAMES, DOG_STRIDE_BANDS, STAT_EFFECT, statScale, turnSpeedLoss, pickupShare } from '../../shared/dogStats.js';

export { STAT_EFFECT, statScale, turnSpeedLoss, pickupShare };

export const DOGS = {
  gsp: {
    name: 'Pippa (German Shorthaired Pointer)',
    displayName: DOG_NAMES.gsp,
    breed: 'German Shorthaired Pointer',
    portrait: '/portraits/pippa.png?v=2',
    accent: '#ff72dd',
    model: '/models/gsp_female.glb',
    stats: DOG_STATS.gsp,
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
    displayName: DOG_NAMES.second_dog,
    breed: 'Greyhound',
    portrait: '/portraits/meela.png?v=2',
    accent: '#cf88ff',
    model: '/models/meela_greyhound.glb',
    stats: DOG_STATS.second_dog,
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
    displayName: DOG_NAMES.black_lab,
    breed: 'Black Labrador',
    portrait: '/portraits/poppy.png?v=2',
    accent: '#55aaff',
    model: '/models/black_lab.glb',
    stats: DOG_STATS.black_lab,
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
    displayName: DOG_NAMES.pablo,
    breed: 'Alaskan Klee Kai',
    portrait: '/portraits/pablo.png?v=2',
    accent: '#63efff',
    model: '/models/pablo.glb',
    stats: DOG_STATS.pablo,
    scale: 3,
    size: 0.7,
    strideBands: DOG_STRIDE_BANDS.pablo,
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
  enzo: {
    name: 'Enzo (XL Bully)',
    displayName: DOG_NAMES.enzo,
    breed: 'XL Bully',
    portrait: '/portraits/enzo.png',
    accent: '#ff8a1f',
    model: '/models/enzo.glb',
    stats: DOG_STATS.enzo,
    // (enzo_bully/create_enzo.py: the Labrador's frame, a great deal wider)
    scale: 2.8,
    size: 1.05,
    // enzo_bully/clip_info.json (Poppy's captured strides, with his roll from side to side)
    gaitSpeed: {
      Walk: 1.205,
      Trot: 2.051,
      Run: 3.597,
      Sprint: 5.598
    }
  },
  rocky: {
    name: 'Rocky (Border Collie)',
    displayName: DOG_NAMES.rocky,
    breed: 'Border Collie',
    portrait: '/portraits/rocky.png',
    accent: '#3ddc4a',
    model: '/models/rocky.glb',
    stats: DOG_STATS.rocky,
    // (rocky_collie/create_rocky.py: built from the Labrador's body; a touch shorter than Poppy, who is 3)
    scale: 2.95,
    // rocky_collie/clip_info.json (Poppy's captured strides, carried low like a collie working sheep)
    gaitSpeed: {
      Walk: 1.205,
      Trot: 2.051,
      Run: 3.597,
      Sprint: 5.598
    }
  },
  kombu: {
    name: 'Kombu (Labradoodle)',
    displayName: DOG_NAMES.kombu,
    breed: 'Labradoodle',
    portrait: '/portraits/kombu.png?v=2',
    accent: '#ffd23a',
    model: '/models/kombu.glb',
    stats: DOG_STATS.kombu,
    // a little smaller than the Labrador he is built from (kombu_labradoodle/create_kombu.py)
    scale: 2.95,
    size: 0.93,
    // kombu_labradoodle/clip_info.json (Poppy's captured strides, with his bounce and waddle on top)
    gaitSpeed: {
      Walk: 1.205,
      Trot: 2.051,
      Run: 3.597,
      Sprint: 5.598
    }
  },
  jazz: {
    name: 'Jazz (Great Dane)',
    displayName: DOG_NAMES.jazz,
    breed: 'Great Dane',
    portrait: '/portraits/jazz.png?v=2',
    accent: '#ff3838',
    model: '/models/jazz.glb',
    stats: DOG_STATS.jazz,
    // (jazz_great_dane/create_jazz.py: the Labrador's frame with its legs lengthened.  The tallest dog by a head: she stands about 2.2 m at the back, Meela 1.9)
    scale: 3.7,
    size: 1.15,
    maxStrideRate: 1.15,
    cameraOffset: [0, 5.0, -9.4],
    cameraLookHeight: 2.2,
    // jazz_great_dane/clip_info.json (Poppy's captured strides on longer legs: a long, easy lope)
    gaitSpeed: {
      Walk: 1.47,
      Trot: 2.502,
      Run: 4.388,
      Sprint: 6.83
    }
  },
  baz_naz: {
    name: 'Baz & Naz (Pug Twins)',
    displayName: DOG_NAMES.baz_naz,
    breed: 'Pug Twins',
    portrait: '/portraits/baz_naz.png?v=2',
    accent: '#35e0b5',
    // Two pugs roped together who race as one: Baz (fawn, red harness) is `model`, Naz (black, blue harness) is `twin`.
    // The rope and the way they sling each other up the road are src/game/dogs/duo.js
    model: '/models/baz.glb',
    twin: { model: '/models/naz.glb' },
    stats: DOG_STATS.baz_naz,
    // (baz_naz_pugs/create_pugs.py: the Labrador's frame with its legs shortened; each a little smaller than Pablo)
    scale: 2.0,
    size: 0.7,
    strideBands: DOG_STRIDE_BANDS.baz_naz,
    maxStrideRate: 1.8,
    cameraOffset: [0, 3.0, -6.2],
    cameraLookHeight: 1.1,
    // baz_naz_pugs/baz_clip_info.json, less a quarter for the shorter legs
    gaitSpeed: {
      Walk: 0.9,
      Trot: 1.54,
      Run: 2.7,
      Sprint: 4.2
    }
  },
  ralph: {
    name: 'Ralph (Dachshund)',
    displayName: DOG_NAMES.ralph,
    breed: 'Dachshund',
    portrait: '/portraits/ralph.png?v=2',
    accent: '#ffad57',
    model: '/models/ralph.glb',
    stats: DOG_STATS.ralph,
    scale: 3,
    // A dachshund stands about a third as tall as the pointer.  `size`
    // scales the collision rays (so he fits the small-dog tunnel), and the
    // speeds at which he changes stride: short legs break into a gallop
    // much sooner.  His legs also turn over faster than a big dog's can.
    size: 0.45,
    strideBands: DOG_STRIDE_BANDS.ralph,
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

// The ratings themselves, and what each point does, are in shared/dogStats.js (the server uses them too)

// Water slows a dog to this share of its top speed: a 4 or below is slowed
// more than by off-track ground, a 10 is not slowed at all
export const WATER_SPEED = [0.4, 1];
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

export function swimShare(swimming, [poor, strong]) {
  return THREE.MathUtils.lerp(
    poor,
    strong,
    THREE.MathUtils.clamp(((swimming ?? 4) - 4) / 6, 0, 1)
  );
}
