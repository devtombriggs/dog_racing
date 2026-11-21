import * as THREE from 'three';

// What a skid throws up: the dust it kicks out, sparks at the dog's back paws once the skid is worth
// a boost (blue, then orange, then purple), and a burst of both when it lets go into that boost.

const SPARKS = 160, DUST = 70;
export const DRIFT_COLOURS = [0xfff3c4, 0x58b8ff, 0xff9a2e, 0xc070ff];     // by tier: none yet, blue, orange, purple
export const DRIFT_HUD_COLOURS = ['#e8e2d0', '#7cc8ff', '#ffb055', '#d39bff'];

// Round dots that fly, fall and fade, each with its own colour, size and opacity.
// glow: drawn as light (sparks); otherwise as kicked-up dirt.  grow: how much bigger a dot is at the end of its life
export function dotMaterial({ size, glow, grow, opacity }) {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: size }, uScale: { value: 400 }, uGrow: { value: grow }, uOpacity: { value: opacity }, uSoft: { value: glow ? 0.12 : 0.0 } },
    vertexShader: `
      attribute vec3 color; attribute float aLeft;
      uniform float uSize, uScale, uGrow;
      varying vec3 vColor; varying float vLeft;
      void main() {
        vColor = color; vLeft = aLeft;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (1.0 + uGrow * (1.0 - aLeft)) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity, uSoft;
      varying vec3 vColor; varying float vLeft;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, uSoft, d) * uOpacity * vLeft;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// A pool of them: the oldest is reused when they run out
export function pool(scene, count, material, { gravity, drag }) {
  const positions = new Float32Array(count * 3), colours = new Float32Array(count * 3), left = new Float32Array(count);
  const velocity = new Float32Array(count * 3), life = new Float32Array(count), span = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('aLeft', new THREE.BufferAttribute(left, 1));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  // (a dot's size on screen follows the height of the picture, as three.js's own points do)
  const buffer = new THREE.Vector2();
  points.onBeforeRender = (renderer, _scene, camera) => {
    material.uniforms.uScale.value = renderer.getDrawingBufferSize(buffer).y * 0.5 * camera.projectionMatrix.elements[5];
  };
  scene.add(points);
  let next = 0;
  const colour = new THREE.Color();

  return {
    emit(at, speed, seconds, hex) {
      const i = next; next = (next + 1) % count;
      positions.set([at.x, at.y, at.z], i * 3);
      velocity.set([speed.x, speed.y, speed.z], i * 3);
      colour.set(hex); colours.set([colour.r, colour.g, colour.b], i * 3);
      life[i] = span[i] = seconds;
    },
    update(delta) {
      const slow = Math.exp(-drag * delta);
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        life[i] -= delta;
        const k = i * 3;
        if (life[i] <= 0) { left[i] = 0; continue; }
        velocity[k + 1] -= gravity * delta;
        velocity[k] *= slow; velocity[k + 2] *= slow;
        positions[k] += velocity[k] * delta; positions[k + 1] += velocity[k + 1] * delta; positions[k + 2] += velocity[k + 2] * delta;
        left[i] = life[i] / span[i];
      }
      for (const name of ['position', 'color', 'aLeft']) geometry.attributes[name].needsUpdate = true;
    },
    dispose() { scene.remove(points); geometry.dispose(); material.dispose(); },
  };
}

export function createDriftEffects(scene) {
  const sparks = pool(scene, SPARKS, dotMaterial({ size: 0.2, glow: true, grow: -0.5, opacity: 1 }), { gravity: 9, drag: 1.2 });
  const dust = pool(scene, DUST, dotMaterial({ size: 0.55, glow: false, grow: 2.2, opacity: 0.4 }), { gravity: -0.5, drag: 2.5 });
  const at = new THREE.Vector3(), speed = new THREE.Vector3();
  let owedSparks = 0, owedDust = 0;
  const rnd = spread => (Math.random() - 0.5) * 2 * spread;

  // Where the back paws are: behind the dog's middle and out to the side its back end has swung to
  // group: the dog.  side: 1 skidding left, -1 right.  size: the dog's scale
  function paws(group, side, size, which) {
    const yaw = group.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    const back = -0.22 * size, out = (-side * 0.1 + which * 0.07) * size;
    return at.set(group.position.x + fx * back + lx * out, group.position.y + 0.06, group.position.z + fz * back + lz * out);
  }

  return {
    // Every frame of a skid.  tier: 0 (dust only) to 3.  pace: the dog's speed (m/s)
    skid(delta, { group, side, size, tier, pace }) {
      const yaw = group.rotation.y, lx = Math.cos(yaw), lz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
      owedSparks = tier === 0 ? 0 : owedSparks + delta * (30 + tier * 30);
      owedDust += delta * 22;
      for (; owedSparks >= 1; owedSparks--) {
        paws(group, side, size, Math.random() < 0.5 ? -1 : 1);
        // thrown out to the outside of the corner and back, the way the paws are scrabbling
        const out = -side * (1.5 + Math.random() * 2.5), behind = -(0.5 + Math.random() * 1.5);
        speed.set(lx * out + fx * behind + rnd(0.6), 1.2 + Math.random() * 2.2 + tier * 0.5, lz * out + fz * behind + rnd(0.6));
        sparks.emit(at, speed, 0.25 + Math.random() * 0.3, DRIFT_COLOURS[tier]);
      }
      for (; owedDust >= 1; owedDust--) {
        paws(group, side, size, rnd(1));
        speed.set(lx * -side * 1.2 + rnd(0.5) - fx * pace * 0.08, 0.5 + Math.random() * 0.6, lz * -side * 1.2 + rnd(0.5) - fz * pace * 0.08);
        dust.emit(at, speed, 0.5 + Math.random() * 0.4, 0xb8a78c);
      }
    },
    // Letting go into a boost: a ring of sparks out from under the dog
    burst({ group, size, tier }) {
      for (let i = 0; i < 26 + tier * 14; i++) {
        const angle = Math.random() * Math.PI * 2, push = 3 + Math.random() * 4;
        at.set(group.position.x, group.position.y + 0.1, group.position.z);
        speed.set(Math.cos(angle) * push, 1.5 + Math.random() * 3, Math.sin(angle) * push);
        sparks.emit(at, speed, 0.3 + Math.random() * 0.35, DRIFT_COLOURS[tier]);
      }
      for (let i = 0; i < 10; i++) {
        at.set(group.position.x + rnd(0.3 * size), group.position.y + 0.1, group.position.z + rnd(0.3 * size));
        speed.set(rnd(2), 0.8 + Math.random(), rnd(2));
        dust.emit(at, speed, 0.7, 0xb8a78c);
      }
    },
    update(delta) { sparks.update(delta); dust.update(delta); },
    dispose() { sparks.dispose(); dust.dispose(); },
  };
}
