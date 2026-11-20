// Two dogs that race as one (Baz and Naz, the pug twins): the second dog, the rope between them, and
// the way they sling each other up the road.  The racer is still one place on the road (the avatar's
// group); the two dogs are moved about inside it.
//
//   const duo = createDuo({ group, first, second, config });     // first, second: holders with a dog model in each
//   each frame: duo.update(delta, { speed, sprintSpeed, action, spread });
//       action: the clip action the first dog is playing (the second copies it, half a stride out of step)
//       spread: null, or { left, right }: how far to each side of the racer the edges of the road are (the
//               twins' Trip Wire: they run out to them, the rope tight between)
//       stack: 0 to 1, how far into a skid they are: the second jumps up on to the first one's back and
//               rides it round the corner, and jumps down again as they run out of it
//   duo.dispose();
//
// Left is +x here: the group faces +z.
import * as THREE from 'three';
import { GAITS } from '../../config/handling.js';

const SIDE = 0.62;            // how far each runs from the middle, side by side
const LEAP = 0.95;            // how far ahead and behind they swing, flat out
const HOP = 0.38;             // how high the one being slung forward comes off the ground
const SWAPS = 0.85;           // how many times a second the lead changes, flat out
const ROPE = { length: 1.9, radius: 0.045, segments: 14, color: 0xb98d5a, taut: 0xffd23a };

export function createDuo({ group, first, second, config }) {
  const mixer = new THREE.AnimationMixer(second.model);
  const actions = Object.fromEntries(second.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  for (const name of ['Jump', 'Land']) actions[name]?.setLoop(THREE.LoopOnce, 1);
  let current = null, phase = 0, swing = 0, spreadShare = 0, taut = 0;
  // (the distances above are for dogs at a scale of 2: smaller dogs run closer together on a shorter rope)
  const part = (config.scale ?? 2) / 2, side = SIDE * part, leap = LEAP * part, hop = HOP * part, ropeLength = ROPE.length * part, ropeRadius = ROPE.radius * part;
  const x = [side, -side], middle = new THREE.Vector3(), riding = new THREE.Vector3();
  // the rope: clipped to each harness, between the shoulders
  const back = (() => { const chest = first.bones.chest ?? first.bones.spine1; if (!chest) return 0.42 * config.scale; group.updateWorldMatrix(true, true); return group.worldToLocal(chest.getWorldPosition(new THREE.Vector3())).y + 0.07 * config.scale; })();
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: ROPE.color, roughness: 0.9, emissive: ROPE.taut, emissiveIntensity: 0 });
  const rope = new THREE.Mesh(new THREE.BufferGeometry(), ropeMaterial); rope.name = 'Twin_Rope'; rope.frustumCulled = false; rope.castShadow = true; group.add(rope);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);

  function copyClip(action) {
    const name = action?.getClip().name, next = name ? actions[name] : null;
    if (!next || next === current) return;
    current?.fadeOut(0.2);
    next.reset();
    // (out of step with the first dog: half a stride on)
    if (GAITS.has(name)) next.time = (action.time + 0.5 * next.getClip().duration) % next.getClip().duration;
    next.fadeIn(0.2).play();
    current = next;
  }

  return {
    second,
    update(delta, { speed = 0, sprintSpeed = 17, action = null, spread = null, stack = 0 } = {}) {
      copyClip(action);
      if (current && action) current.timeScale = action.timeScale;
      mixer.update(delta);
      // whatever the game does to the first dog's model (the lean into a bend, the spin when it is hit, hidden in a fall), the second has too
      second.model.rotation.copy(first.model.rotation);
      second.model.position.y = 0;
      second.holder.visible = first.model.visible;

      const pace = THREE.MathUtils.clamp(Math.abs(speed) / (sprintSpeed * 0.8), 0, 1);
      spreadShare += ((spread ? 1 : 0) - spreadShare) * (1 - Math.exp(-7 * delta));
      // the swing: one is slung forward past the other, lands, and slings the other
      swing += ((spread ? 0 : pace) - swing) * (1 - Math.exp(-5 * delta));
      phase += delta * 2 * Math.PI * SWAPS * (0.45 + 0.55 * pace);
      const targets = spread ? [spread.left, spread.right] : [side, -side];
      [first, second].forEach((dog, k) => {
        const sign = k ? -1 : 1, sin = Math.sin(phase) * sign, cos = Math.cos(phase) * sign;
        x[k] += (targets[k] - x[k]) * (1 - Math.exp(-(spread ? 5 : 8) * delta));
        const flying = Math.max(0, cos) ** 1.5 * swing;             // (on its way forward)
        dog.holder.position.set(x[k], hop * flying, leap * swing * sin);
        dog.holder.rotation.x = -0.35 * flying * Math.sin(Math.max(0, cos) * Math.PI);    // nose up as it leaves the ground
        dog.holder.rotation.y = spreadShare > 0.02 && Math.abs(targets[k] - x[k]) > 0.3 ? Math.sign(targets[k] - x[k]) * 0.5 * spreadShare : 0;      // (running out to the edge)
      });
      if (stack > 0 && !spread) {
        // a skid: the first comes to the middle and crouches (the game folds its legs); the second leaps up
        // on to its back, a little behind its shoulders, and stands there
        const up = Math.max(0, back - 0.03 * config.scale + first.model.position.y), leapUp = Math.sin(stack * Math.PI) * 0.35 * config.scale;
        first.holder.position.lerp(middle, stack);
        first.holder.rotation.x *= 1 - stack;
        second.holder.position.lerp(riding.set(0, up, -0.04 * config.scale), stack);
        second.holder.position.y += leapUp;
        second.holder.rotation.x *= 1 - stack;
      }

      // the rope: slack between them side by side, tight when one is flung ahead, and a bright tight line in the Trip Wire
      const a = first.holder.position, b = second.holder.position, apart = a.distanceTo(b);
      const slack = spread ? 0 : Math.sqrt(Math.max(0, (ropeLength / 2) ** 2 - (apart / 2) ** 2));
      const low = spread ? 0.55 : 1;                                 // (in the Trip Wire it is carried low: shin height)
      taut += ((spread ? 1 : 0) - taut) * (1 - Math.exp(-8 * delta));
      curve.points.forEach((p, k) => { const t = k / 4, sag = Math.min(back * 0.8, slack) * 4 * t * (1 - t); p.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + back * (1 - (1 - low) * taut) - sag, a.z + (b.z - a.z) * t); });
      rope.geometry.dispose();
      rope.geometry = new THREE.TubeGeometry(curve, ROPE.segments, ropeRadius * (1 + 0.6 * taut), 5, false);
      ropeMaterial.emissiveIntensity = 0.9 * taut;
      rope.visible = first.model.visible;
    },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(second.model);
      rope.removeFromParent(); rope.geometry.dispose(); ropeMaterial.dispose();
    },
  };
}
