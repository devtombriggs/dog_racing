import * as THREE from 'three';
import { prepareHeadLook, applyHeadLook } from '../../headLook.js';
import { HANDLING, BEND_SIGN, BEND_BONES, GAITS } from '../../config/handling.js';

// ---------------------------------
// ANIMATION HELPERS
// ---------------------------------

export function switchAction(actions, current, name) {
  // Dogs without a walk or trot clip fall back to the next stride up
  const next =
    actions[name] ||
    (name === 'Walk' ? actions.Trot || actions.Run : null) ||
    (name === 'Trot' ? actions.Run : null);

  if (!next || next === current) {
    return current;
  }

  const inStride =
    current &&
    GAITS.has(current.getClip().name) &&
    GAITS.has(next.getClip().name);

  // Coming down from a jump into a stride: pick the stride up just before
  // the front paws strike (the strides start on a hind paw), and blend quickly
  const fromJump =
    current &&
    current.getClip().name === 'Jump' &&
    GAITS.has(next.getClip().name);

  const phase = inStride
    ? (current.time / current.getClip().duration) % 1
    : fromJump
      ? 0.15
      : 0;

  const fade = fromJump ? 0.12 : 0.2;

  if (current) {
    current.fadeOut(fade);
  }

  next.reset();

  if (inStride || fromJump) {
    next.time = phase * next.getClip().duration;
  }

  next.fadeIn(fade);
  next.play();

  return next;
}

export function gaitTimeScale(action, speed, config) {
  const clipName = action.getClip().name;
  const natural = config.gaitSpeed?.[clipName];

  if (!GAITS.has(clipName) || !natural) {
    return 1;
  }

  const rate = THREE.MathUtils.clamp(
    Math.abs(speed) / (natural * config.scale),
    0.7,
    config.maxStrideRate ?? 1.3
  );

  return speed < 0 ? -rate : rate;
}

// 0 at an easy run, 1 flat out
export function sprintFraction(speed, runSpeed, sprintSpeed) {
  return THREE.MathUtils.clamp(
    (Math.abs(speed) - runSpeed * 0.5) /
      (sprintSpeed - runSpeed * 0.5),
    0,
    1
  );
}

export function collectBones(root) {
  const bones = {};

  root.traverse((object) => {
    if (object.isBone) {
      bones[object.name] = object;
    }
  });

  prepareHeadLook(root, bones);
  return bones;
}

// Lean the dog and curve its body into a turn.  Call after the animation
// mixer has updated.
// steer: -1 (right) to 1 (left).  effort: 0 to 1, how hard the dog is running.
export function applyTurnPose(model, bones, steer, effort) {
  if (!model) return;

  model.rotation.z =
    -steer * HANDLING.lean * (0.35 + 0.65 * effort);

  const bend =
    steer * HANDLING.bend * (0.5 + 0.5 * effort);

  for (const [name, weight] of BEND_BONES) {
    const bone = bones[name];

    if (bone) {
      // The mixer only rewrites a bone whose animated value changed since the
      // last frame.  A bone the stride holds still would keep last frame's
      // bend and have this one added on top, twisting further every frame of
      // a turn, so put such a bone back to its animated pose first.
      const turn = (bone.userData.turnPose ??= {
        animated: new THREE.Quaternion(),
        posed: new THREE.Quaternion(NaN, NaN, NaN, NaN)
      });

      if (bone.quaternion.equals(turn.posed)) {
        bone.quaternion.copy(turn.animated);
      }

      turn.animated.copy(bone.quaternion);
      bone.rotateZ(BEND_SIGN * bend * weight);
    }
  }
  applyHeadLook(model, steer);

  for (const [name] of BEND_BONES) {
    const bone = bones[name];

    if (bone) {
      bone.userData.turnPose.posed.copy(bone.quaternion);
    }
  }
}
