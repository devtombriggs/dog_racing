// Frostpeak's slalom gates and snowmen, one by one (shared/slalom.js has the rules; the server says who hit what):
//   a gate: two poles with a padded flag between them, on a spring hinge at the snow.  Hit, it whacks flat (falling the
//           way the dog was going, down the hill), lies there a moment and springs back up with a wobble
//   a snowman: three balls of snow, a hat, a carrot and stick arms.  Hit, it bursts into lumps of snow that fly and
//           tumble; at the end of its time it builds itself again
import * as THREE from 'three';
import { SLALOM_OBSTACLES } from '../../../shared/slalom.js';

const FLAT = 1.45;              // radians: as far over as a gate goes (it lies on the snow)
const DOWN_SECONDS = 0.12;      // how quickly it goes over
const REBUILD_SECONDS = 0.6;    // how long a snowman takes to build itself again, at the end of its time

export function createSlalom(scene) {
  const group = new THREE.Group(); group.name = 'Slalom'; scene.add(group);
  const disposables = [];
  const keep = thing => { disposables.push(thing); return thing; };
  const mat = color => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 }));
  const red = mat(0xe8362e), blue = mat(0x2f6fd8), white = mat(0xf4f6fa), pole = mat(0xffd23a), snow = mat(0xf7fbff), coal = mat(0x1e1e22), carrot = mat(0xff7a1e), wood = mat(0x6b4a2c), hat = mat(0x24242c);

  // ---------- the pieces
  const poleG = keep(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 8).translate(0, 0.95, 0));
  const flagG = keep(new THREE.BoxGeometry(1, 1.05, 0.12).translate(0, 1.15, 0));
  const padG = keep(new THREE.BoxGeometry(1, 0.22, 0.2).translate(0, 0.55, 0));
  const ballG = keep(new THREE.IcosahedronGeometry(1, 2));
  const noseG = keep(new THREE.ConeGeometry(0.07, 0.36, 8).rotateX(Math.PI / 2));
  const eyeG = keep(new THREE.SphereGeometry(0.05, 6, 6));
  const armG = keep(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 5));
  const brimG = keep(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16)), crownG = keep(new THREE.CylinderGeometry(0.28, 0.3, 0.42, 16));
  const lumpG = keep(new THREE.IcosahedronGeometry(1, 0));

  const items = SLALOM_OBSTACLES.map((o, k) => {
    const holder = new THREE.Group(); holder.position.fromArray(o.position); holder.rotation.y = o.rotationY; group.add(holder);
    if (o.kind === 'gate') {
      // (the hinge is at the snow: the gate turns over about it)
      const hinge = new THREE.Group(); holder.add(hinge);
      const span = o.radius * 1.6, flagM = k % 2 ? blue : red;
      for (const x of [-span / 2, span / 2]) { const p = new THREE.Mesh(poleG, pole); p.position.x = x; p.castShadow = true; hinge.add(p); }
      const flag = new THREE.Mesh(flagG, flagM); flag.scale.x = span; flag.castShadow = true; hinge.add(flag);
      const pad = new THREE.Mesh(padG, white); pad.scale.x = span + 0.1; hinge.add(pad);
      return { o, hinge, hitAt: -Infinity, downMs: 0 };
    }
    // a snowman: bottom, middle, head, face, arms, hat
    const body = new THREE.Group(); holder.add(body);
    const balls = [[0.72, 0.62], [0.52, 1.62], [0.36, 2.3]];
    for (const [r, y] of balls) { const ball = new THREE.Mesh(ballG, snow); ball.scale.setScalar(r); ball.position.y = y; ball.castShadow = true; body.add(ball); }
    const nose = new THREE.Mesh(noseG, carrot); nose.position.set(0, 2.3, 0.5); body.add(nose);
    for (const x of [-0.13, 0.13]) { const eye = new THREE.Mesh(eyeG, coal); eye.position.set(x, 2.42, 0.31); body.add(eye); }
    for (const y of [1.45, 1.7, 1.95]) { const button = new THREE.Mesh(eyeG, coal); button.position.set(0, y, 0.5); body.add(button); }
    for (const side of [-1, 1]) { const arm = new THREE.Mesh(armG, wood); arm.position.set(side * 0.85, 1.75, 0); arm.rotation.z = side * -1.0; body.add(arm); }
    const brim = new THREE.Mesh(brimG, hat); brim.position.y = 2.62; body.add(brim);
    const crown = new THREE.Mesh(crownG, hat); crown.position.y = 2.85; body.add(crown);
    // the lumps it bursts into (hidden until then)
    const lumps = Array.from({ length: 14 }, (_, n) => {
      const lump = new THREE.Mesh(lumpG, n === 3 ? carrot : n === 7 ? hat : snow); lump.visible = false; holder.add(lump);
      const a = n * 2.4, up = 3 + (n % 4), out = 2.5 + (n % 3) * 1.2;
      return { lump, v: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out + 2.5), size: 0.18 + (n % 3) * 0.1, start: new THREE.Vector3(0, 0.6 + (n % 5) * 0.4, 0) };
    });
    return { o, body, lumps, hitAt: -Infinity, downMs: 0 };
  });

  let now = 0;
  return {
    group,
    /** someone knocked it down: downMs from now it is up again (shared/slalom.js) */
    hit(index, downMs) {
      const item = items[index];
      if (!item) return;
      item.hitAt = now; item.downMs = downMs;
    },
    update(seconds) {
      now = seconds;
      for (const item of items) {
        const t = now - item.hitAt, down = item.downMs / 1000;
        if (item.hinge) {
          let angle = 0;
          if (t >= 0 && t < DOWN_SECONDS) angle = FLAT * (t / DOWN_SECONDS);
          else if (t >= DOWN_SECONDS && t < down * 0.55) angle = FLAT;
          else if (t >= down * 0.55 && t < down + 1.2) { const u = t - down * 0.55; angle = FLAT * Math.exp(-5 * u) * Math.cos(9 * u); }
          item.hinge.rotation.x = angle;
          continue;
        }
        // a snowman: in bits from when it was hit, building itself again at the end of its time
        const bits = t >= 0 && t < down;
        const rebuild = bits && t > down - REBUILD_SECONDS ? (t - (down - REBUILD_SECONDS)) / REBUILD_SECONDS : 0;
        item.body.visible = !bits || rebuild > 0;
        item.body.scale.setScalar(rebuild > 0 ? Math.min(1, rebuild * 1.15) : 1);
        for (const { lump, v, size, start } of item.lumps) {
          const flying = bits && t < 1.4;
          lump.visible = flying;
          if (!flying) continue;
          lump.position.set(start.x + v.x * t, Math.max(size, start.y + v.y * t - 6 * t * t), start.z + v.z * t);
          lump.rotation.set(t * 7, t * 5, 0);
          lump.scale.setScalar(size * Math.max(0.2, 1 - t / 1.4));
        }
      }
    },
    dispose() {
      scene.remove(group);
      for (const thing of disposables) thing.dispose();
    },
  };
}

