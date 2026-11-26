import * as THREE from 'three';

const SMOOTHNESS = 6;

// The camera behind the player's dog
export class ChaseCamera {
  // target: the dog's group.  A small dog gets a closer, lower camera so it is not lost on screen.
  // heading(): the way the dog is travelling (radians), which the camera sits behind; by default the way the group
  // faces.  (In a drift the dog's nose and its travel part company: the camera follows the travel, so it does not
  // swing out sideways)
  // view: { closer, look } (touch.js phoneView): on a phone the camera is nearer the dog and looks further up the road
  // confine(place, dog): moves `place` (where the camera is, or is going) to somewhere it may be: indoors, inside the walls
  constructor(camera, target, config, heading = null, view = null, confine = null) {
    this.confine = confine;
    this.camera = camera;
    this.target = target;
    this.heading = heading ?? (() => target.rotation.y);
    this.turn = new THREE.Quaternion();
    this.offset = new THREE.Vector3(...(config.cameraOffset || [0, 4, -8])).multiplyScalar(view?.closer ?? 1);
    this.lookHeight = (config.cameraLookHeight ?? 1.5) + (view?.look ?? 0);

    this.snap();
    camera.lookAt(target.position.x, target.position.y + this.lookHeight, target.position.z);
  }

  #place() {
    this.turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading());
    return this.target.position.clone().add(this.offset.clone().applyQuaternion(this.turn));
  }

  // Straight to its place behind the dog (a respawn can be far away)
  snap() {
    const place = this.#place();
    this.confine?.(place, this.target.position);
    this.camera.position.copy(place);
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
    this.confine?.(place, this.target.position);
    if (rigid) this.camera.position.copy(place);
    else this.camera.position.lerp(place, 1 - Math.exp(-SMOOTHNESS * delta));
    // (and where it has got to on the way there: easing round a corner must not take it through the wall either)
    this.confine?.(this.camera.position, this.target.position);

    const lookTarget = this.target.position.clone();
    lookTarget.y += this.lookHeight;
    this.camera.lookAt(lookTarget);
  }
}

// Indoors the camera stays inside the walls (Tom, 2026-11-26: on the inside maps "you can see inside the walls, shouldn't be
// able to do this at any time").  track.enclosed: the sections with walls to the ceiling either side (Kombu's House, the Vets,
// the Pet Mall).  From the dog back towards where the camera wants to be, the camera goes as far as the last place that is
// still in the same room as the dog: inside the walls, and just behind it round the lap (not in the room next door).
const WALL_CLEAR = 0.7;       // metres the camera keeps from a wall
export function confineToWalls(track) {
  if (!track?.enclosed || !track.query) return null;
  const L = track.length, lapGap = (s, s0) => ((((s - s0) % L) + L * 1.5) % L) - L / 2;
  return (place, dog) => {
    const here = track.query(dog.x, dog.z, -1, dog.y);
    if (!track.enclosed.includes(here.section)) return;
    const dx = place.x - dog.x, dz = place.z - dog.z, far = Math.hypot(dx, dz);
    if (far < 0.05) return;
    const steps = Math.max(4, Math.ceil(far / 0.6));
    let reach = 0;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps, q = track.query(dog.x + dx * f, dog.z + dz * f, here.index, dog.y);
      const inside = Math.abs(q.lateral) <= q.halfWidth - WALL_CLEAR && Math.abs(lapGap(q.s, here.s)) <= far * f * 1.6 + 3 && !q.blocked;
      if (!inside) break;
      reach = f;
    }
    if (reach >= 1) return;
    // nearer the dog, and a little lower with it, so that the dog is still in the picture
    place.x = dog.x + dx * reach; place.z = dog.z + dz * reach;
    place.y = dog.y + (place.y - dog.y) * (0.55 + 0.45 * reach);
  };
}
