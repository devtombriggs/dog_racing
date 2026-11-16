import { Quaternion, Vector3 } from 'three';

const controllers = new WeakMap();
const chain = [['neck1', 0.12], ['neck2', 0.25], ['head', 0.38]];

// Capture the model's forward axis in each bone's REST frame before starting
// the mixer. Bone axes differ between the dogs; Euler Z is not world yaw.
export function prepareHeadLook(model, bones) {
  model.updateWorldMatrix(true, true);
  const modelRotation = model.getWorldQuaternion(new Quaternion());
  controllers.set(model, chain.flatMap(([name, angle]) => {
    const bone = bones[name];
    if (!bone) return [];
    const forward = new Vector3(0, 0, 1)
      .applyQuaternion(modelRotation)
      .applyQuaternion(bone.getWorldQuaternion(new Quaternion()).invert());
    return [{ bone, forward, angle }];
  }));
}

// Replace captured sideways gaze with steering, retaining animated pitch and
// roll. Work in model space so slopes, banking and player heading don't affect
// the result. Parents first spreads the turn naturally along the neck.
export function applyHeadLook(model, steer) {
  const controller = controllers.get(model);
  if (!controller) return;
  const modelRotation = model.getWorldQuaternion(new Quaternion());
  const inverseModel = modelRotation.clone().invert();
  for (const { bone, forward, angle } of controller) {
    const direction = forward.clone()
      .applyQuaternion(bone.getWorldQuaternion(new Quaternion()))
      .applyQuaternion(inverseModel);
    if (Math.hypot(direction.x, direction.z) < 1e-5) continue;
    const yaw = Math.atan2(direction.x, direction.z);
    const up = new Vector3(0, 1, 0)
      .applyQuaternion(modelRotation)
      .applyQuaternion(bone.parent.getWorldQuaternion(new Quaternion()).invert());
    const target = Math.max(-1, Math.min(1, steer)) * angle;
    bone.quaternion.premultiply(new Quaternion().setFromAxisAngle(up, target - yaw));
    bone.updateWorldMatrix(false, true);
  }
}
