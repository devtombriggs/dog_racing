// Poppy's Surf's Up: the wave she rides on her belly (her WaveSurf clip), for her special move.
// Pure three.js (no React), so the game and the model preview page share it.
//
//   const wave = createSurfWave({ dog, size: 1 });   // dog: the Object3D she is (its position and facing; she faces +Z)
//   wave.setActive(true);                            // the wave rises under her with a splash; false: it collapses
//   wave.burst();                                    // a wall of spray: she has ploughed through someone
//   each frame: wave.update(delta);                  // after the dog has been moved and animated
//   wave.dispose();
//
// size scales everything: 1 suits the game's dogs (shown at three times real size); the preview,
// which shows Poppy at her real size, uses about 0.33.
//
// It is her own water: it travels with her, so it works on every track.  A bow-shaped swell, long and
// easy behind her and steep in front with the lip curling forward; foam along the crest and round the
// foot of the face, spray whipped off the top, and a foamy wake left on the ground behind.
// Her clip holds her belly WAVE_RIDE_HEIGHT above the ground; the swell is built to pass just under it.
import * as THREE from 'three';

export const WAVE_RIDE_HEIGHT = 0.42 * 3;     // game units at size 1 (special_abilities/poppy_wave_clip_info.json)

const HALF_WIDTH = 3.3, BACK = -6, FRONT = 3.0, PEAK = 0.6;
const NX = 30, NZ = 34;
const DEEP = new THREE.Color(0x0a5f96), MID = new THREE.Color(0x2bb4d6), LIGHT = new THREE.Color(0x9fe8f2), FOAM = new THREE.Color(0xffffff);

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// how high the swell stands (0..1 of full) at a point in her frame, before the ripples
function swell(x, z) {
  const zc = z + 0.11 * x * x;                               // a bow: the crest sweeps back towards the edges
  const p = zc < PEAK ? Math.exp(-(((zc - PEAK) / 3.3) ** 2)) : Math.exp(-(((zc - PEAK) / 0.8) ** 2));
  const edge = Math.max(0, 1 - (x / HALF_WIDTH) ** 2) ** 0.8;
  return { p, zc, h: p * edge };
}

export function createSurfWave({ dog, size = 1 } = {}) {
  const owned = [];
  const group = new THREE.Group(); group.name = 'SurfWave';
  const scene = (() => { let o = dog; while (o.parent) o = o.parent; return o; })();
  scene.add(group);
  const body = new THREE.Group(); group.add(body);            // turned and placed with her

  // ---- the swell: a grid redrawn every frame
  const geo = new THREE.PlaneGeometry(1, 1, NX, NZ);
  const pos = geo.attributes.position, count = pos.count;
  const colours = new Float32Array(count * 4);                // with alpha: the thin edges of the water fade out
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  const grid = [];
  for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) {
    grid.push([THREE.MathUtils.lerp(-HALF_WIDTH, HALF_WIDTH, ix / NX), THREE.MathUtils.lerp(FRONT, BACK, iz / NZ)]);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0, transparent: true, opacity: 0.94,
    side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
  body.add(mesh); owned.push(geo, mat);

  // ---- spray off the crest (points) and foam left behind on the ground (sprites)
  const dotTex = softDot(); owned.push(dotTex);
  const SPRAY = 260;
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPRAY * 3), 3));
  sprayGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(SPRAY * 3), 3));
  const sprayMat = new THREE.PointsMaterial({ map: dotTex, size: 0.42 * size, vertexColors: true, transparent: true, depthWrite: false,
    sizeAttenuation: true, toneMapped: false, blending: THREE.AdditiveBlending });
  const spray = new THREE.Points(sprayGeo, sprayMat); spray.frustumCulled = false; spray.renderOrder = 4; group.add(spray);
  const sprayVel = new Float32Array(SPRAY * 3), sprayLife = new Float32Array(SPRAY), sprayMax = new Float32Array(SPRAY);
  let sprayNext = 0, sprayCarry = 0;
  owned.push(sprayGeo, sprayMat);

  const wake = Array.from({ length: 40 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xe9fbff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    s.visible = false; s.renderOrder = 1; group.add(s); owned.push(s.material);
    return { s, life: 0, max: 1, grow: 1 };
  });
  let wakeNext = 0, wakeCarry = 0;

  let active = false, power = 0, flash = 0, t = 0, yaw = 0;
  const centre = new THREE.Vector3(), q = new THREE.Quaternion(), fwd = new THREE.Vector3(), last = new THREE.Vector3(), vel = new THREE.Vector3();
  const tmp = new THREE.Vector3(), colour = new THREE.Color();
  let seen = false;

  function droplet(local, vx, vy, vz, life) {
    const k = sprayNext; sprayNext = (sprayNext + 1) % SPRAY;
    tmp.copy(local).multiplyScalar(size).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(centre);
    const pa = sprayGeo.attributes.position.array;
    pa[k * 3] = tmp.x; pa[k * 3 + 1] = tmp.y; pa[k * 3 + 2] = tmp.z;
    tmp.set(vx, vy, vz).multiplyScalar(size).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).addScaledVector(vel, 0.55);   // carried along with the wave
    sprayVel[k * 3] = tmp.x; sprayVel[k * 3 + 1] = tmp.y; sprayVel[k * 3 + 2] = tmp.z;
    sprayLife[k] = sprayMax[k] = life;
  }

  const local = new THREE.Vector3();
  return {
    group,
    setActive(on) {
      if (on && !active) flash = 1;                              // she lands: a splash
      active = on;
    },
    isActive() { return active || power > 0.01; },
    burst() { flash = 1; },

    update(delta) {
      t += delta;
      power += ((active ? 1 : 0) - power) * Math.min(1, delta * (active ? 7 : 3.2));
      const on = power > 0.01;
      dog.updateWorldMatrix(true, false);
      dog.getWorldPosition(centre);
      dog.getWorldQuaternion(q);
      fwd.set(0, 0, 1).applyQuaternion(q);
      yaw = Math.atan2(fwd.x, fwd.z);
      if (seen && delta > 0) vel.subVectors(centre, last).divideScalar(delta).setY(0).clampLength(0, 60 * size); else vel.set(0, 0, 0);
      last.copy(centre); seen = true;

      body.visible = on;
      if (on) {
        body.position.copy(centre); body.rotation.y = yaw; body.scale.setScalar(size);
        const rise = power * power * (3 - 2 * power), reach = 0.55 + 0.45 * power;
        // her clip rests her trailing hind paws at the ride height, so her belly is about half as high again:
        // the swell comes up to her belly and her hind legs drag in the water
        const full = WAVE_RIDE_HEIGHT * 1.72;
        for (let i = 0; i < count; i++) {
          const [x, z] = grid[i];
          const { p, zc, h } = swell(x, z);
          const ripple = (0.07 * Math.sin(2.6 * x + 5.2 * t) + 0.06 * Math.sin(1.9 * z - 7.5 * t + x)) * h;
          const y = Math.max(0, (h + ripple) * full * rise);
          const curl = 0.75 * p * p * p * (zc >= PEAK - 0.6 ? 1 : 0) * Math.max(0, 1 - (x / HALF_WIDTH) ** 2);   // the lip leans forward
          pos.setXYZ(i, x * reach, y, (z + curl * rise) * reach);
          // colour: deep at the foot, lighter up the back, white on the crest, the lip and round the foot of the face
          const crest = THREE.MathUtils.smoothstep(p, 0.93, 0.995), foot = zc > PEAK ? THREE.MathUtils.smoothstep(p, 0.5, 0.05) : 0;
          const fringe = THREE.MathUtils.smoothstep(Math.abs(x) / HALF_WIDTH, 0.78, 1) * 0.8;
          const foam = Math.min(1, Math.max(crest, foot, fringe) + 0.25 * Math.max(0, Math.sin(3.1 * x + 2.3 * z - 6 * t)) * h + 0.5 * flash * h);
          colour.copy(DEEP).lerp(MID, THREE.MathUtils.smoothstep(h, 0.05, 0.6)).lerp(LIGHT, THREE.MathUtils.smoothstep(h, 0.55, 0.95)).lerp(FOAM, foam);
          colours[i * 4] = colour.r; colours[i * 4 + 1] = colour.g; colours[i * 4 + 2] = colour.b;
          colours[i * 4 + 3] = THREE.MathUtils.smoothstep(h, 0.015, 0.16);
        }
        pos.needsUpdate = true; geo.attributes.color.needsUpdate = true;
        geo.computeVertexNormals();
        mat.opacity = 0.94 * Math.min(1, power * 2.5);

        // spray whipped back off the crest, more the faster she goes
        sprayCarry += delta * (60 + 3 * vel.length() / size) * power;
        while (sprayCarry >= 1) {
          sprayCarry -= 1;
          const x = (Math.random() * 2 - 1) * HALF_WIDTH * 0.85;
          local.set(x, WAVE_RIDE_HEIGHT * 1.7 * Math.max(0.15, 1 - (x / HALF_WIDTH) ** 2), PEAK + 0.7 - 0.11 * x * x);
          droplet(local, (Math.random() - 0.5) * 3, 2.5 + Math.random() * 4, -1 - Math.random() * 4, 0.35 + Math.random() * 0.45);
        }
        // foam left on the ground behind
        wakeCarry += delta * 22 * power;
        while (wakeCarry >= 1) {
          wakeCarry -= 1;
          const w = wake[wakeNext]; wakeNext = (wakeNext + 1) % wake.length;
          tmp.set((Math.random() * 2 - 1) * HALF_WIDTH * 0.8, 0.12, BACK * (0.45 + Math.random() * 0.3)).multiplyScalar(size)
            .applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(centre);
          w.s.position.copy(tmp); w.life = w.max = 0.7 + Math.random() * 0.6; w.grow = 0.8 + Math.random() * 0.8; w.s.visible = true;
        }
      }
      if (flash > 0.98) {                                        // the splash: a ring of water thrown up and out
        for (let i = 0; i < 90; i++) {
          const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
          local.set(Math.sin(a) * 1.2, 0.5 + Math.random() * 0.8, Math.cos(a) * 1.2);
          droplet(local, Math.sin(a) * sp, 5 + Math.random() * 8, Math.cos(a) * sp, 0.5 + Math.random() * 0.5);
        }
      }
      flash = Math.max(0, flash - delta * 2.5);

      const pa = sprayGeo.attributes.position.array, ca = sprayGeo.attributes.color.array;
      for (let k = 0; k < SPRAY; k++) {
        if (sprayLife[k] > 0) {
          sprayLife[k] = Math.max(0, sprayLife[k] - delta);
          sprayVel[k * 3 + 1] -= 16 * size * delta;
          pa[k * 3] += sprayVel[k * 3] * delta; pa[k * 3 + 1] += sprayVel[k * 3 + 1] * delta; pa[k * 3 + 2] += sprayVel[k * 3 + 2] * delta;
        }
        const f = Math.min(1, sprayLife[k] / (sprayMax[k] || 1) * 2) * 0.8;    // additive: fading is dimming
        ca[k * 3] = 0.85 * f; ca[k * 3 + 1] = 0.95 * f; ca[k * 3 + 2] = f;
      }
      sprayGeo.attributes.position.needsUpdate = true; sprayGeo.attributes.color.needsUpdate = true;
      for (const w of wake) {
        if (w.life <= 0) { w.s.visible = false; continue; }
        w.life -= delta;
        const k = 1 - Math.max(0, w.life) / w.max;
        w.s.scale.set((1.2 + 2.6 * k) * w.grow * size, (0.5 + 0.5 * k) * w.grow * size, 1);
        w.s.material.opacity = 0.6 * (1 - k) * Math.min(1, k * 6);
      }
    },

    dispose() {
      group.removeFromParent();
      for (const o of owned) o.dispose?.();
    },
  };
}
