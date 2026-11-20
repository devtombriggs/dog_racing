// Drifting: hold the drift button through a corner and the dog hops into a skid and slides round it,
// back end out, losing none of the speed a hard turn costs.  At first there is only dust.  Hold the skid
// and sparks come at its paws: blue, then orange, then purple.  Letting go once there are sparks kicks it
// out of the corner with a boost, longer for each colour; letting go before them gives nothing.
// A slow dog is the better drifter (its Drift stat, shared/dogStats.js): its sparks come sooner and its
// boost lasts longer.

import { statScale } from './dogStats.js';
import { BONE_BOOST } from './items.js';

export const DRIFT = {
  startTurn: 0.35,     // how far the steering has to be over for a skid to start
  startEffort: 0.45,   // how hard the dog has to be running to start one (0 an easy run, 1 flat out)...
  endEffort: 0.2,      // ...and below this it has lost its pace and the skid is over, with nothing for it
  // The skid turns by itself.  Steering into it tightens the line, steering out of it opens it up
  // (shares of the dog's own turning speed at that pace)
  turnOut: 0.5, turnHeld: 0.95, turnIn: 1.4,
  grip: 3.2,           // how tightly travel follows the nose in a skid (a sprint is 5): the back end hangs out
  // The sparks.  `charge` builds by a second a second steering into the skid, more slowly holding it
  // straight and slowly steering out of it (so weaving down a straight earns next to nothing)
  chargeOut: 0.3, chargeHeld: 0.65, chargeIn: 1,
  tiers: [0.8, 1.8, 3.0],   // charge at which the sparks come (blue), then turn orange, then purple (a dog of Drift 7)
  boostSeconds: [0.6, 1.2, 1.8],   // the boost each is worth (Drift 7)
  boostSpeed: 1.2,     // top speed in the boost (a Golden Bone is 1.3)
  boostQuick: 2,       // how much faster speed builds while it lasts
  boostKick: 0.6,      // share of the extra speed given at once
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

// The dogs that are slow on the straights get more out of a skid than their Drift stat alone gives them:
//   speed    how much faster than their top speed they go while they hold a skid
//   control  how much further the steering tightens and opens their skid (1 = as any dog)
//   charge   how much sooner their sparks come (on top of their Drift stat)
//   boost    what letting go is worth to them.  As soon as their sparks are blue it is a Golden Bone's boost
//            (the same speed, for the same time, arriving as quickly), and longer still for orange and purple
// Each of them has a skid of its own to go with it (src/config/dogs.js `skid`): Enzo glides round on his belly,
// Ralph hops on a skateboard, and one of the pug twins jumps on the other's back.
const BONE = {
  speed: BONE_BOOST.speedMultiplier, quick: BONE_BOOST.accelerationMultiplier, kick: BONE_BOOST.instantKick, easeOut: BONE_BOOST.easeOut,
  seconds: [BONE_BOOST.duration, BONE_BOOST.duration + 0.5, BONE_BOOST.duration + 1],
};
const PERK = { speed: 1.08, control: 1.4, charge: 1.6, boost: BONE };
export const DRIFT_PERKS = { enzo: PERK, ralph: PERK, baz_naz: PERK };
const NO_PERKS = { speed: 1, control: 1, charge: 1, boost: null };
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
 * How hard an automatic skid turns the dog (a share of its turning speed, as driftTurn).  It is steered for the
 * player: round with the road, easing over to a line a little inside the middle of it and holding that, so that
 * however long the arrow is held it runs into neither wall.  No tighter than a skid can be; as gentle as the road is.
 *   bend       1 / radius of the road, either sign      speed     m/s
 *   turnRate   the dog's turning speed at that pace (radians a second)
 *   off        how far the dog's travel points away from the road, towards the inside of the bend (radians)
 *   inside     how far it is from the middle of the road, towards the inside of the bend (m)
 *   halfWidth  of the road (m)
 */
export function autoDriftTurn({ bend, speed, turnRate, control = 1, off = 0, inside = 0, halfWidth = 8 }) {
  const aim = Math.max(-1, Math.min(1, (AUTO_DRIFT.line * halfWidth - inside) / halfWidth)) * AUTO_DRIFT.aim;
  const rate = Math.abs(bend) * Math.abs(speed) + AUTO_DRIFT.gain * (aim - off);
  return Math.max(0.05, Math.min(driftTurn(1, control), rate / Math.max(turnRate, 1e-3)));
}

/** Can a skid start?  turn: the steering, -1 to 1.  effort: 0 an easy run, 1 flat out. */
export function driftCanStart({ held, turn, effort, grounded }) {
  return Boolean(held && grounded && Math.abs(turn) >= DRIFT.startTurn && effort >= DRIFT.startEffort);
}

const lerp3 = (out, held, into, s) => (s >= 0 ? held + (into - held) * s : held + (out - held) * -s);

/**
 * How fast the skid turns, as a share of the dog's turning speed.  into: 1 steering into the skid, -1 out of it.
 * control: the dog's perk (DRIFT_PERKS), widening how far the steering moves the skid either way
 */
export function driftTurn(into, control = 1) {
  const held = DRIFT.turnHeld;
  return lerp3(held - (held - DRIFT.turnOut) * control, held, held + (DRIFT.turnIn - held) * control, Math.max(-1, Math.min(1, into)));
}

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

/** Top speed multiplier with `left` seconds of the boost still to run (it fades over the last of them) */
export function driftBoostNow(left, speed = DRIFT.boostSpeed, easeOut = DRIFT.easeOut) {
  return left > 0 ? 1 + (speed - 1) * Math.min(1, left / easeOut) : 1;
}
