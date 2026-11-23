// Items from Treat Boxes: the rules and the geometry, shared by the server (which decides), the game
// (which draws) and the tests.
//
//   ball  — tennis ball thrown straight ahead; knocks over the first dog it reaches
//   toy   — rubber chew toy dropped behind you; stays on the road until a dog runs into it, then it is gone
//   bone  — golden bone: a speed boost for the dog that uses it
//   frisbee — red frisbee: chases down the dog directly ahead of you (whoever is there right now) and
//             knocks just that dog over; the tennis ball is the straight shot, this is the homing one
//   firework — a rocket for the dog in first place, wherever it is: it flies up the road after the
//             leader, knocks over any dog it passes close to on the way (it does not go looking for
//             them), and bursts on the leader, catching anyone right beside them too
//   collar — golden collar: put it on and a golden force shield surrounds you for five seconds.  Nothing
//             thrown, dropped or driven at you knocks you over while it lasts; only another dog's
//             special still does
//
// The dog in first place never gets a golden bone, a frisbee, a firework or a golden collar.
//
// A dog holds one item at a time.  Running through a box while holding one still takes the box,
// but gives nothing; a new item can only come after the held one is used.

export const ITEM_IDS = ['ball', 'toy', 'bone', 'frisbee', 'firework', 'collar'];

export const ITEM_NAMES = { ball: 'Tennis Ball', toy: 'Chew Toy', bone: 'Golden Bone', frisbee: 'Red Frisbee', firework: 'Firework', collar: 'Golden Collar' };

export const BALL = {
  speed: 45,            // m/s, roughly 2.5x a sprinting dog
  duration: 4,          // seconds in flight at most (180 m), if it meets no wall to end it sooner
  launchAhead: 2.5,     // starts this far in front of the thrower
  height: 1.3,          // flies at this height above where it was thrown
  radius: 1.6,          // hits a dog whose centre comes this close
  // It bounces off walls and barriers (Tom, 2026-11-23: "3 bounces and if it doesn't hit a player in that time
  // then they disappear on the 4th"): ballRoute
  bounces: 3,
  traceStep: 0.5,       // metres between the places its route is checked for a wall
  offWall: 0.3,         // how far out from the wall a bounce starts it again
  // It skims the road, up and down with it (Tom, 2026-11-23: thrown in a jump it flew on up there, bouncing off walls in
  // mid-air): its route has the height of the road under it every `heightStep` metres
  heightStep: 2,
  fallPerMetre: 0.6,    // off a ledge it dives down to the road below, this many metres for each metre it goes on
                        // (but across a bridge or the platforms it keeps its level: it does not drop to the river or the Undercity)
  steepest: 1.2,        // the road rising more than this in one traceStep is a wall to it (out of the river where it ends): it pops
  dropGravity: 30,      // thrown in a jump, it drops to its skimming height (m/s², so about a third of a second from a jump's top)
};

export const TOY = {
  dropBehind: 3.5,      // lands this far behind the dog that drops it
  radius: 1.3,
  ownerGraceMs: 1500,   // the dropper cannot trip on it straight away
  jumpClear: 1.0,       // a dog this high off the road at the toy jumps clean over it
  maxPerRoom: 24,       // oldest goes when more are dropped
};

export const FRISBEE = {
  speed: 34,            // m/s: faster than a sprinting dog, catchable only by a boosted one for a while
  turnRate: 3.4,        // radians per second it can turn to follow its target round corners
  closeTurn: 1.3,       // close to its target it turns as sharply as it needs to reach it, and this much over
  duration: 6.0,        // seconds before it gives up
  launchAhead: 2.5,
  height: 1.0,          // flies this far above the dog it is chasing
  climbRate: 6,         // how quickly it matches its target's height (per second, as a share of the gap):
                        // quick enough to follow a dog down Frostpeak's black run
  radius: 1.7,          // hits a dog whose centre comes this close (flat), at about chest height
  tickMs: 50,           // the server moves it (and tells everyone where it is) this often
};

export const FIREWORK = {
  speed: 60,            // m/s: over three times a sprinting dog, so the leader's lead does not last long
  launchAhead: 3,       // starts this far up the road from the dog that lights it
  height: 1.4,          // flies this far above the road
  radius: 2.6,          // knocks over a dog whose centre it passes this close to (the road is 11-16 m wide: keep to the side)
  homeWithin: 35,       // this close to the leader it leaves the road's line and goes straight for them
  blastRadius: 6,       // the burst catches every dog this close to where it goes off
  duration: 14,         // seconds before it burns out (about 840 m of road)
  noTargetSeconds: 1.5, // with nobody to chase (the dog that lit it now leads) it burns out this soon
  tickMs: 50,           // the server moves it (and tells everyone where it is) this often
};

// How often a Treat Box may give a firework (like Mario Kart's blue shell: once or twice a race).  The server
// keeps to these (fireworkAllowed in server/server.js); a box that cannot give one gives something else.
// Jimmy's and Casper's fireworks come with their specials and do not count.
export const FIREWORK_LIMIT = {
  notBeforeMs: 20000,   // none in the first 20 s of a race
  cooldownMs: 40000,    // none for 40 s after one is given
  perRace: 2,           // and no more than two a race
  // (and only one held or flying at a time)
};

export const COLLAR = {
  durationMs: 5000,     // how long the golden shield lasts once the collar is on
};

// What a golden bone does to the dog that eats it (the item, or one picked up off the road)
export const BONE_BOOST = {
  speedMultiplier: 1.3,       // top speed while boosted (brief: ~1.25; raised to be clearly felt)
  accelerationMultiplier: 1.8,// so the extra speed arrives quickly
  instantKick: 0.8,           // share of the extra top speed given at once on pickup
  duration: 2.0,              // seconds at full boost
  easeOut: 0.5,               // seconds to blend back to normal afterwards
};

export const HIT = {
  ballStunMs: 1100,     // how long a hit dog is knocked about
  toyStunMs: 1500,
  fireworkStunMs: 1800,
  immuneMs: 1500,       // a hit dog cannot be hit again for this long
};

/**
 * The odds of each item from a Treat Box, by place in the race (kart-racer style: the further back
 * you are, the better the help).  The leader (or a solo racer) only ever gets a ball or a chew toy:
 * never a bone, a frisbee, a firework or a golden collar.  Last place never gets a chew toy.
 * `behind` runs 0 (2nd) .. 1 (last) for everyone else:
 *   firework 2 % in 2nd, rising to 6 % in last (and see FIREWORK_LIMIT);  golden collar 10 %;
 *   the rest is shared out as before: bone 40 % of it in 2nd, rising to 70 % in last; frisbee 25 %
 *   (20 % in last); what is left split between ball and chew toy (last place: 10 % ball).
 *   e.g. 5 racers, share of all boxes: firework 0, 2, 3.3, 4.7, 6 %.
 */
export function itemOdds(place, racers) {
  if (place <= 1 || racers <= 1) return { ball: 0.5, toy: 0.5, bone: 0, frisbee: 0, firework: 0, collar: 0 };   // nobody ahead
  const behind = racers <= 2 ? 1 : (place - 2) / (racers - 2);
  const firework = 0.02 + 0.04 * behind, collar = 0.1, rest = 1 - firework - collar;
  const bone = place >= racers ? 0.7 : 0.4 + 0.3 * behind;
  const frisbee = place >= racers ? 0.2 : 0.25;
  const ball = place >= racers ? 0.1 : (1 - bone - frisbee) / 2, toy = place >= racers ? 0 : ball;
  return { ball: ball * rest, toy: toy * rest, bone: bone * rest, frisbee: frisbee * rest, firework, collar };
}

/** Which items a dog can be given, from its place in the race. */
export function itemChoices(place, racers) {
  const odds = itemOdds(place, racers);
  return ITEM_IDS.filter(id => odds[id] > 0);
}

/** A Treat Box item by the odds above; noFirework: a firework is not allowed just now (FIREWORK_LIMIT), share the rest out */
export function rollItem(place, racers, random = Math.random, { noFirework = false } = {}) {
  const odds = itemOdds(place, racers);
  if (noFirework && odds.firework > 0) {
    const rest = 1 - odds.firework;
    for (const id of ITEM_IDS) odds[id] = id === 'firework' ? 0 : odds[id] / rest;
  }
  let r = random();
  for (const id of ITEM_IDS) {
    if (odds[id] <= 0) continue;
    if (r < odds[id]) return id;
    r -= odds[id];
  }
  return ITEM_IDS.filter(id => odds[id] > 0).at(-1);
}

export function forwardOf(rotationY) {
  return [Math.sin(rotationY), 0, Math.cos(rotationY)];
}

/**
 * The way a thrown ball goes: straight on from `origin` along `direction`, bouncing off any wall or barrier in
 * its way (like light off a mirror), BALL.bounces times; the wall after that is where it ends.  Worked out once,
 * when it is thrown, so the server and every player's game have the same route.
 *   query(x, z, hint, y): the map's ground there (a generated map's track.query): { blocked, clampX, clampZ,
 *   index }.  `blocked` means (x, z) is through a wall, and (clampX, clampZ) is the wall's face.  null: no walls
 *   (it flies straight for BALL.duration)
 * Returns { legs: [[x, z, dx, dz, at]] (each straight stretch: where it starts, its heading, and how far along the
 * route that is in metres), length (m), popped (it ended on a wall, not by running out of time), heights (the road
 * under it every BALL.heightStep metres along the route: it skims that, on the level of the map it was thrown on) }
 */
export function ballRoute(origin, direction, query = null) {
  const most = BALL.duration * BALL.speed, flat = Math.hypot(direction[0], direction[2]) || 1;
  let dx = direction[0] / flat, dz = direction[2] / flat;
  const legs = [[origin[0], origin[2], dx, dz, 0]];
  if (!query) return { legs, length: most, popped: false };
  const road = q => (q.inWater ? Math.max(q.y, q.waterY) : q.y);          // (over water it skims the top of it)
  const feet = origin[1] - BALL.height;                                    // (the thrower's, or above them in a jump)
  const first = query(origin[0], origin[2], -1, feet);
  let ground = first?.onTrack !== false && Number.isFinite(first?.y) ? road(first) : feet;
  const heights = [round2(ground)], every = Math.round(BALL.heightStep / BALL.traceStep);
  const finish = (length, popped) => ({ legs, length, popped, heights });
  let [lx, lz, , , at] = legs[0], hint = first?.index ?? -1, bounces = 0, step = 0;
  for (let along = at + BALL.traceStep; along <= most; along += BALL.traceStep) {
    const px = lx + dx * (along - at), pz = lz + dz * (along - at);
    // (asked at the ball's own road height, so it stays on its level: under a bridge it is not lifted on to the deck)
    const q = query(px, pz, hint, ground);
    hint = q?.index ?? -1;
    if (q && q.onTrack !== false && Number.isFinite(q.y)) {
      const target = road(q);
      if (target - ground > BALL.steepest) return finish(along, true);
      if (target >= ground) ground = target;
      else if (q.level === first?.level) ground = Math.max(target, ground - BALL.fallPerMetre * BALL.traceStep);
    }
    if (++step % every === 0) heights.push(round2(ground));
    if (!q?.blocked) continue;
    // the wall's face points back the way the ball came from it: the way from where it got to, to the face
    let nx = q.clampX - px, nz = q.clampZ - pz;
    const away = Math.hypot(nx, nz);
    if (away < 1e-6) { nx = -dx; nz = -dz; } else { nx /= away; nz /= away; }
    if (++bounces > BALL.bounces) return finish(along, true);
    const into = dx * nx + dz * nz;
    if (into < 0) { dx -= 2 * into * nx; dz -= 2 * into * nz; } else { dx = nx; dz = nz; }
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    lx = q.clampX + nx * BALL.offWall; lz = q.clampZ + nz * BALL.offWall; at = along;
    legs.push([lx, lz, dx, dz, at]);
  }
  return finish(most, false);
}
const round2 = v => Math.round(v * 100) / 100;

/** Seconds a ball is in the air: until its route ends (ballRoute), or BALL.duration for a ball with none */
export const ballSeconds = ball => (ball.length ?? BALL.duration * BALL.speed) / BALL.speed;

// The stretch of its route a ball is on, d metres along it
function legAt(ball, d) {
  const legs = ball.legs ?? [[ball.origin[0], ball.origin[2], ball.direction[0], ball.direction[2], 0]];
  let i = 0;
  while (i + 1 < legs.length && legs[i + 1][4] <= d) i++;
  return { leg: legs[i], index: i };
}

/** Which way a ball is heading t seconds after the throw: [dx, 0, dz] */
export function ballHeadingAt(ball, t) {
  const { leg } = legAt(ball, Math.max(0, Math.min(t, ballSeconds(ball))) * BALL.speed);
  return [leg[2], 0, leg[3]];
}

/** How many times a ball has bounced, t seconds after the throw */
export const ballBouncesAt = (ball, t) => legAt(ball, Math.max(0, Math.min(t, ballSeconds(ball))) * BALL.speed).index;

/**
 * Where a thrown ball is, t seconds after the throw: along its route (ballRoute; without one, straight the way
 * the thrower faced).  Normally it stays at the height it was thrown from; a ball marked `ground` (Frostpeak's
 * steep black run) skims BALL.height above the ground instead, so it follows the slope down (or up).
 * groundAt(x, z) gives the ground height there.
 */
export function ballPositionAt(ball, t, groundAt = null) {
  const d = Math.max(0, Math.min(t, ballSeconds(ball))) * BALL.speed, { leg } = legAt(ball, d);
  const x = leg[0] + leg[2] * (d - leg[4]), z = leg[1] + leg[3] * (d - leg[4]);
  if (ball.heights?.length) {
    // skimming the road (ballRoute), and thrown in a jump, dropping to it first
    const k = Math.min(d / BALL.heightStep, ball.heights.length - 1), i = Math.floor(k), f = k - i;
    const road = ball.heights[i] + ((ball.heights[i + 1] ?? ball.heights[i]) - ball.heights[i]) * f;
    const tt = Math.max(0, t), above = Math.max(0, ball.origin[1] - BALL.height - ball.heights[0] - 0.5 * BALL.dropGravity * tt * tt);
    return [x, road + BALL.height + above, z];
  }
  const ground = ball.ground && groundAt ? groundAt(x, z) : null;
  return [x, Number.isFinite(ground) ? ground + BALL.height : ball.origin[1], z];
}

/** Flat distance from point p to the segment a-b (x/z only). */
export function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + dx * t), p[2] - (a[2] + dz * t));
}

/**
 * One step of a frisbee's chase: turn towards the target, fly on, and ease its height towards the
 * target's.  f = { position: [x, y, z], yaw }; target = [x, y, z] or null (no target: it flies
 * straight).  Returns the new { position, yaw }.
 *
 * It turns at turnRate, which at its speed is a circle 10 m in radius: a dog nearer than that and off
 * to one side (running alongside the thrower, say) is inside the circle, and the frisbee would swing
 * out wide behind and come round again.  So close in it turns as sharply as it has to to get there.
 */
export function stepFrisbee(f, target, dt) {
  let yaw = f.yaw, y = f.position[1];
  if (target) {
    const want = Math.atan2(target[0] - f.position[0], target[2] - f.position[2]);
    const turn = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
    const away = Math.hypot(target[0] - f.position[0], target[2] - f.position[2]);
    // (a turn of radius r reaches a point `away` off at an angle `turn` if away >= 2 r sin(turn))
    const sharpest = FRISBEE.speed * 2 * Math.sin(Math.min(Math.abs(turn), Math.PI / 2)) / Math.max(away, 0.5) * FRISBEE.closeTurn;
    const rate = Math.max(FRISBEE.turnRate, sharpest) * dt;
    yaw += Math.max(-rate, Math.min(rate, turn));
    y += (target[1] + FRISBEE.height - y) * Math.min(1, FRISBEE.climbRate * dt);
  }
  const d = FRISBEE.speed * dt;
  return { position: [f.position[0] + Math.sin(yaw) * d, y, f.position[2] + Math.cos(yaw) * d], yaw };
}

/** Does a frisbee at `position` hit a dog standing at `dog` ([x, y, z] of its feet)? */
export function frisbeeHits(position, dog) {
  return Math.hypot(position[0] - dog[0], position[2] - dog[2]) <= FRISBEE.radius
    && Math.abs(position[1] - (dog[1] + FRISBEE.height)) <= 2.5;
}

// A boost pad whose boost stays with the dog after it has left the pad (a strip with `hold` seconds: shared/trackKit.js).
// The pad says how fast and for how long; this is what is the same for all of them
export const PAD_KICK = {
  easeOut: 0.6,    // seconds over which the boost fades at the end
  instant: 0.5,    // share of the extra speed a dog has the moment it touches the pad
  quick: 4,        // how much faster its speed builds while the boost lasts
};
