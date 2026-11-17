// Pippa's Pheasant Flush: a flock of pheasants bursts up around her, one for every rival.  Each bird
// locks onto its own dog (ahead or behind), flies it down and vanishes in a burst of feathers on the hit.
// Pure three.js (no React), so the game and the model preview page share it.
//
//   const flock = createPheasantFlock({ scene, gltf, size: 1 });   // gltf: the loaded pheasant.glb
//   flock.launch({
//     from: pippaModel,                    // Object3D she is (its position and facing), she faces +Z
//     targets: [{ id, object }],           // one bird each; object: the rival's Object3D (followed live),
//                                          // or give { id, getPosition(vec3) } instead.  With arriveIn (seconds)
//                                          // the bird times its flight to get there then, and waits to be told
//                                          // the outcome: flock.strike(id, hit) (the game: the server decides)
//     onHit(id, position) { ... },         // the bird has reached that dog and gone
//   });
//   each frame: flock.update(delta);       // after the dogs have been moved
//   flock.strike(id, hit)                  // the bird after that dog lands now (hit) or flies off in a puff (not)
//   flock.flying                           // how many birds are in the air
//   flock.dispose();
//
// size scales everything: 1 suits the game's dogs (shown at three times real size); the preview,
// which shows the dogs at their real size, uses about 0.33.
//
// A bird only ever hits the dog it is locked onto.  It cannot miss: it flies faster than the dogs run
// and turns harder the longer it has been out; if its dog has gone (left the race), it bursts where it is.
// What the hit does to the dog is the game's business (onHit).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const CRUISE = 46;          // flying speed, game units a second at size 1 (a sprinting dog does about 17)
const HIT_RADIUS = 1.3;     // how close to the dog's middle counts as a hit
const AIM_HEIGHT = 1.4;     // the dog's middle, above its feet
const MAX_FLIGHT = 9;       // seconds before a bird gives up and bursts
// plumage: russet, copper, gold, dark green head, white neck ring, red wattle
const FEATHER_COLOURS = [0x9a4a22, 0xb5632a, 0xc8902f, 0x1f4a3a, 0xf2ead8, 0xc0302a, 0x6e3a1e];

function featherTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(16, 2); g.bezierCurveTo(31, 26, 29, 66, 16, 86); g.bezierCurveTo(3, 66, 1, 26, 16, 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(16, 4); g.lineTo(16, 95); g.stroke();                 // the shaft
  g.lineWidth = 1;
  for (let y = 14; y < 80; y += 9) { g.beginPath(); g.moveTo(16, y + 6); g.lineTo(5, y); g.moveTo(16, y + 6); g.lineTo(27, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createPheasantFlock({ scene, gltf, size = 1 } = {}) {
  const owned = [];
  const group = new THREE.Group(); group.name = 'PheasantFlock';
  scene.add(group);
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  for (const need of ['Takeoff', 'Fly', 'Glide']) if (!clips[need]) console.warn(`[Pheasants] the model has no ${need} clip`);

  // ---- feathers and puffs, shared by every bird
  const featherTex = featherTexture(), dotTex = softDot();
  const featherGeo = new THREE.PlaneGeometry(0.34, 1);
  owned.push(featherTex, dotTex, featherGeo);
  const feathers = Array.from({ length: 90 }, () => {
    const mat = new THREE.MeshBasicMaterial({ map: featherTex, transparent: true, alphaTest: 0.05, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(featherGeo, mat); m.visible = false; m.frustumCulled = false; m.renderOrder = 3;
    group.add(m); owned.push(mat);
    return { m, life: 0, max: 1, vel: new THREE.Vector3(), spin: new THREE.Vector3(), phase: 0, len: 1 };
  });
  const puffs = Array.from({ length: 14 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xf3e6cf, transparent: true, depthWrite: false,
      opacity: 0, toneMapped: false }));
    s.visible = false; s.renderOrder = 3; group.add(s); owned.push(s.material);
    return { s, life: 0, max: 1, big: 1 };
  });
  let featherNext = 0, puffNext = 0;

  function burst(at, count, power, inherit) {
    const p = puffs[puffNext]; puffNext = (puffNext + 1) % puffs.length;
    p.s.position.copy(at); p.life = p.max = 0.4; p.big = (1.6 + power) * size; p.s.visible = true;
    for (let i = 0; i < count; i++) {
      const f = feathers[featherNext]; featherNext = (featherNext + 1) % feathers.length;
      const a = Math.random() * Math.PI * 2, up = Math.random() * 1.4 - 0.3, sp = (3 + Math.random() * 6) * power * size;
      f.vel.set(Math.cos(a) * sp, up * sp * 0.8 + 2 * size, Math.sin(a) * sp);
      if (inherit) f.vel.addScaledVector(inherit, 0.25);
      f.m.position.copy(at).addScaledVector(f.vel, 0.02);
      f.m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      f.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      f.len = (0.55 + Math.random() * 0.6) * size;
      f.m.material.color.setHex(FEATHER_COLOURS[(Math.random() * FEATHER_COLOURS.length) | 0]);
      f.life = f.max = 0.9 + Math.random() * 0.7; f.phase = Math.random() * 6.28;
      f.m.visible = true;
    }
  }

  // ---- the birds
  const birds = [];
  const aim = new THREE.Vector3(), want = new THREE.Vector3(), axis = new THREE.Vector3(), look = new THREE.Vector3();
  const fwd = new THREE.Vector3(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();

  function targetPosition(target, out) {
    if (target.getPosition) return target.getPosition(out) || out;
    if (target.object) { if (!target.object.parent) return null; return target.object.getWorldPosition(out); }
    return null;
  }

  function removeBird(b) {
    b.mixer.stopAllAction(); b.mixer.uncacheRoot(b.model);
    b.holder.removeFromParent();
    birds.splice(birds.indexOf(b), 1);
  }

  return {
    group,
    get flying() { return birds.length; },

    launch({ from, targets = [], onHit } = {}) {
      from.updateWorldMatrix(true, false);
      const origin = from.getWorldPosition(new THREE.Vector3());
      from.getWorldQuaternion(q);
      const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
      const side = new THREE.Vector3().crossVectors(UP, ahead);
      targets.forEach((target, i) => {
        const model = cloneSkinned(gltf.scene);
        model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        const holder = new THREE.Group(); holder.add(model); holder.scale.setScalar(3 * size);
        // they come up out of the grass in a ring round her, fanned out and climbing
        const a = (i + 0.5) / targets.length * Math.PI * 2 + 0.4;
        holder.position.copy(origin).addScaledVector(side, Math.cos(a) * 1.6 * size).addScaledVector(ahead, (0.6 + Math.sin(a) * 1.3) * size);
        holder.position.y += 0.3 * size;
        const dir = new THREE.Vector3().copy(ahead).multiplyScalar(0.75).addScaledVector(side, Math.cos(a) * 0.55).addScaledVector(UP, 0.75).normalize();
        group.add(holder);
        const mixer = new THREE.AnimationMixer(model);
        const act = {};
        for (const n of ['Takeoff', 'Fly', 'Glide']) if (clips[n]) act[n] = mixer.clipAction(clips[n]);
        const first = act.Takeoff || act.Fly;
        if (first) { first.setLoop(first === act.Takeoff ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); first.clampWhenFinished = true; first.play(); }
        const b = { holder, model, mixer, act, playing: first === act.Takeoff ? 'Takeoff' : 'Fly', target, onHit, dir, arriveIn: target.arriveIn ?? null,
          speed: 9 * size, age: -i * 0.07, t: 0, roll: 0, wobble: Math.random() * 6.28, climb: (2.2 + Math.random() * 1.6) * size };
        holder.visible = false;
        birds.push(b);
      });
    },

    update(delta) {
      for (const b of [...birds]) {
        b.age += delta;
        if (b.age < 0) continue;                                   // they go up one after another, not all at once
        if (!b.holder.visible) { b.holder.visible = true; burst(b.holder.position, 5, 0.6); }
        b.t += delta;
        const pos = b.holder.position;
        const found = targetPosition(b.target, aim);
        if (!found || b.t > (b.arriveIn === null ? MAX_FLIGHT : b.arriveIn + 1.5)) { burst(pos, 14, 1, tmp.copy(b.dir).multiplyScalar(b.speed)); removeBird(b); continue; }
        aim.y += AIM_HEIGHT * size;
        const dist = pos.distanceTo(aim);

        // wing work: takeoff, then flapping flight, then wings set for the last swoop
        const wantClip = b.t < 0.5 ? b.playing : (dist < 9 * size && b.act.Glide ? 'Glide' : 'Fly');
        if (wantClip !== b.playing && b.act[wantClip]) {
          const next = b.act[wantClip]; next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
          if (b.act[b.playing]) b.act[b.playing].crossFadeTo(next, 0.15, false);
          b.playing = wantClip;
        }
        if (b.act.Fly) b.act.Fly.timeScale = 1.15 + 0.25 * Math.sin(b.t * 3 + b.wobble);
        b.mixer.update(delta);

        // steer: first up and away from her, then onto the dog, turning harder the longer it has been out
        const homing = THREE.MathUtils.smoothstep(b.t, 0.25, 0.7);
        want.copy(aim);
        want.y += Math.min(b.climb, dist * 0.22);                   // come in from above, swooping down at the end
        want.sub(pos).normalize();
        const hurry = b.arriveIn === null ? 0 : THREE.MathUtils.smoothstep(b.t / b.arriveIn, 0.45, 1);
        const turnRate = (2.6 + 5 * THREE.MathUtils.smoothstep(b.t, 0.8, 3) + 9 * hurry) * homing + (dist < 10 * size ? 6 : 0);
        const angle = b.dir.angleTo(want), step = turnRate * delta;
        let yawRate = 0;
        if (angle > 1e-4) {
          axis.crossVectors(b.dir, want);
          if (axis.lengthSq() < 1e-8) axis.copy(UP); else axis.normalize();
          const turned = Math.min(angle, step);
          b.dir.applyAxisAngle(axis, turned).normalize();
          yawRate = axis.y * turned / Math.max(delta, 1e-4);        // turning left is positive
        }
        // timed flight: whatever speed gets it there on time (within reason)
        const cruise = b.arriveIn === null ? CRUISE * size
          : THREE.MathUtils.clamp(dist / Math.max(0.12, b.arriveIn - b.t), 14 * size, 120 * size);
        b.speed += (cruise * (0.25 + 0.75 * homing) - b.speed) * Math.min(1, delta * (b.arriveIn === null ? 3.5 : 6));

        const travel = b.speed * delta;
        if (b.arriveIn === null && dist <= travel + HIT_RADIUS * size) {   // got there (a timed bird waits for strike())
          burst(aim, 16, 1.2, tmp.copy(b.dir).multiplyScalar(b.speed));
          const onHit = b.onHit, id = b.target.id;
          removeBird(b);
          onHit?.(id, aim.clone());
          continue;
        }
        pos.addScaledVector(b.dir, travel);
        pos.y += Math.sin(b.t * 9 + b.wobble) * 0.5 * size * delta; // a little bob on the wingbeat

        // face the way it flies, banked into the turn
        look.copy(pos).add(b.dir);
        b.holder.lookAt(look);
        b.roll += (THREE.MathUtils.clamp(-yawRate * 0.28, -1.0, 1.0) - b.roll) * Math.min(1, delta * 8);
        fwd.set(0, 0, 1);
        b.holder.quaternion.multiply(q.setFromAxisAngle(fwd, b.roll));
      }

      for (const f of feathers) {
        if (f.life <= 0) { f.m.visible = false; continue; }
        f.life -= delta;
        const k = 1 - Math.max(0, f.life) / f.max;
        f.vel.multiplyScalar(Math.max(0, 1 - 3.2 * delta));          // the air stops them quickly...
        f.vel.y -= 3.2 * size * delta;                               // ...then they drift down
        f.m.position.addScaledVector(f.vel, delta);
        f.m.position.x += Math.sin(f.life * 7 + f.phase) * 0.9 * size * delta;   // rocking as they fall
        f.m.rotation.x += f.spin.x * delta * (1 - 0.6 * k); f.m.rotation.y += f.spin.y * delta * (1 - 0.6 * k); f.m.rotation.z += f.spin.z * delta * (1 - 0.6 * k);
        f.m.scale.setScalar(f.len);
        f.m.material.opacity = Math.min(1, (1 - k) * 2.5);
      }
      for (const p of puffs) {
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.life -= delta;
        const k = 1 - Math.max(0, p.life) / p.max;
        p.s.scale.setScalar(p.big * (0.5 + 1.6 * k));
        p.s.material.opacity = 0.7 * (1 - k);
      }
    },

    strike(id, hit = true) {
      const b = birds.find(bird => bird.target.id === id);
      if (!b) return;
      const found = hit && targetPosition(b.target, aim);
      if (found) aim.y += AIM_HEIGHT * size;
      burst(found ? aim : b.holder.position, found ? 16 : 10, found ? 1.2 : 0.8, tmp.copy(b.dir).multiplyScalar(b.speed));
      const onHit = b.onHit;
      removeBird(b);
      if (found) onHit?.(id, aim.clone());
    },

    // take every bird out of the air at once (race over, Pippa gone)
    clear() { for (const b of [...birds]) removeBird(b); },

    dispose() {
      for (const b of [...birds]) removeBird(b);
      group.removeFromParent();
      for (const o of owned) o.dispose?.();
    },
  };
}
