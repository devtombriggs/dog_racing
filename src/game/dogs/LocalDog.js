import * as THREE from 'three';
import { racingLineAt, PICKUP_PATHS } from '../../../shared/pickupSpots.js';
import { bellyBounce, ghostsThrough, jumpsInSpecial, SPECIALS } from '../../../shared/specials.js';
import { woodlandPlankAt, woodlandSwimMultiplier, woodlandBogAt, BOG_SPEED } from '../../../shared/wendoverData.js';
import { BASE_SPEED, downhillSpeed, downhillShare, swimSpeed } from '../../../shared/dogStats.js';
import { JUMP, STEEP_JUMP, DROP, WALL, speedAfterWall } from '../../../shared/handling.js';
import { PAD_KICK } from '../../../shared/items.js';
import { SLALOM } from '../../../shared/slalom.js';
import { DRIFT, AUTO_DRIFT, DRIFT_ARC, driftPerks, driftCanStart, driftArc, driftSteering, driftStep, driftChargeRate, driftTier, driftBoost, driftBoostNow, driftSpeedNow, autoDriftHeld, autoDriftCurvature } from '../../../shared/drift.js';
import { DRIFT_HUD_COLOURS } from './driftEffects.js';
import { DOGS, STAT_EFFECT, WATER_ACCELERATION, statScale, swimShare, turnSpeedLoss, pickupShare } from '../../config/dogs.js';
import { HANDLING, RUNNING_JUMP_SPEED } from '../../config/handling.js';
import { CONTACT, dogMass, dogOverlap } from './contact.js';
import { gaitTimeScale, sprintFraction } from './animation.js';
import { TOUCH_TURN } from '../../touch.js';
import { SkidView } from './skidView.js';
import { DogAvatar } from './DogAvatar.js';

const OFF_TRACK_SPEED_MULTIPLIER = 0.5;
const OFF_TRACK_ACCELERATION_MULTIPLIER = 0.6;
// The invisible walls round a dog in the middle of a special (#keepToRoad): how far in from each edge of the road they
// stand, and how fast (metres a second) they close in on it if it started wider than that
const FLY_EDGE = { inset: 0.5, closeIn: 4 };
const REVERSE_SPEED = 2.5;
const BRAKING = 22;
const FRICTION = 9;
const FORWARD = new THREE.Vector3(0, 0, 1);

// The player's own dog.  This game alone moves it: the keys drive it, the ground, the water and the
// other dogs slow, lift and shove it, and the server is told where it is.  The server in turn says
// when it has fallen, been fired from the cannon, been hit and so on.
export class LocalDog extends DogAvatar {
  // race: the Race this dog is running in.  player: this player as the server describes them
  constructor(race, player) {
    const dogId = player?.dog || 'gsp';
    super({ id: race.myId, dogId, config: DOGS[dogId], scene: race.stage.scene });
    this.race = race;

    if (player) {
      this.group.position.fromArray(player.position);
      this.group.rotation.y = player.rotation;
    }

    this.currentAnimation = 'Idle';

    // ---------------------------------
    // WHERE THE DOG IS AND HOW IT IS MOVING
    // ---------------------------------

    this.currentSpeed = 0;
    this.groundY = 0;       // height of the ground under the dog
    this.jumpHeight = 0;    // how far the dog is above it
    this.slope = 0;         // rise per unit forward: + uphill
    this.steer = 0;
    this.travelYaw = this.group.rotation.y;
    // Speed a bump from another dog has given this one, on top of its own running
    this.knock = new THREE.Vector3();

    this.verticalVelocity = 0;
    this.jumpGravity = JUMP.gravity;
    this.isJumping = false;
    this.isLanding = false;

    this.offTrack = false;
    // A jump that starts on the road is free in the air (that is how the stream is cleared).  A jump
    // that starts off the road is not: otherwise hopping along beside the road dodges the off-track
    // slowdown, and with it every slow stretch (the pools, the hay bales) can be skipped round the side.
    this.jumpedFromOffTrack = false;
    this.inBog = false;             // on the boggy bank beside a Wendover pool (shared/wendoverData.js)
    this.ringHop = 0;               // bouncing off one of the Water Park's rubber rings: the speed it carries the dog at

    // ---------------------------------
    // WHAT THE SERVER HAS DONE TO IT
    // ---------------------------------

    this.fall = null;               // dropping off the edge: { position, startedAt }
    this.launchFlight = null;       // fired from the catapult or cannon: { startedAt, lateral }
    this.tunnelRide = null;         // underground in a burrow: { tunnel, startedAt }
    this.launchBoostUntil = 0;
    this.padKick = null;            // a boost pad whose boost stays with the dog: { speed, until, quick, mega }
    this.burrowBoostUntil = 0;
    this.burrowBoost = 1.3;         // how much faster he comes out of a burrow (each burrow says)
    this.recoveryUntil = 0;         // slowed after a respawn until then
    this.respawnRevision = player?.respawnRevision ?? 0;      // (not 0 for a player coming back into a race)
    this.stunUntil = 0;
    this.quakeUntil = 0;    // shaken by Jazz's Earthquake until then, at quakeSpeed of its pace
    this.quakeSpeed = 1;
    this.stunLength = 1;

    // ---------------------------------
    // DRIFTING (shared/drift.js)
    // ---------------------------------

    this.drift = null;              // skidding round a corner: { side: 1 left / -1 right, charge, steering } (shared/drift.js driftStep)
    this.driftExitUntil = 0;        // just out of one: the ordinary steering comes back in gently until then
    this.kick = null;               // a boost's first burst of speed, being fed in: { left (m/s still to give), rate (m/s a second) }
    this.yawRate = 0;               // how fast the dog is turning (radians a second, + left)
    this.driftBoostUntil = 0;       // the boost for letting go of a skid with sparks, until then
    this.driftBoost = null;         // that boost: { speed, quick, easeOut, seconds, super } (shared/drift.js driftBoost)
    this.wallAt = -1e9;             // when it last ran into a wall (shared/handling.js WALL)
    this.arrowHeld = { side: 0, seconds: 0 };   // which way the steering is held, and for how long (accessibility mode's own skid)
    this.skid = new SkidView(this, race.stage.scene);     // how a skid looks (and what the pug twins take their stack from)
    this.driftPerks = driftPerks(dogId);   // what a slow dog gets from a skid on top of its Drift stat

    // ---------------------------------
    // MOVEMENT SETTINGS
    // ---------------------------------

    // Real dog speeds at the dogs' scale of 3: an easy canter and a gallop
    // ...then each dog's own stats on top (STAT_EFFECT)
    const stats = this.stats = this.config.stats ?? {};
    this.driftArc = driftArc({ agility: stats.agility, size: this.config.size ?? 1, control: this.driftPerks.control });   // its drift's curves (shared/drift.js)
    const speedScale = statScale(stats.speed, STAT_EFFECT.speed);
    this.runSpeed = BASE_SPEED.run * speedScale;
    this.sprintSpeed = BASE_SPEED.sprint * speedScale;

    this.acceleration = BASE_SPEED.acceleration * statScale(stats.acceleration, STAT_EFFECT.acceleration);
    this.turnRateSlow = HANDLING.turnRateSlow * statScale(stats.agility, STAT_EFFECT.agilityTurnSlow);
    this.turnRateSprint = HANDLING.turnRateSprint * statScale(stats.agility, STAT_EFFECT.agilityTurn);
    this.gripSprint = HANDLING.gripSprint * statScale(stats.agility, STAT_EFFECT.agilityGrip);
    // A turn at a sprint costs speed, more for a less agile dog
    this.turnSpeedLoss = turnSpeedLoss(stats.agility, HANDLING.turnSpeedLoss);
    // The supplied coastal map uses 0–1 stats; existing dog stats use 1–10.
    this.coastalStats = {
      stamina: stats.stamina == null ? 0.5 : THREE.MathUtils.clamp(stats.stamina / 10, 0, 1),
      swimming: stats.swimming == null ? 0.5 : THREE.MathUtils.clamp(stats.swimming / 10, 0, 1)
    };
    this.waterSpeed = swimSpeed(stats.swimming);      // (shared/dogStats.js: the same on every map)
    this.waterAcceleration = swimShare(stats.swimming, WATER_ACCELERATION);
  }

  get size() { return this.config.size ?? 1; }

  // ---------------------------------
  // MODEL AND CLIPS
  // ---------------------------------

  modelReady() {
    const { actions } = this;
    if (actions.Jump) actions.Jump.clampWhenFinished = true;
    if (actions.Land) actions.Land.clampWhenFinished = true;

    this.mixer.addEventListener('finished', (event) => {
      if (event.action === actions.Land) this.isLanding = false;
    });

    if (actions.Idle) {
      this.currentAction = actions.Idle;
      this.currentAction.play();
    }

    this.skid.ready();
  }

  play(name) {
    const action = super.play(name);
    if (action) this.currentAnimation = name;
    return action;
  }

  // Stand the dog on the ground it starts on
  standOnGround() {
    this.groundY = this.race.world.groundHeightAt(this.position, 0);
    this.position.y = this.groundY;
  }

  // What the other players' games are told, twenty times a second
  get moveMessage() {
    return {
      position: this.position.toArray(),
      rotation: this.group.rotation.y,
      animation: this.drift ? 'Sprint' : this.currentAnimation,      // (in a skid the others' games pose the dog themselves: skidView.js)
      drift: this.drift ? { side: this.drift.side, tier: driftTier(this.drift.charge) } : null,
      respawnRevision: this.respawnRevision
    };
  }

  // ---------------------------------
  // JUMPING
  // ---------------------------------

  tryJump() {
    const { session, specials, world } = this.race;
    if (
      !session.raceGo ||
      session.raceFinished ||
      this.isJumping ||
      this.tunnelRide ||
      !jumpsInSpecial(specials.physics(this.id)) ||      // (a special can be jumped in, but for Ralph flying and Enzo bouncing)
      this.#inWater ||                   // no jumping out of water, deep or shallow (Tom, 2026-11-21: it was a way through it fast)
      !this.mixer
    ) {
      return;
    }

    this.isJumping = true;
    this.isLanding = false;
    this.jumpedFromOffTrack = this.offTrack || this.inBog;
    const steepHop = world.steepRun && this.slope < STEEP_JUMP.below;
    this.verticalVelocity = steepHop ? STEEP_JUMP.force : JUMP.force;
    this.jumpGravity = steepHop ? STEEP_JUMP.gravity : JUMP.gravity;
    // (in a special that plays its own clips, the dog goes up as it is: Casper upright with the ball, Poppy on her wave)
    if (specials.animating(this.id)) return;
    this.play('Jump');

    // A running dog takes off in stride: skip the standing crouch.
    if (this.currentAction === this.actions.Jump && Math.abs(this.currentSpeed) > RUNNING_JUMP_SPEED) {
      this.currentAction.time = 0.2;
    }
  }

  #groundJump() {
    this.jumpHeight = this.verticalVelocity = 0;
    this.isJumping = this.isLanding = false;
  }

  // ---------------------------------
  // NEWS FROM THE SERVER
  // ---------------------------------

  // Off the edge of the track: drop, until the server puts the dog back
  // Ran into one of Frostpeak's slalom gates or snowmen (the server says): slowed, but not stopped (shared/slalom.js)
  slalomBump(kind) {
    const rule = SLALOM[kind];
    if (!rule) return;
    // (held down to a share of top speed for a moment, then eased back: never a dead stop)
    this.snowDrag = { slow: rule.slow, until: performance.now() + rule.holdMs, easeMs: rule.easeMs };
    this.currentSpeed = Math.min(this.currentSpeed, this.runSpeed * rule.slow);
    this.#endDrift(false, true);
  }

  /** What is left of a slalom bump's drag on top speed: 1 once it has worn off */
  #snowDragNow(now) {
    const d = this.snowDrag;
    if (!d) return 1;
    const past = now - d.until;
    if (past >= d.easeMs) { this.snowDrag = null; return 1; }
    return past <= 0 ? d.slow : d.slow + (1 - d.slow) * past / d.easeMs;
  }

  fell(data) {
    this.fall = { position: new THREE.Vector3().fromArray(data.position), startedAt: performance.now() };
    this.#endDrift(false, true);
    this.currentSpeed = 0;
    this.race.goldenBones.cancelBoost();
    this.knock.set(0, 0, 0);
    this.play('Jump');
  }

  // Put back on the track: after a fall, a rescue, or at the far end of a burrow
  respawned(data) {
    const { race } = this;
    race.rescue.reset();
    this.fall = null;
    this.launchFlight = null;
    this.tunnelRide = null;
    this.burrowBoostUntil = 0;
    race.burrowOverlay.hidden = true;
    if (this.model) this.model.visible = true;
    this.launchBoostUntil = 0;
    this.padKick = null;            // a boost pad whose boost stays with the dog: { speed, until, quick, mega }
    this.#endDrift(false, true);
    race.goldenBones.cancelBoost();
    this.respawnRevision = data.respawnRevision;
    this.recoveryUntil = performance.now() + data.penaltySeconds * 1000;
    this.position.fromArray(data.position);
    this.group.rotation.set(0, data.rotation, 0);
    this.travelYaw = data.rotation;
    this.yawRate = 0;
    this.groundY = data.position[1];
    this.currentSpeed = this.slope = this.steer = 0;
    this.#groundJump();
    this.knock.set(0, 0, 0);
    if (this.model) this.model.rotation.set(0, 0, 0);
    this.play('Idle');
    // A checkpoint can be far away: snap the chase camera with the dog.
    race.chaseCamera.snap();
  }

  // Fired from Treat Road's catapult or Frostpeak's cannon
  launched(data) {
    this.launchFlight = { startedAt: performance.now(), lateral: data.lateral, index: data.launch ?? 0 };
    this.#endDrift(false, true);
    this.fall = null;
    this.knock.set(0, 0, 0);
    this.#groundJump();
    this.play('Jump');
    this.currentAction?.reset();
  }

  // ...and down again, at a sprint
  landed(data) {
    this.launchFlight = null;
    this.respawnRevision = data.respawnRevision;
    this.launchBoostUntil = performance.now() + data.boostSeconds * 1000;
    this.launchBoost = data.speedMultiplier;
    this.padKick = null;
    this.position.fromArray(data.position);
    this.group.rotation.set(0, data.rotation, 0);
    this.travelYaw = data.rotation;
    this.yawRate = 0;
    this.groundY = data.position[1];
    this.currentSpeed = this.sprintSpeed * data.speedMultiplier;
    this.slope = this.steer = 0;
    this.#groundJump();
    if (this.model) this.model.rotation.set(0, 0, 0);
    this.play('Sprint');
  }

  // Down one of Ralph's burrows (shared/wendoverData.js)
  enteredBurrow(tunnel) {
    this.tunnelRide = { tunnel, startedAt: performance.now() };
    this.#endDrift(false, true);
    this.race.burrowOverlay.hidden = false;
    this.currentSpeed = 0;
    this.knock.set(0, 0, 0);
    this.race.goldenBones.cancelBoost();
    this.position.fromArray(tunnel.entry);
    this.group.rotation.y = tunnel.entryYaw;
    this.#groundJump();
    this.play('Run');
  }

  // ...and out of the far end at a sprint (after respawned() has put the dog there)
  leftBurrow(data) {
    this.burrowBoostUntil = performance.now() + data.boostSeconds * 1000;
    this.burrowBoost = data.speedMultiplier;
    this.currentSpeed = this.sprintSpeed * data.speedMultiplier;
    this.play('Sprint');
  }

  // Knocked over by a ball, a chew toy or a frisbee
  hit(stunMs) {
    this.stunLength = stunMs;
    this.stunUntil = performance.now() + stunMs;
    this.currentSpeed *= 0.15;
    this.padKick = null;
    this.#endDrift(false, true);
    this.race.goldenBones.cancelBoost();
  }

  // Jazz has stomped: this dog can barely move for a while
  shaken(seconds, speed, word = 'EARTHQUAKE — HOLD ON!') {
    this.quakeWord = word;          // (what the screen says: Merlin's frogs slow a dog the same way)
    this.quakeUntil = performance.now() + seconds * 1000;
    this.quakeSpeed = speed;
    this.currentSpeed *= speed;
  }

  // This dog's special ability has begun
  specialStarted() {
    const spec = SPECIALS[this.race.localPlayer?.dog];
    if (spec?.speed && this.currentSpeed > 0) this.currentSpeed = Math.max(this.currentSpeed, this.sprintSpeed);   // straight up to full pace
    if (spec?.flyHeight) { this.jumpGravity = JUMP.gravity; this.verticalVelocity = 0; }
    this.specialBegan = performance.now();
  }

  // The kick of speed a golden bone gives a dog that is already running
  boneKick() {
    if (this.currentSpeed > 0) this.currentSpeed += this.race.goldenBones.instantKick(this.sprintSpeed);
  }

  // ---------------------------------
  // DRIFTING
  // ---------------------------------

  // The skid is over.  boost: it was let go (or jumped out of), so its sparks are paid out as a boost.
  // wipe: whatever boost a skid had already earned goes too (knocked over, put back on the track)
  #endDrift(boost, wipe = false) {
    const { drift } = this;
    this.drift = null;
    if (drift) this.driftExitUntil = performance.now() + DRIFT_ARC.exitSeconds * 1000;      // EXITING: the steering comes back gently
    if (wipe) { this.driftBoostUntil = 0; this.kick = null; }
    if (!drift || !boost) return;
    const tier = driftTier(drift.charge), earned = driftBoost(tier, this.driftPerks);
    if (!earned) return;
    this.driftBoostUntil = performance.now() + (earned.seconds + earned.easeOut) * 1000;
    this.driftBoost = earned;
    // (a Golden Bone's boost and a skid's do not add up: no kick on top of a bone)
    const boosted = this.sprintSpeed * earned.speed;
    // (its first burst of speed is fed in over a quarter of a second: the dog surges, it does not jump forward)
    if (this.currentSpeed > 0 && this.currentSpeed < boosted && !this.race.goldenBones.isBoosting()) {
      const give = Math.min(boosted - this.currentSpeed, this.sprintSpeed * (earned.speed - 1) * earned.kick);
      this.kick = { left: give, rate: give / DRIFT_ARC.kickSeconds, upTo: boosted };
    }
    this.skid.burst(tier, earned.super);
  }

  // Run into a wall (shared/handling.js WALL).  into: metres it had gone into it this step.  ground: the share of
  // its pace the ground there leaves it (soft ground has already slowed it: the wall costs no more speed there).
  // Turning the dog or knocking it back off the wall was tried and was unplayable (Tom, 2026-11-24): it only must
  // not get stuck, which #slideAlongWall sees to.
  #hitWall(frame, into, ground) {
    if (frame.special || ground < WALL.softBelow || this.currentSpeed <= 0) return;
    const now = performance.now(), travelled = Math.abs(this.currentSpeed) * frame.delta;
    this.#endDrift(false, true);
    // (in accessibility mode the dog skids by itself: a wall costs it less)
    const cost = this.race.session.state.accessibilityMode ? AUTO_DRIFT.wall : 1, was = this.currentSpeed;
    if (now - this.wallAt > WALL.again * 1000 && travelled > 1e-4) {
      this.currentSpeed = was - (was - speedAfterWall(was, into / travelled)) * cost;
    }
    this.currentSpeed = Math.min(this.currentSpeed, this.sprintSpeed * (1 - (1 - WALL.scrape) * cost));
    this.wallAt = now;
  }

  // Never stuck on a wall (Tom, 2026-11-24): the step it lost going into the wall is carried on along the wall
  // instead, the way the dog was already heading along it (dead square on: the way the race goes), so a dog with its
  // nose to a fence still runs along it until it is steered off.  The dog is not turned.
  // out: [x, z], the way back on to the road; into: metres it had gone into the wall.  Returns the new ground under it.
  #slideAlongWall(frame, [ox, oz], into, coastalSurface) {
    const { position } = this, { coastalTrack } = this.race.world;
    let ax = oz, az = -ox;                                        // along the wall, one way...
    const along = ax * Math.sin(this.travelYaw) + az * Math.cos(this.travelYaw);
    let way = along;
    if (Math.abs(along) < 0.15) {                                 // (dead square on: the way the race goes)
      const line = racingLineAt(this.race.mapId, position.x, position.z, this.race.rescue.lineS);
      if (line) way = ax * Math.sin(line.rotationY) + az * Math.cos(line.rotationY);
    }
    if (way < 0) { ax = -ax; az = -az; }                          // ...the way it goes
    position.x += ax * into;
    position.z += az * into;
    const after = coastalTrack.query(position.x, position.z, -1, position.y);
    if (!after?.blocked) return after;
    position.x = after.clampX;                                    // (into a corner: as far as it goes)
    position.z = after.clampZ;
    return coastalTrack.query(position.x, position.z, -1, position.y) ?? coastalSurface;
  }

  // Start, hold or end a skid, from the drift button.  Returns the drift's steering ({ yawRate: how fast it is turning
  // the dog, radians a second, + left; turned: how far this step }), or null when it is not drifting.  The drift has its own curve; the arrows only tighten or widen it
  #driftSteer(frame, turnInput) {
    const { delta, special, effort } = frame;
    const { input, session } = this.race;
    const grounded = !this.isJumping && !this.offTrack && !frame.inWater && !special && performance.now() >= this.stunUntil;

    // Accessibility mode (four keys, no drift button): an arrow held into a bend is the drift button
    const auto = Boolean(session.state.accessibilityMode);
    const arrow = Math.abs(turnInput) >= DRIFT.startTurn ? Math.sign(turnInput) : 0;
    this.arrowHeld = arrow && arrow === this.arrowHeld.side ? { side: arrow, seconds: this.arrowHeld.seconds + delta } : { side: arrow, seconds: 0 };
    const road = auto && arrow ? this.#roadAhead() : null;
    const held = auto
      ? autoDriftHeld({ turn: turnInput, heldFor: this.arrowHeld.seconds, bend: road?.bend ?? 0, side: this.drift?.side ?? 0 })
      : input.drift;

    // NORMAL -> HOP: the way it will drift is the way the arrow is held now, and stays so until it ends
    if (!this.drift && driftCanStart({ held, turn: turnInput, effort, grounded })) {
      const side = Math.sign(turnInput);
      this.drift = { side, charge: 0, startedAt: performance.now(), steering: driftSteering(side, this.yawRate, this.driftArc, this.currentSpeed) };
    }
    if (!this.drift) return null;
    if (!held || this.isJumping) { this.#endDrift(true); return null; }       // let go: off it goes
    if (!grounded || effort < DRIFT.endEffort) { this.#endDrift(false); return null; }  // lost it

    const { drift } = this, steering = drift.steering;
    // (by itself, the drift is steered round with the road; with the button, the arrows tighten and widen it)
    const curvature = auto && road ? autoDriftCurvature({
      bend: road.bend, speed: this.currentSpeed,
      off: drift.side * Math.atan2(Math.sin(this.travelYaw - road.yaw), Math.cos(this.travelYaw - road.yaw)),
      inside: drift.side * road.left, halfWidth: road.halfWidth,
    }) : null;
    driftStep(steering, this.driftArc, { input: turnInput, speed: this.currentSpeed, dt: delta, curvature });
    // HOP -> DRIFTING: the sparks build once it is down, faster the further into the corner it is steered
    if (steering.seconds >= DRIFT_ARC.hopSeconds) {
      drift.charge += driftChargeRate(this.stats.drift, auto ? AUTO_DRIFT.into : steering.guide, this.driftPerks.charge) * delta;
    }
    return steering;
  }

  // The road at the dog: { bend: how it bends just ahead (1 / its radius in metres, + to the left), yaw: the way it
  // runs, left: how far to the left of its middle the dog is (m), halfWidth }
  #roadAhead() {
    const { mapId, rescue } = this.race, path = PICKUP_PATHS[mapId];
    const line = path && racingLineAt(mapId, this.position.x, this.position.z, rescue.lineS);
    if (!line) return null;
    const from = path.pointAt(line.s + 3).rotationY, to = path.pointAt(line.s + 15).rotationY;
    return {
      bend: Math.atan2(Math.sin(to - from), Math.cos(to - from)) / 12, yaw: line.rotationY, halfWidth: line.halfWidth,
      left: Math.cos(line.rotationY) * (this.position.x - line.x) - Math.sin(line.rotationY) * (this.position.z - line.z),
    };
  }

  // ---------------------------------
  // EVERY FRAME
  // ---------------------------------

  // Knocked over by a ball or a chew toy: a couple of spins on the spot
  spinIfStunned() {
    if (!this.model) return;
    const stunLeft = this.stunUntil - performance.now();
    this.model.rotation.y = stunLeft > 0 ? (1 - stunLeft / this.stunLength) * Math.PI * 4 : 0;
  }

  // Before GO and after the finish: stand where it is
  hold(delta) {
    this.currentSpeed = 0;
    this.mixer?.update(delta);
  }

  // Is the dog out of the player's hands (falling, flying or underground)?
  get carried() {
    return Boolean(this.fall || this.launchFlight || this.tunnelRide);
  }

  // A short cut over rough ground does not slow a dog that is on a Golden Bone's boost, nor one that was on it at any time since
  // it came on to the cut: the bone carries it the whole way across (Tom, 2026-11-26: short cuts on every map; a bone's boost is
  // 2.5 s, about 55 m, and most cuts are longer).  Without one the cut is slower than the road.
  #onBoneOverRough(ground) {
    const cut = ground?.rough ? ground.lane?.id ?? null : null;
    if (!cut) { this.cutPass = null; return false; }
    if (this.race.goldenBones.isBoosting()) this.cutPass = cut;
    return this.cutPass === cut;
  }

  // How wide the camera should see: wider when flying or boosted
  get fov() {
    const { goldenBones, specials } = this.race;
    return this.launchFlight ? 94
      : this.padKick && performance.now() < this.padKick.until ? (this.padKick.mega ? 92 : 86)
      : performance.now() < this.launchBoostUntil || goldenBones.isBoosting() || specials.physics(this.id)?.speed ? 84
      : performance.now() < this.driftBoostUntil ? (this.driftBoost?.super ? 86 : 84) : 75;      // (a drift's boost: as a bone's, wider still for a super one)
  }

  update(delta) {
    if (this.tunnelRide) this.#rideBurrow(delta);
    else if (this.launchFlight) this.#fly(delta);
    else if (this.fall) this.#drop(delta);
    else this.#run(delta);
  }

  #rideBurrow(delta) {
    const { hud } = this.race;
    const elapsed = (performance.now() - this.tunnelRide.startedAt) / 1000;
    if (this.model) this.model.visible = elapsed < 0.12;
    this.mixer?.update(delta);
    hud.setSurface(this.tunnelRide.tunnel.id === 'kelp' ? 'KELP DIVE!' : 'RALPH’S BURROW BOOST', '#ffc478');
    hud.setSpeed('»');
  }

  #fly(delta) {
    const { hud, world } = this.race;
    const elapsed = (performance.now() - this.launchFlight.startedAt) / 1000;
    const point = world.launchTrack.launchPoint(elapsed, this.launchFlight.lateral, this.launchFlight.index);
    this.position.set(point.x, point.y, point.z);
    this.group.rotation.y = point.rotationY;
    if (this.model) this.model.rotation.x = point.pitch;
    this.mixer?.update(delta);
    hud.setSpeed((point.speed * 3.6).toFixed(1));
    hud.setSurface('ZOOM!', '#62ffe6');
  }

  #drop(delta) {
    const { hud, world } = this.race;
    const elapsed = (performance.now() - this.fall.startedAt) / 1000;
    this.position.copy(this.fall.position);
    this.position.y -= 0.5 * world.proceduralTrack.rules.gravity * elapsed * elapsed;
    this.mixer?.update(delta);
    hud.setSpeed('0.0');
    hud.setSurface('FELL — RETURNING TO CHECKPOINT', '#ffbc75');
  }

  // Under the player's control.  Each step leaves what it worked out on `frame` for the later ones.
  #run(delta) {
    // This dog's special, while it is in force: faster, flying (Ralph) or steering itself (Poppy)
    const frame = { delta, special: this.race.specials.physics(this.id) };
    // (Enzo's Belly Bounce: where he is in the bounce, and the burst of speed that goes with it)
    if (frame.special?.bounce) frame.special = { ...frame.special, ...bellyBounce(frame.special, (performance.now() - (this.specialBegan ?? 0)) / 1000), bouncing: true };

    this.#accelerate(frame);
    this.#turn(frame);
    this.#advance(frame);
    this.#bumpOtherDogs(frame);
    this.#feelGround(frame);
    this.#keepToRoad(frame);
    this.race.rescue.update(delta, this);
    this.#rise(frame);
    this.#followGround(frame);
    this.#animate(frame);
    this.#showGround(frame);
  }

  // Standing in water of any depth: a pool, the sea, a river, or water beside the road (no jumping from it)
  get #inWater() {
    const { world } = this.race, { position } = this;
    if (world.poolAt(position)?.inWater) return true;
    if (world.coastalTrack?.query(position.x, position.z, -1, position.y).inWater) return true;
    return this.offTrack && world.isOverWater(position);
  }

  // In the air (from a jump off the road) the dog is off nothing: that is how the stream is cleared
  get #clearOfGround() {
    return this.isJumping && !this.jumpedFromOffTrack;
  }

  // ---------------------------------
  // ACCELERATION AND BRAKING
  // ---------------------------------

  #accelerate(frame) {
    const { delta, special } = frame;
    const { world, goldenBones, hud, input, session } = this.race;
    const { position, stats, sprintSpeed, slope } = this;
    const { steepRun, coastalTrack } = world;

    this.offTrack = !this.#clearOfGround && !world.isTrackSurface(position);
    const woodlandSurface = world.poolAt(position);
    // the bog beside a pool: slower than swimming, and no hopping out of it (a jump from the road sails over)
    this.inBog = Boolean(world.woodland && !this.#clearOfGround && woodlandBogAt(position.x, position.z));
    const inWater = !this.isJumping && (woodlandSurface?.inWater || (this.offTrack && world.isOverWater(position)));
    const coastalGround = coastalTrack?.query(position.x, position.z, -1, position.y);
    // a boost pad whose boost stays with the dog after the pad (Neon Nexus)
    const padNow = performance.now();
    if (coastalGround?.kick && !this.isJumping && padNow >= this.stunUntil) {
      const pad = coastalGround.kick;
      if (!(this.padKick && this.padKick.until > padNow) && this.currentSpeed > 0) this.currentSpeed += this.sprintSpeed * (pad.speed - 1) * PAD_KICK.instant;
      // (a weaker pad never cuts short a stronger boost: landing on a platform just after a mega pad)
      if (!(this.padKick && this.padKick.until > padNow && this.padKick.speed > pad.speed)) {
        this.padKick = { speed: pad.speed, until: padNow + (pad.hold + PAD_KICK.easeOut) * 1000, quick: pad.quick ?? PAD_KICK.quick, mega: Boolean(pad.mega) };
      }
    }
    // a kicker (Squelch Hollow): up the ramp and into the air, steering all the way, with the pad's boost
    if (coastalGround?.hop && !this.isJumping && padNow >= this.stunUntil && this.currentSpeed > 4) {
      this.isJumping = true;
      this.isLanding = false;
      this.jumpedFromOffTrack = false;
      this.verticalVelocity = coastalGround.hop;
      this.jumpGravity = JUMP.gravity;
      if (!this.race.specials.animating(this.id)) { this.play('Jump'); if (this.currentAction === this.actions.Jump) this.currentAction.time = 0.2; }
    }
    const kickLeft = this.padKick ? (this.padKick.until - padNow) / 1000 : 0;
    const kickNow = kickLeft > 0 ? 1 + (this.padKick.speed - 1) * Math.min(1, kickLeft / PAD_KICK.easeOut) : 1;
    const terrainMultiplier = inWater && woodlandSurface
      ? woodlandSwimMultiplier(stats.swimming)
      : coastalGround
      ? coastalTrack.speedFactor(coastalGround, Object.assign(this.coastalStats, { boosted: this.#onBoneOverRough(coastalGround) }), this.isJumping)
      : this.inBog
      ? BOG_SPEED
      : inWater
      ? this.waterSpeed
      : this.offTrack ? OFF_TRACK_SPEED_MULTIPLIER : 1;
    // A climb takes a little off the top speed, a descent gives a little back.
    // On Frostpeak's black run a descent gives a LOT back: up to 1.75x on the steepest pitches.
    const hillMultiplier = coastalTrack || (inWater && woodlandSurface) ? 1
      : steepRun && slope < 0 ? Math.min(1.75, 1 - 1.7 * slope)
      : THREE.MathUtils.clamp(1 - HANDLING.hillEffect * slope, 0.8, 1.08);
    frame.terrainMultiplier = terrainMultiplier;
    frame.inWater = Boolean(inWater);
    // the boost out of a skid (it does not add to a Golden Bone, a boost pad or a landing boost: the best of them counts)
    const driftLeft = (this.driftBoostUntil - padNow) / 1000;
    const driftNow = goldenBones.isBoosting() || !this.driftBoost ? 1 : driftBoostNow(driftLeft, this.driftBoost.speed, this.driftBoost.easeOut);
    // Wet ground (the mud run): a dog slides where it was going and is slow to pick up speed
    const wet = coastalTrack?.rules.slip, slip = frame.slip = wet && !this.isJumping ? coastalGround.slippery ?? 0 : 0;
    const maxSpeed = frame.maxSpeed =
      sprintSpeed *
      terrainMultiplier *
      hillMultiplier *
      (performance.now() < this.burrowBoostUntil ? this.burrowBoost : 1) *
      Math.max(kickNow, driftNow, this.drift && !goldenBones.isBoosting() ? driftSpeedNow((performance.now() - this.drift.startedAt) / 1000, this.driftPerks) : 1, performance.now() < this.launchBoostUntil ? this.launchBoost ?? world.launchTrack.launch.exitSpeedMultiplier : 1) *      // (a landing boost, a boost pad's and a skid's do not add up)
      (world.proceduralTrack && performance.now() < this.recoveryUntil ? world.proceduralTrack.rules.respawnSpeedMultiplier : 1) *
      goldenBones.speedMultiplier() *
      (special?.speed ?? 1) *
      (performance.now() < this.quakeUntil ? this.quakeSpeed : 1) *      // (Jazz's Earthquake)
      downhillSpeed(stats, slope) *      // (Jimmy's wheels, where the road drops)
      this.#snowDragNow(performance.now()) *      // (Frostpeak's slalom gates and snowmen)
      (performance.now() < this.stunUntil ? 0.15 : 1);
    // (the last of a dog's speed comes slowly, and an agile dog is back up to speed sooner)
    const effectiveAcceleration = this.acceleration *
      (slip ? 1 - (1 - wet.acceleration) * slip : 1) *
      pickupShare(stats.agility, HANDLING.topEndAcceleration, sprintFraction(this.currentSpeed, this.runSpeed, sprintSpeed)) *
      (special?.speed ? 2.5 : 1) *
      goldenBones.accelerationMultiplier() *
      (kickLeft > 0 ? this.padKick.quick : 1) *
      (driftNow > 1 ? this.driftBoost.quick : this.drift ? DRIFT.speedQuick : 1) *
      (steepRun && slope < 0 ? 1 - 4 * slope : 1) *      // gravity does the work going down the black run
      (inWater
        ? this.waterAcceleration
        : this.offTrack ? OFF_TRACK_ACCELERATION_MULTIPLIER : 1);
    hud.setSurface(this.offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK', this.offTrack ? '#ffbc75' : '#9fe49b');

    // Accessibility mode runs the dog for the player; Up and Down are jump and item there
    const autoRun = session.state.accessibilityMode;
    const running = autoRun
      ? session.raceGo && !session.raceFinished
      : input.accelerate || Boolean(special?.speed);   // a special carries the dog along by itself
    // (a drift boost's first burst, fed in a little each frame: shared/drift.js DRIFT_ARC.kickSeconds)
    if (this.kick) {
      const give = Math.min(this.kick.left, this.kick.rate * delta);
      if (this.currentSpeed > 0 && this.currentSpeed < this.kick.upTo) this.currentSpeed = Math.min(this.kick.upTo, this.currentSpeed + give);
      this.kick.left -= give;
      if (this.kick.left <= 1e-6) this.kick = null;
    }
    if (running) {
      this.currentSpeed = Math.min(this.currentSpeed + effectiveAcceleration * delta, maxSpeed);
    } else if (!autoRun && input.brake) {
      this.currentSpeed = Math.max(this.currentSpeed - BRAKING * delta, -REVERSE_SPEED);
    } else if (this.currentSpeed > 0) {
      this.currentSpeed = Math.max(0, this.currentSpeed - FRICTION * delta);
    } else if (this.currentSpeed < 0) {
      this.currentSpeed = Math.min(0, this.currentSpeed + FRICTION * delta);
    }

    if (this.currentSpeed > maxSpeed) {
      this.currentSpeed = Math.max(maxSpeed, this.currentSpeed - BRAKING * delta);
    }

    hud.setSpeed((Math.abs(this.currentSpeed) * 3.6).toFixed(1));
  }

  // ---------------------------------
  // STEERING AND LEAN
  // ---------------------------------

  #turn(frame) {
    const { delta, special, maxSpeed } = frame;
    const { input, rescue, mapId } = this.race;
    const { group, position } = this;

    const steeringFactor = frame.steeringFactor =
      Math.min(Math.abs(this.currentSpeed) / HANDLING.fullSteerSpeed, 1);
    const effort = frame.effort = sprintFraction(this.currentSpeed, this.runSpeed, this.sprintSpeed);

    const turnInput = special?.steerLocked ? 0 : input.turn;

    // Fast means wide: the turn rate falls away as the dog stretches out
    // (standing still or stuck against something, left and right still turn the dog on the spot)
    // (and sharper on a phone's ◀ ▶ buttons: touch.js)
    const turnRate = THREE.MathUtils.lerp(this.turnRateSlow, this.turnRateSprint, effort) * Math.max(steeringFactor, HANDLING.pivotSteer)
      * (input.touch ? TOUCH_TURN : 1);

    // A drift (the drift button held through a corner) turns the dog round its own curve; the arrows only tighten or
    // widen it.  The ordinary steering is not added on top: it is kept in step with the drift's turn instead, so that
    // when the drift ends the dog carries on from the turn it had (EXITING), easing back to what the arrows say
    const drifting = this.#driftSteer(frame, turnInput);
    if (drifting) {
      this.yawRate = drifting.yawRate;
      this.steer = THREE.MathUtils.clamp(drifting.yawRate / Math.max(turnRate, 1e-3), -1.6, 1.6);
      group.rotation.y += drifting.turned;
    } else {
      // The turn builds and fades: a running dog cannot change line instantly (and just out of a drift, more gently still)
      const response = HANDLING.steerResponse * (performance.now() < this.driftExitUntil ? DRIFT_ARC.exitResponse : 1);
      this.steer += (turnInput - this.steer) * (1 - Math.exp(-response * delta));
      this.yawRate = turnRate * this.steer;
      group.rotation.y += this.yawRate * delta;
    }

    // Poppy's wave steers itself: it follows the road, wandering from side to side, so it only
    // hits the dogs that happen to be in its way.  The twins' Trip Wire steers itself up the middle (wander 0)
    if (special?.steerLocked) {
      const line = racingLineAt(mapId, position.x, position.z, rescue.lineS);
      if (line) {
        const leftX = Math.cos(line.rotationY), leftZ = -Math.sin(line.rotationY);
        const offset = (position.x - line.x) * leftX + (position.z - line.z) * leftZ;
        const wander = Math.sin(performance.now() / 1000 * 1.1) * (special.wander ?? 0.5) * line.halfWidth;
        const want = line.rotationY +
          THREE.MathUtils.clamp((wander - offset) / Math.max(line.halfWidth, 1) * 0.9, -0.6, 0.6);
        group.rotation.y +=
          Math.atan2(Math.sin(want - group.rotation.y), Math.cos(want - group.rotation.y)) *
          (1 - Math.exp(-5 * delta));
      }
    }

    // Turning hard at speed costs speed (not in a skid: that is what a skid is for)
    const turnLimit = this.drift ? maxSpeed : maxSpeed * (1 - this.turnSpeedLoss * Math.abs(this.steer) * effort);

    if (this.currentSpeed > turnLimit) {
      this.currentSpeed = Math.max(turnLimit, this.currentSpeed - BRAKING * 0.5 * delta);
    }
  }

  // ---------------------------------
  // MOVEMENT
  // ---------------------------------

  #advance(frame) {
    const { delta, effort } = frame;
    const { world } = this.race;
    const { group, position } = this;

    // thrown on by a rubber ring: carried at the ring's pace until it comes down
    if (this.ringHop && this.isJumping && performance.now() >= this.stunUntil) this.currentSpeed = this.ringHop;
    else this.ringHop = 0;

    // The dog travels where its momentum takes it, which trails the way
    // its nose points: at a sprint it drifts a little through a turn
    const wet = world.coastalTrack?.rules.slip;
    const grip = (this.drift ? DRIFT_ARC.grip : THREE.MathUtils.lerp(HANDLING.gripSlow, this.gripSprint, effort))
      * (wet && frame.slip ? 1 - (1 - wet.grip) * frame.slip : 1);

    this.travelYaw +=
      Math.atan2(
        Math.sin(group.rotation.y - this.travelYaw),
        Math.cos(group.rotation.y - this.travelYaw)
      ) *
      (1 - Math.exp(-grip * delta));

    const forward = frame.forward = FORWARD.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.travelYaw);

    const previousPosition = position.clone();
    const proposedPosition = previousPosition.clone().addScaledVector(forward, this.currentSpeed * delta);
    if (!frame.special?.ghost && world.blockedByObstacle(previousPosition, proposedPosition)) {
      // Stop forward movement; steering and jumping remain available.
      this.currentSpeed = 0;
    } else {
      position.copy(proposedPosition);
    }
  }

  // ---------------------------------
  // BUMPING OTHER DOGS
  // ---------------------------------
  // Each player's game moves only its own dog, so each game works out the
  // knocks its own dog takes from where it last saw the others.

  #bumpOtherDogs(frame) {
    const { delta, forward } = frame;
    const { world, remotes } = this.race;
    const { group, position, knock } = this;

    const mySize = this.size;
    const myMass = dogMass(this.config);
    const myVelocity = forward.clone().multiplyScalar(this.currentSpeed).add(knock);
    const push = new THREE.Vector3();

    remotes.forEach((remote) => {
      if (!remote.visible) return; // Dogs travelling underground cannot be bumped.
      const other = remote.position;
      const otherSize = remote.config.size ?? 1;
      const lift = position.y - other.y;

      // One dog is jumping clean over the other
      if (lift > CONTACT.clearHeight * otherSize || -lift > CONTACT.clearHeight * mySize) return;

      const hit = dogOverlap(position, group.rotation.y, mySize, other, remote.group.rotation.y, otherSize);
      if (!hit) return;

      // The lighter dog gives more of the ground
      const share = dogMass(remote.config) / (myMass + dogMass(remote.config));

      push.x += hit.x * hit.depth * share;
      push.z += hit.z * hit.depth * share;

      const fresh = performance.now() - remote.lastMoveTime < CONTACT.staleAfter * 1000;
      const closing =
        ((fresh ? remote.velocity.x : 0) - myVelocity.x) * hit.x +
        ((fresh ? remote.velocity.z : 0) - myVelocity.z) * hit.z;

      if (closing > 0) {
        // Thrown the way the other dog was driving, harder the faster
        // they met.  Topped up to that speed, never stacked every frame.
        const wanted = closing * (1 + CONTACT.bounce) * share;
        const already = knock.x * hit.x + knock.z * hit.z;

        if (already < wanted) {
          knock.x += hit.x * (wanted - already);
          knock.z += hit.z * (wanted - already);
        }
      }
    });

    knock.clampLength(0, CONTACT.maxKnock);
    push.addScaledVector(knock, delta);
    knock.multiplyScalar(Math.exp(-CONTACT.fade * delta));

    if (push.lengthSq() > 1e-10) {
      const from = position.clone();
      const to = from.clone().add(push);

      if (world.blockedByObstacle(from, to)) {
        knock.set(0, 0, 0);
      } else {
        position.copy(to);
      }
    }
  }

  // A dog in the middle of a special that carries it along (Ralph flying, Pablo's sled, Meela's zoomies, Enzo's bounce,
  // Casper's run, Jimmy's dragon...) has an invisible wall at each edge of the road, so it cannot shoot off a road
  // with no barriers (Treat Road) or cut across a corner and miss a checkpoint (Ralph, flying, would miss the lap).
  // It slides along the wall and still steers.  If it started wider than that, the wall closes in on it gently
  // rather than snapping it back.  (Tom, 2026-11-23: on every map, not just Treat Road)
  #keepToRoad(frame) {
    if (!frame.special?.flyHeight && !frame.special?.speed) { this.flyEdge = null; return; }
    const { position } = this, { mapId, rescue } = this.race;
    const line = racingLineAt(mapId, position.x, position.z, rescue.lineS);
    if (!line) return;
    const leftX = Math.cos(line.rotationY), leftZ = -Math.sin(line.rotationY);
    const offset = (position.x - line.x) * leftX + (position.z - line.z) * leftZ;
    const limit = Math.max(1, line.halfWidth - FLY_EDGE.inset);
    this.flyEdge = Math.max(limit, Math.min(this.flyEdge ?? Math.abs(offset), Math.abs(offset)) - FLY_EDGE.closeIn * frame.delta);
    if (Math.abs(offset) <= this.flyEdge) return;
    const back = Math.sign(offset) * this.flyEdge - offset;
    position.x += leftX * back;
    position.z += leftZ * back;
  }

  // ---------------------------------
  // WHAT THE DOG IS NOW STANDING IN
  // ---------------------------------

  #feelGround(frame) {
    const { world, goldenBones, hud } = this.race;
    const { position, stats, sprintSpeed } = this;
    const { coastalTrack } = world;

    // Slide along the coastal banks and dunes; exposed cliff edges remain open.
    let coastalSurface = coastalTrack?.query(position.x, position.z, -1, position.y);
    if (coastalSurface?.blocked && !ghostsThrough(frame.special, coastalSurface)) {      // (the twins' Trip Wire goes through whatever stands on the road)
      // how far into the wall it had got this step, against how far it travelled: 1 is straight into it
      const into = Math.hypot(position.x - coastalSurface.clampX, position.z - coastalSurface.clampZ);
      const out = into > 1e-6 ? [(coastalSurface.clampX - position.x) / into, (coastalSurface.clampZ - position.z) / into] : null;
      position.x = coastalSurface.clampX;
      position.z = coastalSurface.clampZ;
      coastalSurface = coastalTrack.query(position.x, position.z, -1, position.y);
      this.#hitWall(frame, into, coastalTrack.speedFactor(coastalSurface, this.coastalStats, this.isJumping));
      if (out && !frame.special) coastalSurface = this.#slideAlongWall(frame, out, into, coastalSurface);
    }
    // a sinkhole (Dune Dash) drags a dog on the ground towards its middle
    if (coastalSurface?.pull && !this.isJumping) {
      position.x += coastalSurface.pull[0] * frame.delta;
      position.z += coastalSurface.pull[1] * frame.delta;
    }
    if (coastalSurface) {
      // The ground the dog has just run on to sets its pace at once (mud, water, a climb).  Everything
      // else that makes up its top speed still counts: a golden bone, a special, a landing boost.
      const groundNow = coastalTrack.speedFactor(coastalSurface, this.coastalStats, this.isJumping);
      this.currentSpeed = Math.min(this.currentSpeed, frame.maxSpeed * groundNow / Math.max(frame.terrainMultiplier, 0.05));
    }

    // Recheck at the new location, so the slowdown begins immediately.
    this.offTrack = !this.#clearOfGround && !world.isTrackSurface(position);
    const poolNow = world.poolAt(position);
    const swimming = (Boolean(poolNow?.swimming) || coastalSurface?.movement === 'swim') && !this.isJumping;
    const wading = !this.isJumping && (poolNow?.inWater || (this.offTrack && world.isOverWater(position)));
    if (poolNow?.inWater && !this.isJumping) {
      this.currentSpeed = Math.min(this.currentSpeed, sprintSpeed * woodlandSwimMultiplier(stats.swimming)
        * goldenBones.speedMultiplier() * (performance.now() < this.stunUntil ? 0.15 : 1));
    }
    this.inBog = Boolean(world.woodland && !this.#clearOfGround && woodlandBogAt(position.x, position.z));
    if (this.inBog) this.currentSpeed = Math.min(this.currentSpeed, sprintSpeed * BOG_SPEED);
    if (this.offTrack) {
      const offTrackLimit = sprintSpeed * (wading ? this.waterSpeed : OFF_TRACK_SPEED_MULTIPLIER);
      this.currentSpeed = Math.min(this.currentSpeed, offTrackLimit);
    }
    hud.setSurface(
      wading
        ? poolNow ? swimming ? 'SWIMMING' : 'WADING' : 'IN THE WATER — JUMP IT NEXT TIME'
        : this.offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK',
      wading
        ? '#8fd0ff'
        : this.offTrack ? '#ffbc75' : '#9fe49b'
    );

    Object.assign(frame, { coastalSurface, swimming, wading });
  }

  // ---------------------------------
  // JUMPING
  // ---------------------------------

  #rise(frame) {
    const { delta, special } = frame;

    // The Water Park's rubber rings: a dog that comes down on one (or runs on to one from the shallows) is thrown up and
    // on, at no less than its full pace, which carries it to the next ring.  A dog that has fallen in and is swimming can get on
    // one only near the start of the lagoon (Tom, 2026-11-21: "you shouldn't be able to bounce back on, you need to swim")
    const { proceduralTrack } = this.race.world, bounce = proceduralTrack?.rules.bounce;
    const swimmingNow = Boolean(bounce) && !this.isJumping && proceduralTrack.query(this.position.x, this.position.z).movement === 'swim';
    if (bounce && !special && this.jumpHeight < 0.5 && this.verticalVelocity <= 0
      && proceduralTrack.ringAt(this.position.x, this.position.z, swimmingNow)) {
      this.isJumping = true;
      this.isLanding = false;
      this.jumpedFromOffTrack = false;
      this.verticalVelocity = bounce.force;
      this.jumpGravity = bounce.gravity;
      this.ringHop = bounce.pace;                 // (the same hop for every dog: it comes down on the next ring)
      this.bouncedAt = performance.now();
      this.play('Jump');
      if (this.currentAction === this.actions.Jump) this.currentAction.time = 0.2;      // straight into the leap
    }

    if (special?.bouncing) {
      // Enzo's Belly Bounce: up and down the same arc, again and again, wherever he is
      this.isJumping = true;                    // (so that he comes down and lands when it ends in mid-air)
      this.isLanding = false;
      this.jumpedFromOffTrack = false;
      this.verticalVelocity = 0;
      this.jumpGravity = JUMP.gravity;
      this.jumpHeight = special.height;
    } else if (special?.flyHeight) {
      // Ralph's rocket paws: up to flying height and held there, over the other dogs and
      // anything on the road; when they go out he drops and lands in his stride
      this.isJumping = true;
      this.isLanding = false;
      this.jumpedFromOffTrack = false;          // flying is flying, wherever he took off
      this.verticalVelocity = 0;
      this.jumpGravity = JUMP.gravity;
      this.jumpHeight += (special.flyHeight - this.jumpHeight) * (1 - Math.exp(-4 * delta));
    } else if (this.isJumping) {
      this.verticalVelocity -= this.jumpGravity * delta;
      this.jumpHeight += this.verticalVelocity * delta;

      // Down a hill the ground has dropped away since take-off (the jump is measured from where it began, so that
      // it carries over a dip): the dog is not down yet, and falls on to the ground that is really there
      const under = this.jumpHeight <= 0 && !this.race.world.steepRun ? this.race.world.groundHeightAt(this.position, this.groundY) : this.groundY;
      if (this.jumpHeight <= 0 && this.groundY - under > 0.15) {
        this.jumpHeight += this.groundY - under;
        this.groundY = under;
      } else if (this.jumpHeight <= 0) {
        this.jumpHeight = 0;
        this.verticalVelocity = 0;
        this.isJumping = false;
        this.ringHop = 0;

        // Landing at a run goes straight back into the stride; only a
        // standing jump plays the settle-and-stand landing
        if (Math.abs(this.currentSpeed) > RUNNING_JUMP_SPEED || this.race.specials.animating(this.id)) {
          this.isLanding = false;
        } else {
          this.isLanding = true;
          this.play('Land');
        }
      }
    }
  }

  // ---------------------------------
  // FOLLOW THE GROUND
  // ---------------------------------

  #followGround(frame) {
    const { delta, special, forward } = frame;
    const { world } = this.race;
    const { position } = this;
    const { steepRun } = world;

    // Over a dip (the stream) a jumping dog keeps the height it took off
    // from; it only meets lower ground once it comes down
    const groundBelow = world.groundHeightAt(position, this.groundY);
    // The road stops and carries on a long way below (the window at the Vets, the end of the stair in
    // the jungle): the dog runs off the end and falls to it, rather than being put down on it
    // (and off a platform on Neon Nexus, down to the Undercity: but not in the middle of a jump from one platform to the next)
    // (Ralph flying and Enzo bouncing stay up on the level they are on, across any gap: Tom, 2026-11-21.  If it ends over a
    // gap, they come down like any jump)
    const aloft = Boolean(special?.flyHeight || special?.bouncing);
    const below = !aloft && (Boolean(world.proceduralTrack?.drops?.length) || (Boolean(world.proceduralTrack?.undercity?.length) && !this.isJumping));
    if (below && this.groundY - groundBelow > DROP.from) {
      // (a dog that jumped off the end keeps the rise of its jump, and falls from the top of it)
      this.jumpHeight += this.groundY - groundBelow;
      this.groundY = groundBelow;
      if (!this.isJumping) { this.verticalVelocity = 0; this.play('Jump'); }
      this.isJumping = true;
      this.isLanding = false;
      this.jumpedFromOffTrack = false;
      this.jumpGravity = DROP.gravity;
    }
    // ...except down Frostpeak's black run, where that would sail the dog out level over a
    // 45 % slope: there a jump is a hop that follows the mountain down
    let groundNow = aloft && this.groundY - groundBelow > DROP.from ? this.groundY      // (over a gap: held at the level he was on)
      : this.isJumping && !steepRun && !special?.flyHeight   // (flying, he follows the ground)
        ? Math.max(groundBelow, this.groundY)
        : groundBelow;
    // In the air, the ground under the dog has come up a whole level: a swaying bridge or platform back under a dog that
    // had dropped off it (Tom, 2026-11-23: Enzo shot up into the sky on the jungle bridges).  The dog stays where it is in
    // the air: above the deck it comes down on it, and below it, it carries on falling to the level it was dropping to
    if (this.isJumping && groundNow - this.groundY > DROP.from) {
      const height = this.groundY + this.jumpHeight;
      if (height >= groundNow) { this.jumpHeight = height - groundNow; this.groundY = groundNow; }
      else groundNow = this.groundY;
    }

    // Ease onto the new height so tile edges and kerbs do not jolt the dog,
    // but go straight there after a big change (a respawn, a drop), and in the air up a hill: there the ground
    // rising under a jump would otherwise eat into it, and a sheep on a climb could not be cleared (Tom, 2026-11-21)
    this.groundY =
      Math.abs(groundNow - this.groundY) > 2.5 || (this.isJumping && groundNow > this.groundY)
        ? groundNow
        : this.groundY + (groundNow - this.groundY) * (1 - Math.exp(-22 * delta));

    position.y = this.groundY + this.jumpHeight;

    // Slope under the dog, from the ground a stride ahead
    const ahead = position.clone().addScaledVector(forward, 1.6);
    ahead.y = this.groundY;

    const slopeNow = (world.groundHeightAt(ahead, this.groundY) - this.groundY) / 1.6;

    this.slope +=
      (THREE.MathUtils.clamp(slopeNow, steepRun ? -0.55 : -0.4, 0.4) - this.slope) *
      (1 - Math.exp(-8 * delta));
  }

  // ---------------------------------
  // DOG ANIMATIONS
  // ---------------------------------

  #animate(frame) {
    const { delta, steeringFactor, effort, swimming, special } = frame;
    const { specials } = this.race;
    const playsOwnClips = specials.animating(this.id);       // a special plays its own clips

    const isMoving = Math.abs(this.currentSpeed) > 0.1;

    // In a skid the legs stop: a hop, then a held slide (skidView.js).  Out of it, straight back into the stride
    // its speed calls for (a sprint, if it kept its pace)
    const skid = this.skid.clips(delta, this.drift && !this.isJumping && !playsOwnClips ? this.drift : null);

    if (!this.isJumping && !this.isLanding && !playsOwnClips && !skid) {
      // The stride follows the speed, as a dog's does.  A little overlap
      // between strides stops them flickering at the changeover.
      // A short-legged dog changes stride at lower speeds
      const bands = this.config.strideBands ?? 1;
      const pace = Math.abs(this.currentSpeed) / bands;
      const holding = (name, margin) => (this.currentAnimation === name ? margin : 0);

      if (swimming) {
        this.play('Trot');
      } else if (!isMoving) {
        // turning on the spot: it steps round rather than swivelling like a statue
        this.play(Math.abs(this.steer) > 0.3 ? 'Walk' : 'Idle');
      } else if (pace < HANDLING.walkBelow + holding('Walk', 0.5)) {
        this.play('Walk');
      } else if (pace < HANDLING.trotBelow + holding('Trot', 0.7)) {
        this.play('Trot');
      } else if (pace > HANDLING.runBelow - holding('Sprint', 1.0)) {
        this.play('Sprint');
      } else {
        this.play('Run');
      }
    }

    if (this.currentAction && !specials.animating(this.id) && !skid) {
      this.currentAction.timeScale = swimming
        ? (isMoving ? 1.1 : 0.6)
        : gaitTimeScale(this.currentAction, this.currentSpeed, this.config);
    }

    if (this.mixer) {
      this.mixer.update(delta);

      // the lean into a turn, and all of a skid: turned into the corner, legs folded, tail going, dust and sparks
      this.skid.pose(delta, {
        steer: this.steer * steeringFactor / Math.max(1, Math.abs(this.steer)), effort,
        tier: this.drift ? driftTier(this.drift.charge) : 0, speed: this.currentSpeed, spinning: performance.now() < this.stunUntil,
      });
      // the boost out of a skid: a blue trail behind the dog while it lasts (a Golden Bone's is gold)
      const boostLeft = (this.driftBoostUntil - performance.now()) / 1000;
      if (boostLeft > 0 && this.driftBoost && !this.race.goldenBones.isBoosting()) {
        this.skid.trail(delta, Math.min(1, boostLeft / this.driftBoost.easeOut), this.driftBoost.super);
      }

      // Nose up the hills and down the far side (not while in the air)
      if (this.model) {
        // (Enzo bouncing: nose up on the way up, belly first on the way down)
        this.model.rotation.x = special?.bouncing ? -0.5 * Math.cos(special.phase * Math.PI)
          : swimming ? -0.06 : this.isJumping ? 0 : -Math.atan(this.slope);
        // (in the slide: sat back a little and let down on to its paws, its belly or its board)
        this.skid.settle(delta, { pitch: this.model.rotation.x, speed: this.currentSpeed, grounded: !this.isJumping });
      }
      // (Jimmy downhill: fire from his wheels, while they are on the road)
      this.skid.wheels(delta, { share: this.isJumping ? 0 : downhillShare(this.stats, this.slope), speed: this.currentSpeed });
    }
  }

  // ---------------------------------
  // THE GROUND READOUT ON THE HUD
  // ---------------------------------
  // (each map has its own words for what the dog is running on; the special's name beats them all)

  #showGround(frame) {
    const { special, coastalSurface, swimming, wading } = frame;
    const { world, goldenBones, hud } = this.race;
    const { position, offTrack, slope } = this;
    const now = performance.now();

    if (world.woodland) {
      hud.setSurface(
        woodlandPlankAt(position.x, position.z, position.y)
          ? 'TIGHTROPE — STAY ON IT!'
          : swimming
          ? this.dogId === 'black_lab' ? 'POPPY’S WATER DASH' : 'SWIMMING'
          : wading ? 'WADING'
          : this.inBog ? 'BOG — SWIM OR TAKE THE PLANK'
          : now < this.burrowBoostUntil ? 'BURROW EXIT BOOST!'
          : goldenBones.isBoosting() ? 'GOLDEN BONE BOOST!'
          : offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK',
        wading ? '#9de5df' : '#cbe4ae'
      );
    }
    if (world.steepRun && !offTrack) {
      hud.setSurface(
        now < this.launchBoostUntil ? 'LANDING BOOST!'
          : goldenBones.isBoosting() ? 'GOLDEN BONE BOOST!'
          : slope < -0.2 ? 'BLACK RUN — FULL SEND!' : 'ON TRACK',
        slope < -0.2 ? '#ffd166' : '#9fe49b'
      );
    }
    if (world.proceduralTrack) {
      const soft = coastalSurface?.surface === 'shoulder' || coastalSurface?.surface === 'verge';
      hud.setSurface(
        now < this.recoveryUntil
          ? 'RECOVERING — REDUCED SPEED'
          : now < this.launchBoostUntil ? 'LANDING BOOST!'
          : this.padKick && now < this.padKick.until ? (this.padKick.mega ? 'MEGA BOOST!' : 'BOOST!')
          : goldenBones.isBoosting() ? 'GOLDEN BONE BOOST!'
          : offTrack ? 'OFF THE EDGE'
          : now - (this.bouncedAt ?? -1e9) < 700 ? 'BOING!'
          : coastalSurface?.slide ? world.proceduralTrack.slipAt ? 'MUDSLIDE!' : 'WATER SLIDE!'
          : coastalSurface?.slippery > 0.6 ? 'WET CLAY — SLIPPERY!'
          : coastalSurface?.movement === 'swim' ? 'SWIMMING'
          : coastalSurface?.movement === 'wade' ? 'WADING'
          : coastalSurface?.escalator ? 'ESCALATOR — GOING UP!'
          : coastalSurface?.mud ? coastalSurface.slowName ?? 'MUD — SLOW GOING'
          : soft ? 'SOFT GROUND — SLOWDOWN' : 'ON TRACK',
        coastalSurface?.inWater ? '#8fd0ff'
          : offTrack || coastalSurface?.mud || soft ? '#ffbc75' : '#9fe49b'
      );
    }
    if (this.drift) {
      const tier = driftTier(this.drift.charge);
      hud.setSurface(tier ? (this.driftPerks.boost.super ? 'SUPER BOOST READY — LET GO!' : 'BOOST READY — LET GO!') : 'DRIFTING…', DRIFT_HUD_COLOURS[tier]);
    } else if (now < this.driftBoostUntil && !goldenBones.isBoosting()) {
      hud.setSurface(this.driftBoost?.super ? 'SUPER DRIFT BOOST!' : 'DRIFT BOOST!', DRIFT_HUD_COLOURS[1]);
    }
    if (!this.drift && !this.offTrack && downhillSpeed(this.stats, this.slope) > 1.08) hud.setSurface('DOWNHILL — WHEELS AWAY!', '#62ffe6');      // (Jimmy)
    if (!special && now - this.wallAt < 700) hud.setSurface('HIT THE WALL!', '#ff8a6a');
    if (special) hud.setSurface(`${special.name.toUpperCase()}!`, '#ffe45c');
    else if (performance.now() < this.quakeUntil) hud.setSurface(this.quakeWord ?? 'EARTHQUAKE — HOLD ON!', '#ff8a6a');
  }
}
