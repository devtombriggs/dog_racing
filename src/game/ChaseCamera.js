import * as THREE from 'three';

const SMOOTHNESS = 6;

// The camera behind the player's dog
export class ChaseCamera {
  // target: the dog's group.  A small dog gets a closer, lower camera so it is not lost on screen
  constructor(camera, target, config) {
    this.camera = camera;
    this.target = target;
    this.offset = new THREE.Vector3(...(config.cameraOffset || [0, 4, -8]));
    this.lookHeight = config.cameraLookHeight ?? 1.5;

    this.snap();
    camera.lookAt(target.position.x, target.position.y + this.lookHeight, target.position.z);
  }

  #place() {
    return this.target.position.clone().add(this.offset.clone().applyQuaternion(this.target.quaternion));
  }

  // Straight to its place behind the dog (a respawn can be far away)
  snap() {
    this.camera.position.copy(this.#place());
  }

  // Widen or narrow the view towards `fov` (wider when boosted or flying)
  easeFov(fov, delta) {
    const camera = this.camera;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-8 * delta));
      camera.updateProjectionMatrix();
    }
  }

  // rigid: stay locked behind the dog (while it is fired through the air) instead of easing after it
  update(delta, rigid) {
    const place = this.#place();
    if (rigid) this.camera.position.copy(place);
    else this.camera.position.lerp(place, 1 - Math.exp(-SMOOTHNESS * delta));

    const lookTarget = this.target.position.clone();
    lookTarget.y += this.lookHeight;
    this.camera.lookAt(lookTarget);
  }
}
