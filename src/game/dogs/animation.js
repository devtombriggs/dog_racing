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

// Fold the dog's legs under it for the slide of a skid (config.skid.bend), `weight` of the way (0 to 1).
// Call after the animation mixer has updated.
export function applySkidPose(bones, bend, weight) {
  for (const [name, angle] of Object.entries(bend)) {
    for (const side of ['L', 'R']) {
      const bone = bones[name + side];
      if (!bone) continue;
      // (as in applyTurnPose: a bone the clip holds still is not rewritten by the mixer, so put it back first)
      const skid = (bone.userData.skidPose ??= { animated: new THREE.Quaternion(), posed: new THREE.Quaternion(NaN, NaN, NaN, NaN) });
      if (bone.quaternion.equals(skid.posed)) bone.quaternion.copy(skid.animated);
      skid.animated.copy(bone.quaternion);
      if (weight > 0) bone.rotateX(angle * weight);
      skid.posed.copy(bone.quaternion);
    }
  }
}

/**
 * Where the dog's paws are, standing (measured once, when its model has loaded and is in its standing clip):
 * { rest: how high its lowest paw joint is off the ground, front, back: how far ahead of and behind its middle its
 * paws are, side: how far out to each side } (metres, in the dog's own space: it faces +z)
 */
export function pawStance(group, bones) {
  group.updateWorldMatrix(true, true);
  const at = PAWS.filter(name => bones[name]).map(name => group.worldToLocal(bones[name].getWorldPosition(new THREE.Vector3())));
  if (!at.length) return { rest: 0, front: 0.5, back: -0.5, side: 0.2 };
  return {
    rest: Math.min(...at.map(p => p.y)), front: Math.max(...at.map(p => p.z)), back: Math.min(...at.map(p => p.z)),
    side: Math.max(...at.map(p => Math.abs(p.x))),
  };
}

const PAWS = ['pawL', 'pawR', 'hindpawL', 'hindpawR'], pawAt = new THREE.Vector3();
/**
 * How high the dog's lowest paw joint is above the road under it (metres), as `pawStance().rest` is when it stands.
 * group: the dog in the scene; model: its model, posed.  slopePitch: the tilt it has for the hill it is on (model.rotation.x
 * without the skid's own): that is taken out, so that the answer is the same on a hill as on the flat (Tom, 2026-11-27: "the
 * dogs float when drifting", the snow map most.  Measured straight up and down, the downhill paws of a dog tilted with a slope
 * are far below its middle, and it was lifted until they were level with it: off the ground).  Its lean and the skid's own
 * sit-back are left in: the paw they put lowest is the one on the ground.
 */
export function lowestPaw(group, model, bones, slopePitch = 0) {
  group.updateWorldMatrix(true, true);
  const cos = Math.cos(slopePitch), sin = Math.sin(slopePitch);
  let lowest = Infinity;
  for (const name of PAWS) {
    if (!bones[name]) continue;
    (model.parent ?? group).worldToLocal(bones[name].getWorldPosition(pawAt));     // (in what the model is placed in: the dog, or a twin's holder)
    // (turned back about the model's own middle by the slope's tilt: a rotation about x by -slopePitch: y cos + z sin)
    const y = pawAt.y - model.position.y, z = pawAt.z - model.position.z;
    lowest = Math.min(lowest, model.position.y + y * cos + z * sin);
  }
  return lowest;
}

// A dog in the slide of a skid is not a statue: its tail wags hard, the tip a beat behind the root,
// and its head nods and shakes with the judder of the skid while its neck sways.
// time: seconds.  weight: how far into the slide it is (0 to 1).  life: config.skid.life.
// Returns what applyTurnPose takes as `sway`: { bone: [sideways, nod] } in radians.
export function skidSway(time, weight, life) {
  const wag = time * life.wagRate * Math.PI * 2, look = time * life.lookRate * Math.PI * 2, judder = time * life.judderRate * Math.PI * 2;
  const tail = i => [Math.sin(wag - i * 0.7) * life.wag * (1 - i * 0.12) * weight, 0];
  return {
    tail1: tail(0), tail2: tail(1), tail3: tail(2),
    neck1: [Math.sin(look) * life.look * 0.5 * weight, Math.sin(judder - 0.8) * life.judder * 0.4 * weight],
    neck2: [Math.sin(look - 0.3) * life.look * 0.5 * weight, Math.sin(judder - 0.4) * life.judder * 0.6 * weight],
    head: [Math.sin(look - 0.6) * life.look * weight, Math.sin(judder) * life.judder * weight],
  };
}

// Lean the dog and curve its body into a turn.  Call after the animation
// mixer has updated.
// steer: -1 (right) to 1 (left).  effort: 0 to 1, how hard the dog is running.
// sway: more movement for the same bones, on top of the turn (skidSway), or null.
export function applyTurnPose(model, bones, steer, effort, sway = null) {
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
      bone.rotateZ(BEND_SIGN * bend * weight + (sway?.[name]?.[0] ?? 0));
      if (sway?.[name]?.[1]) bone.rotateX(sway[name][1]);
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
