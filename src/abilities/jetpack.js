// Ralph's rocket paws: a jet of fire out of each of his four paws, for his JetFly special move.
// Pure three.js (no React), so the game and the model preview page share it.
//
//   const jets = createJetPaws({ dog, size: 1 });   // dog: the loaded model (with paw.L/paw.R/hindpaw.L/hindpaw.R bones)
//   jets.setActive(true);                           // fire on (it ramps up), false: it sputters out
//   each frame: jets.update(delta);                 // after the dog's animation has been updated
//   jets.dispose();
//
// size scales everything: 1 suits the game's dogs (shown at three times real size); the preview,
// which shows Ralph at his real size, uses about 0.33.
//
// The flames point down and back from the dog (thrust, not along the paw), each a white-hot core in
// an orange flame, flickering; sparks spray out behind, a little smoke trails off, and a warm light
// flickers under him.  Everything is additive and not tone-mapped, so it glows in the game's ACES look.
import * as THREE from 'three';

const PAWS = [['paw.L', 'pawL'], ['paw.R', 'pawR'], ['hindpaw.L', 'hindpawL'], ['hindpaw.R', 'hindpawR']];

function softDot(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner); grd.addColorStop(0.45, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// a flame-shaped gradient down a cone (bright at the nozzle, fading to the tip)
function flameTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grd; g.fillRect(0, 0, 16, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createJetPaws({ dog, size = 1 } = {}) {
  const owned = [];
  const group = new THREE.Group(); group.name = 'JetPaws';
  const scene = (() => { let o = dog; while (o.parent) o = o.parent; return o; })();
  scene.add(group);

  const bones = PAWS.map(names => names.map(n => dog.getObjectByName(n)).find(Boolean)).filter(Boolean);
  if (bones.length < 4) console.warn(`[JetPaws] found ${bones.length} of 4 paw bones`);

  const add = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false };
  const flameTex = flameTexture(), glowTex = softDot('rgba(255,250,220,1)', 'rgba(255,140,40,0.5)');
  const smokeTex = softDot('rgba(160,150,140,0.9)', 'rgba(110,100,95,0.35)');
  owned.push(flameTex, glowTex, smokeTex);

  // a cone with its wide end at the nozzle (y = 0) and its tip 1 unit out along +Y; the holder turns +Y onto the thrust
  const coneGeo = new THREE.ConeGeometry(0.5, 1, 14, 1, true).translate(0, 0.5, 0);
  const outerMat = new THREE.MeshBasicMaterial({ ...add, map: flameTex, color: 0xff5a1a, side: THREE.DoubleSide, opacity: 0.9 });
  const coreMat = new THREE.MeshBasicMaterial({ ...add, map: flameTex, color: 0xffe9a0, side: THREE.DoubleSide, opacity: 0.85 });
  const glowMat = new THREE.SpriteMaterial({ ...add, map: glowTex, color: 0xffa040, opacity: 0.9 });
  owned.push(coneGeo, outerMat, coreMat, glowMat);

  const jets = bones.map((bone, i) => {
    const holder = new THREE.Group();
    const outer = new THREE.Mesh(coneGeo, outerMat); outer.scale.set(0.2 * size, 1.0 * size, 0.2 * size);
    const core = new THREE.Mesh(coneGeo, coreMat); core.scale.set(0.09 * size, 0.5 * size, 0.09 * size);
    const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(0.55 * size);
    outer.renderOrder = core.renderOrder = glow.renderOrder = 4;
    holder.add(outer, core, glow);
    group.add(holder);
    return { bone, holder, outer, core, glow, phase: i * 1.9 };
  });

  // sparks: a pool of points thrown out behind the jets, falling and cooling from yellow to red
  const SPARKS = 220;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
  sparkGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
  const sparkMat = new THREE.PointsMaterial({ ...add, map: glowTex, size: 0.12 * size, vertexColors: true, sizeAttenuation: true });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; group.add(sparks);
  const sparkVel = new Float32Array(SPARKS * 3), sparkLife = new Float32Array(SPARKS), sparkMax = new Float32Array(SPARKS);
  let sparkNext = 0, sparkCarry = 0;
  owned.push(sparkGeo, sparkMat);

  // smoke: a few soft grey puffs left behind
  const smoke = Array.from({ length: 28 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; group.add(s); owned.push(s.material);
    return { s, life: 0, max: 1, vel: new THREE.Vector3() };
  });
  let smokeNext = 0, smokeCarry = 0;

  const light = new THREE.PointLight(0xff8a3a, 0, 7 * size, 2);
  group.add(light);

  let active = false, power = 0, t = 0;
  const pos = new THREE.Vector3(), dogQuat = new THREE.Quaternion(), thrust = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0), back = new THREE.Vector3(0, 0, -1), yAxis = new THREE.Vector3(0, 1, 0);
  const flameQuat = new THREE.Quaternion(), centre = new THREE.Vector3();

  return {
    group,
    setActive(on) { active = on; },
    isActive() { return active || power > 0.01; },

    update(delta) {
      t += delta;
      power += ((active ? 1 : 0) - power) * Math.min(1, delta * (active ? 6 : 3.5));
      const on = power > 0.01;
      dog.updateWorldMatrix(true, false);
      dog.getWorldQuaternion(dogQuat);
      // thrust: down and back from the dog (the dog faces +Z in its own frame)
      thrust.copy(down).multiplyScalar(1).addScaledVector(back, 0.75).normalize().applyQuaternion(dogQuat);
      flameQuat.setFromUnitVectors(yAxis, thrust);
      centre.set(0, 0, 0);
      for (const j of jets) {
        j.bone.getWorldPosition(pos);
        centre.add(pos);
        j.holder.visible = on;
        if (!on) continue;
        j.holder.position.copy(pos);
        j.holder.quaternion.copy(flameQuat);
        const flick = 0.82 + 0.18 * Math.sin(t * 47 + j.phase) * Math.sin(t * 31 + j.phase * 2) + 0.08 * Math.random();
        const len = power * flick;
        j.outer.scale.y = 1.0 * size * len; j.outer.scale.x = j.outer.scale.z = 0.2 * size * (0.85 + 0.15 * flick);
        j.core.scale.y = 0.5 * size * len;
        j.glow.scale.setScalar(0.55 * size * (0.8 + 0.3 * flick) * power);
        // sparks from this paw
        sparkCarry += delta * 70 * power;
        while (sparkCarry >= 1) {
          sparkCarry -= 1;
          const k = sparkNext; sparkNext = (sparkNext + 1) % SPARKS;
          const pa = sparkGeo.attributes.position.array;
          pa[k * 3] = pos.x; pa[k * 3 + 1] = pos.y; pa[k * 3 + 2] = pos.z;
          const speed = (5 + Math.random() * 5) * size;
          sparkVel[k * 3] = thrust.x * speed + (Math.random() - 0.5) * 2.2 * size;
          sparkVel[k * 3 + 1] = thrust.y * speed + (Math.random() - 0.5) * 2.2 * size;
          sparkVel[k * 3 + 2] = thrust.z * speed + (Math.random() - 0.5) * 2.2 * size;
          sparkLife[k] = sparkMax[k] = 0.25 + Math.random() * 0.35;
        }
      }
      centre.multiplyScalar(1 / Math.max(1, jets.length));
      // smoke puffs from the middle of the four jets, drifting out behind
      if (on) {
        smokeCarry += delta * 14 * power;
        while (smokeCarry >= 1) {
          smokeCarry -= 1;
          const p = smoke[smokeNext]; smokeNext = (smokeNext + 1) % smoke.length;
          p.s.position.copy(centre).addScaledVector(thrust, 0.9 * size);
          p.vel.copy(thrust).multiplyScalar(2.2 * size).add(new THREE.Vector3((Math.random() - 0.5) * size, 0.9 * size, (Math.random() - 0.5) * size));
          p.life = p.max = 0.8 + Math.random() * 0.6;
          p.s.visible = true;
        }
      }
      for (const p of smoke) {
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.life -= delta;
        const k = 1 - p.life / p.max;
        p.s.position.addScaledVector(p.vel, delta);
        p.s.scale.setScalar((0.35 + 1.4 * k) * size);
        p.s.material.opacity = 0.32 * (1 - k) * Math.min(1, k * 6);
      }
      const pa = sparkGeo.attributes.position.array, ca = sparkGeo.attributes.color.array;
      for (let k = 0; k < SPARKS; k++) {
        if (sparkLife[k] > 0) {
          sparkLife[k] = Math.max(0, sparkLife[k] - delta);
          sparkVel[k * 3 + 1] -= 9 * size * delta;                       // they fall
          pa[k * 3] += sparkVel[k * 3] * delta; pa[k * 3 + 1] += sparkVel[k * 3 + 1] * delta; pa[k * 3 + 2] += sparkVel[k * 3 + 2] * delta;
        }
        const f = sparkLife[k] / (sparkMax[k] || 1);                      // 1 fresh .. 0 dead
        ca[k * 3] = f; ca[k * 3 + 1] = 0.85 * f * f; ca[k * 3 + 2] = 0.35 * f * f * f;
      }
      sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
      light.position.copy(centre).addScaledVector(thrust, 0.5 * size);
      light.intensity = on ? (18 + 6 * Math.sin(t * 40)) * power * size * size : 0;
    },

    dispose() {
      group.removeFromParent();
      for (const o of owned) o.dispose?.();
    },
  };
}
