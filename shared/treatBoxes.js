import { PICKUP_PATHS, BOX_ROW_S } from './pickupSpots.js';

export const TREAT_BOX_SCALE = 1.6;
export const TREAT_BOX_RESPAWN_MS = 2500;      // a taken box is back this soon
const BOX_LIFT = 0.5;
const PICKUP_RADIUS = 1.5;
const LANES = [-0.66, 0, 0.66];

// Keep the visual crates and server pickup locations identical: both come from here.
// Treat Road's IDs stay "treat-<row>-<column>"; other maps prefix the map id.
function boxesFor(mapId) {
  const path = PICKUP_PATHS[mapId];
  return BOX_ROW_S[mapId].flatMap((s, row) => {
    const centre = path.pointAt(s);
    return LANES.map((lane, column) => {
      const p = path.pointAt(s, lane * centre.halfWidth);
      return {
        id: mapId === 'treat_road' ? `treat-${row}-${column}` : `${mapId}-${row}-${column}`, s,
        groundPosition: [p.x, p.y, p.z],
        position: [p.x, p.y + BOX_LIFT + TREAT_BOX_SCALE / 2, p.z],
        rotationY: centre.rotationY
      };
    });
  });
}

/** Every map's crates, by map id. */
export const TREAT_BOXES_BY_MAP = Object.fromEntries(Object.keys(BOX_ROW_S).map(mapId => [mapId, boxesFor(mapId)]));

/** Treat Road's crates (kept for existing callers). */
export const TREAT_BOXES = TREAT_BOXES_BY_MAP.treat_road;

// Sweep between movement packets so a sprint cannot skip a crate. Large position
// corrections only test the destination; they must not collect crates along a teleport.
export function touchesTreatBox(previous, current, box) {
  const dx = current[0] - previous[0], dz = current[2] - previous[2];
  const lengthSq = dx * dx + dz * dz;
  const [x, y, z] = box.groundPosition;
  const t = lengthSq > 0 && lengthSq <= 144
    ? Math.max(0, Math.min(1, ((x - previous[0]) * dx + (z - previous[2]) * dz) / lengthSq))
    : 1;
  const dogY = previous[1] + (current[1] - previous[1]) * t;
  return Math.abs(dogY - y) <= 1.5
    && Math.hypot(previous[0] + dx * t - x, previous[2] + dz * t - z) <= PICKUP_RADIUS;
}

// ---------------------------------
// Golden Bones on the road: the server decides who got each one, so a bone one dog eats disappears
// for everyone.  Same sweep as the crates, with the bone's own reach (it floats 1.3 m up).
// ---------------------------------
export const GOLDEN_BONE_RESPAWN_MS = 6000;
export const GOLDEN_BONE_REACH = { radius: 2.0, below: 1.5, above: 3.3 };

export function touchesGoldenBone(previous, current, spot) {
  const dx = current[0] - previous[0], dz = current[2] - previous[2];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 && lengthSq <= 144
    ? Math.max(0, Math.min(1, ((spot.x - previous[0]) * dx + (spot.z - previous[2]) * dz) / lengthSq))
    : 1;
  const dy = previous[1] + (current[1] - previous[1]) * t - spot.y;
  return dy > -GOLDEN_BONE_REACH.below && dy < GOLDEN_BONE_REACH.above
    && Math.hypot(previous[0] + dx * t - spot.x, previous[2] + dz * t - spot.z) < GOLDEN_BONE_REACH.radius;
}
