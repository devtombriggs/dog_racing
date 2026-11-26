// The dogs: who they are, how they are rated and what each rating does to their handling
import * as THREE from 'three';
import { DOG_STATS, DOG_NAMES, DOG_STRIDE_BANDS, STAT_EFFECT, statScale, turnSpeedLoss, pickupShare } from '../../shared/dogStats.js';

export { STAT_EFFECT, statScale, turnSpeedLoss, pickupShare };

// ---------------------------------
// DRIFTING (shared/drift.js): what each dog does with its body in a skid
// ---------------------------------
//   hop    the frame of a clip it holds in the little hop that starts a skid
//   slide  the clip under the slide itself
//   bend   how far each leg joint is folded (radians about the joint: + swings the leg below it back, - forward):
//          hind legs more than the front ones, and the body tipped back by
//   pitch  so that it sits back into the skid.  Its paws are kept on the ground: folded legs are shorter
//   drop   or, with no `bend`: how far the dog is let down on to the ground (share of its size)
//   life   what keeps moving in the slide: its tail wags `wag` radians each way `wagRate` times a second,
//          its head and neck sway `look` each way (slowly) and nod `judder` each way (fast, the skid's shake)
const SKID_LIFE = { wag: 0.4, wagRate: 4.5, look: 0.035, lookRate: 0.7, judder: 0.012, judderRate: 6 };
// The skid of the dogs that are fast enough already: down into a crouch, legs folded, and round
const CROUCH_SKID = {
  hop: ['Jump', 0.5], slide: 'Idle', pitch: -0.1,
  bend: { thigh: -0.5, shin: 0.9, metatarsus: -0.5, upperarm: 0.6, forearm: -0.85, pastern: 0.25 },
  life: SKID_LIFE
};
// The slow dogs each have a skid of their own, and get more from it (shared/drift.js DRIFT_PERKS):
// Enzo flops on to his belly and glides round, legs out
const BELLY_SKID = { hop: ['Jump', 0.5], slide: 'BellyFlop', slideRate: 0.5, drop: 0.14, pitch: -0.04, life: SKID_LIFE };
// Ralph hops on to a little skateboard (src/game/dogs/skateboard.js) and rides it round, knees a little bent
const BOARD_SKID = {
  hop: ['Jump', 0.5], slide: 'Idle', pitch: -0.04, board: { colour: 0xff7a1a, size: 0.6 },
  bend: { thigh: -0.22, shin: 0.4, metatarsus: -0.22, upperarm: 0.26, forearm: -0.38, pastern: 0.12 },
  life: SKID_LIFE
};
// Jimmy's wheels lock and slide round behind him: he braces his front legs and steers the cart through it
const CART_SKID = {
  hop: ['Jump', 0.5], slide: 'Idle', pitch: -0.03,
  bend: { upperarm: 0.42, forearm: -0.6, pastern: 0.18 },
  life: { ...SKID_LIFE, wag: 0.5, judder: 0.02 }
};
// Baz crouches into the skid and Naz jumps up on to his back and rides him round (src/game/dogs/duo.js)
const STACK_SKID = { ...CROUCH_SKID, stack: true };

export const DOGS = {
  gsp: {
    name: 'Pippa (German Shorthaired Pointer)',
    displayName: DOG_NAMES.gsp,
    breed: 'German Shorthaired Pointer',
    portrait: '/portraits/pippa.png?v=2',
    accent: '#ff4fd8',
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
    },
    skid: CROUCH_SKID
  },
  second_dog: {
    name: 'Meela (Greyhound)',
    displayName: DOG_NAMES.second_dog,
    breed: 'Greyhound',
    portrait: '/portraits/meela.png?v=2',
    accent: '#a35cff',
    model: '/models/meela_greyhound.glb',
    stats: DOG_STATS.second_dog,
    skid: CROUCH_SKID,
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
    accent: '#4d8dff',
    model: '/models/black_lab.glb',
    stats: DOG_STATS.black_lab,
    skid: CROUCH_SKID,
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
    accent: '#3fe6ff',
    model: '/models/pablo.glb',
    stats: DOG_STATS.pablo,
    skid: CROUCH_SKID,
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
    skid: BELLY_SKID,
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
    accent: '#2fd147',
    model: '/models/rocky.glb',
    stats: DOG_STATS.rocky,
    skid: CROUCH_SKID,
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
    accent: '#ffe01a',
    model: '/models/kombu.glb',
    stats: DOG_STATS.kombu,
    skid: CROUCH_SKID,
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
    accent: '#ff2a2a',
    model: '/models/jazz.glb',
    stats: DOG_STATS.jazz,
    skid: CROUCH_SKID,
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
    accent: '#b6f23a',
    // Two pugs roped together who race as one: Baz (fawn, red harness) is `model`, Naz (black, blue harness) is `twin`.
    // The rope and the way they sling each other up the road are src/game/dogs/duo.js
    model: '/models/baz.glb',
    twin: { model: '/models/naz.glb' },
    stats: DOG_STATS.baz_naz,
    skid: STACK_SKID,
    // (baz_naz_pugs/create_pugs.py: the Labrador's frame with its legs shortened.  Tom, 2026-11-19: not much bigger
    //  than Ralph, being pugs: each is 1.13 m tall and 1.62 m long here, to Ralph's 1.05 and 1.92)
    scale: 1.65,
    size: 0.6,
    strideBands: DOG_STRIDE_BANDS.baz_naz,
    maxStrideRate: 1.8,
    cameraOffset: [0, 2.7, -5.6],
    cameraLookHeight: 0.95,
    // baz_naz_pugs/baz_clip_info.json, less a quarter for the shorter legs
    gaitSpeed: {
      Walk: 0.9,
      Trot: 1.54,
      Run: 2.7,
      Sprint: 4.2
    }
  },
  casper: {
    name: 'Casper (Patterdale Terrier)',
    displayName: DOG_NAMES.casper,
    breed: 'Patterdale Terrier',
    portrait: '/portraits/casper.png',
    accent: '#ffffff',
    model: '/models/casper.glb',
    stats: DOG_STATS.casper,
    skid: CROUCH_SKID,
    // (casper_patterdale/create_casper.py: the Labrador's frame on slightly shorter legs.  A small terrier: about
    //  1.5 m at the top of his head here, between the pugs and Pablo)
    scale: 2.15,
    size: 0.7,
    strideBands: DOG_STRIDE_BANDS.casper,
    maxStrideRate: 1.7,
    cameraOffset: [0, 3.0, -6.2],
    cameraLookHeight: 1.2,
    // casper_patterdale/clip_info.json (Poppy's captured strides, a little shorter, quick and bouncy)
    gaitSpeed: {
      Walk: 1.121,
      Trot: 1.907,
      Run: 3.345,
      Sprint: 5.206
    }
  },
  jimmy: {
    name: 'Jimmy (Chinese Crested)',
    displayName: DOG_NAMES.jimmy,
    breed: 'Chinese Crested',
    portrait: '/portraits/jimmy.png',
    accent: '#14b8a6',
    model: '/models/jimmy.glb',
    stats: DOG_STATS.jimmy,
    // what his card says under his ratings (src/ui/DogSelectScreen.jsx)
    perk: 'Downhill his wheels run away with him: Meela’s speed wherever the road drops',
    skid: CART_SKID,
    // (jimmy_crested/create_jimmy.py: the Labrador's frame made fine, his back legs slung in a two-wheeled cart whose
    //  wheels turn in his clips.  A small dog: about 1.2 m at the back here, the top of his crest at 1.6)
    scale: 1.9,
    size: 0.6,
    strideBands: DOG_STRIDE_BANDS.jimmy,
    maxStrideRate: 1.9,
    cameraOffset: [0, 2.9, -6.0],
    cameraLookHeight: 1.05,
    // jimmy_crested/clip_info.json (Poppy's captured strides in front; the wheels turn as far as each stride goes)
    gaitSpeed: {
      Walk: 1.205,
      Trot: 2.051,
      Run: 3.597,
      Sprint: 5.598
    }
  },
  // ---------- the three dogs from the Shop (Tom, 2026-11-26; built by ../new_dogs/create_dog.py) ----------
  ziggy: {
    name: 'Ziggy (Whippet)',
    displayName: DOG_NAMES.ziggy,
    breed: 'Whippet',
    portrait: '/portraits/ziggy.png',
    accent: '#c0c8d4',
    model: '/models/ziggy.glb',
    stats: DOG_STATS.ziggy,
    skid: CROUCH_SKID,
    // (Meela's frame at Casper's size: Tom, 2026-11-26 "she needs to be casper size not like a greyhound".  About 1.6 m at
    //  the top of her head here.  At the same pace her legs turn over much quicker than Meela's)
    scale: 1.85,
    size: 0.7,
    strideBands: DOG_STRIDE_BANDS.ziggy,
    maxStrideRate: 2.0,
    cameraOffset: [0, 3.0, -6.2],
    cameraLookHeight: 1.2,
    // new_dogs/ziggy/clip_info.json (Meela's captured gallop)
    gaitSpeed: { Walk: 1.52, Trot: 2.587, Run: 3.9, Sprint: 5.5 }
  },
  barney: {
    name: 'Barney (Basset Hound)',
    displayName: DOG_NAMES.barney,
    breed: 'Basset Hound',
    portrait: '/portraits/barney.png',
    accent: '#9a5a22',
    model: '/models/barney.glb',
    stats: DOG_STATS.barney,
    skid: CROUCH_SKID,
    // (Ralph's frame made heavy.  Bigger than a dachshund: about 1.3 m at the top of his head here.  Too big for the
    //  small-dog tunnel, and the burrows are Ralph's alone)
    scale: 3.5,
    size: 0.6,
    strideBands: DOG_STRIDE_BANDS.barney,
    maxStrideRate: 1.9,
    cameraOffset: [0, 2.8, -6.0],
    cameraLookHeight: 1.0,
    // new_dogs/barney/clip_info.json (Ralph's strides)
    gaitSpeed: { Walk: 0.39, Trot: 0.66, Run: 1.16, Sprint: 1.8 }
  },
  merlin: {
    name: 'Merlin (Brussels Griffon)',
    displayName: DOG_NAMES.merlin,
    breed: 'Brussels Griffon',
    portrait: '/portraits/merlin.png',
    accent: '#5b2bd6',
    model: '/models/merlin.glb',
    stats: DOG_STATS.merlin,
    skid: CROUCH_SKID,
    // (Poppy's frame on short legs, in a wizard's hat and cape.  A small dog: about 1.1 m at the back here, his hat half as much again)
    // (smaller: Tom, 2026-11-26.  About 0.85 m at the back now, 1.35 to the tip of his hat)
    scale: 1.5,
    size: 0.5,
    strideBands: DOG_STRIDE_BANDS.merlin,
    maxStrideRate: 2.2,
    cameraOffset: [0, 2.8, -5.8],
    cameraLookHeight: 1.0,
    // new_dogs/merlin/clip_info.json (Poppy's captured strides on legs 62% as long)
    gaitSpeed: { Walk: 0.95, Trot: 1.62, Run: 2.85, Sprint: 4.43 }
  },
  nacho: {
    name: 'Nacho (Chihuahua)',
    displayName: DOG_NAMES.nacho,
    breed: 'Chihuahua',
    portrait: '/portraits/nacho.png',
    accent: '#0b6b3a',
    model: '/models/nacho.glb',
    stats: DOG_STATS.nacho,
    perk: 'Small enough for Ralph’s burrows',
    skid: CROUCH_SKID,
    // (Poppy's frame made tiny, in a sombrero and a poncho.  The smallest dog: about 0.75 m at the back here, 1.1 to the top
    //  of his hat.  His legs go like a sewing machine)
    scale: 1.35,
    size: 0.45,
    strideBands: DOG_STRIDE_BANDS.nacho,
    maxStrideRate: 2.3,
    cameraOffset: [0, 2.6, -5.6],
    cameraLookHeight: 0.9,
    // new_dogs/nacho/clip_info.json (Poppy's captured strides on legs three quarters as long)
    gaitSpeed: { Walk: 0.96, Trot: 1.64, Run: 2.88, Sprint: 4.48 }
  },
  ralph: {
    name: 'Ralph (Dachshund)',
    displayName: DOG_NAMES.ralph,
    breed: 'Dachshund',
    portrait: '/portraits/ralph.png?v=2',
    accent: '#ff9eb0',
    model: '/models/ralph.glb',
    stats: DOG_STATS.ralph,
    skid: BOARD_SKID,
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

/** the small picture of a dog (public/portraits: a .webp beside every .png) */
export const portraitOf = dogId => (DOGS[dogId]?.portrait ?? '/icons/special.png').replace(/\.png.*$/, '.webp');

// The ratings themselves, and what each point does, are in shared/dogStats.js (the server uses them too)

// (how much water slows a dog is shared/dogStats.js swimSpeed; how quickly it picks up speed in it is this)
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
