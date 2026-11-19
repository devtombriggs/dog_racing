import frostpeak from './frostpeak.json' with { type: 'json' };
import { TREAT_ROAD } from './treatRoadData.js';
import { MODBURY_HEIGHTS } from './modburyData.js';
import { FARMYARD } from './farmData.js';
import { WATER_PARK } from './waterParkData.js';
import { PET_MALL } from './petMallData.js';
import { MUD_PARK } from './mudParkData.js';
import { DESERT } from './desertData.js';
import { SPEED_BOWL } from './speedBowlData.js';
import { KOMBU_HOUSE } from './kombuHouseData.js';
import { NEON } from './neonData.js';
import { DALES } from './dalesData.js';
import { BONEYARD } from './boneyardData.js';
import { VETS } from './vetsData.js';
import { JUNGLE } from './jungleData.js';

export const PROCEDURAL_TRACKS = { treat_road: TREAT_ROAD, modbury_heights: MODBURY_HEIGHTS, farmyard: FARMYARD, water_park: WATER_PARK, pet_mall: PET_MALL, mud_park: MUD_PARK,
  desert_dunes: DESERT, speed_bowl: SPEED_BOWL, kombu_house: KOMBU_HOUSE, neon_nexus: NEON,
  yorkshire_dales: DALES, boneyard: BONEYARD, the_vets: VETS, monkey_jungle: JUNGLE };
const PROCEDURAL_DESCRIPTIONS = {
  yorkshire_dales: `${(DALES.length / 1000).toFixed(2)} km over the fells · boost pads up every climb, flat out down the other side · cheeses rolling down the hill · sheep · into the cave in the scar and out through the waterfall`,
  boneyard: `${(BONEYARD.length / 1000).toFixed(2)} km in the rain · a lap the shape of a bone · Golden Bones all the way round · muddy water to wade and swim · rolling bones and mud spouts`,
  the_vets: `${(VETS.length / 1000).toFixed(2)} km inside the vets · in on the treadmill · three storeys of syringes, giant pills, cones of shame and vets in masks · out of the top-floor window`,
  monkey_jungle: `${(JUNGLE.length / 1000).toFixed(2)} km of rainforest · rope bridges and a log with no sides · vine swings to jump along · up the tree stair and off the end · snakes, monkeys, coconuts and stone balls`,
  desert_dunes: `${(DESERT.length / 1000).toFixed(2)} km of desert · rolling dunes and soft sand · whirlwinds and tumbleweed · the leap off the great dune`,
  speed_bowl: `${Math.round(SPEED_BOWL.length)} m kart oval · five laps · six rows of Treat Boxes and Golden Bones all the way round · nothing in the way`,
  kombu_house: `${(KOMBU_HOUSE.length / 1000).toFixed(2)} km through Kombu’s house · in at the glass doors · the toy car, the pool room, flying cutlery · up in the lift · swinging doors · the dog pen and the chickens · down the back drive`,
  neon_nexus: `${(NEON.length / 1000).toFixed(2)} km above a neon city · three two-minute laps · mega boost pads · three catapults · choose your road: the longer has the mega pads and the Golden Bones · moving platforms to jump`,
  treat_road: '1.45 km of sky road · catapult gap · landing boost',
  modbury_heights: '3.12 km coastal circuit · clifftops · broken bridges to jump · water crossing',
  farmyard: '1.67 km round the farm · through the barn · dodge the tractor, the sheep and the sails',
  mud_park: '1.45 km mud run in the rain · slippery clay bends · deep bog and rolling logs · the mudslide and the mud pit',
  pet_mall: '1.33 km round a pet shopping mall · escaped cats, trolleys and hamster balls · the escalator and the big leap',
  water_park: '1.72 km of pools and slides · bounce across the rubber rings · the big slide and its jump',
};

const STARTING_GRID = [
  [-4, 0, 4.2],
  [-4, 0, 2.1],
  [-4, 0, 0],
  [-4, 0, -2.1],
  [-4, 0, -4.2],
  [-7, 0, 0]          // (the sixth dog: behind the middle of the row)
];

const START_ROTATION = Math.PI / 2;

// Ordered checkpoints following the Wendover Woods circuit (the long
// version: 1466 m a lap).  Copied from wendover_woods/track_info.json, which
// the map build writes.  Coordinates are X/Z, with a radius in game units.
const CHECKPOINTS = [
  { x: 96.5, z: -52.8, radius: 18 },
  { x: 174.2, z: -133.4, radius: 18 },
  { x: 289.2, z: -138.9, radius: 18 },
  { x: 278.3, z: -258.3, radius: 18 },
  { x: 190.4, z: -289.6, radius: 18 },
  { x: 86.6, z: -325.1, radius: 18 },
  { x: -9.3, z: -371.9, radius: 18 },
  { x: -43.6, z: -255.2, radius: 18 },
  { x: -150.3, z: -224.6, radius: 18 },
  { x: -156.0, z: -103.9, radius: 18 },
  { x: -122.0, z: -0.1, radius: 18 }
];

export const DEFAULT_MAP = 'wendover';

export const MAPS = {
  wendover: {
    name: 'Wendover Woods',
    description: '1.47 km woodland adventure · Ralph’s burrows · Poppy’s swimming sections',
    model: '/models/wendover_woods.glb',
    startPositions: STARTING_GRID.map(position => ({ position, rotationY: START_ROTATION })),
    checkpoints: CHECKPOINTS,
    startFinish: { position: [0, 0, 0], forward: [1, 0, 0], halfWidth: 6.5 }
  },
  frostpeak: {
    name: frostpeak.name,
    description: '2.5 km alpine circuit · summit cannon · black run slalom',
    model: '/models/frostpeak_alpine.glb',
    // (the model has five places in a row; the sixth dog starts 3 m behind the middle one)
    startPositions: [...frostpeak.startPositions, (({ position, forward, rotationY }) => ({ id: 6, rotationY, forward,
      position: [position[0] - forward[0] * 3, position[1], position[2] - forward[2] * 3] }))(frostpeak.startPositions[2])],
    // Checkpoint zero is the finish line, tested separately after the others.
    checkpoints: frostpeak.checkpoints.slice(1).map(({ position, radius }) => ({
      x: position[0], z: position[2], radius
    })),
    startFinish: frostpeak.startFinish,
    heightmap: { ...frostpeak.heightmap, file: '/models/frostpeak_heightmap.bin' },
    lighting: frostpeak.lighting
  },
  ...Object.fromEntries(Object.entries(PROCEDURAL_TRACKS).map(([id, track]) => [id, {
    name: track.name,
    description: PROCEDURAL_DESCRIPTIONS[id],
    procedural: true,
    laps: track.laps ?? 3,
    startPositions: track.startPositions,
    checkpoints: track.checkpoints.slice(1).map(({ position, halfWidth, radius, rotationY, launchLanding }) => ({
      x: position[0], y: position[1], z: position[2], radius: radius ?? halfWidth + 8, launchLanding,
      forward: [Math.sin(rotationY), Math.cos(rotationY)]
    })),
    startFinish: {
      ...track.startFinish,
      forward: [Math.sin(track.startFinish.rotationY), 0, Math.cos(track.startFinish.rotationY)]
    }
  }]))
};

export function crossedFinishLine(previous, current, finish) {
  const [fx, , fz] = finish.position;
  const length = Math.hypot(finish.forward[0], finish.forward[2]);
  const nx = finish.forward[0] / length;
  const nz = finish.forward[2] / length;
  const before = (previous[0] - fx) * nx + (previous[2] - fz) * nz;
  const after = (current[0] - fx) * nx + (current[2] - fz) * nz;
  if (before >= 0 || after < 0) return false;
  // Check the actual intersection, including when a movement straddles the line.
  const t = -before / (after - before);
  const x = previous[0] + (current[0] - previous[0]) * t - fx;
  const z = previous[2] + (current[2] - previous[2]) * t - fz;
  return Math.abs(-x * nz + z * nx) <= finish.halfWidth;
}

export function sampleGroundHeight(heights, metadata, x, z) {
  const { width, height, originX, originZ, cellSize } = metadata;
  const fx = Math.max(0, Math.min((x - originX) / cellSize, width - 1));
  const fz = Math.max(0, Math.min((z - originZ) / cellSize, height - 1));
  const ix = Math.min(Math.floor(fx), width - 2);
  const iz = Math.min(Math.floor(fz), height - 2);
  const u = fx - ix, v = fz - iz;
  const row = iz * width + ix;
  return (heights[row] * (1 - u) + heights[row + 1] * u) * (1 - v)
    + (heights[row + width] * (1 - u) + heights[row + width + 1] * u) * v;
}

/** How many laps a race on this map is: three, unless the map says otherwise (the Speed Bowl is five). */
export const DEFAULT_LAPS = 3;
export function lapsFor(mapId) {
  return MAPS[mapId]?.laps ?? DEFAULT_LAPS;
}
