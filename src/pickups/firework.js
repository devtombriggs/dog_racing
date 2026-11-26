// The firework, as the players see it: the rocket, its trail of sparks, and the burst when it reaches
// the dog in first place.  The server flies it (shared/firework.js); this only draws it.
//
//   const fireworks = createFireworks({ scene });
//   fireworks.launch({ id, position, yaw, look });  fireworks.move([{ id, position, yaw }]);
//       look: 'rugby' for the ball Casper passes at the end of his Try Time: it flies the same way, drawn as a
//       spinning rugby ball with no sparks, and lands in a burst of turf
//   fireworks.explode(id, position);          // reached the leader: the big burst
//   fireworks.pass(position);                 // knocked a dog over on its way: a shower of sparks
//   fireworks.fizzle(id, position);           // burned out
//   each frame: fireworks.update(delta);      fireworks.dispose();
import * as THREE from 'three';
import { FIREWORK } from '../../shared/items.js';
import { buildRugbyBall } from '../abilities/rugby.js';

const SPARKS = 1800;             // most sparks alive at once, trails and bursts together
const GRAVITY = 7;               // sparks fall, m/s²
// each burst is two colours, like a real shell
const BURSTS = [[0xffd34d, 0xff4f8b], [0x7df9ff, 0xffffff], [0x8dff6a, 0xc77dff], [0xff8a3c, 0xffe9a8]];

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * The rocket: a red paper tube with a gold nose cone, three fins and its stick.  About 1.3 long with
 * the stick, pointing along +Z (the way it flies).  Also shown above a dog that is holding one.
 */
export function buildRocket() {
  const rocket = new THREE.Group();
  const paint = (color, glow = 0.25) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, emissive: color, emissiveIntensity: glow });
  const along = mesh => { mesh.rotation.x = Math.PI / 2; return mesh; };       // cylinders are built upright: lay them along Z
  const body = along(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.56, 14), paint(0xe2303a)));
  const band = along(new THREE.Mesh(new THREE.CylinderGeometry(0.116, 0.116, 0.1, 14), paint(0xfff3d6)));
  band.position.z = 0.08;
  const band2 = along(new THREE.Mesh(new THREE.CylinderGeometry(0.116, 0.116, 0.05, 14), paint(0x2f6bff)));
  band2.position.z = -0.1;
  const nose = along(new THREE.Mesh(new THREE.ConeGeometry(0.135, 0.3, 14), paint(0xffc233, 0.45)));
  nose.position.z = 0.43;
  const stick = along(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 6), paint(0xb98a52, 0.1)));
  stick.position.set(0.1, 0, -0.5);
  rocket.add(body, band, band2, nose, stick);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.2), paint(0x2f6bff));
    const a = i / 3 * Math.PI * 2 + Math.PI / 3;
    fin.position.set(Math.sin(a) * 0.16, Math.cos(a) * 0.16, -0.22);
    fin.rotation.z = -a;
    rocket.add(fin);
  }
  return rocket;
}

export function createFireworks({ scene }) {
  const root = new THREE.Group(); root.name = 'Fireworks'; scene.add(root);
  const glow = glowTexture();
  const template = buildRocket();
  const rockets = new Map(), flashes = [];

  // every spark in the race is one point in this cloud
  const positions = new Float32Array(SPARKS * 3), colors = new Float32Array(SPARKS * 3);
  const velocity = new Float32Array(SPARKS * 3), base = new Float32Array(SPARKS * 3);
  const life = new Float32Array(SPARKS), span = new Float32Array(SPARKS);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.4, map: glow, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true,
  });
  const cloud = new THREE.Points(geometry, material);
  cloud.frustumCulled = false;
  root.add(cloud);
  let next = 0;
  const tint = new THREE.Color();

  function spark(x, y, z, vx, vy, vz, color, seconds) {
    const i = next; next = (next + 1) % SPARKS;
    positions.set([x, y, z], i * 3); velocity.set([vx, vy, vz], i * 3);
    tint.set(color); base.set([tint.r, tint.g, tint.b], i * 3);
    life[i] = span[i] = seconds;
  }

  // a ball of sparks thrown out in every direction
  function shower(position, count, speed, palette, seconds) {
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const v = speed * (0.55 + Math.random() * 0.45);
      spark(position[0], position[1], position[2], r * Math.cos(a) * v, u * v + speed * 0.25, r * Math.sin(a) * v,
        palette[i % palette.length], seconds * (0.7 + Math.random() * 0.5));
    }
  }

  function flash(position, color, size, seconds) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    sprite.position.fromArray(position);
    root.add(sprite);
    flashes.push({ sprite, age: 0, size, seconds });
  }

  function remove(id) {
    const rocket = rockets.get(id);
    if (rocket?.object) root.remove(rocket.object);
    rocket?.object?.userData.dispose?.();
    rockets.delete(id);
  }

  const tail = new THREE.Vector3(), back = new THREE.Vector3(), aim = new THREE.Vector3();
  return {
    launch({ id, position, yaw, look = null }) {
      if (look === 'rugby') {
        const object = buildRugbyBall();
        object.scale.setScalar(1.25);
        object.position.fromArray(position);
        object.rotation.y = yaw;
        root.add(object);
        rockets.set(id, { from: [...position], to: [...position], at: performance.now(), object, fuse: null, look });
        return;
      }
      const object = template.clone(true);
      object.scale.setScalar(1.5);
      object.position.fromArray(position);
      object.rotation.y = yaw;
      const fuse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffb347, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      fuse.position.z = -0.36; fuse.scale.setScalar(0.9);
      object.add(fuse);
      root.add(object);
      rockets.set(id, { from: [...position], to: [...position], at: performance.now(), object, fuse });
      flash(position, 0xffc46b, 5, 0.25);
    },
    /** Where a firework is now (as drawn), or null */
    where(id) { return rockets.get(id)?.object.position ?? null; },
    move(list) {
      for (const { id, position } of list) {
        const rocket = rockets.get(id);
        if (!rocket) continue;
        rocket.from = rocket.object.position.toArray(); rocket.to = [...position]; rocket.at = performance.now();
      }
    },
    explode(id, position) {
      if (rockets.get(id)?.look === 'rugby') {              // the ball lands: turf and dust, no fireworks
        remove(id);
        shower(position, 110, 9, [0xffffff, 0x8fd66a, 0xcdb58a], 0.8);
        flash(position, 0xffffff, 9, 0.3);
        return;
      }
      remove(id);
      const palette = BURSTS[Math.floor(Math.random() * BURSTS.length)];
      shower(position, 220, 15, palette, 1.25);
      shower(position, 90, 6, [0xffffff, palette[0]], 0.8);
      flash(position, 0xffe2a0, 13, 0.4);
    },
    pass(position) {
      shower(position, 60, 7, [0xffd34d, 0xff8a3c, 0xffffff], 0.6);
      flash(position, 0xffc46b, 8, 0.25);
    },
    fizzle(id, position) {
      const dud = rockets.get(id)?.look !== 'rugby';         // (a ball with nobody to go for just drops out of sight)
      remove(id);
      if (position && dud) shower(position, 40, 3.5, [0xff8a3c, 0x8a8a8a], 0.7);
    },

    update(delta) {
      const t = performance.now();
      for (const rocket of rockets.values()) {
        const k = Math.min(1, (t - rocket.at) / FIREWORK.tickMs);          // the server moves it every tick
        const { from, to, object } = rocket;
        object.position.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k);
        aim.fromArray(to);
        if (aim.distanceToSquared(object.position) > 0.01) object.lookAt(aim);   // nose along its flight, up and down slopes too
        object.rotateZ(t / 1000 * (rocket.look ? 22 : 9) % (Math.PI * 2));                      // spinning as it goes (a ball spirals faster)
        if (!rocket.fuse) continue;                                        // (a rugby ball has no fuse and leaves no sparks)
        rocket.fuse.scale.setScalar(0.8 + Math.random() * 0.5);
        // sparks pouring out of the tail
        back.set(0, 0, -1).applyQuaternion(object.quaternion);
        tail.copy(object.position).addScaledVector(back, 0.6);
        const count = Math.min(8, Math.ceil(delta * 240));
        for (let i = 0; i < count; i++) {
          const j = () => (Math.random() - 0.5) * 2.4;
          spark(tail.x, tail.y, tail.z, back.x * 9 + j(), back.y * 9 + j() + 1, back.z * 9 + j(),
            i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffd34d : 0xff7a2e, 0.35 + Math.random() * 0.35);
        }
      }
      for (let i = 0; i < SPARKS; i++) {
        if (life[i] <= 0) continue;
        life[i] -= delta;
        const p = i * 3;
        if (life[i] <= 0) { colors[p] = colors[p + 1] = colors[p + 2] = 0; continue; }
        const drag = Math.exp(-2.2 * delta);
        velocity[p] *= drag; velocity[p + 1] = velocity[p + 1] * drag - GRAVITY * delta; velocity[p + 2] *= drag;
        positions[p] += velocity[p] * delta; positions[p + 1] += velocity[p + 1] * delta; positions[p + 2] += velocity[p + 2] * delta;
        const fade = Math.min(1, life[i] / span[i] * 1.6);                 // bright, then dying away (additive: black is invisible)
        colors[p] = base[p] * fade; colors[p + 1] = base[p + 1] * fade; colors[p + 2] = base[p + 2] * fade;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.age += delta;
        const k = f.age / f.seconds;
        f.sprite.scale.setScalar(f.size * (0.3 + 0.7 * Math.min(1, k * 2)));
        f.sprite.material.opacity = Math.max(0, 1 - k);
        if (k >= 1) { root.remove(f.sprite); f.sprite.material.dispose(); flashes.splice(i, 1); }
      }
    },

    dispose() {
      scene.remove(root);
      for (const f of flashes) f.sprite.material.dispose();
      for (const rocket of rockets.values()) { rocket.fuse?.material.dispose(); rocket.object.userData.dispose?.(); }
      template.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      geometry.dispose(); material.dispose(); glow.dispose();
    },
  };
}
