// Pet Mall Mayhem — Three.js visuals: the aisles and their shop fronts, the atrium and its dome, the
// aquarium tunnel, the escalator, the upper gallery and the leap off the end of it, and every animal
// that has got out.  Everything is generated at runtime from shared/petMallData.js (no model files).
//
//   const world = createPetMall();
//   scene.add(world.group);
//   const restore = world.applyEnvironment(scene, renderer);
//   each frame: world.update(elapsedSeconds, leadDogPosition, raceSeconds);
//   leaving the map: restore(); scene.remove(world.group); world.dispose();
//
// raceSeconds is the time since GO: the cats, trolleys and hamster balls are drawn where
// PET_MALL.hazardsAt(raceSeconds) says they are, which is exactly where the server has them.
// Gameplay never reads these meshes: use PET_MALL.query() and PET_MALL.hazardHit().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PET_MALL as T } from '../../../shared/petMallData.js';

const S = T.samples, N = T.sampleCount;
export const SUN_DIRECTION = new THREE.Vector3(0.3, 0.86, 0.26).normalize();
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lapGap = (s, s0) => { let d = (((s - s0) % T.length) + T.length) % T.length; if (d > T.length / 2) d -= T.length; return d; };
const onEscalator = s => lapGap(s, T.escalator.sStart) >= 0 && lapGap(s, T.escalator.sEnd) <= 0;
const raised = i => S.y[i] > 1.2;                           // off the ground floor: the escalator and the gallery
const WALL = 7;                                             // height of a shop front

// ---------- building things out of painted primitives
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
  const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const box = (w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => { const g = paint(new THREE.BoxGeometry(w, h, d), color); if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); return g.translate(x, y, z); };
const cyl = (rt, rb, h, seg, color, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { const g = paint(new THREE.CylinderGeometry(rt, rb, h, seg), color); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };
const ball = (r, detail, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => paint(new THREE.IcosahedronGeometry(r, detail), color).scale(sx, sy, sz).translate(x, y, z);
const cone = (r, h, seg, color, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { const g = paint(new THREE.ConeGeometry(r, h, seg), color); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };
function merge(parts) { const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g; }

function canvasTexture(width, height, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = width; c.height = height; draw(c.getContext('2d'), width, height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const signTexture = (text, back = '#ffffff', ink = '#e2303a') => canvasTexture(256, 128, (g) => {
  g.fillStyle = back; g.fillRect(0, 0, 256, 128); g.strokeStyle = ink; g.lineWidth = 12; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 76; do { g.font = `bold ${size}px sans-serif`; size -= 4; } while (g.measureText(text).width > 220 && size > 20);
  g.fillText(text, 128, 68);
});

// ---------- sky and clouds
function buildSky(group, D) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: SUN_DIRECTION } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 c = mix(vec3(0.78, 0.93, 1.0), vec3(0.16, 0.52, 0.98), pow(h, 0.5));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.95, 0.8) * (pow(s, 24.0) * 0.35 + smoothstep(0.9993, 0.9997, s) * 3.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sg = new THREE.SphereGeometry(6500, 24, 12), sky = new THREE.Mesh(sg, mat); sky.name = 'Mall_Sky'; sky.frustumCulled = false; sky.renderOrder = -10; group.add(sky); D.push(sg, mat);
  const r = rng(77), o = new THREE.Object3D(), cg = new THREE.IcosahedronGeometry(1, 1), cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xb8c8dc, emissiveIntensity: 0.6, fog: false, flatShading: true }), puffs = [];
  for (let k = 0; k < 14; k++) { const a = r() * 6.28, d = 600 + r() * 3000, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 330 + r() * 300, size = 70 + r() * 120; for (let p = 0; p < 3; p++) puffs.push([cx + (r() - 0.5) * size * 2.2, cy + (r() - 0.5) * size * 0.2, cz + (r() - 0.5) * size * 1.2, size * (0.5 + r() * 0.6)]); }
  const clouds = new THREE.InstancedMesh(cg, cm, puffs.length);
  puffs.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.scale.set(p[3], p[3] * 0.36, p[3] * 0.8); o.updateMatrix(); clouds.setMatrixAt(k, o.matrix); });
  clouds.name = 'Mall_Clouds'; clouds.frustumCulled = false; group.add(clouds); D.push(cg, cm, clouds);
}

// ---------- the floor the mall stands on, and the fountain pool under the leap
function buildGround(group, D, animated, pool) {
  const fg = new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), ft = canvasTexture(64, 64, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#d2d2d2'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64); }, true), fm = new THREE.MeshStandardMaterial({ color: 0xd9d3c7, map: ft, roughness: 0.6 });
  ft.repeat.set(1500, 1500); D.push(ft);
  const floor = new THREE.Mesh(fg, fm); floor.position.y = -0.06; floor.name = 'Mall_Floor'; floor.receiveShadow = true; group.add(floor); D.push(fg, fm);
  const wg = new THREE.CircleGeometry(pool.radius, 32).rotateX(-Math.PI / 2), wm = new THREE.MeshStandardMaterial({ color: 0x38b6e8, roughness: 0.08, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const water = new THREE.Mesh(wg, wm); water.position.set(pool.x, 0.3, pool.z); water.name = 'Mall_Fountain'; group.add(water); D.push(wg, wm);
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true }); D.push(prop);
  // a stone rim, and in the middle a golden bone on a plinth with water coming off it
  const parts = [paint(new THREE.TorusGeometry(pool.radius + 0.5, 0.9, 6, 36).rotateX(Math.PI / 2), 0xe8e2d4).translate(0, 0.4, 0), cyl(2.6, 3.2, 3, 12, 0xe8e2d4, 0, 1.5, 0)];
  parts.push(cyl(0.55, 0.55, 5, 8, 0xf2c230, 0, 5.4, 0, 0, Math.PI / 2));
  for (const sx of [-1, 1]) for (const sy of [-0.5, 0.5]) parts.push(ball(0.95, 1, 0xf2c230, sx * 2.6, 5.4 + sy, 0));
  const fg2 = merge(parts), fountain = new THREE.Mesh(fg2, prop); fountain.position.set(pool.x, 0, pool.z); fountain.castShadow = true; fountain.name = 'Mall_BoneFountain'; group.add(fountain); D.push(fg2);
  const jetG = new THREE.ConeGeometry(0.5, 4, 8, 1, true).translate(0, 2, 0), jetM = new THREE.MeshStandardMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.7, emissive: 0x7fcfff, emissiveIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const jets = [0, 1, 2, 3, 4, 5].map(k => { const m = new THREE.Mesh(jetG, jetM), a = k / 6 * Math.PI * 2; m.position.set(pool.x + Math.cos(a) * pool.radius * 0.6, 0.3, pool.z + Math.sin(a) * pool.radius * 0.6); group.add(m); return m; });
  D.push(jetG, jetM);
  animated.push(t => { wm.opacity = 0.86 + 0.04 * Math.sin(t * 1.4); jets.forEach((m, k) => m.scale.set(1, 0.6 + 0.5 * Math.abs(Math.sin(t * 1.7 + k)), 1)); });
}

// ---------- the aisles: tiled floor, shop fronts either side, glass along the escalator and the gallery's edge
const FLOOR = { A: 0xf4efe4, B: 0xffe6ee, C: 0xd9f1f7, D: 0xfff0cf, E: 0x8d96a3, F: 0xe7dcff, H: 0xffe0b8 };
const SHOPS = [['PAWS & CLAWS', '#e2303a'], ['FEATHER & FIN', '#1e9be0'], ['KIBBLE KING', '#f29a1f'], ['WAGS & WHISKERS', '#7b4fd6'], ['SQUEAKY TOYS', '#2fae62'], ['THE BONE YARD', '#d6497b']];
function buildAisles(group, D) {
  const tiles = canvasTexture(64, 64, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ececec'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); g.strokeStyle = '#cfcfcf'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64); }, true);
  // the floor (and under the raised parts, the slab it is laid on)
  const pos = [], col = [], uv = [], idx = [], c = new THREE.Color(), K = 5;
  for (let r = 0; r <= N; r++) {
    const i = r % N, s = r === N ? T.length : S.s[i], hw = S.width[i] / 2, foot = raised(i) ? S.y[i] - 0.9 : -0.05;
    const lat = [-hw - 0.3, -hw - 0.3, 0, hw + 0.3, hw + 0.3], y = [foot, S.y[i] + 0.02, S.y[i] + 0.02, S.y[i] + 0.02, foot];
    const stripe = onEscalator(S.s[i]) && Math.floor(S.s[i] / 1.2) % 2 ? 0x6f7885 : FLOOR[S.section[i]];
    for (let k = 0; k < K; k++) { pos.push(S.x[i] + S.normalX[i] * lat[k], y[k], S.z[i] + S.normalZ[i] * lat[k]); c.set(k === 0 || k === 4 ? 0x9aa3ad : stripe); col.push(c.r, c.g, c.b); uv.push(lat[k] / 3, s / 3); }
  }
  for (let r = 0; r < N; r++) { if (T.isGapSegment(r)) continue; for (let k = 0; k < K - 1; k++) { const a = r * K + k, b = a + 1, cc = a + K, d = cc + 1; idx.push(a, b, cc, b, d, cc); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tiles, roughness: 0.45, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(flat, mat); floor.name = 'Mall_Aisle'; floor.receiveShadow = true; group.add(floor); D.push(flat, mat, tiles);

  // shop fronts: six shops side by side on one long picture, repeated down both sides of every aisle
  const shops = canvasTexture(SHOPS.length * 256, 256, (cg) => {
    SHOPS.forEach(([name, hue], k) => {
      const x = k * 256;
      cg.fillStyle = '#f7f3ea'; cg.fillRect(x, 0, 256, 256);
      cg.fillStyle = hue; cg.fillRect(x, 0, 256, 70);                                     // the fascia
      cg.fillStyle = '#fff'; cg.font = 'bold 26px sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
      let size = 30; do { cg.font = `bold ${size}px sans-serif`; size -= 2; } while (cg.measureText(name).width > 230 && size > 12);
      cg.fillText(name, x + 128, 36);
      cg.fillStyle = '#9fd8ee'; cg.fillRect(x + 14, 90, 130, 150); cg.fillRect(x + 164, 90, 78, 166);       // window and door
      cg.strokeStyle = '#ffffff'; cg.lineWidth = 6; cg.strokeRect(x + 14, 90, 130, 150); cg.strokeRect(x + 164, 90, 78, 166);
      cg.fillStyle = hue;                                                                 // a paw in the window
      cg.beginPath(); cg.ellipse(x + 79, 182, 22, 18, 0, 0, 6.3); cg.fill();
      for (const [dx, dy] of [[-26, -22], [-9, -36], [9, -36], [26, -22]]) { cg.beginPath(); cg.ellipse(x + 79 + dx, 182 + dy, 8, 10, 0, 0, 6.3); cg.fill(); }
      cg.fillStyle = 'rgba(0,0,0,0.12)'; cg.fillRect(x + 252, 0, 4, 256);
    });
  }, true);
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe8f7, roughness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const frontMat = new THREE.MeshStandardMaterial({ map: shops, roughness: 0.8, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 0.9, side: THREE.DoubleSide });
  D.push(shops, glass, frontMat, roofMat);
  const wall = (name, material, height, keep, uScale, depth = 0) => {
    const p = [], u = [], ix = [], back = [], backIx = []; let v = 0, bv = 0;
    for (const side of [1, -1]) {
      let prev = null;
      for (let r = 0; r <= N; r++) {
        const i = r % N, s = r === N ? T.length : S.s[i];
        if (T.isGapSegment(i) || !keep(i, side)) { prev = null; continue; }
        const lat = side * (S.width[i] / 2 + 0.3), x = S.x[i] + S.normalX[i] * lat, z = S.z[i] + S.normalZ[i] * lat, y = S.y[i];
        if (prev) { p.push(prev[0], prev[1], prev[2], prev[0], prev[1] + height, prev[2], x, y, z, x, y + height, z); u.push(prev[3], 0, prev[3], 1, -s * uScale * side, 0, -s * uScale * side, 1); ix.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); v += 4; }
        if (prev && depth) {                                    // the shop behind its front: a flat roof and a back wall
          const bx = S.x[i] + S.normalX[i] * (lat + side * depth), bz = S.z[i] + S.normalZ[i] * (lat + side * depth), top = y + height;
          back.push(prev[0], prev[1] + height, prev[2], prev[4], prev[1] + height, prev[5], x, top, z, bx, top, bz, prev[4], prev[1] + height, prev[5], prev[4], -0.1, prev[5], bx, top, bz, bx, -0.1, bz);
          for (const q of [0, 4]) backIx.push(bv + q, bv + q + 2, bv + q + 1, bv + q + 1, bv + q + 2, bv + q + 3);
          bv += 8;
        }
        prev = [x, y, z, -s * uScale * side, S.x[i] + S.normalX[i] * (lat + side * depth), S.z[i] + S.normalZ[i] * (lat + side * depth)];
      }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); wg.setIndex(ix); wg.computeVertexNormals();
    const mesh = new THREE.Mesh(wg, material); mesh.name = name; mesh.receiveShadow = true; group.add(mesh); D.push(wg);
    if (back.length) {
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(back, 3)); bg.setIndex(backIx); bg.computeVertexNormals();
      const blocks = new THREE.Mesh(bg, roofMat); blocks.name = `${name}_Blocks`; blocks.receiveShadow = true; blocks.castShadow = true; group.add(blocks); D.push(bg);
    }
  };
  // shops on the ground floor (not across a lane something crosses) and along the outside of the gallery
  const crossing = i => [...T.catLanes, ...T.trolleyLanes].some(s => Math.abs(lapGap(S.s[i], s)) < 4);
  const aquarium = i => S.section[i] === 'C';
  wall('Mall_ShopFronts', frontMat, WALL, (i, side) => !onEscalator(S.s[i]) && !aquarium(i) && !crossing(i) && (!raised(i) || side > 0), 1 / (12 * SHOPS.length), 9);
  wall('Mall_Glass', glass, 1.3, (i, side) => onEscalator(S.s[i]) || (raised(i) && side < 0 && !aquarium(i)), 1);
  // the aquarium: fish tanks floor to ceiling down both sides
  const tank = canvasTexture(256, 256, (cg) => {
    const grd = cg.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#49c4ee'); grd.addColorStop(1, '#0f5f9c'); cg.fillStyle = grd; cg.fillRect(0, 0, 256, 256);
    const r = rng(9);
    for (let k = 0; k < 9; k++) { const x = 20 + r() * 216, y = 30 + r() * 190, w = 14 + r() * 16, dir = r() < 0.5 ? 1 : -1; cg.fillStyle = ['#ff8a3c', '#ffd23a', '#ff4f8b', '#ffffff'][k % 4]; cg.beginPath(); cg.ellipse(x, y, w, w * 0.5, 0, 0, 6.3); cg.fill(); cg.beginPath(); cg.moveTo(x - dir * w, y); cg.lineTo(x - dir * (w + 12), y - 9); cg.lineTo(x - dir * (w + 12), y + 9); cg.fill(); }
    cg.fillStyle = '#2fae62'; for (let k = 0; k < 6; k++) { cg.fillRect(20 + k * 40, 256 - 30 - r() * 50, 6, 90); }
    cg.strokeStyle = '#e8f6ff'; cg.lineWidth = 8; cg.strokeRect(0, 0, 256, 256);
  }, true);
  const tankMat = new THREE.MeshStandardMaterial({ map: tank, roughness: 0.2, emissive: 0x1a6aa8, emissiveIntensity: 0.35, emissiveMap: tank, side: THREE.DoubleSide }); D.push(tank, tankMat);
  wall('Mall_Aquarium', tankMat, WALL, i => aquarium(i), 1 / 8, 6);

  // legs under the escalator and the gallery
  const legs = [];
  for (let i = 0; i < N; i += 7) { if (!raised(i) || T.isGapSegment(i)) continue; for (const side of [-1, 1]) { const p = T.pointAt(S.s[i], side * (S.width[i] / 2 - 0.5)); legs.push([p.x, p.y - 0.9, p.z]); } }
  const lg = new THREE.CylinderGeometry(0.4, 0.4, 1, 8).translate(0, -0.5, 0), lm = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }), o = new THREE.Object3D();
  const legMesh = new THREE.InstancedMesh(lg, lm, legs.length);
  legs.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.scale.set(1, Math.max(0.1, p[1]), 1); o.updateMatrix(); legMesh.setMatrixAt(k, o.matrix); });
  legMesh.name = 'Mall_Legs'; legMesh.castShadow = true; group.add(legMesh); D.push(lg, lm, legMesh);

  // beams across the aisles with a banner hanging from each, so it feels indoors
  const beams = [], banners = [];
  for (let s = 30; s < T.length - 20; s += 34) {
    const p = T.pointAt(s); if (raised(p.index) || T.isGap(s) || S.section[p.index] === 'C' || lapGap(s, T.launch.landingS) > -30 && lapGap(s, T.launch.landingS) < 20) continue;
    beams.push(p); banners.push(p);
  }
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true }); D.push(prop);
  const hues = [0xe2303a, 0x1e9be0, 0xf29a1f, 0x7b4fd6, 0x2fae62];
  beams.forEach((p, k) => {
    const w = p.halfWidth + 0.6, gm = merge([box(w * 2 + 0.6, 0.5, 0.5, 0xffffff, 0, WALL + 0.8, 0), box(0.5, WALL + 1, 0.5, 0xffffff, -w, (WALL + 1) / 2, 0), box(0.5, WALL + 1, 0.5, 0xffffff, w, (WALL + 1) / 2, 0),
      box(2.4, 1.5, 0.08, hues[k % hues.length], 0, WALL - 0.25, 0), ball(0.26, 0, 0xffffff, 0, WALL - 0.4, 0.08, 1, 0.85, 0.3), ball(0.12, 0, 0xffffff, -0.28, WALL - 0.05, 0.08, 1, 1.2, 0.3), ball(0.12, 0, 0xffffff, 0.28, WALL - 0.05, 0.08, 1, 1.2, 0.3), ball(0.12, 0, 0xffffff, -0.1, WALL + 0.08, 0.08, 1, 1.2, 0.3), ball(0.12, 0, 0xffffff, 0.1, WALL + 0.08, 0.08, 1, 1.2, 0.3)]);
    const m = new THREE.Mesh(gm, prop); m.position.set(p.x, p.y, p.z); m.rotation.y = p.rotationY; m.name = 'Mall_Beam'; m.castShadow = true; group.add(m); D.push(gm);
  });

  // start/finish: a chequered line under the dome's ring of arches
  const chequer = canvasTexture(256, 32, (cg) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { cg.fillStyle = (x + y) % 2 ? '#111' : '#fff'; cg.fillRect(x * 16, y * 16, 16, 16); } });
  chequer.magFilter = THREE.NearestFilter;
  const hw0 = T.startFinish.halfWidth, holder = new THREE.Group(); holder.position.set(...T.startFinish.position); holder.rotation.y = T.startFinish.rotationY;
  const lineG = new THREE.PlaneGeometry(hw0 * 2, 1.6), lineM = new THREE.MeshBasicMaterial({ map: chequer, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const line = new THREE.Mesh(lineG, lineM); line.rotation.x = -Math.PI / 2; line.position.y = 0.08; holder.add(line);
  const dome = []; for (let k = 0; k < 6; k++) dome.push(paint(new THREE.TorusGeometry(hw0 + 6, 0.35, 6, 24, Math.PI), 0xffffff).rotateY(k / 6 * Math.PI).translate(0, WALL, 0));
  const domeG = merge(dome), domeM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), domeMesh = new THREE.Mesh(domeG, domeM); domeMesh.name = 'Mall_Dome'; holder.add(domeMesh);
  const banner = signTexture('PET MALL MAYHEM', '#ffffff', '#7b4fd6'), bannerG = new THREE.PlaneGeometry(10, 5), bannerM = new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide }), sign = new THREE.Mesh(bannerG, bannerM); sign.position.y = WALL + 4.5; sign.rotation.y = Math.PI; holder.add(sign);
  group.add(holder); D.push(chequer, lineG, lineM, domeG, domeM, banner, bannerG, bannerM);
}

// ---------- the animals and trolleys that knock dogs over, the tins and the puddles
function catGeometry(coat) {
  const legs = []; for (const [x, z] of [[-0.22, 0.42], [0.22, 0.42], [-0.22, -0.42], [0.22, -0.42]]) legs.push(box(0.14, 0.5, 0.14, coat, x, 0.25, z));
  return merge([ball(0.42, 1, coat, 0, 0.72, 0, 0.8, 0.75, 1.45), ball(0.3, 1, coat, 0, 1.0, 0.68), cone(0.11, 0.24, 4, coat, -0.16, 1.32, 0.68), cone(0.11, 0.24, 4, coat, 0.16, 1.32, 0.68),
    cyl(0.06, 0.07, 0.9, 5, coat, 0, 1.15, -0.7, -0.5), ball(0.05, 0, 0x202020, -0.11, 1.05, 0.95), ball(0.05, 0, 0x202020, 0.11, 1.05, 0.95), ...legs]);
}
function trolleyGeometry() {
  const steel = 0xb8c0c8, parts = [box(1.5, 0.12, 2.3, steel, 0, 0.55, 0)];
  for (const sx of [-0.75, 0.75]) parts.push(box(0.08, 1.0, 2.3, steel, sx, 1.05, 0));
  for (const sz of [-1.15, 1.15]) parts.push(box(1.5, 1.0, 0.08, steel, 0, 1.05, sz));
  parts.push(box(1.7, 0.1, 0.1, 0xe2303a, 0, 1.75, -1.35), box(1.2, 0.7, 0.9, 0xf29a1f, 0, 1.0, 0.45), box(1.1, 0.6, 0.8, 0x2fae62, 0, 1.0, -0.5), ball(0.4, 0, 0xffffff, 0.2, 1.65, 0.3, 1, 0.5, 1.6));
  for (const [x, z] of [[-0.6, 0.9], [0.6, 0.9], [-0.6, -0.9], [0.6, -0.9]]) parts.push(cyl(0.2, 0.2, 0.12, 8, 0x30343a, x, 0.2, z, 0, Math.PI / 2));
  return merge(parts);
}
function buildHazards(group, D, movers, animated) {
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }); D.push(prop);
  const coats = [0xf29a3c, 0x3a3a3f, 0xf2f0e8, 0xa8a8ae, 0xc98a55, 0xf2f0e8].map(catGeometry); D.push(...coats);
  T.catLanes.forEach((_, lane) => { for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(coats[(lane * 3 + k) % coats.length], prop); m.castShadow = true; m.name = 'Mall_Cat'; group.add(m); movers[`cat-${lane}-${k}`] = h => { m.position.set(h.x, h.y + h.bob, h.z); m.rotation.y = h.rotationY; }; } });
  const trolleyG = trolleyGeometry(); D.push(trolleyG);
  T.trolleyLanes.forEach((_, k) => { const m = new THREE.Mesh(trolleyG, prop); m.castShadow = true; m.name = 'Mall_Trolley'; group.add(m); movers[`trolley-${k}`] = h => { m.position.set(h.x, h.y, h.z); m.rotation.y = h.rotationY; m.rotation.z = 0.04 * Math.sin(h.roll * 2); }; });
  // a hamster in its ball: a clear shell with coloured hoops, and the hamster running inside
  const shellG = new THREE.SphereGeometry(T.hamsterRadius, 16, 10), shellM = new THREE.MeshStandardMaterial({ color: 0xd8f4ff, roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false });
  const hoopG = merge([paint(new THREE.TorusGeometry(T.hamsterRadius, 0.05, 5, 20), 0xff4f8b), paint(new THREE.TorusGeometry(T.hamsterRadius, 0.05, 5, 20), 0x33b6e6).rotateY(Math.PI / 2)]);
  const hamsterG = merge([ball(0.34, 1, 0xe9a45c, 0, 0, 0, 1, 0.85, 1.3), ball(0.2, 0, 0xfff1dc, 0, -0.08, 0.2, 1, 0.8, 1), ball(0.07, 0, 0xf2b6a0, -0.13, 0.26, 0.26), ball(0.07, 0, 0xf2b6a0, 0.13, 0.26, 0.26), ball(0.04, 0, 0x202020, -0.1, 0.1, 0.42), ball(0.04, 0, 0x202020, 0.1, 0.1, 0.42)]);
  D.push(shellG, shellM, hoopG, hamsterG);
  T.hamsterLanes.forEach((_, k) => {
    const holder = new THREE.Group(), hoops = new THREE.Mesh(hoopG, prop), shell = new THREE.Mesh(shellG, shellM), hamster = new THREE.Mesh(hamsterG, prop);
    hamster.position.y = -T.hamsterRadius + 0.38; shell.renderOrder = 3; holder.add(hoops, shell, hamster); holder.name = 'Mall_HamsterBall'; group.add(holder);
    let last = 0;
    movers[`hamster-${k}`] = h => { holder.position.set(h.x, h.y + T.hamsterRadius, h.z); holder.rotation.y = h.rotationY + Math.PI / 2; hoops.rotation.x = h.roll; hamster.rotation.y = h.roll > last ? 0 : Math.PI; hamster.position.z = 0; last = h.roll; };
  });
  // towers of tins standing in the aisle
  const tin = (hue, x, y, z) => [cyl(0.36, 0.36, 0.62, 10, hue, x, y, z), cyl(0.365, 0.365, 0.3, 10, 0xffffff, x, y, z)];
  const tower = []; const hues = [0xe2303a, 0x1e9be0, 0xf29a1f];
  for (let layer = 0; layer < 4; layer++) { const n = 4 - layer, r = 0.36 * (n - 1); for (let k = 0; k < Math.max(1, n * 2 - 2); k++) { const a = k / Math.max(1, n * 2 - 2) * Math.PI * 2; tower.push(...tin(hues[(layer + k) % 3], Math.cos(a) * r, 0.31 + layer * 0.63, Math.sin(a) * r)); } }
  const towerG = merge(tower), towers = new THREE.InstancedMesh(towerG, prop, T.obstacles.length), o = new THREE.Object3D();
  T.obstacles.forEach((ob, k) => { o.position.set(ob.x, ob.y, ob.z); o.rotation.set(0, k * 0.7, 0); o.scale.setScalar(1.45); o.updateMatrix(); towers.setMatrixAt(k, o.matrix); });
  towers.name = 'Mall_TinTowers'; towers.castShadow = true; group.add(towers); D.push(towerG, towers);
  // puddles from the burst tanks, each with a fish or two flapping in it
  const pg = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), pm = new THREE.MeshStandardMaterial({ color: 0x4fc3ee, roughness: 0.05, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const puddles = new THREE.InstancedMesh(pg, pm, T.mud.length);
  T.mud.forEach((p, k) => { o.position.set(p.x, p.y + 0.05, p.z); o.rotation.set(0, p.rotationY, 0); o.scale.set(p.across, 1, p.along); o.updateMatrix(); puddles.setMatrixAt(k, o.matrix); });
  puddles.name = 'Mall_Puddles'; group.add(puddles); D.push(pg, pm, puddles);
  const fishG = merge([ball(0.3, 0, 0xff8a3c, 0, 0, 0, 0.45, 0.8, 1.4), cone(0.22, 0.4, 4, 0xffb347, 0, 0, -0.55, -Math.PI / 2)]); D.push(fishG);
  const fish = T.mud.flatMap((p, k) => [0, 1].map(n => { const m = new THREE.Mesh(fishG, prop); m.name = 'Mall_Fish'; group.add(m); return { m, x: p.x + (n ? 1.2 : -0.8), y: p.y, z: p.z + (n ? -0.9 : 1.1), ph: k * 2.1 + n * 1.3 }; }));
  animated.push(t => { for (const f of fish) { const hop = Math.abs(Math.sin(t * 5 + f.ph)); f.m.position.set(f.x, f.y + 0.15 + hop * 0.35, f.z); f.m.rotation.set(0, f.ph + t * 0.6, Math.PI / 2 + 0.5 * Math.sin(t * 10 + f.ph)); } });
}

// ---------- everything else that has got out, and the mall's furniture
function buildChaos(group, D, animated, pool) {
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), r = rng(51), o = new THREE.Object3D(); D.push(prop);
  // along the foot of the shop fronts, out of the dogs' way: rabbits hopping, tortoises plodding, cages on their sides, spilt kibble, plants
  const edge = (count, test) => { const out = []; let tries = 0; while (out.length < count && tries++ < count * 30) { const i = Math.floor(r() * N); if (!test(i) || T.isGapSegment(i) || onEscalator(S.s[i])) continue; const side = r() < 0.5 ? 1 : -1, p = T.pointAt(S.s[i], side * (S.width[i] / 2 - 0.05)); out.push({ x: p.x, y: p.y, z: p.z, yaw: p.rotationY, side, ph: r() * 6.28 }); } return out; };
  const ground = i => !raised(i) && S.section[i] !== 'C';
  const rabbitG = merge([ball(0.3, 1, 0xf2f0e8, 0, 0.32, 0, 0.8, 0.85, 1.2), ball(0.2, 0, 0xf2f0e8, 0, 0.6, 0.28), box(0.07, 0.34, 0.05, 0xf2c8c8, -0.08, 0.92, 0.25), box(0.07, 0.34, 0.05, 0xf2c8c8, 0.08, 0.92, 0.25), ball(0.1, 0, 0xffffff, 0, 0.3, -0.36)]);
  const tortoiseG = merge([ball(0.42, 1, 0x5d8a3c, 0, 0.3, 0, 1, 0.6, 1.2), ball(0.14, 0, 0x8fb86a, 0, 0.26, 0.56), box(0.14, 0.14, 0.14, 0x8fb86a, -0.34, 0.08, 0.3), box(0.14, 0.14, 0.14, 0x8fb86a, 0.34, 0.08, 0.3), box(0.14, 0.14, 0.14, 0x8fb86a, -0.34, 0.08, -0.3), box(0.14, 0.14, 0.14, 0x8fb86a, 0.34, 0.08, -0.3)]);
  D.push(rabbitG, tortoiseG);
  const rabbits = edge(34, ground).map(a => { const m = new THREE.Mesh(rabbitG, prop); m.name = 'Mall_Rabbit'; group.add(m); return { m, ...a }; });
  const tortoises = edge(12, i => ground(i) || S.section[i] === 'F').map(a => { const m = new THREE.Mesh(tortoiseG, prop); m.name = 'Mall_Tortoise'; group.add(m); return { m, ...a }; });
  animated.push(t => {
    for (const a of rabbits) { const hop = Math.max(0, Math.sin(t * 4 + a.ph)), along = Math.sin(t * 0.5 + a.ph) * 1.5; a.m.position.set(a.x + Math.sin(a.yaw) * along, a.y + hop * 0.4, a.z + Math.cos(a.yaw) * along); a.m.rotation.y = a.yaw + (Math.cos(t * 0.5 + a.ph) > 0 ? 0 : Math.PI); }
    for (const a of tortoises) { const along = ((t * 0.12 + a.ph) % 6) - 3; a.m.position.set(a.x + Math.sin(a.yaw) * along, a.y, a.z + Math.cos(a.yaw) * along); a.m.rotation.y = a.yaw; }
  });
  const herd = (name, geo, list, scale = () => 1) => { const m = new THREE.InstancedMesh(geo, prop, list.length); list.forEach((a, k) => { o.position.set(a.x, a.y, a.z); o.rotation.set(0, a.yaw + a.ph, a.tip ?? 0); o.scale.setScalar(scale(a)); o.updateMatrix(); m.setMatrixAt(k, o.matrix); }); m.name = name; m.castShadow = true; group.add(m); D.push(geo, m); };
  const cage = [box(0.9, 0.06, 0.6, 0x6a7078, 0, 0.03, 0), box(0.9, 0.06, 0.6, 0x6a7078, 0, 0.63, 0)]; for (let k = 0; k <= 6; k++) cage.push(box(0.03, 0.6, 0.03, 0xb8c0c8, -0.45 + k * 0.15, 0.33, 0.3), box(0.03, 0.6, 0.03, 0xb8c0c8, -0.45 + k * 0.15, 0.33, -0.3));
  herd('Mall_Cages', merge(cage), edge(26, ground).map(a => ({ ...a, tip: r() < 0.6 ? Math.PI / 2 : 0, y: a.y + 0.32 })));
  herd('Mall_Kibble', merge([cone(0.55, 0.3, 7, 0xb5793a, 0, 0.15, 0), box(0.5, 0.7, 0.2, 0xf29a1f, 0.5, 0.2, 0.1, 0, 0, 1.2)]), edge(22, ground));
  herd('Mall_Plants', merge([cyl(0.4, 0.3, 0.6, 8, 0xd98a5c, 0, 0.3, 0), ball(0.7, 1, 0x3fae4f, 0, 1.2, 0, 1, 1.2, 1), ball(0.45, 0, 0x55c060, 0.3, 1.8, 0.1)]), edge(30, i => !T.isGapSegment(i)), () => 1.3);

  // birds out of the aviary: parrots and budgies wheeling over the aisles
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.28, 0, 0, -0.28, 1.2, 0.08, -0.06], 3)); wing.computeVertexNormals();
  const body = new THREE.SphereGeometry(0.2, 6, 5).scale(1, 0.85, 2.2), birds = []; D.push(wing, body);
  const plumage = [0xe2303a, 0x2fae62, 0x1e9be0, 0xffd23a, 0xff8a3c].map(color => { const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }); D.push(m); return m; });
  for (let k = 0; k < 26; k++) { const p = T.pointAt(r() * T.length), bm = plumage[k % plumage.length], b = new THREE.Group(), l = new THREE.Mesh(wing, bm), rr = new THREE.Mesh(wing, bm); rr.scale.x = -1; b.add(l, rr, new THREE.Mesh(body, bm)); b.scale.setScalar(0.9 + r() * 0.7); group.add(b); birds.push({ b, l, rr, cx: p.x, cz: p.z, cy: p.y, rad: 6 + r() * 16, y: 5 + r() * 5, sp: (0.3 + r() * 0.4) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28 }); }
  animated.push(t => { for (const q of birds) { const a = q.ph + t * q.sp; q.b.position.set(q.cx + Math.cos(a) * q.rad, q.cy + q.y + Math.sin(t * 0.7 + q.ph) * 1.2, q.cz + Math.sin(a) * q.rad); q.b.rotation.y = -a + (q.sp > 0 ? 0 : Math.PI); const f = Math.sin(t * 11 + q.ph) * 0.7; q.l.rotation.z = f; q.rr.rotation.z = -f; } });

  // the landing: a heap of giant dog beds round the end of the leap
  const land = T.pointAt(T.launch.landingS + 2), beds = [];
  for (const [sx, dz, hue] of [[-1, -4, 0xe2303a], [1, -2, 0x1e9be0], [-1, 5, 0x7b4fd6], [1, 8, 0xf29a1f]]) beds.push(paint(new THREE.TorusGeometry(2.0, 0.75, 8, 16).rotateX(Math.PI / 2), hue).translate(sx * (land.halfWidth + 2.6), 0.7, dz), cyl(1.6, 1.6, 0.5, 14, 0xfff1dc, sx * (land.halfWidth + 2.6), 0.5, dz));
  const bedG = merge(beds), bedMesh = new THREE.Mesh(bedG, prop); bedMesh.position.set(land.x, land.y, land.z); bedMesh.rotation.y = land.rotationY; bedMesh.name = 'Mall_DogBeds'; bedMesh.castShadow = true; group.add(bedMesh); D.push(bedG);
  // potted palms round the fountain
  herd('Mall_FountainPalms', merge([cyl(0.7, 0.5, 1.0, 8, 0xd98a5c, 0, 0.5, 0), cyl(0.2, 0.26, 4, 6, 0xb98a52, 0, 3, 0), ...[0, 1, 2, 3, 4, 5].map(k => cone(0.6, 3.2, 4, k % 2 ? 0x3fae4f : 0x55c060, 0, 0, 0).scale(1, 1, 0.22).rotateZ(-1.15).translate(1.4, 5.2, 0).rotateY(k / 6 * Math.PI * 2))]),
    [0, 1, 2, 3, 4, 5, 6, 7].map(k => ({ x: pool.x + Math.cos(k / 8 * 6.28) * (pool.radius + 3), y: 0, z: pool.z + Math.sin(k / 8 * 6.28) * (pool.radius + 3), yaw: k, ph: 0 })).filter(a => { const q = T.query(a.x, a.z); return q.distance > q.halfWidth + 2; }));

  // in the middle of the mall, for show: three pavilions built like giant kennels, each with a bone on its roof
  for (const [x, z, yaw, hue] of [[30, 5, 0.2, 0xe2303a], [140, -15, -0.4, 0x1e9be0], [-85, -10, 0.5, 0x2fae62]]) {
    const parts = [box(34, 13, 24, 0xf7f0e2, 0, 6.5, 0), box(9, 9, 0.6, 0x3a2a22, 0, 4.5, 12.1), cyl(4.5, 4.5, 0.6, 14, 0x3a2a22, 0, 9, 12.1, Math.PI / 2), box(36, 1, 26, 0xffffff, 0, 13.2, 0)];
    for (const sx of [-1, 1]) parts.push(box(21, 1.2, 27, hue, sx * 8.6, 18.4, 0, 0, 0, -sx * 0.55));
    parts.push(cyl(1.1, 1.1, 9, 8, 0xf2c230, 0, 25.5, 0, 0, Math.PI / 2));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push(ball(1.8, 1, 0xf2c230, sx * 4.8, 25.5 + sy * 1.1, 0));
    const pg = merge(parts), m = new THREE.Mesh(pg, prop); m.position.set(x, 0, z); m.rotation.y = yaw; m.name = 'Mall_Pavilion'; m.castShadow = true; m.receiveShadow = true; group.add(m); D.push(pg);
  }

  // signs on the way in to each part of the mall
  const postG = new THREE.CylinderGeometry(0.1, 0.12, 2.2, 6), postM = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.6 }), boardG = new THREE.PlaneGeometry(2.8, 1.4); D.push(postG, postM, boardG);
  for (const [text, s] of [['CATS!', T.catLanes[0] - 26], ['WET FLOOR', T.mud[0].s - 24], ['TROLLEYS!', T.trolleyLanes[0] - 26], ['TINS!', T.obstacles[0].s - 22], ['ESCALATOR', T.escalator.sStart - 20], ['HAMSTERS!', T.hamsterLanes[0] - 24], ['LEAP!', T.launch.padStart - 30]]) {
    const c = T.pointAt(s), p = T.pointAt(s, c.halfWidth - 0.1), tex = signTexture(text, '#ffd23a', '#202020'), mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); D.push(tex, mat);
    const post = new THREE.Mesh(postG, postM); post.position.set(p.x, p.y + 1.1, p.z); group.add(post);
    const board = new THREE.Mesh(boardG, mat); board.position.set(p.x, p.y + 2.9, p.z); board.rotation.y = c.rotationY + Math.PI; board.name = 'Mall_Sign'; group.add(board);
  }
}

/** Build the whole mall. */
export function createPetMall() {
  const group = new THREE.Group(); group.name = 'PetMall';
  const D = [], animated = [], movers = {};
  // the fountain pool lies under the leap
  const a = T.pointAt(T.launch.gapStart), b = T.pointAt(T.launch.gapEnd), pool = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius: Math.hypot(a.x - b.x, a.z - b.z) / 2 + 5 };
  buildSky(group, D); buildGround(group, D, animated, pool); buildAisles(group, D); buildHazards(group, D, movers, animated); buildChaos(group, D, animated, pool);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.25), sun = new THREE.DirectionalLight(0xfff6e6, 2.6);
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  const lights = new THREE.Group(); lights.name = 'Mall_Lights'; lights.add(hemi, sun, sun.target); group.add(lights);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(300);
  const placeHazards = raceSeconds => { for (const h of T.hazardsAt(raceSeconds)) movers[h.id]?.(h); };
  placeHazards(0);
  for (const f of animated) f(0, null);
  return {
    group, track: T, sun,
    /** t = seconds (cosmetic).  focus = {x,y,z} of the dog to light.  raceSeconds = time since GO. */
    update(t, focus, raceSeconds = 0) {
      for (const f of animated) f(t, focus);
      placeHazards(raceSeconds);
      if (focus) { sun.target.position.set(focus.x, focus.y, focus.z); sun.position.set(focus.x, focus.y, focus.z).addScaledVector(SUN_DIRECTION, 300); }
    },
    /** how many triangles the whole mall is (instances counted) */
    triangles() { let n = 0; group.traverse(m => { if (!m.isMesh) return; const g = m.geometry, tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3; n += tris * (m.isInstancedMesh ? m.count : 1); }); return Math.round(n); },
    /** Bright shop lighting.  Returns a function that undoes it. */
    applyEnvironment(scene, renderer, { shadows = true } = {}) {
      const prev = { fog: scene.fog, bg: scene.background, tm: renderer?.toneMapping, ex: renderer?.toneMappingExposure, sh: renderer?.shadowMap.enabled };
      scene.fog = new THREE.Fog(0xdcecf8, 500, 5000); scene.background = new THREE.Color(0x9fd3f7);
      if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85; if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; sun.castShadow = true; } }
      return () => { scene.fog = prev.fog; scene.background = prev.bg; if (renderer) { renderer.toneMapping = prev.tm; renderer.toneMappingExposure = prev.ex; renderer.shadowMap.enabled = prev.sh; } };
    },
    dispose() { for (const d of D) d.dispose?.(); },
  };
}
