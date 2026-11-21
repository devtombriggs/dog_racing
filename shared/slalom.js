// Frostpeak's black run: the slalom gates and the snowmen down it (Tom, 2026-11-21).  Neither stops a dog any more:
//   a gate   is a padded flag on a spring hinge.  A dog that runs into it is slowed, and knocks it flat to the snow; it
//            springs back up once the dog is past (`flatMs`), as a real slalom gate does
//   a snowman is knocked to bits by a dog that runs into it, slowing it a lot more, and is built again `respawnMs` later
// The server decides who hit what (on each dog's moves, as it does chew toys) and tells everyone; the game draws it
// (src/tracks/frostpeak/slalom.js) and slows its own dog.  Where they are: shared/frostpeak.json slalomObstacles.
import { FROSTPEAK_SLALOM } from './frostpeakCannon.js';

export const SLALOM = {
  // slow: the share of its top speed a dog is held to for holdMs, then it gets the rest back over easeMs (Tom, 2026-11-21:
  // "slow you a lot more, no complete stop then go again"); height: a jump this high clears it
  gate: { slow: 0.6, holdMs: 900, easeMs: 900, flatMs: 1400, height: 1.7 },
  snowman: { slow: 0.4, holdMs: 1600, easeMs: 1200, respawnMs: 15000, height: 2.4 },
  reach: 0.55,                                             // how far from a dog's middle counts as touching
};

/** Every gate and snowman: { index, kind, position, rotationY, radius } */
export const SLALOM_OBSTACLES = FROSTPEAK_SLALOM.map((o, index) => ({ index, ...o }));

/** How near (x, z) comes to the line from a to b */
function distanceToSegment2d(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], length = dx * dx + dz * dz;
  const t = length > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / length)) : 0;
  return Math.hypot(a[0] + dx * t - x, a[2] + dz * t - z);
}

/**
 * The gates and snowmen a dog ran into, moving from `from` to `to` ([x, y, z]): any it passed close enough to touch,
 * without being high enough in the air to clear it.  standing(index): is it up (not flat, not in bits)?
 */
export function slalomHits(from, to, standing = () => true) {
  const hits = [];
  for (const o of SLALOM_OBSTACLES) {
    if (!standing(o.index)) continue;
    if (Math.abs(to[0] - o.position[0]) > 25 || Math.abs(to[2] - o.position[2]) > 25) continue;
    if (to[1] - o.position[1] > SLALOM[o.kind].height) continue;              // (cleared it)
    if (distanceToSegment2d(o.position[0], o.position[2], from, to) <= o.radius + SLALOM.reach) hits.push(o);
  }
  return hits;
}
