// Computer-controlled dogs.  The server runs one of these for every dog without a player: each
// tick it says where the dog now is, exactly as a player's game would, and the server treats that
// move like anyone else's (checkpoints, falls, the catapult, hits, pickups).
//
// A computer dog is one of the five dogs with that dog's own stats: the same top speed, the same
// acceleration, the same loss of speed in a tight turn, the same hills, water and boosts.  It follows
// the road (the line the pickups are placed on), choosing how far to the left or right of the middle
// to run: the inside of a bend, round what is in the way, through a Treat Box.  How well it does
// that, and how fast it dares go, is its level (BOT_LEVELS).  None of them is given speed a player
// could not have: there is no catching up or easing off behind the scenes.
//
//   const bot = createBot({ mapId, dog, level, seed, groundAt });
//   bot.place(position, rotation);                    // on the grid
//   const move = bot.step(dt, world);                 // { position, rotation, animation, useItem, stuck }
//   bot.place(position, rotation, effect);            // the server moved it (a landing, a respawn...)
//   bot.hit(stunMs);  bot.boost();                    // knocked over; ate a golden bone
import { PICKUP_PATHS, GOLDEN_BONE_SPOTS } from '../shared/pickupSpots.js';
import { PROCEDURAL_TRACKS } from '../shared/maps.js';
import { TREAT_BOXES_BY_MAP } from '../shared/treatBoxes.js';
import { DOG_STATS, DOG_STRIDE_BANDS, STAT_EFFECT, BASE_SPEED, statScale, turnSpeedLoss, pickupShare, downhillSpeed } from '../shared/dogStats.js';
import { HANDLING, JUMP, STEEP_JUMP, DROP, WALL, speedAfterWall } from '../shared/handling.js';
import { BONE_BOOST, PAD_KICK, TOY } from '../shared/items.js';
import { SPECIALS, SPECIAL_ITEM, bellyBounce } from '../shared/specials.js';
import { DRIFT, driftPerks, driftTurn, driftChargeRate, driftTier, driftBoost, driftBoostNow } from '../shared/drift.js';
import { WENDOVER, woodlandWaterAt, woodlandDogY, woodlandSwimMultiplier } from '../shared/wendoverData.js';
import { BURROWS } from '../shared/burrows.js';
import frostpeak from '../shared/frostpeak.json' with { type: 'json' };
import { BOT_LEVELS } from '../shared/botLevels.js';

// How the dog of a player who has dropped out for a moment is driven until they are back: a steady jog
// up the middle of the road, round what is in the way and over what has to be jumped, touching nothing.
export const AWAY_DRIVER = {
  name: 'Away', pace: 0.5, line: 0, wander: 0, foresight: 0.7, jumpMiss: 0, reaction: [0, 0],
  itemDelay: [1e9, 1e9], itemSense: 1, pickups: 0, dodges: true,
};

const BRAKING = 14;            // m/s² a dog sheds when it has to slow (a player's dog: 11 easing off for a turn, 22 braking)
const EDGE_MARGIN = 1.1;       // metres it keeps from the edge of the road
const CLEARANCE = 1.25;        // metres it leaves round something it is steering past (on top of the thing's own radius)
const STUCK_SECONDS = 6;       // no progress for this long: ask to be put back on the road

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// A small seeded random number generator: each dog has its own, so a race can be replayed in a test
function randomFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------
// THE ROAD, AS A COMPUTER DOG SEES IT
// ---------------------------------
// One sample every metre of the lap: the middle of the road, its height, half width, heading and
// curvature.  A place on the road is (s, lateral): metres round the lap and metres to the side of the
// middle, to the same side as PICKUP_PATHS' pointAt(s, lateral).

// Things on Wendover's road that have to be jumped (logs, the hay bales): wendover_woods/track_info.json "jumps"
const WENDOVER_JUMPS = [[129.5, -110], [290.8, -187.4], [285.8, -215.9], [280.7, -244.5], [275.7, -273.1], [224.4, -298.7], [-104, 0]];

const routes = new Map();

export function botRoute(mapId) {
  if (!routes.has(mapId)) routes.set(mapId, buildRoute(mapId));
  return routes.get(mapId);
}

function buildRoute(mapId) {
  const path = PICKUP_PATHS[mapId], track = PROCEDURAL_TRACKS[mapId] ?? null;
  const n = Math.max(8, Math.round(path.length)), step = path.length / n, length = path.length;
  const raw = Array.from({ length: n }, (_, i) => path.pointAt(i * step));
  const at = i => ((i % n) + n) % n;
  // Wendover and Frostpeak are drawn from straight pieces 5 and 10 m long: round the corners off
  const reach = track ? 0 : 6;
  const smooth = (values, r) => values.map((_, i) => {
    let sum = 0, total = 0;
    for (let k = -r; k <= r; k++) { const w = r + 1 - Math.abs(k); sum += values[at(i + k)] * w; total += w; }
    return sum / total;
  });
  const X = smooth(raw.map(p => p.x), reach), Y = smooth(raw.map(p => p.y), reach), Z = smooth(raw.map(p => p.z), reach);
  const HW = raw.map(p => p.halfWidth);
  const H = X.map((_, i) => Math.atan2(X[at(i + 1)] - X[at(i - 1)], Z[at(i + 1)] - Z[at(i - 1)]));
  // (+ when the road bends towards the + lateral side)
  const K = smooth(H.map((_, i) => -wrapAngle(H[at(i + 1)] - H[at(i - 1)]) / (2 * step)), 2);
  const mod = s => ((s % length) + length) % length;

  function pointAt(s, lateral = 0) {
    const f = mod(s) / step, i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
    const heading = H[i] + wrapAngle(H[j] - H[i]) * t;
    return {
      x: lerp(X[i], X[j], t) - Math.cos(heading) * lateral, y: lerp(Y[i], Y[j], t), z: lerp(Z[i], Z[j], t) + Math.sin(heading) * lateral,
      heading, halfWidth: lerp(HW[i], HW[j], t), curvature: lerp(K[i], K[j], t),
    };
  }

  /** Where on the road a position is: { s, lateral, distance }.  hintS: about where it was last time. */
  function locate(position, hintS = null) {
    const [x, y, z] = position;
    const nearest = (from, to) => {
      let best = -1, bestD = Infinity;
      for (let k = from; k <= to; k++) {
        const i = at(k), dy = Number.isFinite(y) ? (Y[i] - y) * 0.5 : 0;      // (height tells apart two roads that cross)
        const d = (X[i] - x) ** 2 + (Z[i] - z) ** 2 + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      return { i: best, d: Math.sqrt(bestD) };
    };
    let found = null;
    if (hintS !== null) {
      const centre = Math.round(mod(hintS) / step);
      found = nearest(centre - 60, centre + 60);
      if (found.d > HW[found.i] + 25) found = null;
    }
    found ??= nearest(0, n - 1);
    const i = found.i, dx = x - X[i], dz = z - Z[i], sin = Math.sin(H[i]), cos = Math.cos(H[i]);
    return { s: mod(i * step + dx * sin + dz * cos), lateral: -dx * cos + dz * sin, distance: found.d };
  }

  const ahead = (to, from) => mod(to - from + length / 2) - length / 2;       // metres from one s to another, the short way

  // ----- what stands in the road, and what has to be jumped
  const obstacles = [];     // { s, lateral, radius }: steer round
  const jumps = [];         // { id, s0, s1, height }: be at least `height` off the ground from s0 to s1
  const narrow = [];        // { from, to, half }: stretches where it must keep nearer the middle
  const pads = [];          // { from, to }: the run on to the catapult or the cannon, which only takes a dog that is near the ground
  const place = (x, y, z) => locate([x, y, z]);
  if (track?.chasms) {
    for (const c of track.chasms) jumps.push({ id: `gap-${c.index}`, s0: c.gapStart + 0.4, s1: c.gapEnd - 0.4, height: 0.35, must: true });
    // (the bridges are railed, and narrower than the road)
    for (const c of track.chasms) narrow.push({ from: c.ravineStart - 12, to: c.ravineEnd + 4, half: Math.min(...[c.ravineStart, c.s, c.ravineEnd].map(s => pointAt(s).halfWidth)) - 1.3 });
  }
  // moving platforms (Neon Nexus): every break between them has to be jumped, and each has to be steered for
  const sliders = [];
  for (const zone of track?.platforms ?? []) {
    const edges = [zone.sStart, ...zone.pads.flatMap(pad => [pad.s0, pad.s1]), zone.sEnd];
    // (a rope bridge is one platform from end to end: no breaks to jump)
    for (let k = 0; k < edges.length; k += 2) if (edges[k + 1] - edges[k] > 1) jumps.push({ id: `${zone.id}-gap-${k / 2}`, s0: edges[k] + 0.4, s1: edges[k + 1] - 0.4, height: 0.35, must: true });
    for (const pad of zone.pads) sliders.push({ s0: pad.s0, s1: pad.s1, half: pad.half, lateralAt: t => track.padLateral(pad, t) });
  }
  // doorways (Kombu's House, the Vets): line up for them in good time
  for (const door of track?.doors ?? []) narrow.push({ from: door.s - 26, to: door.s + (door.depth ?? 4) / 2 + 1, half: door.width / 2 - 1.5 });
  if (track?.obstacles) for (const o of track.obstacles) obstacles.push({ s: o.s, lateral: o.lateral, radius: o.radius });
  // the pig pen's mud (slow, and a pig trots round each wallow) and the ground the windmill's sails sweep:
  // nothing solid, but a dog that knows the farm keeps out of them
  for (const patch of track?.mud ?? []) obstacles.push({ s: patch.s, lateral: patch.lateral, radius: patch.across - CLEARANCE + 0.25, reach: patch.along + 1, optional: true });
  if (track?.mill) obstacles.push({ s: track.mill.s, lateral: track.mill.side * (pointAt(track.mill.s).halfWidth - 1.7), radius: 2.3, reach: 4, optional: true });
  // the Water Park's fountain jets: there is room to run between them
  for (const jet of track?.jets ?? []) obstacles.push({ s: jet.s, lateral: (jet.lane - 1) * 0.62 * pointAt(jet.s).halfWidth, radius: jet.radius, optional: true });
  if (track?.barn) narrow.push({ from: track.barn.start - 14, to: track.barn.end + 4, half: track.barn.inside - 1.2 });
  for (const launch of track?.launches ?? (track?.launch ? [track.launch] : [])) {
    narrow.push({ from: launch.padStart - 30, to: launch.takeoffS + 2, half: pointAt(launch.landingS).halfWidth - 1.8 });
    pads.push({ from: launch.padStart - 30, to: launch.takeoffS + 6 });
  }
  if (mapId === 'wendover') {
    WENDOVER_JUMPS.forEach(([x, z], k) => { const { s } = locate([x, NaN, z]); jumps.push({ id: `hop-${k}`, s0: s - 0.8, s1: s + 0.8, height: 0.9 }); });
    // the pools are swum down the middle: the banks beside them are bog
    for (const pool of WENDOVER.pools) narrow.push({ from: pool.sStart - 15, to: pool.sEnd + 6, half: 4.5 });
  }
  if (mapId === 'frostpeak') {
    for (const o of path.slalom) obstacles.push({ s: o.s, lateral: o.lateral * pointAt(o.s).halfWidth, radius: o.radius });
    for (const o of frostpeak.obstacles) { const p = place(...o.position); obstacles.push({ s: p.s, lateral: p.lateral, radius: o.length / 2 }); }
    const takeoff = place(...frostpeak.cannon.takeoff);
    narrow.push({ from: path.runStartS - 30, to: takeoff.s + 2, half: frostpeak.cannon.padHalfWidth - 1.6 });
    pads.push({ from: path.runStartS - 30, to: takeoff.s + 6 });
  }
  obstacles.sort((a, b) => a.s - b.s);

  /** How far from the middle of the road a dog may run at s. */
  function limitAt(s) {
    let half = pointAt(s).halfWidth - EDGE_MARGIN;
    for (const r of narrow) if (ahead(s, r.from) >= 0 && ahead(s, r.to) <= 0) half = Math.min(half, r.half);
    return Math.max(0.5, half);
  }

  /** Is s on the run on to the catapult or the cannon? */
  const onPad = s => pads.some(r => ahead(s, r.from) >= 0 && ahead(s, r.to) <= 0);

  // ----- pickups, in road terms
  const boxes = (TREAT_BOXES_BY_MAP[mapId] ?? []).map(box => ({ id: box.id, ...locate(box.groundPosition, box.s) }));
  const bones = (GOLDEN_BONE_SPOTS[mapId] ?? []).map((spot, index) => ({ index, ...locate([spot.x, spot.y, spot.z], spot.s) }));

  // ----- Ralph's burrows: where to run to go down one
  const burrows = (BURROWS[mapId] ?? []).map(t => ({ id: t.id, ...locate(t.entry, t.entryS) }));

  /**
   * The ground under (x, z): { y, speed, hills, swimming, hint }.  speed: the share of its top speed the
   * dog keeps there; hills: whether that already counts the slope.
   */
  function groundAt(x, z, s, dog, swimming, hint, heightAt, airborne = false) {
    if (track) {
      const q = track.query(x, z, hint);
      return {
        y: q.dogY ?? q.y, hint: q.index, swimming: q.movement === 'swim',
        speed: track.speedFactor ? track.speedFactor(q, { stamina: 0.5, swimming: clamp(swimming / 10, 0, 1) }, airborne) : 1,
        hills: Boolean(track.speedFactor),
        kick: airborne ? null : q.kick ?? null,       // a boost pad whose boost stays with the dog
      };
    }
    if (mapId === 'wendover') {
      const water = woodlandWaterAt(x, z);
      if (water) return { y: woodlandDogY(water, dog), speed: water.inWater ? woodlandSwimMultiplier(swimming) : 1, hills: water.inWater, swimming: water.swimming, hint: -1 };
    }
    return { y: heightAt ? heightAt(x, z) : pointAt(s).y, speed: 1, hills: false, swimming: false, hint: -1 };
  }

  return {
    mapId, length, pointAt, locate, ahead, limitAt, onPad, groundAt, obstacles, jumps, boxes, bones, burrows, sliders,
    steep: mapId === 'frostpeak', drops: Boolean(track?.drops?.length),
    // the farm's tractor, sheep, pigs, sails and rolling bales: where they are is a matter of the race clock
    hazardHit: track?.hazardHit ?? null,
    hazardZones: Object.values(track?.hazardZones ?? {}).flat(),
    // the Water Park's rubber rings, and what one does to a dog that lands on it
    // how slippery the road is at s (the mud run), 0 to 1
    slipAt: track?.slipAt ?? (() => 0),
    rings: track?.rings ?? [], ringAt: track?.ringAt ?? (() => null), bounce: track?.rules.bounce ?? null,
    // a second road beside the main one for a while (Neon Nexus): { id, side, centre, half, slope, branch } at s, or null
    branchAt: track?.branches?.length ? track.branchAt : null,
  };
}

// ---------------------------------
// ONE COMPUTER DOG
// ---------------------------------

/**
 * mapId, dog: where it races and which dog it is.  level: 'easy' | 'medium' | 'hard' (or a level of its own, like AWAY_DRIVER).  seed: for its own
 * dice.  heightAt(x, z): the ground height where the map has a height map (Frostpeak).
 */
export function createBot({ mapId, dog, level = 'medium', seed = 1, heightAt = null }) {
  const route = botRoute(mapId), L = (typeof level === 'object' ? level : BOT_LEVELS[level]) ?? BOT_LEVELS.medium, random = randomFrom(seed);
  const stats = DOG_STATS[dog] ?? DOG_STATS.gsp, special = SPECIALS[dog] ?? null;
  const speedScale = statScale(stats.speed, STAT_EFFECT.speed);
  const runSpeed = BASE_SPEED.run * speedScale, sprintSpeed = BASE_SPEED.sprint * speedScale;
  const acceleration = BASE_SPEED.acceleration * statScale(stats.acceleration, STAT_EFFECT.acceleration);
  const turnSlow = HANDLING.turnRateSlow * statScale(stats.agility, STAT_EFFECT.agilityTurnSlow);
  const turnSprint = HANDLING.turnRateSprint * statScale(stats.agility, STAT_EFFECT.agilityTurn);
  // (a dog with poor grip runs wide of where it points, so a bend asks more of it)
  const cornering = turnSprint * Math.sqrt(statScale(stats.agility, STAT_EFFECT.agilityGrip));
  const turnLoss = turnSpeedLoss(stats.agility, HANDLING.turnSpeedLoss);
  const waterAcceleration = lerp(0.5, 1, clamp((stats.swimming - 4) / 6, 0, 1));
  const strideBands = DOG_STRIDE_BANDS[dog] ?? 1;
  const between = ([a, b]) => lerp(a, b, random());

  // where it is and how it is moving
  let s = 0, lateral = 0, sideSpeed = 0, speed = 0, yaw = 0, hint = -1;
  let position = [0, 0, 0], groundY = 0, slope = 0;
  let jumpHeight = 0, jumpSpeed = 0, jumpGravity = JUMP.gravity, jumping = false, ringHop = 0;
  // its clocks, in seconds of its own running time
  let specialBegan = 0;        // when its special last started (Enzo's bounces are counted from it)
  // Drifting (shared/drift.js), toned down for a computer dog by its level's `drift`:
  //   skid       the skid it is in: { side: 1 left / -1 right, charge, until, wallAt (when it will go wrong, or null) }
  //   skidBoost  the boost it let go into: { speed, quick, easeOut, until }
  //   inBend     it is in a bend it has already made its mind up about
  //   wideUntil  it has run wide into the wall, and is against it until then: { until, side }
  const perks = driftPerks(dog), drifting = L.drift ?? { chance: 0, seconds: 0, wall: 0 };
  let skid = null, skidBoost = null, inBend = false, wide = null;
  let time = 0, startAt = between(L.reaction), stunUntil = 0, boneUntil = -1, effect = null, kick = null;       // kick: { speed, until, quick } from a held boost pad
  let progressAt = 0, progressS = 0, travelled = 0, finishing = false;
  // how it is driving
  const lane = (random() - 0.5) * 0.5, phase = [random() * 7, random() * 7];
  const decided = new Map();       // things it makes up its mind about once (go for that box? fluff that jump?)
  let heldItem = null, heldFor = 0, useAfter = 0, animation = 'Idle', attempt = 0;

  const decide = (key, chance) => {
    if (!decided.has(key)) { if (decided.size > 200) decided.clear(); decided.set(key, random() < chance); }
    return decided.get(key);
  };
  const lap = () => Math.floor(travelled / route.length);

  function place(at, rotation, change = null) {
    const found = route.locate(at, change ? null : s);
    s = found.s;
    const reach = route.branchAt?.(s) ? Infinity : route.pointAt(s).halfWidth;       // (it may be on a second road, well out to the side)
    lateral = clamp(found.lateral, -reach, reach);
    sideSpeed = 0; yaw = rotation; hint = -1; skid = null; inBend = false;
    position = [...at]; groundY = at[1];
    jumpHeight = jumpSpeed = 0; jumping = false; ringHop = 0;
    if (change) {                          // a landing, a respawn, the far end of a burrow: { speed, seconds, running }
      effect = { speed: change.speed, until: time + change.seconds };
      attempt += 1;                        // (a fresh go at whatever it got wrong)
      speed = change.running ? sprintSpeed * change.speed : 0;
      boneUntil = -1; kick = null;
    }
    progressAt = time; progressS = travelled;
  }

  // ----- top speed here and now, as a player's dog has it (LocalDog #accelerate)
  function topSpeed(ground, world) {
    const hill = ground.hills ? 1
      : route.steep && slope < 0 ? Math.min(1.75, 1 - 1.7 * slope)
      : clamp(1 - HANDLING.hillEffect * slope, 0.8, 1.08);
    const boneLeft = boneUntil - time;
    const bone = boneLeft <= 0 ? 0 : Math.min(1, boneLeft / BONE_BOOST.easeOut);
    const kickLeft = kick ? kick.until - time : 0, padBoost = kickLeft > 0 ? 1 + (kick.speed - 1) * Math.min(1, kickLeft / PAD_KICK.easeOut) : 1;
    return sprintSpeed * ground.speed * hill
      // (a landing boost and a boost pad's do not add up: the greater of the two; a slow-down after a fall still counts)
      * (padBoost > 1 && !(effect && time < effect.until && effect.speed < 1) ? Math.max(padBoost, effect && time < effect.until ? effect.speed : 1) : effect && time < effect.until ? effect.speed : 1)
      * (1 + (BONE_BOOST.speedMultiplier - 1) * bone)
      * (world.special?.speed ?? 1)
      * (world.slowed ?? 1)                                      // (Jazz's Earthquake)
      * downhillSpeed(stats, slope)                              // (Jimmy's wheels, where the road drops)
      // (a slow dog is a little faster than flat out in a skid; out of one, its boost.  The better of the two, and neither on top of a Golden Bone)
      * (boneLeft > 0 ? 1 : Math.max(skid ? perks.speed : 1, skidBoost ? driftBoostNow(skidBoost.until - time, skidBoost.speed, skidBoost.easeOut) : 1))
      * (time < stunUntil ? 0.15 : 1);
  }

  // ----- the fastest it can take the road at s without running wide (LocalDog #turn)
  function cornerSpeed(at, side, top) {
    const point = route.pointAt(at), bend = Math.abs(point.curvature) / Math.max(0.5, 1 - point.curvature * side);
    if (bend < 1e-4) return top;
    // (on wet ground a dog slides wide, so it can hold less of a bend)
    // (in a skid it turns tighter, and the turn costs it no speed: that is what a skid is for)
    const hold = cornering * (1 - 0.45 * route.slipAt(at)) * (skid ? driftTurn(0.6, perks.control) : 1);
    const demand = bend * top / hold;                       // how much of its steering the bend needs flat out
    if (demand <= 1) return top * (1 - (skid ? 0 : turnLoss) * demand);
    return Math.max(4, Math.min(top * (1 - (skid ? 0 : turnLoss)), lerp(turnSlow, hold, 0.5) / bend));
  }

  // ----- drifting.  At each bend it comes to it may go into a skid (its level's chance); it holds it to the end of
  // the bend or for as long as its level allows, whichever is first, and lets go into whatever boost its sparks
  // have earned by then.  Now and then (its level's chance again) the skid goes wrong instead: it runs wide into
  // the wall, loses speed as a player's dog would, and gets nothing.
  const BEND = 0.018;       // how tight a bend has to be to skid round (1 / its radius in metres)
  function driftRound(dt, ground, world) {
    const bend = route.pointAt(s + Math.max(2, speed * 0.2)).curvature, tight = Math.abs(bend) >= BEND;
    const effort = clamp((speed - runSpeed * 0.5) / (sprintSpeed - runSpeed * 0.5), 0, 1);
    const able = !jumping && !finishing && !world.special && time >= stunUntil && !ground.swimming && !(wide && time < wide.until);
    if (skid) {
      if (!able || effort < DRIFT.endEffort) { skid = null; return; }                     // lost it: nothing for it
      skid.charge += driftChargeRate(stats.drift, 0.5, perks.charge) * dt;
      if (skid.wallAt != null && time >= skid.wallAt) {
        // into the wall: the skid is over, and so is its speed
        wide = { until: time + 0.7, side: skid.side };
        speed = Math.min(speedAfterWall(speed, 0.35), sprintSpeed * WALL.scrape);
        skid = skidBoost = null;
      } else if (Math.abs(bend) < BEND * 0.6 || time >= skid.until) {
        // out of the bend (or it has held it as long as it dares): let go
        const earned = driftBoost(stats.drift, driftTier(skid.charge), perks);
        if (earned && boneUntil <= time) {                 // (a Golden Bone's boost and a skid's do not add up)
          skidBoost = { ...earned, until: time + earned.seconds + earned.easeOut };
          if (speed > 0 && speed < sprintSpeed * earned.speed) speed = Math.min(sprintSpeed * earned.speed, speed + sprintSpeed * (earned.speed - 1) * earned.kick);
        }
        skid = null;
      }
      return;
    }
    if (!tight) { inBend = false; return; }
    if (inBend) return;
    inBend = true;                                    // (one go at each bend)
    if (!able || effort < DRIFT.startEffort || random() >= drifting.chance) return;
    const hold = lerp(0.6, 1, random()) * drifting.seconds;
    // (a bend that curves to + is a turn to the right: its rotation falls)
    skid = { side: -Math.sign(bend), charge: 0, until: time + hold, wallAt: random() < drifting.wall ? time + lerp(0.3, 0.8, random()) * hold : null };
  }

  // ----- where across the road to run
  function chooseLine(world, limit) {
    const reach = Math.max(14, speed * 1.1);
    // the bend coming up: inside it (or outside, for a dog that does not know better)
    let bend = 0, count = 0;
    for (let d = 4; d <= reach + 8; d += 4) { bend += route.pointAt(s + d).curvature; count += 1; }
    bend /= count;
    let target = limit * (clamp(bend / 0.025, -1, 1) * L.line + lane
      + L.wander * (0.6 * Math.sin(time * 0.5 + phase[0]) + 0.4 * Math.sin(time * 1.3 + phase[1])));

    // Poppy's wave steers itself, wandering from side to side
    if (world.special?.steerLocked) return clamp(Math.sin(time * 1.1) * 0.5 * route.pointAt(s).halfWidth, -limit, limit);

    // a Treat Box (when it holds nothing) or a Golden Bone it could reach
    const sideways = clamp(0.3 * speed, 1, 5.5);
    let wanted = null;
    const consider = (pickup, key) => {
      const gap = route.ahead(pickup.s, s);
      if (gap < 3 || gap > 50 || (wanted && gap > wanted.gap + 1)) return;
      if (Math.abs(pickup.lateral) > limit || Math.abs(pickup.lateral - lateral) > sideways * gap / Math.max(speed, 6) * 0.8) return;
      if (wanted && Math.abs(gap - wanted.gap) <= 1 && Math.abs(pickup.lateral - lateral) >= Math.abs(wanted.lateral - lateral)) return;
      if (!decide(`${key}:${lap()}`, L.pickups)) return;
      wanted = { gap, lateral: pickup.lateral };
    };
    if (!world.item) for (const box of route.boxes) if (!world.boxTaken?.(box.id)) consider(box, `box-${Math.round(box.s)}`);
    for (const bone of route.bones) if (!world.boneTaken?.(bone.index)) consider(bone, `bone-${bone.index}`);
    if (wanted) target = wanted.lateral;

    // the rubber rings across the water: every dog but a real swimmer goes from ring to ring
    if (stats.swimming < 9) {
      const ring = route.rings.find(r => { const gap = route.ahead(r.s, s); return gap > -1 && gap < 40; });
      if (ring) return clamp(ring.lateral, -limit, limit);
    }

    // Ralph goes down his burrows (the server takes him through when he runs into the mouth of one)
    if (dog === 'ralph' && L.itemSense > 0 && !world.special && world.burrowOpen !== false) {
      for (const burrow of route.burrows) {
        const gap = route.ahead(burrow.s, s);
        if (gap > -1 && gap < 40) return burrow.lateral;
      }
    }


    // round whatever is in the way: things standing in the road, chew toys, slower dogs
    const blocks = [];
    for (const o of route.obstacles) {
      if (o.optional && !L.dodges) continue;
      const gap = route.ahead(o.s, s);
      if (gap > -(o.reach ?? 2.5) && gap < reach + (o.reach ?? 0)) blocks.push({ gap, lateral: o.lateral, radius: o.radius, span: o.reach ?? 0 });
    }
    if (L.dodges && !world.special) {             // (a dog in its special sends a toy flying: nothing to steer round)
      for (const toy of world.toys ?? []) {
        const found = route.locate(toy.position, s), gap = route.ahead(found.s, s);
        if (found.distance < 30 && gap > -1 && gap < reach) blocks.push({ gap, lateral: found.lateral, radius: TOY.radius });
      }
    }
    if (!world.special?.hitRadius && !world.special?.flyHeight && !world.special?.rope) {
      for (const other of world.dogs ?? []) {
        if (other.finished) continue;
        const found = route.locate(other.position, s), gap = route.ahead(found.s, s);
        if (found.distance < 30 && gap > 0.5 && gap < Math.min(reach, 9) && (other.speed ?? 0) < speed) blocks.push({ gap, lateral: found.lateral, radius: 0.5 });
      }
    }
    // the farthest first, so that the nearest has the last word
    const away = block => Math.max(0, Math.abs(block.gap) - (block.span ?? 0));
    blocks.sort((a, b) => away(b) - away(a) || b.gap - a.gap);
    for (const block of blocks) {
      const need = block.radius + CLEARANCE;
      if (Math.abs(target - block.lateral) >= need) continue;
      const sides = [block.lateral + need, block.lateral - need].filter(side => Math.abs(side) <= limit);
      if (!sides.length) continue;
      target = sides.sort((a, b) => Math.abs(a - lateral) - Math.abs(b - lateral))[0];      // the side it is already nearer
    }
    return clamp(target, -limit, limit);
  }

  // ----- jumping
  // The farthest it must be from the start of something to take off and be `height` up when it gets there
  function takeoffDistance(height, force, gravity) {
    const root = Math.sqrt(Math.max(0, force * force - 2 * gravity * height));
    return { rise: (force - root) / gravity, fall: (force + root) / gravity };
  }

  function wantsToJump(world, ground) {
    if (jumping || ground.swimming || world.special || speed < 1 || route.onPad(s)) return false;
    const steep = route.steep && slope < STEEP_JUMP.below;
    const force = steep ? STEEP_JUMP.force : JUMP.force, gravity = steep ? STEEP_JUMP.gravity : JUMP.gravity;
    const tick = 0.06;
    for (const jump of route.jumps) {
      const gap = route.ahead(jump.s0, s);
      if (gap < -1 || gap > 30) continue;
      const { rise, fall } = takeoffDistance(jump.height, force, gravity);
      // (a dog too slow to stay up the whole way goes when the middle of its jump is the middle of the gap)
      const spare = speed * (fall - rise) - (jump.s1 - jump.s0);
      let from = speed * (rise + tick) - Math.min(0, spare) / 2;
      if (jump.must && decide(`${jump.id}:${lap()}:${attempt}`, L.jumpMiss)) from = -1.2;        // misjudged: goes too late
      if (gap <= from) return true;
    }
    // a chew toy it cannot steer round, a sheep or a pig about to be under its paws
    if (L.dodges) {
      const { rise } = takeoffDistance(TOY.jumpClear + 0.1, force, gravity);
      for (const toy of world.toys ?? []) {
        const found = route.locate(toy.position, s), gap = route.ahead(found.s, s);
        if (found.distance < 30 && gap > 0 && gap <= speed * (rise + tick) && Math.abs(found.lateral - lateral) < TOY.radius + 0.4) return true;
      }
    }
    return false;
  }

  // The farm's tractor, animals, sails and bales: is one going to be where this dog will be?  Returns how
  // fast it may go (it waits for what cannot be jumped) and whether to jump now.
  function watchHazards(world, top) {
    if (!route.hazardHit || world.shielded || world.special || world.raceSeconds == null) return { cap: top, jump: false };       // (nothing knocks a dog out of its special)
    if (!route.hazardZones.some(zone => Math.abs(route.ahead(zone, s)) < 45)) return { cap: top, jump: false };
    for (let ahead = 0.15; ahead <= L.foresight + 1e-6; ahead += 0.15) {
      // where it will be then: at the speed it is going, or having picked up speed on the way
      const quicker = Math.min(top, speed + acceleration * ahead);
      for (const [reach, side] of [[speed * ahead, 0], [(speed + quicker) / 2 * ahead, 0], [speed * ahead, 0.9], [speed * ahead, -0.9]]) {
        const there = route.pointAt(s + reach, lateral + side);       // (and a little to either side: nothing is cut fine)
        const hazard = route.hazardHit([there.x, there.y, there.z], world.raceSeconds + ahead);
        if (!hazard) continue;
        // a sheep or a pig: over it, if there is time to get up (the jump is highest 0.2 to 0.65 s in)
        if (hazard.height <= 1.3 && ahead >= 0.2) return { cap: top, jump: ahead <= 0.6 };
        // something that cannot be jumped (or not in time): step out of its way if there is a clear line beside it,
        // and slow down only if there is not.  (An easier dog thinks of this less often.)
        if (decide(`dodge-${hazard.id}-${Math.floor(world.raceSeconds / 4)}`, L.pace >= 0.9 ? 0.9 : 0.55)) {
          const room = route.limitAt(s + reach);
          for (const step of [2.6, -2.6, 4.8, -4.8, 7, -7]) {
            const aside = clamp(lateral + step, -room, room);
            if (Math.abs(aside - lateral) < 1.8) continue;
            const clearAt = when => { const p = route.pointAt(s + speed * when, aside); return !route.hazardHit([p.x, p.y, p.z], world.raceSeconds + when); };
            if ([ahead - 0.3, ahead - 0.15, ahead, ahead + 0.15, ahead + 0.3].every(when => when < 0 || clearAt(when))) return { cap: top, jump: false, dodge: aside };
          }
        }
        return { cap: Math.min(top, Math.max(0, speed - BRAKING * 0.3)), jump: false };
      }
    }
    return { cap: top, jump: false };
  }

  // ----- items
  function wantsToUse(world, dt) {
    if (world.item !== heldItem) { heldItem = world.item; heldFor = 0; useAfter = between(L.itemDelay); }
    if (!heldItem) return false;
    heldFor += dt;
    if (heldFor < useAfter || time < stunUntil) return false;
    if (L.itemSense === 0) return true;
    const aim = L.itemSense === 2;
    // the other dogs, as this one sees them: metres ahead of its nose (- behind) and to the side
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const seen = (world.dogs ?? []).filter(other => !other.finished).map(other => {
      const dx = other.position[0] - position[0], dz = other.position[2] - position[2];
      return { ahead: dx * fx + dz * fz, side: Math.abs(dx * fz - dz * fx), level: Math.abs(other.position[1] - position[1]) < 3 };
    });
    const inFront = (within, width) => seen.some(d => d.level && d.ahead > 3 && d.ahead < within && d.side < width);
    const behind = (within, width) => seen.some(d => d.level && d.ahead < -2 && d.ahead > -within && d.side < width);
    const straight = Math.abs(route.pointAt(s + 10).curvature) < 0.012 && Math.abs(route.pointAt(s + 25).curvature) < 0.012;
    const leading = world.place <= 1;
    switch (heldItem) {
      case 'ball': return inFront(55, aim ? 2 : 4) || heldFor > 12;
      case 'toy': return behind(22, aim ? 3 : 8) || heldFor > 10;
      case 'bone': return (straight && !world.swimming) || heldFor > 8;
      case 'frisbee': return !leading || heldFor > 10;
      case 'firework': return !leading || heldFor > 15;              // (nobody to send it after while it leads)
      case 'collar': return (world.threat ?? Infinity) < (aim ? 30 : 18) || heldFor > (aim ? 20 : 9);
      case SPECIAL_ITEM:
        if (!special) return true;
        if (special.kind === 'jet') return true;
        if (special.kind === 'dragon') return !leading || heldFor > 8;                         // Jimmy's fireworks want a leader to go after
        if (special.kind === 'flush' || special.kind === 'kelp' || special.kind === 'sheep' || special.kind === 'quake') return !leading || heldFor > 8;
        if (special.kind === 'rope') return inFront(aim ? 14 : 22, 40) || heldFor > 6;      // the twins' rope: with anyone at all just up the road
        return inFront(aim ? 22 : 35, aim ? 4 : 8) || heldFor > 6;    // the sled, the spin, the wave: with someone to run into
      default: return true;
    }
  }

  function stride(ground) {
    if (jumping) return 'Jump';
    if (ground.swimming) return 'Trot';
    if (speed < 0.1) return 'Idle';
    const pace = speed / strideBands, holding = (name, margin) => (animation === name ? margin : 0);
    if (pace < HANDLING.walkBelow + holding('Walk', 0.5)) return 'Walk';
    if (pace < HANDLING.trotBelow + holding('Trot', 0.7)) return 'Trot';
    if (pace > HANDLING.runBelow - holding('Sprint', 1.0)) return 'Sprint';
    return 'Run';
  }

  /**
   * One step of `dt` seconds.  world: what the server knows that this dog would see:
   *   { item, place, dogs: [{ position, rotation, speed, finished }], toys: [{ position }], boxTaken(id),
   *     boneTaken(index), special (its special, while it lasts), burrowOpen (Ralph may still use a burrow this lap), shielded, threat (metres to the nearest
   *     thing coming for it), raceSeconds }
   * Returns { position, rotation, animation, useItem, stuck }.
   */
  function step(dt, world = {}) {
    time += dt;
    const still = { position, rotation: yaw, animation, drift: null, useItem: false, stuck: false };
    if (time < startAt) { progressAt = time; return still; }
    // Enzo's Belly Bounce: where he is in the bounce, and the burst of speed that goes with it (as a player's Enzo has it)
    if (world.special?.bounce) world = { ...world, special: { ...world.special, ...bellyBounce(world.special, time - specialBegan), bouncing: true } };

    let ground = route.groundAt(position[0], position[2], s, dog, stats.swimming, hint, heightAt, jumping);
    hint = ground.hint;

    // ----- how fast
    if (ground.kick && time >= stunUntil) {
      if (!(kick && kick.until > time) && speed > 0) speed += sprintSpeed * (ground.kick.speed - 1) * PAD_KICK.instant;
      kick = { speed: ground.kick.speed, until: time + ground.kick.hold + PAD_KICK.easeOut, quick: ground.kick.quick ?? PAD_KICK.quick };
    }
    driftRound(dt, ground, world);
    const top = topSpeed(ground, world);
    let cap = finishing ? 0 : top * L.pace;
    if (wide && time < wide.until) cap = Math.min(cap, sprintSpeed * WALL.scrape);       // (against the wall)
    if (world.special?.speed) cap = top;                     // a special carries the dog along by itself
    const limit = route.limitAt(s + Math.max(4, speed * 0.4));
    let target = finishing ? lateral : chooseLine(world, limit);
    // a second road leaving this one: a dog makes up its mind once a lap whether to take it, and one that
    // does is carried across with it (down the middle of it, a little to its own side)
    const branch = finishing || !route.branchAt ? null : route.branchAt(s);
    const riding = branch && decide(`branch-${branch.id}:${lap()}`, branch.branch.bots ?? 0.5) ? branch : null;
    if (riding) target = riding.side * riding.centre + lane * riding.half;
    // a moving platform coming up (or under it): be where it will be when it gets there
    if (!finishing && world.raceSeconds != null) {
      const k = route.sliders.findIndex(q => route.ahead(q.s1, s) > 0 && route.ahead(q.s0, s) < 26);
      if (k >= 0) {
        const pad = route.sliders[k], next = route.sliders[k + 1], pace = Math.max(speed, 8), when = gap => world.raceSeconds + Math.max(0, gap) / pace;
        target = pad.lateralAt(when(route.ahead(pad.s0 + 4, s)));
        // near the far end of it: somewhere that is on this one now and will be on the next when it lands there
        if (next && route.ahead(next.s0, pad.s1) < 12 && route.ahead(pad.s1, s) < 12) target = (pad.lateralAt(world.raceSeconds) + next.lateralAt(when(route.ahead(next.s0 + 3, s)))) / 2;
        target = clamp(target, -limit, limit);
      }
    }
    if (!finishing) {
      cap = Math.min(cap, cornerSpeed(s, lateral, top));
      for (const share of [0.4, 0.8, 1.2]) {                  // ease off in time for the bend ahead
        const gap = Math.max(3, speed * share);
        cap = Math.min(cap, Math.sqrt(cornerSpeed(s + gap, target, top) ** 2 + 2 * BRAKING * 0.8 * gap));
      }
    }
    const hazards = finishing ? { cap, jump: false } : watchHazards(world, cap);
    cap = Math.min(cap, hazards.cap);
    if (hazards.dodge != null) target = hazards.dodge;
    if (wide && time < wide.until) target = wide.side * limit;                           // (run wide: out to the wall on the outside of the bend)
    const boneLeft = boneUntil - time;
    const effort = clamp((speed - runSpeed * 0.5) / (sprintSpeed - runSpeed * 0.5), 0, 1);
    const push = acceleration
      * pickupShare(stats.agility, HANDLING.topEndAcceleration, effort)
      * (world.special?.speed ? 2.5 : 1)
      * (boneLeft > 0 ? BONE_BOOST.accelerationMultiplier : 1)
      * (kick && kick.until > time ? kick.quick : 1)
      * (skidBoost && skidBoost.until > time ? skidBoost.quick : 1)
      * (route.steep && slope < 0 ? 1 - 4 * slope : 1)
      * (ground.swimming ? waterAcceleration : 1);
    speed = speed < cap ? Math.min(cap, speed + push * dt) : Math.max(cap, speed - (finishing ? 9 : BRAKING) * dt);
    if (ringHop && jumping && time >= stunUntil) speed = ringHop;      // thrown on by a rubber ring: carried at its pace

    // ----- across the road, then along it
    const sideways = clamp(0.3 * speed, 1, 5.5) * statScale(stats.agility, STAT_EFFECT.agilityTurn);
    if (riding) {
      const most = (sideways + Math.abs(riding.slope) * speed * 1.5 + 1) * dt, move = clamp(target - lateral, -most, most);
      sideSpeed = move / dt; lateral += move;
    } else {
      const wantedSide = clamp((target - lateral) * 3.5, -sideways, sideways);
      sideSpeed += (wantedSide - sideSpeed) * (1 - Math.exp(-5 * dt));
      if (Math.abs(sideSpeed) > speed * 0.6) sideSpeed = Math.sign(sideSpeed) * speed * 0.6;
      lateral += sideSpeed * dt;
    }
    const here = route.pointAt(s);
    const along = Math.sqrt(Math.max((speed * dt * 0.8) ** 2, (speed * dt) ** 2 - (sideSpeed * dt) ** 2)) / Math.max(0.5, 1 - here.curvature * lateral);
    s = (s + along) % route.length;
    travelled += along;

    // ----- up and down
    if (world.special?.bouncing) {
      // up and down the same arc, again and again; when it ends in mid-air he drops and lands
      jumping = true; jumpSpeed = 0; jumpGravity = JUMP.gravity;
      jumpHeight = world.special.height;
    } else if (world.special?.flyHeight) {
      // Ralph's rocket paws: up to flying height and held there (low over the catapult and the cannon,
      // which fire him like anyone else)
      jumping = true; jumpSpeed = 0; jumpGravity = JUMP.gravity;
      const height = route.onPad(s) || route.onPad(s + speed * 0.5) ? Math.min(1.4, world.special.flyHeight) : world.special.flyHeight;
      jumpHeight += (height - jumpHeight) * (1 - Math.exp(-4 * dt));
    } else if (jumping) {
      jumpSpeed -= jumpGravity * dt;
      jumpHeight += jumpSpeed * dt;
      if (jumpHeight <= 0) { jumpHeight = jumpSpeed = 0; jumping = false; ringHop = 0; }
    } else if (route.bounce && !world.special && !finishing && route.ringAt(position[0], position[2])) {
      // a rubber ring under it: thrown up and on at full pace
      jumping = true; jumpSpeed = route.bounce.force; jumpGravity = route.bounce.gravity;
      ringHop = route.bounce.pace;
    } else if (!finishing && (hazards.jump || wantsToJump(world, ground))) {
      const steep = route.steep && slope < STEEP_JUMP.below;
      jumping = true;
      jumpSpeed = steep ? STEEP_JUMP.force : JUMP.force;
      jumpGravity = steep ? STEEP_JUMP.gravity : JUMP.gravity;
    }

    // ----- where that puts it
    const point = route.pointAt(s, lateral);
    ground = route.groundAt(point.x, point.z, s, dog, stats.swimming, hint, heightAt, jumping);
    hint = ground.hint;
    // the road stops and carries on a long way below: it falls to it
    if (route.drops && groundY - ground.y > DROP.from) { jumpHeight += groundY - ground.y; if (!jumping) jumpSpeed = 0; jumping = true; jumpGravity = DROP.gravity; }
    groundY = ground.y;
    const next = [point.x, groundY + jumpHeight, point.z];
    const dx = next[0] - position[0], dz = next[2] - position[2];
    if (dx * dx + dz * dz > 1e-5) yaw += wrapAngle(Math.atan2(dx, dz) - yaw) * (1 - Math.exp(-14 * dt));
    position = next;
    const rise = (route.pointAt(s + 1.6).y - point.y) / 1.6;
    slope += (clamp(rise, route.steep ? -0.55 : -0.4, 0.4) - slope) * (1 - Math.exp(-8 * dt));
    animation = stride(ground);

    // ----- going nowhere?  (held against something, or put somewhere it cannot run from)
    let stuck = false;
    if (travelled - progressS > 3 || time < stunUntil || finishing) { progressAt = time; progressS = travelled; }
    else if (time - progressAt > STUCK_SECONDS) { stuck = true; progressAt = time; }

    return {
      position, rotation: yaw, animation: skid ? 'Sprint' : animation, stuck,
      drift: skid ? { side: skid.side, tier: driftTier(skid.charge) } : null,      // (for the players' games to draw)
      useItem: !finishing && wantsToUse({ ...world, swimming: ground.swimming }, dt),
    };
  }

  return {
    place, step,
    /** Knocked over: nearly stopped, and slow until it is back on its paws. */
    hit(stunMs) { stunUntil = time + stunMs / 1000; speed *= 0.15; boneUntil = -1; kick = null; skid = skidBoost = null; },
    /** A golden bone (the item, or one off the road). */
    boost() {
      boneUntil = time + BONE_BOOST.duration + BONE_BOOST.easeOut;
      skidBoost = null;
      if (speed > 0) speed += sprintSpeed * (BONE_BOOST.speedMultiplier - 1) * BONE_BOOST.instantKick;
    },
    /** Its special has begun: straight up to full pace. */
    specialStarted() { specialBegan = time; if (special?.speed && speed > 0) speed = Math.max(speed, sprintSpeed); },
    /** Over the line: it runs on a little way, slowing, and stops. */
    finish() { finishing = true; },
    get stopped() { return finishing && speed < 0.1; },
    get speed() { return speed; },
    get state() { return { s, lateral, speed, jumping, travelled, skid: skid ? { ...skid, tier: driftTier(skid.charge) } : null, boosting: Boolean(skidBoost && skidBoost.until > time), wide: Boolean(wide && wide.until > time) }; },
    sprintSpeed, runSpeed,
  };
}
