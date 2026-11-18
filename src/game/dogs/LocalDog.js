import * as THREE from 'three';
import { racingLineAt } from '../../../shared/pickupSpots.js';
import { SPECIALS } from '../../../shared/specials.js';
import { woodlandPlankAt, woodlandSwimMultiplier, woodlandBogAt, BOG_SPEED } from '../../../shared/wendoverData.js';
import { BASE_SPEED } from '../../../shared/dogStats.js';
import { JUMP, STEEP_JUMP } from '../../../shared/handling.js';
import { DOGS, STAT_EFFECT, WATER_SPEED, WATER_ACCELERATION, statScale, swimShare, turnSpeedLoss, pickupShare } from '../../config/dogs.js';
import { HANDLING, RUNNING_JUMP_SPEED } from '../../config/handling.js';
import { CONTACT, dogMass, dogOverlap } from './contact.js';
import { gaitTimeScale, sprintFraction, applyTurnPose } from './animation.js';
import { DogAvatar } from './DogAvatar.js';

const OFF_TRACK_SPEED_MULTIPLIER = 0.5;
const OFF_TRACK_ACCELERATION_MULTIPLIER = 0.6;
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
    this.burrowBoostUntil = 0;
    this.burrowBoost = 1.3;         // how much faster he comes out of a burrow (each burrow says)
    this.recoveryUntil = 0;         // slowed after a respawn until then
    this.respawnRevision = player?.respawnRevision ?? 0;      // (not 0 for a player coming back into a race)
    this.stunUntil = 0;
    this.stunLength = 1;

    // ---------------------------------
    // MOVEMENT SETTINGS
    // ---------------------------------

    // Real dog speeds at the dogs' scale of 3: an easy canter and a gallop
    // ...then each dog's own stats on top (STAT_EFFECT)
    const stats = this.stats = this.config.stats ?? {};
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
    this.waterSpeed = swimShare(stats.swimming, WATER_SPEED);
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
      animation: this.currentAnimation,
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
      specials.busy(this.id) ||          // no jumping in the middle of a special
      world.poolAt(this.position)?.swimming ||
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
  fell(data) {
    this.fall = { position: new THREE.Vector3().fromArray(data.position), startedAt: performance.now() };
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
    race.goldenBones.cancelBoost();
    this.respawnRevision = data.respawnRevision;
    this.recoveryUntil = performance.now() + data.penaltySeconds * 1000;
    this.position.fromArray(data.position);
    this.group.rotation.set(0, data.rotation, 0);
    this.travelYaw = data.rotation;
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
    this.launchFlight = { startedAt: performance.now(), lateral: data.lateral };
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
    this.position.fromArray(data.position);
    this.group.rotation.set(0, data.rotation, 0);
    this.travelYaw = data.rotation;
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
    this.race.goldenBones.cancelBoost();
  }

  // This dog's special ability has begun
  specialStarted() {
    const spec = SPECIALS[this.race.localPlayer?.dog];
    if (spec?.speed && this.currentSpeed > 0) this.currentSpeed = Math.max(this.currentSpeed, this.sprintSpeed);   // straight up to full pace
    if (spec?.flyHeight) { this.jumpGravity = JUMP.gravity; this.verticalVelocity = 0; }
  }

  // The kick of speed a golden bone gives a dog that is already running
  boneKick() {
    if (this.currentSpeed > 0) this.currentSpeed += this.race.goldenBones.instantKick(this.sprintSpeed);
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

  // How wide the camera should see: wider when flying or boosted
  get fov() {
    const { goldenBones, specials } = this.race;
    return this.launchFlight ? 94
      : performance.now() < this.launchBoostUntil || goldenBones.isBoosting() || specials.physics(this.id)?.speed ? 84 : 75;
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
    hud.setSurface('RALPH’S BURROW BOOST', '#ffc478');
    hud.setSpeed('»');
  }

  #fly(delta) {
    const { hud, world } = this.race;
    const elapsed = (performance.now() - this.launchFlight.startedAt) / 1000;
    const point = world.launchTrack.launchPoint(elapsed, this.launchFlight.lateral);
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

    this.#accelerate(frame);
    this.#turn(frame);
    this.#advance(frame);
    this.#bumpOtherDogs(frame);
    this.#feelGround(frame);
    this.race.rescue.update(delta, this);
    this.#rise(frame);
    this.#followGround(frame);
    this.#animate(frame);
    this.#showGround(frame);
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
    const coastalGround = coastalTrack?.query(position.x, position.z);
    const terrainMultiplier = inWater && woodlandSurface
      ? woodlandSwimMultiplier(stats.swimming)
      : coastalGround
      ? coastalTrack.speedFactor(coastalGround, this.coastalStats, this.isJumping)
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
    // Wet ground (the mud run): a dog slides where it was going and is slow to pick up speed
    const wet = coastalTrack?.rules.slip, slip = frame.slip = wet && !this.isJumping ? coastalGround.slippery ?? 0 : 0;
    const maxSpeed = frame.maxSpeed =
      sprintSpeed *
      terrainMultiplier *
      hillMultiplier *
      (performance.now() < this.burrowBoostUntil ? this.burrowBoost : 1) *
      (performance.now() < this.launchBoostUntil ? world.launchTrack.launch.exitSpeedMultiplier : 1) *
      (world.proceduralTrack && performance.now() < this.recoveryUntil ? world.proceduralTrack.rules.respawnSpeedMultiplier : 1) *
      goldenBones.speedMultiplier() *
      (special?.speed ?? 1) *
      (performance.now() < this.stunUntil ? 0.15 : 1);
    // (the last of a dog's speed comes slowly, and an agile dog is back up to speed sooner)
    const effectiveAcceleration = this.acceleration *
      (slip ? 1 - (1 - wet.acceleration) * slip : 1) *
      pickupShare(stats.agility, HANDLING.topEndAcceleration, sprintFraction(this.currentSpeed, this.runSpeed, sprintSpeed)) *
      (special?.speed ? 2.5 : 1) *
      goldenBones.accelerationMultiplier() *
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

    // The turn builds and fades: a running dog cannot change line instantly
    this.steer += (turnInput - this.steer) * (1 - Math.exp(-HANDLING.steerResponse * delta));

    // Fast means wide: the turn rate falls away as the dog stretches out
    const turnRate = THREE.MathUtils.lerp(this.turnRateSlow, this.turnRateSprint, effort);

    // (standing still or stuck against something, left and right still turn the dog on the spot)
    group.rotation.y += turnRate * this.steer * Math.max(steeringFactor, HANDLING.pivotSteer) * delta;

    // Poppy's wave steers itself: it follows the road, wandering from side to side, so it only
    // hits the dogs that happen to be in its way
    if (special?.steerLocked) {
      const line = racingLineAt(mapId, position.x, position.z, rescue.lineS);
      if (line) {
        const leftX = Math.cos(line.rotationY), leftZ = -Math.sin(line.rotationY);
        const offset = (position.x - line.x) * leftX + (position.z - line.z) * leftZ;
        const wander = Math.sin(performance.now() / 1000 * 1.1) * 0.5 * line.halfWidth;
        const want = line.rotationY +
          THREE.MathUtils.clamp((wander - offset) / Math.max(line.halfWidth, 1) * 0.9, -0.6, 0.6);
        group.rotation.y +=
          Math.atan2(Math.sin(want - group.rotation.y), Math.cos(want - group.rotation.y)) *
          (1 - Math.exp(-5 * delta));
      }
    }

    // Turning hard at speed costs speed
    const turnLimit = maxSpeed * (1 - this.turnSpeedLoss * Math.abs(this.steer) * effort);

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
    const grip = THREE.MathUtils.lerp(HANDLING.gripSlow, this.gripSprint, effort) * (wet && frame.slip ? 1 - (1 - wet.grip) * frame.slip : 1);

    this.travelYaw +=
      Math.atan2(
        Math.sin(group.rotation.y - this.travelYaw),
        Math.cos(group.rotation.y - this.travelYaw)
      ) *
      (1 - Math.exp(-grip * delta));

    const forward = frame.forward = FORWARD.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.travelYaw);

    const previousPosition = position.clone();
    const proposedPosition = previousPosition.clone().addScaledVector(forward, this.currentSpeed * delta);
    if (world.blockedByObstacle(previousPosition, proposedPosition)) {
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

  // ---------------------------------
  // WHAT THE DOG IS NOW STANDING IN
  // ---------------------------------

  #feelGround(frame) {
    const { world, goldenBones, hud } = this.race;
    const { position, stats, sprintSpeed } = this;
    const { coastalTrack } = world;

    // Slide along the coastal banks and dunes; exposed cliff edges remain open.
    let coastalSurface = coastalTrack?.query(position.x, position.z);
    if (coastalSurface?.blocked) {
      position.x = coastalSurface.clampX;
      position.z = coastalSurface.clampZ;
      coastalSurface = coastalTrack.query(position.x, position.z);
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

    // The Water Park's rubber rings: a dog that comes down on one (or swims into it) is thrown up and
    // on, at no less than its full pace, which carries it to the next ring
    const { proceduralTrack } = this.race.world, bounce = proceduralTrack?.rules.bounce;
    if (bounce && !special && this.jumpHeight < 0.5 && this.verticalVelocity <= 0
      && proceduralTrack.ringAt(this.position.x, this.position.z)) {
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

    if (special?.flyHeight) {
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

      if (this.jumpHeight <= 0) {
        this.jumpHeight = 0;
        this.verticalVelocity = 0;
        this.isJumping = false;
        this.ringHop = 0;

        // Landing at a run goes straight back into the stride; only a
        // standing jump plays the settle-and-stand landing
        if (Math.abs(this.currentSpeed) > RUNNING_JUMP_SPEED) {
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
    // ...except down Frostpeak's black run, where that would sail the dog out level over a
    // 45 % slope: there a jump is a hop that follows the mountain down
    const groundNow = this.isJumping && !steepRun && !special?.flyHeight   // (flying, he follows the ground)
      ? Math.max(groundBelow, this.groundY)
      : groundBelow;

    // Ease onto the new height so tile edges and kerbs do not jolt the dog,
    // but go straight there after a big change (a respawn, a drop)
    this.groundY =
      Math.abs(groundNow - this.groundY) > 2.5
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
    const { delta, steeringFactor, effort, swimming } = frame;
    const { specials } = this.race;
    const playsOwnClips = specials.animating(this.id);       // a special plays its own clips

    const isMoving = Math.abs(this.currentSpeed) > 0.1;

    if (!this.isJumping && !this.isLanding && !playsOwnClips) {
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

    if (this.currentAction && !specials.animating(this.id)) {
      this.currentAction.timeScale = swimming
        ? (isMoving ? 1.1 : 0.6)
        : gaitTimeScale(this.currentAction, this.currentSpeed, this.config);
    }

    if (this.mixer) {
      this.mixer.update(delta);

      applyTurnPose(this.model, this.bones, this.steer * steeringFactor, effort);

      // Nose up the hills and down the far side (not while in the air)
      if (this.model) {
        this.model.rotation.x = swimming ? -0.06 : this.isJumping ? 0 : -Math.atan(this.slope);
      }
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
    if (special) hud.setSurface(`${special.name.toUpperCase()}!`, '#ffe45c');
  }
}
