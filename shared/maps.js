import frostpeak from './frostpeak.json' with { type: 'json' };
import { TREAT_ROAD } from './treatRoadData.js';
import { WENDOVER_WOODS } from './wendoverWoodsData.js';
import { MODBURY_HEIGHTS } from './modburyData.js';
import { FARMYARD } from './farmData.js';
import { WATER_PARK } from './waterParkData.js';
import { PET_MALL } from './petMallData.js';
import { MUD_PARK } from './mudParkData.js';
import { BYPASS } from './bypassData.js';
import { DESERT } from './desertData.js';
import { SPEED_BOWL } from './speedBowlData.js';
import { KOMBU_HOUSE } from './kombuHouseData.js';
import { NEON } from './neonData.js';
import { DALES } from './dalesData.js';
import { BONEYARD } from './boneyardData.js';
import { VETS } from './vetsData.js';
import { JUNGLE } from './jungleData.js';

export const PROCEDURAL_TRACKS = { wendover: WENDOVER_WOODS, treat_road: TREAT_ROAD, modbury_heights: MODBURY_HEIGHTS, farmyard: FARMYARD, water_park: WATER_PARK, pet_mall: PET_MALL, bypass_dash: BYPASS, mud_park: MUD_PARK,
  desert_dunes: DESERT, speed_bowl: SPEED_BOWL, kombu_house: KOMBU_HOUSE, neon_nexus: NEON,
  yorkshire_dales: DALES, boneyard: BONEYARD, the_vets: VETS, monkey_jungle: JUNGLE };
const PROCEDURAL_DESCRIPTIONS = {
  wendover: `${(WENDOVER_WOODS.length / 1000).toFixed(2)} km through the woods, and fast · downhill past the deer · the Speed Tunnel · jump the beck · High Path or Low Path · boosts over the ridge · the long drift · fallen trees to jump`,
  yorkshire_dales: `${(DALES.length / 1000).toFixed(2)} km over the fells · zig-zags up Cheese Fell, and the goat path across a hairpin · flat out down the other side · sheep · through the cave, out of the waterfall and down the stream, rock to rock`,
  boneyard: `${(BONEYARD.length / 1000).toFixed(2)} km in the rain · a lap the shape of a bone · Golden Bones all the way round · muddy water to wade and swim · rolling bones and mud spouts`,
  the_vets: `${(VETS.length / 1000).toFixed(2)} km inside the vets · in on the treadmill · three storeys of syringes, giant pills, cones of shame and vets in masks · out of the top-floor window`,
  monkey_jungle: `${(JUNGLE.length / 1000).toFixed(2)} km of rainforest · rope bridges and a log with no sides · vine swings to jump along · up the tree stair and off the end · snakes, monkeys, coconuts and stone balls`,
  desert_dunes: `${(DESERT.length / 1000).toFixed(2)} km of desert · S-bends over the dunes and soft sand · whirlwinds and tumbleweed · the canyon hairpin · boulders rolling down the great dune · the sandworm · skirt the sinkhole`,
  speed_bowl: `${Math.round(SPEED_BOWL.length)} m kart oval · five laps · six rows of Treat Boxes and Golden Bones all the way round · nothing in the way`,
  kombu_house: `${(KOMBU_HOUSE.length / 1000).toFixed(2)} km through Kombu’s house · in at the glass doors · the toy car, the pool room, flying cutlery · up in the lift · swinging doors · the dog pen and the chickens · down the back drive`,
  neon_nexus: `${(NEON.length / 1000).toFixed(2)} km above a neon city · two two-minute laps · mega boost pads · three catapults · choose your road: the longer has the mega pads and the Golden Bones · boost across the moving platforms, or fall into the Undercity with the robots`,
  treat_road: '2.3 km of sky road · faster than anywhere · boost pads all the way · no barriers · catapult gap',
  modbury_heights: `${((MODBURY_HEIGHTS.length - (MODBURY_HEIGHTS.launch.landingS - MODBURY_HEIGHTS.launch.takeoffS)) / 1000).toFixed(2)} km coastal circuit · the mountain lift up the cliff · clifftops · broken bridges to jump · swim the cove · the Seabed Tunnel: under the sea, among the fish`,
  farmyard: `${(FARMYARD.length / 1000).toFixed(2)} km weaving round the farm · through the barn · dodge the tractor, the sheep and the sails · find your way through the maize maze`,
  bypass_dash: `${(BYPASS.length / 1000).toFixed(2)} km of roads · down the motorway among the traffic · weave through the roadworks · round the roundabout · the underpass · cross four lanes of traffic, or take the footbridge`,
  mud_park: '1.41 km dirt-bike course in the rain · a figure of eight: the big jump flies over the middle · kickers and boost pads · slippery clay · deep bog and rolling logs · the mudslide and the mud pit',
  pet_mall: `${(PET_MALL.length / 1000).toFixed(2)} km weaving through a pet shopping mall · escaped cats, trolleys and hamster balls · the escalator and the big leap`,
  water_park: '1.72 km of pools and slides · bounce across the rubber rings · the big slide and its jump',
};

export const DEFAULT_MAP = 'wendover';

// Maps that are still in the game's files (and still run, for a room that asks for one by name) but are not offered any more:
// Squelch Hollow, since Tom, 2026-11-26 (Bypass Dash took its place).  The menus, the vote and the leaderboards go by MAP_IDS.
export const RETIRED_MAPS = ['mud_park'];

export const MAPS = {
  // (Wendover Woods is a generated track since Tom, 2026-11-21, but stays first in the list)
  wendover: null,
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

/** The maps on offer, in the order the menus show them */
export const MAP_IDS = Object.keys(MAPS).filter(id => !RETIRED_MAPS.includes(id));
