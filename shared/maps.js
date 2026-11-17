import frostpeak from './frostpeak.json' with { type: 'json' };
import { TREAT_ROAD } from './treatRoadData.js';
import { MODBURY_HEIGHTS } from './modburyData.js';

export const PROCEDURAL_TRACKS = { treat_road: TREAT_ROAD, modbury_heights: MODBURY_HEIGHTS };

const STARTING_GRID = [
  [-4, 0, 4.2],
  [-4, 0, 2.1],
  [-4, 0, 0],
  [-4, 0, -2.1],
  [-4, 0, -4.2]
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
    description: '1.47 km woodland circuit',
    model: '/models/wendover_woods.glb',
    startPositions: STARTING_GRID.map(position => ({ position, rotationY: START_ROTATION })),
    checkpoints: CHECKPOINTS,
    startFinish: { position: [0, 0, 0], forward: [1, 0, 0], halfWidth: 6.5 }
  },
  frostpeak: {
    name: frostpeak.name,
    description: '2.5 km snowy alpine circuit',
    model: '/models/frostpeak_alpine.glb',
    startPositions: frostpeak.startPositions,
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
    description: id === 'modbury_heights'
      ? '3.12 km coastal circuit · clifftops · water crossing'
      : '1.45 km of sky road · catapult gap · landing boost',
    procedural: true,
    allowJump: false,
    startPositions: track.startPositions,
    checkpoints: track.checkpoints.slice(1).map(({ position, halfWidth, rotationY, launchLanding }) => ({
      x: position[0], y: position[1], z: position[2], radius: halfWidth + 8, launchLanding,
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
