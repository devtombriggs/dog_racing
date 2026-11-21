// Drifting: hold the drift button through a corner and the dog hops into a skid and slides round it,
// back end out, losing none of the speed a hard turn costs.  At first there is only dust.  Hold the skid
// and sparks come at its paws: blue, then orange, then purple.  Letting go once there are sparks kicks it
// out of the corner with a boost, longer for each colour; letting go before them gives nothing.
// A slow dog is the better drifter (its Drift stat, shared/dogStats.js): its sparks come sooner and its
// boost lasts longer.
//
// How a drift steers (Tom, 2026-11-21: "like Mario Kart"): the drift is a curve of its own.  Let go of the arrows and
// the dog carries on round a medium curve; the arrow into the corner eases it tighter, the arrow out of it eases it
// wider, and neither ever turns it the other way.  The player guides a turn that is already happening rather than
// steering the dog round.  The stages:  NORMAL -> HOP (the curve begins, no sparks yet) -> DRIFTING -> EXITING (the
// ordinary steering comes back in gently, from the turn the drift had) -> NORMAL.  Every number to tune is in DRIFT_ARC.

import { statScale } from './dogStats.js';
import { BONE_BOOST } from './items.js';

export const DRIFT = {
  startTurn: 0.35,     // how far the steering has to be over for a skid to start
  startEffort: 0.45,   // how hard the dog has to be running to start one (0 an easy run, 1 flat out)...
  endEffort: 0.2,      // ...and below this it has lost its pace and the skid is over, with nothing for it
  // The sparks.  `charge` builds by a second a second steering into the skid, more slowly holding it
  // straight and slowly steering out of it (so weaving down a straight earns next to nothing)
  chargeOut: 0.3, chargeHeld: 0.65, chargeIn: 1,
  tiers: [0.8, 1.8, 3.0],   // charge at which the sparks come (blue), then turn orange, then purple (a dog of Drift 7)
  boostSeconds: [0.6, 1.2, 1.8],   // the boost each is worth (Drift 7)
  speed: 1.06,         // top speed as a skid starts (any dog: so that it does not look as if it slows to drift)...
  speedGain: 0.09,     // ...and this much more by the time it has been held `speedSeconds` (it pulls away from a dog not drifting)
  speedSeconds: 3,     //    (when the sparks turn purple, for a dog of Drift 7)
  speedQuick: 2,       // how much faster speed builds in a skid, so that it keeps up
  boostSpeed: 1.2,     // top speed in the boost (a Golden Bone is 1.3)
  boostQuick: 2,       // how much faster speed builds while it lasts
  boostKick: 0.6,      // share of the extra speed given straight away (fed in over DRIFT_ARC.kickSeconds, not in one jump)
  easeOut: 0.4,        // seconds over which the boost fades at the end
  statCharge: 0.1,     // how much sooner the sparks come per point of Drift over 7
  statBoost: 0.08,     // how much longer the boost lasts per point
  // How it looks (the game, not the rules)
  swing: 0.38,         // how far the dog is turned into the corner beyond the way it is heading (radians)
  lean: 0.5,           // its lean and the curve of its body, against an ordinary hard turn: it stays upright
  poseIn: 14,          // how quickly its legs fold into the slide, and straighten out of it into the run
  hopSeconds: 0.26,    // the little hop that starts a skid...
  hopHeight: 0.11,     // ...and how high (share of its size)
};

// The drift's own curve, and how it is steered.  The radii are at any speed (a drift is a curve, not a spin): for
// scale, most bends in the game are 50 to 250 m round and the tightest tenth of them 25 to 120 m.
export const DRIFT_ARC = {
  radius: { tight: 16, base: 40, wide: 150 },   // metres: arrow into the corner / no arrow / arrow out of it (agility 7)
  agility: 0.06,       // each point of agility over 7 makes all three this share tighter (Meela wider; Ralph, Rocky tighter)
  steerRate: 3.5,      // how quickly the arrows move the drift between wide and tight (the whole way, -1 to 1, is 2)
  yawAccel: 3,         // radians a second, a second: the most the turn itself can change by (no snapping)
  weight: [0.8, 1.2],  // the quickness of both, for the heaviest dog and the lightest (by size: Jazz and Enzo are slow to answer)
  hopSeconds: 0.25,    // HOP: the curve begins at once, but the sparks only build once it is down
  exitSeconds: 0.35,   // EXITING: for this long after letting go...
  exitResponse: 0.45,  // ...the ordinary steering answers at this share of its usual quickness, carrying on from the drift's turn
  grip: 6,             // how tightly travel follows the curve (an ordinary sprint is 5): a little slide outwards, never much
  kickSeconds: 0.25,   // a boost's first burst of speed is fed in over this long
};

/**
 * One dog's drift: its three curves (as curvature, 1 / radius in metres) and how quickly it answers.
 * agility: its stat.  size: its weight in collisions (src/config/dogs.js `size`, 1 for most).  control: its perk (DRIFT_PERKS)
 */
export function driftArc({ agility = 7, size = 1, control = 1 } = {}) {
  const tighter = Math.max(0.6, 1 - (agility - 7) * DRIFT_ARC.agility);
  const mass = Math.pow(size, 1.5), [heavy, light] = DRIFT_ARC.weight;
  const quick = Math.max(heavy, Math.min(light, 1 / Math.sqrt(mass)));
  const { tight, base, wide } = DRIFT_ARC.radius;
  return {
    tight: 1 / (tight * tighter / Math.sqrt(control)), base: 1 / (base * tighter), wide: 1 / (wide * tighter * control),
    steerRate: DRIFT_ARC.steerRate * quick, yawAccel: DRIFT_ARC.yawAccel * quick,
  };
}

/** The drift's curvature (1 / radius) for this much steering into it: 1 all the way in, 0 none, -1 all the way out.  Never below the wide curve. */
export function driftCurvature(arc, guide) {
  const g = Math.max(-1, Math.min(1, guide));
  return g >= 0 ? arc.base + (arc.tight - arc.base) * g : arc.base + (arc.wide - arc.base) * -g;
}

/**
 * Start a drift's steering: side 1 left / -1 right, yawRate the dog's turn as it starts (radians a second, + left).
 * Given its arc and speed, the drift starts on the curve the dog was already turning (as near as the drift can hold
 * it) and the arrows ease it from there: no lurch into the corner as it begins.
 * The state is { side, guide, yawRate, turned (radians, the last step), seconds }, moved on by driftStep.
 */
export function driftSteering(side, yawRate = 0, arc = null, speed = 0) {
  let guide = 0;
  if (arc && Math.abs(speed) > 1) {
    const k = Math.max(0, yawRate * side) / Math.abs(speed);         // the curve it was on, its own way round
    guide = k >= arc.base ? Math.min(1, (k - arc.base) / (arc.tight - arc.base)) : -Math.min(1, (arc.base - k) / (arc.base - arc.wide));
  }
  return { side, guide, yawRate, turned: 0, seconds: 0 };
}

/**
 * One step of a drift's steering.  input: the arrows (-1 to 1, + left).  speed: m/s.  curvature: instead of the arrows,
 * the curve wanted (accessibility mode's own drift).  The arrows move `guide` towards in or out at the arc's steerRate; the
 * turn (`yawRate`, radians a second, + left) follows the curve at the dog's speed, changing by no more than yawAccel a
 * second.  Both change steadily, whatever the frame rate.  Returns the state.
 */
export function driftStep(state, arc, { input = 0, speed, dt, curvature = null }) {
  const want = Math.max(-1, Math.min(1, input * state.side)), most = arc.steerRate * dt;
  state.guide += Math.max(-most, Math.min(most, want - state.guide));
  const curve = curvature == null ? driftCurvature(arc, state.guide) : Math.max(arc.wide, Math.min(arc.tight, curvature));
  const target = state.side * curve * Math.abs(speed), turn = arc.yawAccel * dt, was = state.yawRate;
  state.yawRate += Math.max(-turn, Math.min(turn, target - state.yawRate));
  state.turned = (was + state.yawRate) / 2 * dt;          // how far it turned this step (the average of the turn over it)
  state.seconds += dt;
  return state;
}

// The dogs that are slow on the straights get more out of a skid than their Drift stat alone gives them:
//   speed    how much faster than their top speed they go as a skid starts (it builds from there: driftSpeedNow)
//   control  how much tighter and wider the arrows can take their drift (1 = as any dog): driftArc
//   charge   how much sooner their sparks come (on top of their Drift stat)
//   boost    what letting go is worth to them.  As soon as their sparks are blue it is a Golden Bone's boost
//            (the same speed, for the same time, arriving as quickly), and longer still for orange and purple
// Each of them has a skid of its own to go with it (src/config/dogs.js `skid`): Enzo glides round on his belly,
// Ralph hops on a skateboard, and one of the pug twins jumps on the other's back.
const BONE = {
  speed: BONE_BOOST.speedMultiplier, quick: BONE_BOOST.accelerationMultiplier, kick: BONE_BOOST.instantKick, easeOut: BONE_BOOST.easeOut,
  seconds: [BONE_BOOST.duration, BONE_BOOST.duration + 0.5, BONE_BOOST.duration + 1],
};
const PERK = { speed: 1.12, control: 1.4, charge: 1.6, boost: BONE };
export const DRIFT_PERKS = { enzo: PERK, ralph: PERK, baz_naz: PERK, jimmy: PERK };
const NO_PERKS = { speed: DRIFT.speed, control: 1, charge: 1, boost: null };
export const driftPerks = dogId => DRIFT_PERKS[dogId] ?? NO_PERKS;

// Accessibility mode has four keys (left, right, jump, item) and no drift button: there the dog drifts by itself.
// Holding an arrow into a bend for a moment starts the skid, the skid follows the road round, and letting go of
// the arrow lets go of the skid, into whatever boost its sparks have earned.
export const AUTO_DRIFT = {
  hold: 0.33,        // seconds an arrow has to be held before a skid starts (a tap to change line does not start one)
  bend: 0.012,       // how much the road has to bend that way for one to start (1 / its radius in metres)
  line: 0.4,         // where across the road the skid settles: this share of the way from the middle to the inside edge
  aim: 0.25,         // how sharply it heads for that line when it is right across the road from it (radians)
  gain: 2.5,         // how quickly it comes round to the heading it wants (a second)
  into: 0.5,         // the sparks build as if the steering were this far into the skid
  wall: 0.5,         // share of a wall's cost the dog pays (it did not choose to skid)
};

/**
 * Should the dog be in a skid by itself?  turn: the arrow held (-1 to 1; left is +).  heldFor: seconds it has
 * been held that way.  bend: how the road ahead bends (1 / radius, left is +).  side: the skid it is already in (1, -1) or 0
 */
export function autoDriftHeld({ turn, heldFor, bend, side = 0 }) {
  if (Math.abs(turn) < DRIFT.startTurn) return false;
  if (side) return Math.sign(turn) === side;                      // (held until the arrow is let go, or the other one pressed)
  return heldFor >= AUTO_DRIFT.hold && bend * Math.sign(turn) >= AUTO_DRIFT.bend;
}

/**
 * The curve an automatic drift wants (1 / radius in metres, positive).  It is steered for the player: round with the
 * road, easing over to a line a little inside the middle of it and holding that, so that however long the arrow is
 * held it runs into neither wall.  driftStep keeps it between the dog's wide and tight curves.
 *   bend       1 / radius of the road, either sign      speed     m/s
 *   off        how far the dog's travel points away from the road, towards the inside of the bend (radians)
 *   inside     how far it is from the middle of the road, towards the inside of the bend (m)
 *   halfWidth  of the road (m)
 */
export function autoDriftCurvature({ bend, speed, off = 0, inside = 0, halfWidth = 8 }) {
  const aim = Math.max(-1, Math.min(1, (AUTO_DRIFT.line * halfWidth - inside) / halfWidth)) * AUTO_DRIFT.aim;
  return Math.max(0, Math.abs(bend) + AUTO_DRIFT.gain * (aim - off) / Math.max(Math.abs(speed), 1));
}

/** Can a skid start?  turn: the steering, -1 to 1.  effort: 0 an easy run, 1 flat out. */
export function driftCanStart({ held, turn, effort, grounded }) {
  return Boolean(held && grounded && Math.abs(turn) >= DRIFT.startTurn && effort >= DRIFT.startEffort);
}

const lerp3 = (out, held, into, s) => (s >= 0 ? held + (into - held) * s : held + (out - held) * -s);

/** How fast the sparks build (charge per second) for a dog of this Drift stat.  charge: its perk (DRIFT_PERKS) */
export function driftChargeRate(drift, into, charge = 1) {
  return lerp3(DRIFT.chargeOut, DRIFT.chargeHeld, DRIFT.chargeIn, Math.max(-1, Math.min(1, into))) * statScale(drift, DRIFT.statCharge) * charge;
}

/** Which sparks the dog has: 0 none yet, 1 blue, 2 orange, 3 purple */
export function driftTier(charge) {
  return DRIFT.tiers.reduce((tier, at, i) => (charge >= at ? i + 1 : tier), 0);
}

/** Seconds of boost for letting go at this tier (0 for none) */
export function driftBoostSeconds(drift, tier) {
  return tier > 0 ? DRIFT.boostSeconds[tier - 1] * statScale(drift, DRIFT.statBoost) : 0;
}

/**
 * The boost a dog gets for letting go of a skid at this tier, or null for none:
 * { seconds, speed (top speed multiplier), quick (how much faster speed builds), kick (share of the extra
 * speed given at once), easeOut (seconds it fades over at the end) }.  perks: the dog's (driftPerks)
 */
export function driftBoost(drift, tier, perks = NO_PERKS) {
  if (tier <= 0) return null;
  if (perks.boost) { const { seconds, ...rest } = perks.boost; return { ...rest, seconds: seconds[tier - 1] }; }
  return { seconds: driftBoostSeconds(drift, tier), speed: DRIFT.boostSpeed, quick: DRIFT.boostQuick, kick: DRIFT.boostKick, easeOut: DRIFT.easeOut };
}

/** Top speed multiplier `held` seconds into a skid (perks: the dog's, driftPerks): it builds the longer it is held */
export function driftSpeedNow(held, perks = NO_PERKS) {
  return perks.speed + DRIFT.speedGain * Math.min(1, Math.max(0, held) / DRIFT.speedSeconds);
}

/** Top speed multiplier with `left` seconds of the boost still to run (it fades over the last of them) */
export function driftBoostNow(left, speed = DRIFT.boostSpeed, easeOut = DRIFT.easeOut) {
  return left > 0 ? 1 + (speed - 1) * Math.min(1, left / easeOut) : 1;
}
