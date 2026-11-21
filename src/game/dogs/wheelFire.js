import * as THREE from 'three';
import { dotMaterial, pool } from './driftEffects.js';

// Jimmy downhill (shared/dogStats.js downhillShare): his wheels run away with him, and fire streams back from both of
// them like a Chinese dragon's: red at the heart, then orange and gold, curling as it goes, with gold sparks thrown
// off it.  The steeper the road, the more of it.  For any dog that has wheels (bones `wheel.L` and `wheel.R`).
//
//   const fire = createWheelFire(scene, avatar);    // null for a dog with no wheels (call once its model is in)
//   each frame: fire.update(delta, { share, speed });   // share: 0 to 1, how downhill it is.  speed: m/s
//   fire.dispose();

const FLAME = [0xff2a10, 0xff5a12, 0xff8c1a, 0xffc22e, 0xffe27a];     // from the wheel outwards: red to gold
const SPARK = 0xffd46a;

export function createWheelFire(scene, avatar) {
  const { bones } = avatar;
  const wheels = [bones['wheel.L'] ?? bones.wheelL, bones['wheel.R'] ?? bones.wheelR].filter(Boolean);
  if (!wheels.length) return null;
  const size = avatar.config.scale ?? 2;
  // (the flames are drawn in their own colours, not as light: added light washes out to white on snow)
  const flames = pool(scene, 260, dotMaterial({ size: 0.16 * size, glow: false, grow: 1.3, opacity: 0.9 }), { gravity: -2.5, drag: 3 });
  const cores = pool(scene, 120, dotMaterial({ size: 0.09 * size, glow: true, grow: 0.5, opacity: 0.9 }), { gravity: -1.5, drag: 3 });
  const sparks = pool(scene, 90, dotMaterial({ size: 0.05 * size, glow: true, grow: -0.6, opacity: 1 }), { gravity: 6, drag: 1 });
  const at = new THREE.Vector3(), speed = new THREE.Vector3();
  let owedFlame = 0, owedSpark = 0, clock = 0, shown = 0;
  const rnd = spread => (Math.random() - 0.5) * 2 * spread;

  return {
    update(delta, { share = 0, speed: pace = 0 }) {
      clock += delta;
      // (eased, so a bump in the road does not flicker it on and off)
      shown += ((avatar.group.visible ? share : 0) - shown) * (1 - Math.exp(-6 * delta));
      if (shown < 0.05) { owedFlame = owedSpark = 0; }
      else {
        owedFlame += delta * 140 * shown;
        owedSpark += delta * 30 * shown;
        const yaw = avatar.group.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
        const back = 0.4 * pace + 2.5;          // it streams out behind, faster the faster he goes
        for (; owedFlame >= 1; owedFlame--) {
          const k = Math.floor(Math.random() * wheels.length), side = k ? -1 : 1;
          wheels[k].getWorldPosition(at);
          // the dragon's curl: each stream snakes from side to side and up and down as it goes
          const curl = Math.sin(clock * 9 + k * Math.PI), lift = Math.cos(clock * 7 + k);
          const out = side * (0.6 + 0.5 * curl) + rnd(0.3);
          speed.set(-fx * back + lx * out + rnd(0.4), 0.6 + 0.6 * lift + Math.random() * 0.8, -fz * back + lz * out + rnd(0.4));
          flames.emit(at, speed, (0.18 + Math.random() * 0.22) * (0.6 + 0.4 * shown), FLAME[Math.min(FLAME.length - 1, Math.floor(Math.random() ** 1.6 * FLAME.length))]);
          if (Math.random() < 0.4) cores.emit(at, speed.multiplyScalar(0.8), 0.12 + Math.random() * 0.1, 0xffe9a0);    // (the bright heart of it)
        }
        for (; owedSpark >= 1; owedSpark--) {
          wheels[Math.floor(Math.random() * wheels.length)].getWorldPosition(at);
          speed.set(-fx * back * 0.7 + rnd(2.5), 1.5 + Math.random() * 2.5, -fz * back * 0.7 + rnd(2.5));
          sparks.emit(at, speed, 0.3 + Math.random() * 0.4, SPARK);
        }
      }
      flames.update(delta); cores.update(delta); sparks.update(delta);
    },
    dispose() { flames.dispose(); cores.dispose(); sparks.dispose(); },
  };
}
