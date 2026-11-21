import * as THREE from 'three';
import { DOGS } from '../../config/dogs.js';
import { HANDLING } from '../../config/handling.js';
import { gaitTimeScale, sprintFraction } from './animation.js';
import { SkidView } from './skidView.js';
import { DogAvatar } from './DogAvatar.js';
import { DOG_STATS, downhillShare } from '../../../shared/dogStats.js';

// Another player's dog.  Their own game moves it; here it follows the positions the server passes
// on, smoothed, and plays the clip their game says it is in.
export class RemoteDog extends DogAvatar {
  // data: the player as the server describes them { id, dog, position, rotation, animation }
  constructor(data, scene) {
    super({ id: data.id, dogId: data.dog, config: DOGS[data.dog] || DOGS.gsp, scene });

    this.group.position.fromArray(data.position);
    this.group.rotation.y = data.rotation;

    this.targetPosition = new THREE.Vector3().fromArray(data.position);
    this.targetRotation = data.rotation;
    this.speed = 0;
    this.velocity = new THREE.Vector3();
    this.lastMoveTime = 0;
    this.steer = 0;
    this.steerTarget = 0;
    this.animation = data.animation || 'Idle';
    this.drift = null;       // skidding round a corner, as its own game (or the server, for a computer dog) says: { side, tier, startedAt }
    this.skid = new SkidView(this, scene);
    this.slope = 0;          // the slope it is on (rise per metre), from how it moves (for Jimmy's wheel fire)
  }

  get visible() { return this.group.visible; }

  modelReady() {
    this.play(this.animation);
    this.skid.ready();
  }

  // News of where the dog is now.  keepClip: it is in the middle of its special, which plays its own clips
  moved(data, keepClip) {
    const now = performance.now();
    const elapsed = (now - this.lastMoveTime) / 1000;
    const previous = this.targetPosition.clone();

    this.targetPosition.fromArray(data.position);

    if (this.lastMoveTime && elapsed > 0.01 && elapsed < 0.5) {
      previous.y = this.targetPosition.y;
      this.speed = previous.distanceTo(this.targetPosition) / elapsed;
      this.velocity.subVectors(this.targetPosition, previous).divideScalar(elapsed);

      // How hard the other dog is turning, from how fast its heading changes
      const yawRate = Math.atan2(
        Math.sin(data.rotation - this.targetRotation),
        Math.cos(data.rotation - this.targetRotation)
      ) / elapsed;

      this.steerTarget = THREE.MathUtils.clamp(yawRate / HANDLING.turnRateSprint, -1, 1);
    }

    this.lastMoveTime = now;
    this.targetRotation = data.rotation;
    this.animation = data.animation;
    // in a skid (and which sparks it has): this game poses the dog for it, from when it first hears of it
    const side = data.drift?.side === 1 || data.drift?.side === -1 ? data.drift.side : 0;
    if (!side) this.drift = null;
    else if (this.drift?.side === side) this.drift.tier = data.drift.tier ?? 0;
    else this.drift = { side, tier: data.drift.tier ?? 0, startedAt: now };

    if (!keepClip && !this.drift) this.play(data.animation);
  }

  // Put straight back on the track (a fall, a rescue, the far end of a burrow)
  respawned(data) {
    this.group.visible = true;
    this.group.position.fromArray(data.position);
    this.targetPosition.copy(this.group.position);
    this.group.rotation.set(0, data.rotation, 0);
    this.targetRotation = data.rotation;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.lastMoveTime = 0;
    this.drift = null;
    this.play('Idle');
  }

  // Down from the catapult or the cannon
  landed(data) {
    this.targetPosition.fromArray(data.position);
    this.targetRotation = data.rotation;
    this.play('Sprint');
  }

  // Underground in one of Ralph's burrows
  hide() {
    this.group.visible = false;
  }

  // swimmingAt(position): is that deep water?  playsOwnClips: its special is animating it.
  // runSpeed, sprintSpeed: the speeds its lean is judged against
  update(delta, { swimmingAt, playsOwnClips, runSpeed, sprintSpeed }) {
    const smoothing = 1 - Math.exp(-12 * delta);

    this.group.position.lerp(this.targetPosition, smoothing);

    const rotationDifference = Math.atan2(
      Math.sin(this.targetRotation - this.group.rotation.y),
      Math.cos(this.targetRotation - this.group.rotation.y)
    );
    this.group.rotation.y += rotationDifference * smoothing;

    const skidding = this.skid.clips(delta, playsOwnClips || !this.group.visible ? null : this.drift);

    if (this.currentAction && !playsOwnClips && !skidding) {
      this.currentAction.timeScale = swimmingAt(this.group.position)
        ? (this.speed > 0.1 ? 1.1 : 0.6)
        : gaitTimeScale(this.currentAction, this.speed, this.config);
    }

    this.steer += (this.steerTarget - this.steer) * (1 - Math.exp(-HANDLING.steerResponse * delta));

    if (this.mixer) {
      this.mixer.update(delta);
      this.skid.pose(delta, { steer: this.steer, effort: sprintFraction(this.speed, runSpeed, sprintSpeed), tier: this.drift?.tier ?? 0, speed: this.speed });
      this.skid.settle(delta, { speed: this.speed });
      // (Jimmy downhill: the slope he is on, from how his position is falling as he goes; his wheels catch fire)
      if (this.skid.fire) {
        const was = this.lastAt ?? this.group.position, run = Math.hypot(this.group.position.x - was.x, this.group.position.z - was.z);
        if (run > 1e-4) this.slope += ((this.group.position.y - was.y) / run - this.slope) * (1 - Math.exp(-6 * delta));
        (this.lastAt ??= new THREE.Vector3()).copy(this.group.position);
        this.skid.wheels(delta, { share: downhillShare(DOG_STATS[this.dogId], this.slope), speed: this.speed });
      }
    }
  }
}
