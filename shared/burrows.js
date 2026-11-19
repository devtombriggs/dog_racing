// Ralph's burrows: short tunnels at the side of the road that only he fits down.  He runs into the
// mouth of one, is underground for a moment, and comes out further up the road with a short boost.
// Each can be used once a lap.  Shared by the server (which takes him through), the game (which draws
// the mouths and hides him) and the tests.
//
// Wendover Woods has four long ones, built into its model (shared/wendoverData.js): each skips about
// 100 m of road, so he may take only two of them a lap (his choice which) and is underground a while.
// Every other map but Treat Road has two short ones, placed here on clear stretches of road.  Either
// way they give Ralph, the slowest dog, something back, not a different race.
import { PICKUP_PATHS, BOX_ROW_S, BONE_S } from './pickupSpots.js';
import { PROCEDURAL_TRACKS, MAPS } from './maps.js';
import { WENDOVER } from './wendoverData.js';

export const BURROW = {
  length: 45,            // metres of road it skips
  duration: 1.3,         // seconds underground (running that far takes Ralph nearly three)
  boostSeconds: 0.8, speedMultiplier: 1.2,     // the dash he comes out with
  halfWidth: 1.3, height: 1.1,
  inset: 1.5,            // the mouth is this far in from the edge of the road
  minHalfWidth: 5,       // ...and only where the road is wide enough to leave everyone else room to pass
  below: 2, above: 2.5,  // how far under or over the mouth's own height he may be and still go in
  targets: [0.3, 0.72],  // about where round the lap they go
};

// Wendover's burrows as the game plays them: the model's four mouths, with a longer ride and a gentler
// dash out than the map build gave them (running the 100 m takes Ralph about 6 s: this saves him about 4)
export const WENDOVER_BURROW = { duration: 2.2, boostSeconds: 0.8, speedMultiplier: 1.2, perLap: 2 };

const CROWDED = ['boneyard', 'the_vets'];        // maps with a pickup every 20 or 30 m: a mouth may be nearer one there
const lapDistance = (a, b, length) => { const d = Math.abs(a - b) % length; return Math.min(d, length - d); };

function place(mapId) {
  const path = PICKUP_PATHS[mapId], track = PROCEDURAL_TRACKS[mapId], L = path.length;
  const within = (s, [a, b], pad = 0) => lapDistance(s, (a + b) / 2, L) <= (b - a) / 2 + pad;
  // nothing may be tunnelled under that fires dogs through the air (those have their own rules)
  const flights = track?.launch ? [[track.launch.padStart - 20, track.launch.landingS + 25]] : mapId === 'frostpeak' ? [path.hazards[0]] : [];
  // ...or that they fall off the end of (the window at the Vets, the stair in the jungle)
  for (const drop of track?.drops ?? []) flights.push([drop.s - 20, drop.s + 50]);
  const pickups = [...BOX_ROW_S[mapId], ...BONE_S[mapId]];
  // a mouth needs a clear bit of road: no hazard, pickup, obstacle or start line on top of it
  const clear = s => lapDistance(s, 0, L) > 60 && path.pointAt(s).halfWidth >= BURROW.minHalfWidth && !path.hazards.some(range => within(s, range, 4))
    && pickups.every(p => lapDistance(s, p, L) > (CROWDED.includes(mapId) ? 9 : 12)) && (path.slalom ?? []).every(o => lapDistance(s, o.s, L) > 14);
  const usable = s => clear(s) && clear(s + BURROW.length) && s + BURROW.length < L - 60
    && !flights.some(range => within(s, range) || within(s + BURROW.length, range) || within(s + BURROW.length / 2, range));
  const out = [];
  BURROW.targets.forEach((fraction, k) => {
    for (let d = 0; d <= 0.4 * L; d += 5) {
      const entryS = [L * fraction + d, L * fraction - d].find(s => usable(s) && out.every(other => lapDistance(s, other.entryS, L) > Math.min(150, L * 0.2)));
      if (entryS === undefined) continue;
      const side = k % 2 ? -1 : 1, exitS = entryS + BURROW.length;
      const at = s => { const c = path.pointAt(s), p = path.pointAt(s, side * (c.halfWidth - BURROW.inset)); return { position: [p.x, p.y, p.z], yaw: c.rotationY }; };
      const entry = at(entryS), exit = at(exitS);
      out.push({
        id: `${mapId}-burrow-${k}`, name: 'Ralph’s Burrow', entryS, exitS, side: side > 0 ? 'left' : 'right',
        entry: entry.position, entryYaw: entry.yaw, exit: exit.position, exitYaw: exit.yaw,
        halfWidth: BURROW.halfWidth, height: BURROW.height, below: BURROW.below, above: BURROW.above,
        duration: BURROW.duration, boostSeconds: BURROW.boostSeconds, speedMultiplier: BURROW.speedMultiplier,
      });
      return;
    }
    throw new Error(`${mapId}: no clear stretch for a burrow near ${Math.round(fraction * 100)} % of the lap`);
  });
  return out;
}

/** Every map's burrows: { mapId: [{ id, entryS, exitS, entry, entryYaw, exit, exitYaw, halfWidth, duration, ... }] } */
export const BURROWS = {
  wendover: WENDOVER.tunnels.map(tunnel => ({ ...tunnel, duration: WENDOVER_BURROW.duration, boostSeconds: WENDOVER_BURROW.boostSeconds, speedMultiplier: WENDOVER_BURROW.speedMultiplier })),
  ...Object.fromEntries(['frostpeak', 'modbury_heights', 'farmyard', 'water_park', 'pet_mall', 'mud_park', 'desert_dunes', 'speed_bowl', 'kombu_house', 'neon_nexus', 'yorkshire_dales', 'boneyard', 'the_vets', 'monkey_jungle'].map(mapId => [mapId, place(mapId)])),
};

/** How many burrows Ralph may go down in one lap of a map (every one of them, unless it says otherwise). */
export const BURROWS_PER_LAP = { wendover: WENDOVER_BURROW.perLap };

// How far round the lap each of a map's checkpoints is, in order (a dog coming out of a burrow is
// credited with the ones it went under)
function checkpointDistances(mapId) {
  const path = PICKUP_PATHS[mapId];
  return MAPS[mapId].checkpoints.map(cp => {
    let best = 0, nearest = Infinity;
    for (let s = 0; s < path.length; s += 1) { const p = path.pointAt(s), d = (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2; if (d < nearest) { nearest = d; best = s; } }
    return best;
  });
}
export const BURROW_CHECKPOINTS = Object.fromEntries(Object.keys(MAPS).map(mapId => [mapId, checkpointDistances(mapId)]));
