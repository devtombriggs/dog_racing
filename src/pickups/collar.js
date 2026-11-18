// The golden collar, as the players see it: the collar itself (above the head of a dog holding one,
// then round the neck of a dog wearing it) and the golden force shield round a dog that has put it on.
// The server decides what the shield stops (server.js, hitPlayer); this only draws it.
//
//   const shields = createShields({ envMap });      // envMap: something for the gold to reflect
//   shields.start(playerId, durationMs);            // the collar goes on
//   shields.blocked(playerId);                      // something bounced off: the shield flares
//   shields.stop(playerId);                         // gone early (the dog left the race)
//   each frame: shields.update(delta, id => avatar) // avatar: the DogAvatar (its group, model and bones)
//   shields.dispose();
import * as THREE from 'three';

const GOLD = 0xffc233;
const FADE_IN = 0.25, FADE_OUT = 0.3;     // seconds
const WARNING = 1.2;                      // seconds before it goes that it starts to flicker

const goldMaterial = envMap => new THREE.MeshStandardMaterial({
  color: GOLD, metalness: 1, roughness: 0.22, envMap, envMapIntensity: 1.4,
  emissive: 0x7a4c00, emissiveIntensity: 0.6,          // the game has no environment of its own: keep it reading as gold
});

/** A collar of the given inner radius lying in the XZ plane, with a round tag hanging at +Z. */
function collarMesh(radius, material) {
  const collar = new THREE.Group();
  const tube = radius * 0.17;
  const band = new THREE.Mesh(new THREE.TorusGeometry(radius + tube, tube, 10, 36), material);
  band.rotation.x = Math.PI / 2;
  band.scale.z = 1.5;                                  // a flat strap, not a ring: deeper than it is thick
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, tube * 0.5, 18), material);
  tag.rotation.x = Math.PI / 2;
  tag.position.set(0, -radius * 0.42, radius + tube * 2.2);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.1, tube * 0.25, 6, 12), material);
  loop.position.set(0, -radius * 0.1, radius + tube * 2.2);
  collar.add(band, tag, loop);
  return collar;
}

/** The collar shown above a dog that is holding one (about 0.8 across). */
export function buildCollar(envMap) {
  return collarMesh(0.3, goldMaterial(envMap));
}

/**
 * The collar as worn: a strap following the oval of the dog's neck (half-widths rx and rz, in the XZ
 * plane), with its tag hanging at `angle` round it (0 = +Z).
 */
function wornCollar(rx, rz, angle, material) {
  const collar = new THREE.Group();
  const size = Math.max(rx, rz), tube = size * 0.15;
  const band = new THREE.Mesh(new THREE.TorusGeometry(1, tube / size, 10, 40), material);
  band.rotation.x = Math.PI / 2;
  // (the ring's own X and Y lie in the collar's plane, its Z across the strap) an oval, flat strap: deeper than it is thick
  band.scale.set(rx + tube, rz + tube, size * 1.7);
  const hang = new THREE.Group();                      // the tag, on the outside of the strap at the throat
  hang.position.set(Math.sin(angle) * (rx + tube * 2), 0, Math.cos(angle) * (rz + tube * 2));
  hang.rotation.y = angle;
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.3, size * 0.3, tube * 0.5, 18), material);
  tag.rotation.x = Math.PI / 2;
  tag.position.y = -size * 0.42;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(size * 0.1, tube * 0.25, 6, 12), material);
  loop.position.y = -size * 0.1;
  hang.add(tag, loop);
  collar.add(band, hang);
  return collar;
}

// Where a collar sits on a dog, measured from the dog itself: the ring of skin round the upper neck
// bone.  Returns { bone, centre: [x, y, z], rx, rz } in that bone's own space (the bone runs along
// its Y), or null.
function neckFit(avatar) {
  const bone = avatar.bones.neck2 ?? avatar.bones.neck1;
  if (!bone) return null;
  const points = [], v = new THREE.Vector3();
  avatar.model.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.skeleton.bones.indexOf(bone);
    if (index < 0) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === index) weight += skinWeight.getComponent(i, k);
      if (weight < 0.3) continue;
      points.push(v.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[index]).clone());
    }
  });
  if (points.length < 24) return null;
  // a band of skin a third of the way up the bone
  const ys = points.map(p => p.y).sort((a, b) => a - b);
  const low = ys[Math.floor(ys.length * 0.05)], high = ys[Math.floor(ys.length * 0.95)];
  const y = low + (high - low) * 0.35;
  let band = points.filter(p => Math.abs(p.y - y) < (high - low) * 0.12);
  if (band.length < 8) band = points;
  const span = axis => { const values = band.map(p => p[axis]); return [Math.min(...values), Math.max(...values)]; };
  const [x0, x1] = span('x'), [z0, z1] = span('z');
  return { bone, centre: [(x0 + x1) / 2, y, (z0 + z1) / 2], rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 };
}

const SHIELD_VERTEX = `
  varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
  void main() {
    vLocal = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
// A thin golden shell: bright at its edge, a honeycomb of plates over it, a band of light sweeping up
const SHIELD_FRAGMENT = `
  uniform float time; uniform float strength; uniform float flare; uniform vec3 tint;
  varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
  float comb(vec2 p) {
    p.x *= 1.1547; p.y += mod(floor(p.x), 2.0) * 0.5;
    p = abs(fract(p) - 0.5);
    return abs(max(p.x * 1.5 + p.y, p.y * 2.0) - 1.0);
  }
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    vec2 uv = vec2(atan(vLocal.z, vLocal.x) / 6.2832 * 14.0, acos(clamp(vLocal.y, -1.0, 1.0)) / 3.1416 * 8.0);
    float plates = 1.0 - smoothstep(0.0, 0.09, comb(uv));
    float sweep = smoothstep(0.82, 1.0, sin(vLocal.y * 3.0 - time * 3.5) * 0.5 + 0.5);
    float glow = 0.07 + rim * 0.95 + plates * (0.16 + 0.5 * rim) + sweep * 0.22 + flare * (0.5 + plates);
    gl_FragColor = vec4(tint * (1.0 + flare) * glow * strength, glow * strength);
  }`;

export function createShields({ envMap = null } = {}) {
  const gold = goldMaterial(envMap);
  const sphere = new THREE.IcosahedronGeometry(1, 5);
  const active = new Map();
  const box = new THREE.Box3(), part = new THREE.Box3(), toGroup = new THREE.Matrix4(), size = new THREE.Vector3(), down = new THREE.Vector3();

  function attach(entry, avatar) {
    // the shield: an egg of light round the whole dog, sized from its model
    avatar.group.updateWorldMatrix(true, true);
    box.makeEmpty();
    avatar.model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      toGroup.copy(avatar.group.matrixWorld).invert().multiply(mesh.matrixWorld);
      box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(toGroup));
    });
    box.getSize(size);
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, strength: { value: 0 }, flare: { value: 0 }, tint: { value: new THREE.Color(1.0, 0.76, 0.2) } },
      vertexShader: SHIELD_VERTEX, fragmentShader: SHIELD_FRAGMENT,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    const bubble = new THREE.Mesh(sphere, material);
    const tall = size.y * 0.62 + 0.25, long = size.z * 0.58 + 0.25;
    bubble.scale.set(Math.max(size.x * 0.9 + 0.3, tall * 0.8), tall, long);
    box.getCenter(bubble.position);
    bubble.renderOrder = 5;
    avatar.group.add(bubble);
    entry.bubble = bubble;

    // the collar, round its neck: it turns and nods with the dog
    const fit = neckFit(avatar);
    if (fit) {
      // the tag hangs at the throat: the way that is down (and a little forward) from the neck, as the dog stands
      down.set(0, -1, 0.35).applyQuaternion(avatar.group.getWorldQuaternion(new THREE.Quaternion()))
        .applyQuaternion(fit.bone.getWorldQuaternion(new THREE.Quaternion()).invert());
      const collar = wornCollar(fit.rx * 1.05, fit.rz * 1.05, Math.atan2(down.x, down.z), gold);
      collar.position.fromArray(fit.centre);
      fit.bone.add(collar);
      entry.collar = collar;
    }
    entry.avatar = avatar;
  }

  function detach(entry) {
    entry.bubble?.removeFromParent();
    entry.bubble?.material.dispose();
    entry.collar?.removeFromParent();
    entry.collar?.traverse(o => o.geometry?.dispose());
    entry.bubble = entry.collar = null;
  }

  return {
    start(playerId, durationMs) {
      const current = active.get(playerId);
      if (current) detach(current);
      // (timed by the clock, not by frames: it must go when the server's five seconds are up however slowly this game is running)
      active.set(playerId, { startedAt: performance.now(), age: 0, seconds: durationMs / 1000, flare: 0, bubble: null, collar: null, avatar: null });
    },
    blocked(playerId) {
      const entry = active.get(playerId);
      if (entry) entry.flare = 1;
    },
    stop(playerId) {
      const entry = active.get(playerId);
      if (entry) detach(entry);
      active.delete(playerId);
    },

    update(delta, avatarOf) {
      for (const [playerId, entry] of active) {
        entry.age = (performance.now() - entry.startedAt) / 1000;
        if (entry.age >= entry.seconds) { detach(entry); active.delete(playerId); continue; }
        if (!entry.bubble) {
          const avatar = avatarOf(playerId);
          if (!avatar?.model) continue;                 // its model is still loading
          attach(entry, avatar);
        }
        const left = entry.seconds - entry.age;
        let strength = Math.min(1, entry.age / FADE_IN, left / FADE_OUT);
        if (left < WARNING) strength *= 0.55 + 0.45 * Math.sin(entry.age * 26);      // about to go
        entry.flare = Math.max(0, entry.flare - delta * 3);
        const uniforms = entry.bubble.material.uniforms;
        uniforms.time.value = entry.age; uniforms.strength.value = strength; uniforms.flare.value = entry.flare;
        const swell = 1 + 0.02 * Math.sin(entry.age * 5) + 0.1 * entry.flare;
        entry.bubble.scale.copy(entry.bubble.userData.rest ??= entry.bubble.scale.clone()).multiplyScalar(swell);
      }
    },

    dispose() {
      for (const entry of active.values()) detach(entry);
      active.clear();
      sphere.dispose(); gold.dispose();
    },
  };
}
