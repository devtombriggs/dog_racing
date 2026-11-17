// Meela's zoomies: the whirl around her while she spins (her ZoomiesSpin clip), for her special move.
// Pure three.js (no React), so the game and the model preview page share it.
//
//   const whirl = createZoomiesWhirl({ dog, size: 1 });  // dog: the loaded model
//   whirl.setActive(true);                               // whirl on (it winds up), false: it dies away
//   whirl.burst();                                       // a flash and a ring of dust: she has hit someone
//   each frame: whirl.update(delta);                     // after the dog has been moved and animated
//   whirl.dispose();
//
// size scales everything: 1 suits the game's dogs (shown at three times real size); the preview,
// which shows Meela at her real size, uses about 0.33.
//
// The look: low and wide, not a tall funnel.  Streaks race round her close to the ground in her own
// colours (white toes and chest, black coat, one red for her collar), widest at the bottom, and dust
// is thrown out along the ground.  She turns to her left, so everything goes anticlockwise from above.
// Nothing here is tone-mapped, so the colours hold in the game's ACES look.
import * as THREE from 'three';

// alpha rising along the streak (faint tail -> bright head), soft top and bottom edges
function streakTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g = c.getContext('2d'), img = g.createImageData(256, 32);
  for (let y = 0; y < 32; y++) {
    const v = Math.sin(Math.PI * (y + 0.5) / 32) ** 1.5;
    for (let x = 0; x < 256; x++) {
      const u = x / 255, a = Math.pow(u, 1.8) * Math.min(1, (1 - u) * 14) * v;
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// [colour, opacity, radius, height above ground, band height, arc (turns), speed (turns/s), tilt]
// radius and heights are in game units at size 1 (she is about 3.7 long there)
const STREAKS = [
  [0xffffff, 0.85, 2.25, 0.22, 0.46, 0.42, 3.6, 0.03],
  [0xffffff, 0.7, 2.0, 0.6, 0.4, 0.34, 4.3, -0.05],
  [0xf3ece0, 0.65, 1.7, 1.05, 0.36, 0.3, 3.2, 0.07],
  [0xf3ece0, 0.45, 1.3, 1.5, 0.24, 0.28, 4.8, -0.04],
  [0x15151a, 0.7, 2.1, 0.42, 0.5, 0.5, 3.0, -0.03],
  [0x15151a, 0.5, 1.8, 0.85, 0.36, 0.44, 3.9, 0.05],
  [0x15151a, 0.4, 1.45, 1.3, 0.3, 0.36, 2.7, -0.06],
  [0xe0262c, 0.9, 1.95, 0.78, 0.17, 0.3, 3.0, 0.02],
  [0xffffff, 0.5, 2.45, 0.1, 0.18, 0.55, 2.4, 0.0],
];

export function createZoomiesWhirl({ dog, size = 1 } = {}) {
  const owned = [];
  const group = new THREE.Group(); group.name = 'ZoomiesWhirl';
  const scene = (() => { let o = dog; while (o.parent) o = o.parent; return o; })();
  scene.add(group);

  const streakTex = streakTexture(), dotTex = softDot();
  owned.push(streakTex, dotTex);

  const streaks = STREAKS.map(([color, opacity, r, y, h, arc, speed, tilt], i) => {
    // an open band of a cone: a little wider at the bottom than the top
    const geo = new THREE.CylinderGeometry(r * 0.94, r * 1.06, h, 28, 1, true, 0, arc * Math.PI * 2);
    const mat = new THREE.MeshBasicMaterial({ map: streakTex, color, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = y + h / 2; mesh.renderOrder = 4; mesh.frustumCulled = false;
    const holder = new THREE.Group(); holder.rotation.set(tilt, 0, tilt * 0.7); holder.add(mesh);
    holder.scale.setScalar(size); group.add(holder);
    owned.push(geo, mat);
    return { mesh, mat, opacity, speed, y: y + h / 2, phase: i * 2.4, angle: i * 1.7 };
  });

  // dust: soft puffs thrown out along the ground, the way she is turning
  const dust = Array.from({ length: 48 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xe6dcc6, transparent: true, depthWrite: false,
      opacity: 0, toneMapped: false }));
    s.visible = false; s.renderOrder = 3; group.add(s); owned.push(s.material);
    return { s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1 };
  });
  let dustNext = 0, dustCarry = 0;

  function puff(centre, speedScale) {
    const p = dust[dustNext]; dustNext = (dustNext + 1) % dust.length;
    const a = Math.random() * Math.PI * 2, r = (1.5 + Math.random() * 0.7) * size;
    const ox = Math.sin(a), oz = Math.cos(a);                    // outwards
    const tx = oz, tz = -ox;                                     // along the turn (anticlockwise from above)
    p.s.position.set(centre.x + ox * r, centre.y + (0.1 + Math.random() * 0.25) * size, centre.z + oz * r);
    const out = (1.2 + Math.random() * 1.6) * size * speedScale, along = (3 + Math.random() * 3) * size;
    p.vel.set(ox * out + tx * along, (0.5 + Math.random() * 0.9) * size, oz * out + tz * along);
    p.life = p.max = 0.45 + Math.random() * 0.4;
    p.grow = 0.8 + Math.random() * 0.7;
    p.s.visible = true;
  }

  let active = false, power = 0, flash = 0, t = 0;
  const centre = new THREE.Vector3();

  return {
    group,
    setActive(on) { active = on; },
    isActive() { return active || power > 0.01; },
    burst() { flash = 1; dog.getWorldPosition(centre); for (let i = 0; i < 16; i++) puff(centre, 3); },

    update(delta) {
      t += delta;
      power += ((active ? 1 : 0) - power) * Math.min(1, delta * (active ? 9 : 4));
      flash = Math.max(0, flash - delta * 3);
      const on = power > 0.01;
      dog.updateWorldMatrix(true, false);
      dog.getWorldPosition(centre);
      for (const k of streaks) {
        k.mesh.parent.visible = on;
        if (!on) continue;
        k.mesh.parent.position.copy(centre);
        k.angle += delta * k.speed * Math.PI * 2 * (0.5 + 0.5 * power) * (1 + 0.6 * flash);
        k.mesh.rotation.y = k.angle;
        k.mesh.position.y = k.y * (1 + 0.12 * Math.sin(t * 7 + k.phase));
        const sc = (0.55 + 0.45 * power) * (1 + 0.25 * flash) * (1 + 0.05 * Math.sin(t * 11 + k.phase));
        k.mesh.scale.set(sc, 1, sc);
        k.mat.opacity = Math.min(1, k.opacity * power * (0.8 + 0.2 * Math.sin(t * 13 + k.phase * 2)) * (1 + 0.5 * flash));
      }
      if (on) {
        dustCarry += delta * 38 * power;
        while (dustCarry >= 1) { dustCarry -= 1; puff(centre, 1); }
      }
      for (const p of dust) {
        if (p.life <= 0) { p.s.visible = false; continue; }
        p.life -= delta;
        const k = 1 - Math.max(0, p.life) / p.max;
        p.vel.multiplyScalar(Math.max(0, 1 - 2.2 * delta));        // the air slows it
        p.s.position.addScaledVector(p.vel, delta);
        p.s.scale.setScalar((0.5 + 1.9 * k) * p.grow * size);
        p.s.material.opacity = 0.75 * (1 - k) * Math.min(1, k * 8);
      }
    },

    dispose() {
      group.removeFromParent();
      for (const o of owned) o.dispose?.();
    },
  };
}
