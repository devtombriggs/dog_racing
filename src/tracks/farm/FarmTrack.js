// Muddy Paws Farm — Three.js visuals: the land, the road, the barn you run through, the windmill,
// the tractor, the animals, the maize, the pond and its broken bridge, and everything else on the farm.
// Everything is generated at runtime from shared/farmData.js (no model files); about 90,000 triangles.
//
//   const world = createFarm();
//   scene.add(world.group);
//   const restore = world.applyEnvironment(scene, renderer);
//   each frame: world.update(elapsedSeconds, leadDogPosition, raceSeconds);
//   leaving the map: restore(); scene.remove(world.group); world.dispose();
//
// raceSeconds is the time since GO: the moving hazards (tractor, sheep, pigs, windmill sails, rolling
// bales) are drawn where FARMYARD.hazardsAt(raceSeconds) says they are, which is exactly where the
// server has them.  Gameplay never reads these meshes: use FARMYARD.query() and FARMYARD.hazardHit().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FARMYARD as T } from '../../../shared/farmData.js';
import { fbm } from '../../../shared/modburyData.js';

const S = T.samples, N = T.sampleCount;
export const SUN_DIRECTION = new THREE.Vector3(0.42, 0.78, 0.36).normalize();
const BOUNDS = { x0: -480, x1: 410, z0: -400, z1: 330, step: 10.5 };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lapGap = (s, s0) => { let d = (((s - s0) % T.length) + T.length) % T.length; if (d > T.length / 2) d -= T.length; return d; };
const ground = (x, z) => T.terrainHeight(x, z);
/** a point beside the road: distance round the lap, metres to the left of the centreline; y is the ground there */
function beside(s, lateral) { const p = T.pointAt(s, lateral); return { ...p, y: ground(p.x, p.z) }; }

const C = { grassA: [0.30, 0.56, 0.18], grassB: [0.44, 0.66, 0.22], hay: [0.86, 0.72, 0.34], earth: [0.42, 0.30, 0.20], dirt: [0.60, 0.47, 0.32],
  cobble: [0.66, 0.62, 0.56], straw: [0.83, 0.71, 0.40], mud: [0.27, 0.19, 0.13], plank: [0.70, 0.54, 0.35] };

function noiseTexture(size, lo, hi, scale, speck = 0) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), im = g.createImageData(size, size), r = rng(size + scale);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * scale, w = y / size * scale, fx = x / size, fy = y / size;
    let v = (fbm(u, w, 4) * (1 - fx) + fbm(u - scale, w, 4) * fx) * (1 - fy) + (fbm(u, w - scale, 4) * (1 - fx) + fbm(u - scale, w - scale, 4) * fx) * fy;
    v = lo + (hi - lo) * (0.5 + 0.5 * v) - (r() < speck ? 0.12 : 0);
    const i = (y * size + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.max(0, Math.min(255, v * 255)); im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// ---------- building things out of painted primitives
/** give a geometry one colour (as vertex colours) and return it un-indexed, ready to merge */
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

// The animals and the tractor face +Z, feet on y = 0.  They are big, as everything is beside these dogs.
function sheepGeometry() {
  const wool = 0xf4f1e8, dark = 0x2c2826, legs = [];
  for (const [x, z] of [[-0.42, 0.55], [0.42, 0.55], [-0.42, -0.55], [0.42, -0.55]]) legs.push(box(0.2, 0.75, 0.2, dark, x, 0.37, z));
  return merge([ball(0.95, 1, wool, 0, 1.25, 0, 0.9, 0.8, 1.25), ball(0.5, 1, wool, 0, 1.75, 0.75, 1, 0.9, 1), box(0.46, 0.5, 0.62, dark, 0, 1.55, 1.2),
    box(0.16, 0.12, 0.3, dark, -0.34, 1.72, 1.05, 0, 0, 0.5), box(0.16, 0.12, 0.3, dark, 0.34, 1.72, 1.05, 0, 0, -0.5), ball(0.26, 0, wool, 0, 1.3, -1.15), ...legs]);
}
function pigGeometry() {
  const pink = 0xf2a6a0, deep = 0xd97f7c, legs = [];
  for (const [x, z] of [[-0.36, 0.6], [0.36, 0.6], [-0.36, -0.6], [0.36, -0.6]]) legs.push(box(0.22, 0.5, 0.22, deep, x, 0.25, z));
  return merge([ball(0.8, 1, pink, 0, 0.95, 0, 0.82, 0.74, 1.35), ball(0.5, 1, pink, 0, 1.05, 1.0, 1, 0.95, 1), cyl(0.2, 0.22, 0.26, 8, deep, 0, 1.0, 1.5, Math.PI / 2),
    cone(0.16, 0.3, 4, deep, -0.3, 1.5, 0.95, 0, 0.5), cone(0.16, 0.3, 4, deep, 0.3, 1.5, 0.95, 0, -0.5), paint(new THREE.TorusGeometry(0.16, 0.05, 5, 8), deep).translate(0, 1.15, -1.1), ...legs]);
}
function cowGeometry() {
  const white = 0xf5f2ea, black = 0x1f1d1c, pinkish = 0xe9b6a6, legs = [];
  for (const [x, z] of [[-0.55, 1.0], [0.55, 1.0], [-0.55, -1.0], [0.55, -1.0]]) legs.push(box(0.3, 1.2, 0.3, white, x, 0.6, z));
  return merge([box(1.5, 1.4, 3.0, white, 0, 1.9, 0), box(1.52, 0.9, 1.0, black, 0, 2.1, -0.6), box(0.9, 0.7, 0.72, black, 0.32, 2.1, 0.9), box(0.9, 0.9, 1.0, white, 0, 2.5, 1.9),
    box(0.92, 0.5, 0.5, black, 0, 2.75, 1.75), box(0.7, 0.45, 0.4, pinkish, 0, 2.2, 2.45), cone(0.1, 0.4, 5, 0xe8dcc0, -0.4, 3.1, 1.85, 0, 0.5), cone(0.1, 0.4, 5, 0xe8dcc0, 0.4, 3.1, 1.85, 0, -0.5),
    box(0.1, 1.0, 0.1, black, 0, 1.9, -1.55, 0, 0.3), box(0.6, 0.3, 0.5, pinkish, 0, 1.05, -0.5), ...legs]);
}
function chickenGeometry() {
  return merge([ball(0.34, 1, 0xf6f1e4, 0, 0.5, 0, 0.85, 0.9, 1.15), ball(0.2, 0, 0xf6f1e4, 0, 0.92, 0.3), cone(0.07, 0.2, 4, 0xf0a020, 0, 0.9, 0.52, Math.PI / 2), box(0.06, 0.16, 0.2, 0xd8302a, 0, 1.12, 0.3),
    cone(0.22, 0.4, 4, 0xe8e0cc, 0, 0.75, -0.42, -0.9), box(0.05, 0.3, 0.05, 0xf0a020, -0.1, 0.15, 0), box(0.05, 0.3, 0.05, 0xf0a020, 0.1, 0.15, 0)]);
}
function duckGeometry() {
  return merge([ball(0.42, 1, 0xfdfdf6, 0, 0.18, 0, 0.9, 0.6, 1.3), ball(0.22, 0, 0xfdfdf6, 0, 0.62, 0.42), cyl(0.09, 0.11, 0.32, 5, 0xfdfdf6, 0, 0.4, 0.36), box(0.16, 0.06, 0.24, 0xf2a01e, 0, 0.58, 0.66),
    cone(0.2, 0.36, 4, 0xfdfdf6, 0, 0.32, -0.56, -1.1)]);
}
function tractorGeometry() {       // the wheels are separate, so they can turn
  const red = 0xd23a2a, dark = 0x2a2c30, glass = 0x9fd3e8;
  return merge([box(1.7, 1.1, 3.0, red, 0, 1.75, 0.9), box(1.5, 0.5, 1.2, red, 0, 2.5, 1.8), box(1.9, 0.3, 2.2, dark, 0, 1.1, 0.3), box(2.0, 2.0, 1.9, red, 0, 3.0, -0.9),
    box(1.8, 1.2, 1.7, glass, 0, 3.3, -0.88), box(2.2, 0.16, 2.2, dark, 0, 4.1, -0.9), cyl(0.1, 0.1, 1.5, 6, dark, 0.55, 3.2, 1.6), box(0.3, 0.3, 0.3, dark, 0.55, 4.0, 1.6),
    box(1.6, 0.5, 0.2, 0xe8e2c8, 0, 1.9, 2.45), box(0.3, 0.3, 1.4, dark, 0, 0.9, -2.6)]);
}
function trailerGeometry() {
  const wood = 0x8c6238, hay = 0xe2c060;
  return merge([box(2.6, 0.25, 4.0, wood, 0, 1.2, 0), box(2.6, 0.9, 0.16, wood, 0, 1.75, 1.95), box(2.6, 0.9, 0.16, wood, 0, 1.75, -1.95), box(0.16, 0.9, 4.0, wood, 1.25, 1.75, 0), box(0.16, 0.9, 4.0, wood, -1.25, 1.75, 0),
    box(2.2, 1.3, 1.6, hay, 0, 2.2, 0.9), box(2.2, 1.3, 1.6, hay, 0, 2.2, -0.9), box(2.0, 1.1, 1.8, hay, 0, 3.3, 0)]);
}
const wheelGeometry = (r, w) => merge([cyl(r, r, w, 14, 0x1e1f22, 0, 0, 0, 0, Math.PI / 2), cyl(r * 0.5, r * 0.5, w + 0.06, 8, 0xe2c84a, 0, 0, 0, 0, Math.PI / 2)]);
// a round bale lying on its side, 2.6 m across: straw with a paler coil on each end
const baleGeometry = () => merge([cyl(1.3, 1.3, 1.7, 12, 0xdcb75a, 0, 0, 0, 0, Math.PI / 2), cyl(0.9, 0.9, 1.74, 10, 0xeacd78, 0, 0, 0, 0, Math.PI / 2), cyl(0.3, 0.3, 1.78, 6, 0xc79a3e, 0, 0, 0, 0, Math.PI / 2)]);

/** a wooden sign on a post: red letters on cream */
function signTexture(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f4e7c4'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#d9372b'; g.lineWidth = 12; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#d9372b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 76; do { g.font = `bold ${size}px sans-serif`; size -= 4; } while (g.measureText(text).width > 220 && size > 20);
  g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- the land
function fieldColor(x, z, h, ny) {
  const n = fbm(x / 40, z / 40, 3), n2 = fbm(x / 11 + 30, z / 11, 2);
  let c = mix(C.grassA, C.grassB, 0.5 + 0.5 * n2);
  // a patchwork of fields: some ploughed (striped earth), some stubble, most pasture
  const fx = Math.floor((x + 1000) / 150), fz = Math.floor((z + 1000) / 130), kind = ((fx * 7 + fz * 13) % 5 + 5) % 5;
  const edge = Math.min(((x + 1000) % 150), 150 - ((x + 1000) % 150), ((z + 1000) % 130), 130 - ((z + 1000) % 130)), inField = sstep(2, 7, edge);
  const farFromRoad = sstep(18, 34, T.query(x, z).distance);
  if (kind === 1) c = mix(c, mix(C.earth, [0.5, 0.37, 0.25], 0.5 + 0.5 * Math.sin((x + z * 0.3) * 0.9)), inField * farFromRoad * 0.9);
  if (kind === 3) c = mix(c, mix(C.hay, [0.78, 0.66, 0.3], 0.5 + 0.5 * n2), inField * farFromRoad * 0.8);
  c = mix(c, [0.36, 0.33, 0.28], sstep(0.86, 0.6, ny));                       // bare earth where it is steep
  const v = 1 + 0.07 * n; return [c[0] * v, c[1] * v, c[2] * v];
}

function buildTerrain(group, D) {
  const { x0, x1, z0, z1, step } = BOUNDS, nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = ground(x, z); pos[k * 3 + 2] = z; uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const nrm = g.getAttribute('normal'), col = new Float32Array(nx * nz * 3);
  for (let k = 0; k < nx * nz; k++) { const c = fieldColor(pos[k * 3], pos[k * 3 + 2], pos[k * 3 + 1], nrm.getY(k)); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tex = noiseTexture(256, 0.84, 1.0, 8, 0.02), mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.96 });
  const m = new THREE.Mesh(g, mat); m.name = 'Farm_Terrain'; m.receiveShadow = true; group.add(m); D.push(g, mat, tex);
  // the countryside beyond: one big green floor, and a ring of low wooded hills on the horizon
  const fg = new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), fm = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.36, 0.60, 0.21), roughness: 1 });
  const far = new THREE.Mesh(fg, fm); far.position.y = -1.6; far.name = 'Farm_FarLand'; group.add(far); D.push(fg, fm);
  const r = rng(5), hills = [];
  for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2 + r() * 0.1, d = 1500 + r() * 1800, h = 90 + r() * 190; hills.push(paint(new THREE.ConeGeometry(420 + r() * 500, h, 7, 1), new THREE.Color().setHSL(0.27 + r() * 0.05, 0.36, 0.34 + r() * 0.1)).scale(1, 1, 0.7).rotateY(r() * 3).translate(Math.cos(a) * d, h / 2 - 12, Math.sin(a) * d)); }
  const hg = merge(hills), hm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), ring = new THREE.Mesh(hg, hm); ring.name = 'Farm_Hills'; group.add(ring); D.push(hg, hm);
}

// ---------- the road
function buildTrail(group, D) {
  const secCol = { A: C.cobble, B: C.straw, C: C.dirt, D: C.dirt, E: C.dirt, F: C.dirt, G: mix(C.dirt, C.mud, 0.45), H: mix(C.dirt, C.hay, 0.3), I: mix(C.dirt, C.grassB, 0.35), J: C.dirt };
  const raw = S.section.map(s => secCol[s]), cols = [];
  for (let i = 0; i < N; i++) { let c = [0, 0, 0]; for (let k = -6; k <= 6; k++) { const r = raw[(i + k + N) % N]; c = [c[0] + r[0] / 13, c[1] + r[1] / 13, c[2] + r[2] / 13]; } cols.push(c); }
  const pos = [], col = [], uv = [], idx = [], K = 5;
  for (let r = 0; r <= N; r++) {
    const i = r % N, hw = S.width[i] / 2, lat = [-hw - 1.4, -hw, 0, hw, hw + 1.4], dy = [-0.3, 0.02, 0.06, 0.02, -0.3];
    for (let k = 0; k < K; k++) {
      const x = S.x[i] + S.normalX[i] * lat[k], z = S.z[i] + S.normalZ[i] * lat[k], edge = k === 0 || k === K - 1;
      const c = edge ? fieldColor(x, z, S.y[i], 1) : cols[i];
      pos.push(x, S.y[i] + dy[k], z); col.push(c[0], c[1], c[2]); uv.push(lat[k] / 5, (r === N ? T.length : S.s[i]) / 5);
    }
  }
  const bridge = T.chasms[0];
  for (let r = 0; r < N; r++) {
    if (r >= bridge.firstIndex && r < bridge.lastIndex) continue;            // the road stops at the pond: the bridge carries on
    for (let k = 0; k < K - 1; k++) { const a = r * K + k, b = a + 1, c = a + K, d = c + 1; idx.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  let up = 0; const nn = g.getAttribute('normal'); for (let i = 2; i < nn.count; i += K) up += nn.getY(i);
  if (up < 0) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.computeVertexNormals(); }
  const tex = noiseTexture(256, 0.78, 1.0, 16, 0.08), mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.92 });
  const m = new THREE.Mesh(g, mat); m.name = 'Farm_Road'; m.receiveShadow = true; group.add(m); D.push(g, mat, tex);

  // the pig pen's mud wallows: dark, wet ovals lying on the road
  const mg = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), mm = new THREE.MeshStandardMaterial({ color: new THREE.Color(...C.mud), roughness: 0.25, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const wallows = new THREE.InstancedMesh(mg, mm, T.mud.length), o = new THREE.Object3D();
  T.mud.forEach((p, k) => { o.position.set(p.x, p.y + 0.09, p.z); o.rotation.set(0, p.rotationY, 0); o.scale.set(p.across, 1, p.along); o.updateMatrix(); wallows.setMatrixAt(k, o.matrix); });
  wallows.name = 'Farm_Mud'; wallows.receiveShadow = true; group.add(wallows); D.push(mg, mm, wallows);

  // start/finish: a chequered line under a timber arch
  const cc = document.createElement('canvas'); cc.width = 256; cc.height = 32; const cg = cc.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { cg.fillStyle = (x + y) % 2 ? '#111' : '#fff'; cg.fillRect(x * 16, y * 16, 16, 16); }
  const ct = new THREE.CanvasTexture(cc); ct.magFilter = THREE.NearestFilter; ct.colorSpace = THREE.SRGBColorSpace;
  const hw0 = T.startFinish.halfWidth, holder = new THREE.Group(); holder.position.set(...T.startFinish.position); holder.rotation.y = T.startFinish.rotationY;
  const lg = new THREE.PlaneGeometry(hw0 * 2, 1.6), lm = new THREE.MeshBasicMaterial({ map: ct, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const line = new THREE.Mesh(lg, lm); line.rotation.x = -Math.PI / 2; line.position.y = 0.1; line.name = 'Farm_StartFinishLine'; holder.add(line);
  const arch = merge([box(0.6, 8, 0.6, 0x8b6a45, -(hw0 + 2.2), 4, 0), box(0.6, 8, 0.6, 0x8b6a45, hw0 + 2.2, 4, 0), box(hw0 * 2 + 5.6, 0.6, 0.6, 0x8b6a45, 0, 8, 0)]);
  const am = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), archMesh = new THREE.Mesh(arch, am); archMesh.castShadow = true; holder.add(archMesh);
  const bg = new THREE.PlaneGeometry(hw0 * 2 + 3.4, 1.5), bm = new THREE.MeshBasicMaterial({ map: ct, side: THREE.DoubleSide }), ban = new THREE.Mesh(bg, bm); ban.position.y = 6.9; holder.add(ban);
  group.add(holder); D.push(ct, lg, lm, arch, am, bg, bm);
}

// ---------- post-and-rail fences along the road, open where something crosses it
function buildFences(group, D) {
  const b = T.barn, br = T.chasms[0];
  const open = (s, side) => (lapGap(s, b.start) > -2 && lapGap(s, b.end) < 2) || (lapGap(s, br.ravineStart) > -1 && lapGap(s, br.ravineEnd) < 1)
    || Math.abs(lapGap(s, T.tractorLane.s)) < 6.5 || Math.abs(lapGap(s, T.sheepLane.s)) < 6
    || Math.abs(lapGap(s, T.baleRun.s)) < T.baleRun.spacing + 6
    || (Math.abs(lapGap(s, T.mill.s - 3.4)) < 5 && side < 0);
  const posts = [], rail = [], idx = []; let v = 0;
  for (const side of [1, -1]) {
    let prev = null;
    for (let r = 0; r <= N; r++) {
      const i = r % N, sec = S.section[i];
      if (sec === 'H' || open(S.s[i], side)) { prev = null; continue; }           // the maize is its own wall
      const lat = side * (S.width[i] / 2 + T.verge[sec] + 0.35), x = S.x[i] + S.normalX[i] * lat, z = S.z[i] + S.normalZ[i] * lat, y = ground(x, z);
      if (prev === null || r % 4 === 0) posts.push([x, y, z, Math.atan2(S.tangentX[i], S.tangentZ[i])]);
      if (prev) for (const h of [0.6, 1.15]) {                                    // two rails, each a thin upright strip seen from both sides
        rail.push(prev[0], prev[1] + h, prev[2], prev[0], prev[1] + h + 0.16, prev[2], x, y + h, z, x, y + h + 0.16, z);
        idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); v += 4;
      }
      prev = [x, y, z];
    }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rail, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  const rm = new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.9, side: THREE.DoubleSide }), rails = new THREE.Mesh(rg, rm); rails.name = 'Farm_FenceRails'; group.add(rails);
  const pg = new THREE.BoxGeometry(0.22, 1.5, 0.22), pm = new THREE.MeshStandardMaterial({ color: 0x8f6c44, roughness: 0.9 }), pmesh = new THREE.InstancedMesh(pg, pm, posts.length), o = new THREE.Object3D();
  posts.forEach((p, k) => { o.position.set(p[0], p[1] + 0.7, p[2]); o.rotation.set(0, p[3], 0); o.updateMatrix(); pmesh.setMatrixAt(k, o.matrix); });
  pmesh.name = 'Farm_FencePosts'; pmesh.castShadow = true; group.add(pmesh); D.push(rg, rm, pg, pm, pmesh);
}

// ---------- the buildings: the barn the road runs through, the farmhouse, the silo, the sheds
function buildBuildings(group, D, animated) {
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true }); D.push(prop);
  const place = (geo, x, y, z, yaw, name, shadow = true) => { const m = new THREE.Mesh(geo, prop); m.position.set(x, y, z); m.rotation.y = yaw; m.name = name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); D.push(geo); return m; };
  const red = 0xb5382c, white = 0xf2ece0, roof = 0x5a5f66, wood = 0x8b6a45;

  // the big red barn: 34 m long, open at both ends, the road straight through the middle
  {
    const b = T.barn, L = b.end - b.start + 2, inner = 6.2, wall = 0.5, wallH = 7.5, peak = 12.5, parts = [];
    for (const sx of [-1, 1]) {
      parts.push(box(wall, wallH, L, red, sx * (inner + wall / 2), wallH / 2, 0));
      for (let k = -2; k <= 2; k++) parts.push(box(wall + 0.1, wallH, 0.35, white, sx * (inner + wall / 2), wallH / 2, k * L / 5));        // white battens
      parts.push(box(wall + 0.12, 0.4, L, white, sx * (inner + wall / 2), wallH - 0.2, 0));
      // the end walls beside the doorway, and the doors swung open
      for (const ez of [-1, 1]) {
        parts.push(box(1.4, wallH, wall, red, sx * (inner - 0.2), wallH / 2, ez * L / 2));
        parts.push(box(0.35, wallH, wall + 0.1, white, sx * (inner - 0.9), wallH / 2, ez * L / 2));
        parts.push(box(4.6, wallH - 0.4, 0.25, red, sx * (inner + 2.6), (wallH - 0.4) / 2, ez * (L / 2 + 0.6), sx * ez * 0.35));
        parts.push(box(4.7, 0.3, 0.3, white, sx * (inner + 2.6), wallH - 1.2, ez * (L / 2 + 0.7), sx * ez * 0.35));
      }
      // hay stacked along the walls inside, and a rafter light strip
      for (let k = -3; k <= 3; k++) parts.push(box(1.3, 1.1 + (k % 2 ? 1.1 : 0), 3.6, 0xe0c060, sx * (inner - 0.85), (1.1 + (k % 2 ? 1.1 : 0)) / 2, k * 4.4));
    }
    // gambrel roof: a steep lower pitch and a shallow upper one, each side
    const half = inner + wall + 0.6, kneeX = half * 0.55, kneeY = wallH + (peak - wallH) * 0.62;
    for (const sx of [-1, 1]) {
      const lowLen = Math.hypot(half - kneeX, kneeY - wallH), lowAng = Math.atan2(kneeY - wallH, half - kneeX);
      parts.push(box(lowLen, 0.3, L + 2, roof, sx * (half + kneeX) / 2, (wallH + kneeY) / 2, 0, 0, 0, -sx * lowAng));
      const upLen = Math.hypot(kneeX, peak - kneeY), upAng = Math.atan2(peak - kneeY, kneeX);
      parts.push(box(upLen, 0.3, L + 2, roof, sx * kneeX / 2, (kneeY + peak) / 2, 0, 0, 0, -sx * upAng));
    }
    for (const ez of [-1, 1]) {                        // the gable ends above the doorway, with a white-trimmed hay door
      parts.push(box(half * 2 - 0.6, kneeY - wallH + 0.2, wall, red, 0, (wallH + kneeY) / 2, ez * L / 2));
      parts.push(box(kneeX * 2 - 0.4, peak - kneeY - 0.4, wall, red, 0, (kneeY + peak) / 2 - 0.3, ez * L / 2));
      parts.push(box(2.4, 2.2, wall + 0.2, white, 0, wallH + 1.6, ez * L / 2));
      parts.push(box(1.9, 1.8, wall + 0.3, 0x3a2a22, 0, wallH + 1.6, ez * L / 2));
      parts.push(box(half * 2 - 0.4, 0.4, wall + 0.2, white, 0, wallH + 0.1, ez * L / 2));
    }
    place(merge(parts), b.x, b.y, b.z, b.rotationY, 'Farm_Barn');
    // a weather vane on the ridge, turning with the wind
    const vane = place(merge([cyl(0.06, 0.06, 1.6, 5, 0x2a2c30, 0, 0.8, 0), box(1.6, 0.08, 0.08, 0x2a2c30, 0, 1.3, 0), cone(0.22, 0.5, 4, 0xd8a020, 0.9, 1.3, 0, 0, -Math.PI / 2), box(0.5, 0.4, 0.05, 0xd8a020, -0.7, 1.3, 0)]), b.x, b.y + peak, b.z, 0, 'Farm_WeatherVane', false);
    animated.push(t => { vane.rotation.y = 0.8 + 0.5 * Math.sin(t * 0.6) + 0.15 * Math.sin(t * 2.3); });
  }
  // the farmhouse across the yard from the start line, smoke from its chimney
  {
    const p = beside(T.sAtU(1.0), 30), parts = [box(14, 6.5, 9, 0xe9dcc0, 0, 3.25, 0), box(15, 0.4, 10, white, 0, 6.5, 0)];
    for (const sx of [-1, 1]) parts.push(box(7.4, 0.35, 10.6, 0x9c4a36, sx * 3.1, 8.3, 0, 0, 0, -sx * 0.52));
    for (const ez of [-1, 1]) parts.push(box(11, 3.2, 0.4, 0xe9dcc0, 0, 7.6, ez * 4.3), box(5, 1.2, 0.42, 0xe9dcc0, 0, 9.4, ez * 4.3));
    parts.push(box(1.5, 3.6, 1.5, 0x8a5a48, 4.2, 10.2, 1.5), box(2.0, 3.6, 0.3, 0x5a3a2a, 0, 1.8, -4.6), box(2.6, 0.3, 1.6, 0x8b6a45, 0, 3.8, -5.2));
    for (const wx of [-4.6, 4.6]) for (const wy of [2.2, 5.0]) parts.push(box(2.0, 1.6, 0.3, 0x86c5e0, wx, wy, -4.6), box(2.3, 0.2, 0.36, white, wx, wy - 0.9, -4.62));
    parts.push(box(2.0, 1.6, 0.3, 0x86c5e0, 0, 5.0, -4.6));
    place(merge(parts), p.x, p.y, p.z, Math.atan2(p.nx, p.nz), 'Farm_Farmhouse');      // its front door (on -Z) faces the road
    const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const chimney = new THREE.Vector3(4.2, 12.2, 1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.nx, p.nz)).add(new THREE.Vector3(p.x, p.y, p.z)), puffs = [];
    for (let k = 0; k < 7; k++) { const sm = new THREE.SpriteMaterial({ map: smokeTex, color: 0xdedede, transparent: true, depthWrite: false, opacity: 0 }), sp = new THREE.Sprite(sm); group.add(sp); puffs.push(sp); D.push(sm); }
    D.push(smokeTex);
    animated.push(t => puffs.forEach((sp, k) => { const a = ((t * 0.22 + k / puffs.length) % 1); sp.position.set(chimney.x + a * 5 + Math.sin(t + k) * 0.4, chimney.y + a * 9, chimney.z + a * 2); sp.scale.setScalar(1.4 + a * 4.5); sp.material.opacity = 0.5 * (1 - a) * Math.min(1, a * 6); }));
  }
  // grain silo, tractor shed, chicken coop, dog kennel, water trough, a cart, milk churns
  {
    const silo = beside(T.sAtU(2.4), 22); place(merge([cyl(4.2, 4.2, 16, 14, 0xc9ccd0, 0, 8, 0), paint(new THREE.SphereGeometry(4.2, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x9aa0a8).translate(0, 16, 0), box(0.4, 16, 0.5, 0x6a6e74, 0, 8, 4.3), cyl(4.3, 4.3, 0.4, 14, 0x8a8e94, 0, 5.3, 0), cyl(4.3, 4.3, 0.4, 14, 0x8a8e94, 0, 10.6, 0)]), silo.x, silo.y, silo.z, silo.rotationY, 'Farm_Silo');
    const shed = beside(T.sAtU(0.2), -24), sp = [box(11, 4.5, 8, 0x7c8a5c, 0, 2.25, 0), box(12, 0.35, 9.4, 0x5a5f66, 0, 5.2, 0, 0, 0.14, 0), box(4.5, 3.6, 0.3, 0x3a2a22, -2, 1.8, 4.05), box(0.3, 4.5, 0.3, white, 3.2, 2.25, 4.05)];
    place(merge(sp), shed.x, shed.y, shed.z, Math.atan2(shed.nx, shed.nz), 'Farm_Shed');
    const coop = beside(T.sAtU(1.6), -20), cp = [box(4.4, 2.2, 3.2, 0xb88a50, 0, 2.0, 0), box(0.3, 0.9, 0.3, wood, -1.8, 0.45, 1.2), box(0.3, 0.9, 0.3, wood, 1.8, 0.45, 1.2), box(0.3, 0.9, 0.3, wood, -1.8, 0.45, -1.2), box(0.3, 0.9, 0.3, wood, 1.8, 0.45, -1.2),
      box(2.8, 0.25, 3.8, red, -1.2, 3.6, 0, 0, 0, 0.5), box(2.8, 0.25, 3.8, red, 1.2, 3.6, 0, 0, 0, -0.5), box(0.9, 1.0, 0.2, 0x3a2a22, 0, 1.6, 1.62), box(1.0, 0.12, 2.6, wood, 0, 0.5, 2.6, 0, 0.42, 0)];
    place(merge(cp), coop.x, coop.y, coop.z, Math.atan2(coop.nx, coop.nz), 'Farm_ChickenCoop');
    const kennel = beside(T.sAtU(0.75), 14.5), kp = [box(2.6, 1.7, 3.0, 0xc45a3c, 0, 0.85, 0), box(1.9, 0.2, 3.4, 0x4a4e55, -0.75, 2.2, 0, 0, 0, 0.6), box(1.9, 0.2, 3.4, 0x4a4e55, 0.75, 2.2, 0, 0, 0, -0.6), box(1.1, 1.2, 0.2, 0x241a16, 0, 0.6, -1.52), box(1.3, 0.3, 0.12, white, 0, 1.6, -1.56)];
    place(merge(kp), kennel.x, kennel.y, kennel.z, Math.atan2(kennel.nx, kennel.nz), 'Farm_Kennel');
    const trough = beside(T.sAtU(0.0), 13.6); place(merge([box(4.2, 0.9, 1.4, 0x7a7f86, 0, 0.55, 0), box(3.8, 0.1, 1.0, 0x4aa3c8, 0, 0.95, 0)]), trough.x, trough.y, trough.z, trough.rotationY, 'Farm_Trough');
    const cart = beside(T.sAtU(2.0), -15), cg = [box(2.4, 0.3, 4.2, wood, 0, 1.3, 0), box(2.4, 1.0, 0.2, wood, 0, 1.9, 2.0), box(0.2, 1.0, 4.2, wood, 1.1, 1.9, 0), box(0.2, 1.0, 4.2, wood, -1.1, 1.9, 0), box(2.0, 1.0, 3.6, 0xe0c060, 0, 2.0, 0),
      cyl(1.0, 1.0, 0.25, 12, 0x5a3f28, 1.4, 1.0, -0.4, 0, Math.PI / 2), cyl(1.0, 1.0, 0.25, 12, 0x5a3f28, -1.4, 1.0, -0.4, 0, Math.PI / 2), box(0.2, 0.2, 3.0, wood, 0, 0.9, 3.4, 0, 0.25, 0)];
    place(merge(cg), cart.x, cart.y, cart.z, cart.rotationY + 0.5, 'Farm_Cart');
    const churns = []; for (let k = 0; k < 4; k++) churns.push(cyl(0.34, 0.42, 1.2, 8, 0xb8bcc2, k * 0.95 - 1.4, 0.6, (k % 2) * 0.5), cyl(0.2, 0.3, 0.3, 8, 0x8a8e94, k * 0.95 - 1.4, 1.35, (k % 2) * 0.5));
    const ch = beside(T.sAtU(0.5), 13.4); place(merge(churns), ch.x, ch.y, ch.z, ch.rotationY, 'Farm_MilkChurns');
  }
}

// ---------- the windmill on the inside of Windmill Corner
function buildWindmill(group, D, movers) {
  const mill = T.mill, prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }); D.push(prop);
  const tower = merge([cyl(1.7, 2.6, mill.hubHeight + 1.2, 10, 0xe6ddc8, 0, (mill.hubHeight + 1.2) / 2, 0), cone(2.2, 2.4, 10, 0x8c4a34, 0, mill.hubHeight + 2.4, 0), box(1.0, 2.0, 0.2, 0x5a3a2a, 0, 1.0, 2.55), box(0.8, 0.8, 0.2, 0x86c5e0, 0, 5.2, 2.05),
    cyl(2.75, 2.75, 0.5, 10, 0x9a927f, 0, 0.25, 0)]);
  const tm = new THREE.Mesh(tower, prop); tm.position.set(mill.tower.x, mill.tower.y, mill.tower.z); tm.rotation.y = mill.axisYaw; tm.name = 'Farm_WindmillTower'; tm.castShadow = true; group.add(tm); D.push(tower);
  // the sails: four lattice blades on a hub, turning about the line of the road.  Blade 0 hangs straight down at angle 0.
  const blades = [cyl(0.5, 0.5, 3.6, 8, 0x6a4a34, 0, 0, -1.6, Math.PI / 2)];
  for (let b = 0; b < mill.blades; b++) {
    const a = b * Math.PI * 2 / mill.blades, L = mill.bladeLength, parts = [box(0.22, L, 0.18, 0x7a5a3c, 0, -L / 2, 0), box(1.5, L * 0.72, 0.06, 0xf0e8d2, 0.85, -L * 0.6, 0)];
    for (let k = 1; k <= 5; k++) parts.push(box(1.6, 0.1, 0.1, 0x7a5a3c, 0.85, -L * (0.26 + k * 0.135), 0.03));
    const blade = merge(parts); blade.rotateZ(a); blades.push(blade);
  }
  const rg = merge(blades), holder = new THREE.Group(), rotor = new THREE.Mesh(rg, prop);
  holder.position.set(mill.x, mill.y + mill.hubHeight, mill.z); holder.rotation.y = mill.axisYaw; holder.add(rotor); rotor.castShadow = true; rotor.name = 'Farm_WindmillSails'; group.add(holder); D.push(rg);
  movers.sails = h => { rotor.rotation.z = h.angle; };
}

// ---------- hay: the bales standing in the road, the ones rolling down the hill, and stacks in the fields
function buildHay(group, D, movers) {
  const geo = baleGeometry(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), r = rng(41), o = new THREE.Object3D();
  D.push(geo, mat);
  const fixed = T.obstacles.filter(ob => ob.kind === 'bale').map(ob => [ob.x, ob.y + 1.3, ob.z, ob.rotationY, 1]);
  // stacks about the place: by the barn, in the stubble, at the top of Bale Hill waiting their turn
  for (const [u, lat, n] of [[3.6, 13, 3], [4.9, -12, 2], [9.6, 14, 3], [11.4, -13, 2], [19.2, 31, 4], [19.5, 34, 3], [20.6, 12, 2], [6.0, 15, 2]]) {
    const p = beside(T.sAtU(u), lat);
    for (let k = 0; k < n; k++) fixed.push([p.x + (k - n / 2) * 2.8 * Math.cos(p.rotationY), ground(p.x, p.z) + 1.3, p.z - (k - n / 2) * 2.8 * Math.sin(p.rotationY), p.rotationY + r() * 0.3, 1]);
    if (n > 2) fixed.push([p.x, ground(p.x, p.z) + 3.55, p.z, p.rotationY + 0.2, 1]);
  }
  const m = new THREE.InstancedMesh(geo, mat, fixed.length);
  fixed.forEach((b, k) => { o.position.set(b[0], b[1], b[2]); o.rotation.set(0, b[3], 0); o.updateMatrix(); m.setMatrixAt(k, o.matrix); });
  m.name = 'Farm_HayBales'; m.castShadow = true; m.receiveShadow = true; group.add(m); D.push(m);
  for (let k = 0; k < 3; k++) {
    const bale = new THREE.Mesh(geo, mat); bale.rotation.order = 'YXZ'; bale.castShadow = true; bale.name = 'Farm_RollingBale'; group.add(bale);
    movers[`rolling-${k}`] = h => { bale.visible = h.fade > 0.01; bale.position.set(h.x, h.y, h.z); bale.rotation.set(h.spin, h.rotationY, 0); bale.scale.setScalar(0.6 + 0.4 * h.fade); };
  }
}

// ---------- the animals and the tractor
function buildAnimals(group, D, movers, animated) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }), r = rng(63), o = new THREE.Object3D(); D.push(mat);
  const herd = (name, geo, list) => { const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((a, k) => { o.position.set(a[0], a[1], a[2]); o.rotation.set(0, a[3], 0); o.scale.setScalar(a[4] ?? 1); o.updateMatrix(); m.setMatrixAt(k, o.matrix); }); m.name = name; m.castShadow = true; group.add(m); D.push(m); return m; };
  const scatter = (u, lat0, lat1, n, spread) => Array.from({ length: n }, () => { const p = beside(T.sAtU(u) + (r() - 0.5) * spread, lat0 + r() * (lat1 - lat0)); return [p.x, p.y, p.z, r() * 6.28, 0.9 + r() * 0.25]; });

  const sheep = sheepGeometry(), pig = pigGeometry(), cow = cowGeometry(), hen = chickenGeometry(); D.push(sheep, pig, cow, hen);
  // the sheep that cross the road, and the rest of the flock grazing either side of it
  for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(sheep, mat); m.castShadow = true; m.name = 'Farm_Sheep'; group.add(m); movers[`sheep-${k}`] = h => { m.position.set(h.x, h.y + h.bob, h.z); m.rotation.y = h.rotationY; }; }
  herd('Farm_Flock', sheep, [...scatter(6.55, 24, 60, 7, 50), ...scatter(6.55, -55, -22, 5, 50)]);
  // the pigs trotting round their wallows, and a few more asleep by the fence
  T.mud.forEach((_, k) => { const m = new THREE.Mesh(pig, mat); m.castShadow = true; m.name = 'Farm_Pig'; group.add(m); movers[`pig-${k}`] = h => { m.position.set(h.x, h.y + 0.06 * Math.abs(Math.sin(h.x + h.z)), h.z); m.rotation.y = h.rotationY; }; });
  herd('Farm_PigsResting', pig, scatter(12.6, 13, 20, 4, 60));
  herd('Farm_Cows', cow, [...scatter(10.5, -60, -28, 4, 70), ...scatter(18.6, -55, -20, 4, 80), ...scatter(2.6, -70, -35, 3, 60)]);

  // the tractor and its trailer of hay
  const tractor = new THREE.Group(), body = new THREE.Mesh(tractorGeometry(), mat), big = wheelGeometry(1.5, 0.7), small = wheelGeometry(0.85, 0.5), wheels = [];
  body.castShadow = true; tractor.add(body); D.push(body.geometry, big, small);
  for (const [geo, x, y, z] of [[big, -1.35, 1.5, -1.0], [big, 1.35, 1.5, -1.0], [small, -1.1, 0.85, 2.0], [small, 1.1, 0.85, 2.0]]) { const w = new THREE.Mesh(geo, mat); w.position.set(x, y, z); w.castShadow = true; tractor.add(w); wheels.push([w, geo === big ? 1.5 : 0.85]); }
  tractor.name = 'Farm_Tractor'; group.add(tractor);
  const trailer = new THREE.Group(), tb = new THREE.Mesh(trailerGeometry(), mat); tb.castShadow = true; trailer.add(tb); D.push(tb.geometry);
  for (const x of [-1.5, 1.5]) { const w = new THREE.Mesh(small, mat); w.position.set(x, 0.85, -0.6); trailer.add(w); wheels.push([w, 0.85]); }
  trailer.name = 'Farm_Trailer'; group.add(trailer);
  let lastX = null, lastZ = 0, travelled = 0;
  movers.tractor = h => {
    if (lastX !== null) travelled += Math.hypot(h.x - lastX, h.z - lastZ); lastX = h.x; lastZ = h.z;
    tractor.position.set(h.x, h.y, h.z); tractor.rotation.y = h.rotationY; body.position.y = 0.04 * Math.sin(travelled * 3);
    for (const [w, radius] of wheels) w.rotation.x = travelled / radius;
  };
  movers.trailer = h => { trailer.position.set(h.x, h.y, h.z); trailer.rotation.y = h.rotationY; };

  // chickens in the yard: pecking about, and running from any dog that comes near
  const yard = beside(T.sAtU(1.3), -13), hens = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(hen, mat); m.castShadow = true; m.name = 'Farm_Chicken'; group.add(m); return { m, home: new THREE.Vector3(yard.x + (r() - 0.5) * 22, 0, yard.z + (r() - 0.5) * 9), phase: r() * 6.28, flee: new THREE.Vector3() }; });
  animated.push((t, focus) => {
    for (const h of hens) {
      // run from a dog within ten metres, otherwise wander about home and peck
      let fx = 0, fz = 0;
      if (focus) { const dx = h.m.position.x - focus.x, dz = h.m.position.z - focus.z, d = Math.hypot(dx, dz); if (d < 10 && d > 0.01) { fx = dx / d * (10 - d); fz = dz / d * (10 - d); } }
      h.flee.x += (fx - h.flee.x) * 0.08; h.flee.z += (fz - h.flee.z) * 0.08;
      const running = Math.hypot(fx, fz) > 0.5;
      const x = h.home.x + Math.sin(t * 0.3 + h.phase) * 1.6 + h.flee.x, z = h.home.z + Math.cos(t * 0.23 + h.phase * 2) * 1.6 + h.flee.z;
      const dx = x - h.m.position.x, dz = z - h.m.position.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.002) h.m.rotation.y = Math.atan2(dx, dz);
      h.m.position.set(x, ground(x, z) + (running ? Math.abs(Math.sin(t * 16 + h.phase)) * 0.35 : 0), z);
      h.m.rotation.x = running ? 0 : Math.max(0, Math.sin(t * 2.2 + h.phase * 3)) * 0.7;             // pecking
    }
  });
}

// ---------- the Maize Maze: walls of corn either side of the path, and the scarecrow standing in it
function buildMaize(group, D, animated) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.strokeStyle = '#6f9a2c'; g.lineWidth = 5; g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 18); g.stroke();
  g.fillStyle = '#5c8f24';
  for (let k = 0; k < 7; k++) { const y = 230 - k * 30, dir = k % 2 ? 1 : -1; g.beginPath(); g.moveTo(32, y); g.quadraticCurveTo(32 + dir * 30, y - 34, 32 + dir * 27, y + 6); g.quadraticCurveTo(32 + dir * 16, y - 10, 32, y + 8); g.fill(); }
  g.fillStyle = '#e8c53a'; g.beginPath(); g.ellipse(41, 120, 6, 17, 0.25, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(24, 86, 5, 14, -0.25, 0, 6.3); g.fill();
  g.fillStyle = '#c9a85a'; g.beginPath(); g.moveTo(32, 20); g.lineTo(24, 0); g.lineTo(32, 10); g.lineTo(40, 0); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const quad = new THREE.PlaneGeometry(1.5, 4.2).translate(0, 2.1, 0), stalk = mergeGeometries([quad, quad.clone().rotateY(Math.PI / 2)]); quad.dispose();
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), r = rng(88), o = new THREE.Object3D(), list = [];
  const h = T.sections.find(sec => sec.id === 'H');
  for (let s = h.sStart + 4; s < h.sEnd - 4; s += 1.15) for (const side of [1, -1]) {
    const hw = T.pointAt(s).halfWidth;
    for (const [off, chance] of [[0.9, 1], [2.0, 0.9], [3.4, 0.5], [5.2, 0.3]]) {
      if (r() > chance) continue;
      const p = beside(s + (r() - 0.5) * 0.9, side * (hw + off + r() * 0.5)); list.push([p.x, p.y, p.z, r() * 3.14, 0.82 + r() * 0.36]);
    }
  }
  // the maze (Tom, 2026-11-21): its rows and walls of corn, two staggered rows of stalks along each
  for (const wall of T.maze.boxes) {
    const acrossS = wall.s1 - wall.s0 < wall.l1 - wall.l0;          // (a row across the field, rather than a wall down it)
    const along = acrossS ? [wall.l0, wall.l1] : [wall.s0, wall.s1], mid = acrossS ? (wall.s0 + wall.s1) / 2 : (wall.l0 + wall.l1) / 2;
    for (let v = along[0] + 0.4; v < along[1] - 0.2; v += 1.1) for (const off of [-0.45, 0.45]) {
      const sAt = acrossS ? mid + off + (r() - 0.5) * 0.3 : v + (r() - 0.5) * 0.4, lat = acrossS ? v + (r() - 0.5) * 0.4 : mid + off + (r() - 0.5) * 0.3;
      if (Math.abs(lat) > T.pointAt(sAt).halfWidth + 1.2) continue;
      const p = T.pointAt(sAt, lat); list.push([p.x, p.y, p.z, r() * 3.14, 0.85 + r() * 0.3]);
    }
  }
  const m = new THREE.InstancedMesh(stalk, mat, list.length);
  list.forEach((p, k) => { o.position.set(p[0], p[1] - 0.1, p[2]); o.rotation.set(0, p[3], 0); o.scale.set(p[4], p[4], p[4]); o.updateMatrix(); m.setMatrixAt(k, o.matrix); });
  m.name = 'Farm_Maize'; m.receiveShadow = true; group.add(m); D.push(tex, stalk, mat, m);

  // the scarecrow: a post, a crossbar, a sack shirt, a pumpkin head and a straw hat; his arms flap in the wind
  const sc = T.obstacles.find(ob => ob.kind === 'scarecrow'), prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }); D.push(prop);
  const bodyG = merge([cyl(0.14, 0.14, 4.6, 6, 0x8b6a45, 0, 2.3, 0), box(1.5, 1.7, 0.7, 0x4a6fa5, 0, 3.0, 0), box(1.52, 0.2, 0.72, 0xd8c070, 0, 2.2, 0), ball(0.62, 1, 0xe8892a, 0, 4.35, 0, 1, 0.9, 1), cone(0.95, 0.8, 8, 0xd8c070, 0, 5.05, 0), cyl(1.25, 1.25, 0.08, 10, 0xd8c070, 0, 4.72, 0),
    box(0.16, 0.16, 0.1, 0x241a16, -0.22, 4.45, 0.58), box(0.16, 0.16, 0.1, 0x241a16, 0.22, 4.45, 0.58), box(0.4, 0.08, 0.1, 0x241a16, 0, 4.15, 0.6), cone(0.5, 0.9, 6, 0xd8c070, 0, 1.5, 0, Math.PI)]);
  const body = new THREE.Mesh(bodyG, prop); body.position.set(sc.x, sc.y, sc.z); body.rotation.y = sc.rotationY; body.castShadow = true; body.name = 'Farm_Scarecrow'; group.add(body); D.push(bodyG);
  const armG = merge([box(2.3, 0.3, 0.3, 0x4a6fa5, 1.15, 0, 0), ball(0.3, 0, 0xd8c070, 2.45, 0, 0, 1.4, 1, 1)]); D.push(armG);
  const arms = [1, -1].map(sx => { const a = new THREE.Mesh(armG, prop); a.position.set(0, 3.6, 0); a.scale.x = sx; a.castShadow = true; body.add(a); return [a, sx]; });
  animated.push(t => { for (const [a, sx] of arms) a.rotation.z = sx * (0.12 * Math.sin(t * 2.4 + sx) + 0.06 * Math.sin(t * 5.1)); body.rotation.z = 0.03 * Math.sin(t * 1.3); });
}

// ---------- the Duck Pond and its broken bridge
function buildPond(group, D, animated) {
  const pond = T.pond, c = T.chasms[0], waterY = pond.y - pond.waterDrop, o = new THREE.Object3D(), r = rng(29);
  o.rotation.order = 'YXZ';
  const wg = new THREE.CircleGeometry(pond.radius + 0.6, 28).rotateX(-Math.PI / 2), wm = new THREE.MeshStandardMaterial({ color: 0x3f9fc0, roughness: 0.1, transparent: true, opacity: 0.86 });
  const water = new THREE.Mesh(wg, wm); water.position.set(pond.x, waterY, pond.z); water.name = 'Farm_PondWater'; water.renderOrder = 2; group.add(water); D.push(wg, wm);
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }); D.push(prop);
  // reeds round the edge, lily pads on the water, ducks paddling about
  const reedG = merge([cone(0.09, 2.6, 4, 0x6f9a2c, 0, 1.3, 0), cone(0.08, 2.2, 4, 0x82a83a, 0.22, 1.1, 0.1), cone(0.08, 2.0, 4, 0x5c8f24, -0.18, 1.0, -0.14), cyl(0.09, 0.09, 0.5, 5, 0x5a3a22, 0, 2.5, 0)]);
  const reeds = []; for (let k = 0; k < 44; k++) { const a = r() * 6.28, d = pond.radius - 1.2 + r() * 2.4, x = pond.x + Math.cos(a) * d, z = pond.z + Math.sin(a) * d; if (T.query(x, z).distance < 6.5) continue; reeds.push([x, Math.max(ground(x, z), waterY - 0.3), z, r() * 6.28, 0.8 + r() * 0.7]); }
  const reedM = new THREE.InstancedMesh(reedG, prop, reeds.length); reeds.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(0, p[3], 0); o.scale.setScalar(p[4]); o.updateMatrix(); reedM.setMatrixAt(k, o.matrix); }); reedM.name = 'Farm_Reeds'; group.add(reedM); D.push(reedG, reedM);
  const padG = paint(new THREE.CircleGeometry(0.7, 9, 0.4, 5.6).rotateX(-Math.PI / 2), 0x3f8a3a), pads = [];
  for (let k = 0; k < 16; k++) { const a = r() * 6.28, d = 3 + r() * (pond.radius - 5), x = pond.x + Math.cos(a) * d, z = pond.z + Math.sin(a) * d; if (T.query(x, z).distance < 5.5) continue; pads.push([x, z, r() * 6.28, 0.7 + r() * 0.8]); }
  const padM = new THREE.InstancedMesh(padG, prop, pads.length); pads.forEach((p, k) => { o.position.set(p[0], waterY + 0.04, p[1]); o.rotation.set(0, p[2], 0); o.scale.setScalar(p[3]); o.updateMatrix(); padM.setMatrixAt(k, o.matrix); }); padM.name = 'Farm_LilyPads'; group.add(padM); D.push(padG, padM);
  const duckG = duckGeometry(); D.push(duckG);
  const ducks = Array.from({ length: 6 }, (_, k) => { const m = new THREE.Mesh(duckG, prop); m.name = 'Farm_Duck'; group.add(m); return { m, rad: 4 + r() * 5, sp: (0.16 + r() * 0.14) * (k % 2 ? 1 : -1), ph: r() * 6.28, side: k % 2 ? 1 : -1 }; });
  animated.push(t => {
    wm.opacity = 0.84 + 0.04 * Math.sin(t * 1.3);
    for (const d of ducks) {                     // each keeps to its own half of the pond, clear of the bridge
      const a = d.ph + t * d.sp, fx = Math.sin(pond.rotationY), fz = Math.cos(pond.rotationY), sx = Math.cos(pond.rotationY), sz = -Math.sin(pond.rotationY);
      const along = Math.cos(a) * d.rad * 0.8, across = d.side * (5.6 + (0.5 + 0.5 * Math.sin(a)) * (pond.radius - 8));
      d.m.position.set(pond.x + fx * along + sx * across, waterY + 0.05 + 0.05 * Math.sin(t * 2 + d.ph), pond.z + fz * along + sz * across);
      d.m.rotation.y = Math.atan2(fx * -Math.sin(a) * d.sp + sx * Math.cos(a) * d.sp * d.side * 0.4, fz * -Math.sin(a) * d.sp + sz * Math.cos(a) * d.sp * d.side * 0.4);
    }
  });

  // the bridge: planks reaching in from both banks, rails, legs in the water, red flagged posts at the break
  const planks = [], posts = [], rails = [], legs = [], flags = [];
  for (const [from, to, towardsBreak] of [[c.ravineStart, c.gapStart, 1], [c.gapEnd, c.ravineEnd, -1]]) {
    const n = Math.max(1, Math.round((to - from) / 0.8));
    for (let k = 0; k < n; k++) { const s = from + (k + 0.5) * (to - from) / n, fromBreak = towardsBreak > 0 ? to - s : s - from; planks.push({ p: T.pointAt(s), sag: Math.max(0, 1 - fromBreak / 1.4), dir: towardsBreak }); }
    const count = Math.max(2, Math.round((to - from) / 2.4) + 1);
    for (const side of [-1, 1]) {
      let last = null;
      for (let k = 0; k < count; k++) {
        const s = from + (to - from) * k / (count - 1), q = T.pointAt(s, side * (T.pointAt(s).halfWidth + 0.1)), atBreak = towardsBreak > 0 ? k === count - 1 : k === 0;
        posts.push({ q, tall: atBreak }); if (atBreak) flags.push({ q, phase: r() * 6.28 });
        if (last) for (const h of [0.6, 1.15]) rails.push({ a: last, b: q, h });
        last = q;
      }
    }
    for (const s of [towardsBreak > 0 ? to - 0.5 : from + 0.5, (from + to) / 2]) for (const side of [-1, 1]) { const q = T.pointAt(s, side * (T.pointAt(s).halfWidth - 0.4)), gy = ground(q.x, q.z); if (q.y - gy > 0.6) legs.push({ q, height: q.y - gy + 0.6 }); }
  }
  const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }), ic = new THREE.Color(); D.push(wood);
  const inst = (name, geo, list, placeOne, shadow = false) => { const m = new THREE.InstancedMesh(geo, wood, list.length); list.forEach((item, k) => { o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); placeOne(item); o.updateMatrix(); m.setMatrixAt(k, o.matrix); m.setColorAt(k, ic); }); m.name = name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); D.push(geo, m); };
  inst('Farm_BridgePlanks', new THREE.BoxGeometry(1, 0.12, 0.74), planks, ({ p, sag, dir }) => { o.position.set(p.x, p.y + 0.07 - sag * sag * 0.5, p.z); o.rotation.set(dir * sag * 0.55, p.rotationY + (r() - 0.5) * 0.03, (r() - 0.5) * 0.02 * (1 + 6 * sag)); o.scale.set(p.halfWidth * 2 + 0.3, 1, 1); const v = 0.6 + r() * 0.22; ic.setRGB(v * 1.12, v * 0.86, v * 0.56); }, true);
  inst('Farm_BridgePosts', new THREE.CylinderGeometry(0.1, 0.12, 1, 6), posts, ({ q, tall }) => { const h = tall ? 3.6 : 1.35; o.position.set(q.x, q.y + h / 2 - 0.1, q.z); o.scale.set(tall ? 1.5 : 1, h, tall ? 1.5 : 1); if (tall) ic.setRGB(0.85, 0.2, 0.16); else ic.setRGB(0.5, 0.38, 0.25); }, true);
  inst('Farm_BridgeRails', new THREE.BoxGeometry(0.08, 0.08, 1), rails, ({ a, b, h }) => { o.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + h, (a.z + b.z) / 2); o.lookAt(b.x, b.y + h, b.z); o.scale.set(1, 1, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)); ic.setRGB(0.78, 0.68, 0.48); });
  inst('Farm_BridgeLegs', new THREE.CylinderGeometry(0.2, 0.26, 1, 7), legs, ({ q, height }) => { o.position.set(q.x, q.y - height / 2, q.z); o.scale.set(1, height, 1); ic.setRGB(0.42, 0.32, 0.22); }, true);
  const flagG = new THREE.BufferGeometry(); flagG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.9, 0, 0, -0.45, -1.4], 3)); flagG.computeVertexNormals();
  const flagM = new THREE.MeshBasicMaterial({ color: 0xe5352b, side: THREE.DoubleSide }); D.push(flagG, flagM);
  const flying = flags.map(f => { const flag = new THREE.Mesh(flagG, flagM); flag.position.set(f.q.x, f.q.y + 3.45, f.q.z); group.add(flag); return { flag, yaw: f.q.rotationY, phase: f.phase }; });
  animated.push(t => { for (const f of flying) f.flag.rotation.y = f.yaw + 0.35 * Math.sin(t * 3.1 + f.phase) + 0.12 * Math.sin(t * 7.3 + f.phase); });
}

// ---------- warning signs on the way in to each hazard
function buildSigns(group, D) {
  const postG = new THREE.CylinderGeometry(0.12, 0.14, 3.0, 6), postM = new THREE.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.9 }), boardG = new THREE.PlaneGeometry(3.0, 1.5); D.push(postG, postM, boardG);
  const signs = [['JUMP!', T.chasms[0].ravineStart - 26, 1], ['BALES!', T.obstacles[0].s - 28, 1], ['SHEEP!', T.sheepLane.s - 30, 1], ['MIND THE SAILS', T.mill.s - 34, 1],
    ['TRACTOR!', T.tractorLane.s - 32, 1], ['MUD + PIGS', T.mud[0].s - 30, 1], ['MAIZE MAZE', T.sections.find(sec => sec.id === 'H').sStart - 14, 1], ['BALE HILL', T.baleRun.s - T.baleRun.spacing - 30, -1]];
  for (const [text, s, side] of signs) {
    const c = T.pointAt(s), p = beside(s, side * (c.halfWidth + 1.5)), tex = signTexture(text), mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); D.push(tex, mat);
    const post = new THREE.Mesh(postG, postM); post.position.set(p.x, p.y + 1.4, p.z); post.castShadow = true; group.add(post);
    const board = new THREE.Mesh(boardG, mat); board.position.set(p.x, p.y + 3.1, p.z); board.rotation.y = c.rotationY + Math.PI; board.name = 'Farm_Sign'; group.add(board);
  }
}

// ---------- trees, the orchard, sunflowers, grass and flowers (all instanced)
function buildNature(group, D) {
  const r = rng(17), o = new THREE.Object3D(), ic = new THREE.Color(), mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, side: THREE.DoubleSide }); D.push(mat);
  const clear = (x, z, margin) => T.query(x, z).distance > margin && Math.hypot(x - T.pond.x, z - T.pond.z) > T.pond.radius + 2;
  const add = (name, geo, list, placeOne, shadow = false) => { const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((p, k) => { o.rotation.set(0, 0, 0); placeOne(p, k); o.updateMatrix(); m.setMatrixAt(k, o.matrix); m.setColorAt(k, ic); }); m.name = name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); D.push(geo, m); };
  // big trees: along the far hedgerows and dotted about the fields
  const trees = []; let guard = 0;
  while (trees.length < 70 && guard++ < 4000) { const x = BOUNDS.x0 + 20 + r() * (BOUNDS.x1 - BOUNDS.x0 - 40), z = BOUNDS.z0 + 20 + r() * (BOUNDS.z1 - BOUNDS.z0 - 40), d = T.query(x, z).distance; if (d < 16 || (d < 60 && r() < 0.6) || !clear(x, z, 16)) continue; trees.push([x, ground(x, z), z, 1 + r() * 0.9]); }
  for (let k = 0; k < 46; k++) { const a = k / 46 * 6.28, x = -35 + Math.cos(a) * (400 + r() * 30), z = -35 + Math.sin(a) * (345 + r() * 25); trees.push([x, T.naturalHeight(x, z), z, 1.3 + r() * 0.9]); }
  add('Farm_TreeTrunks', new THREE.CylinderGeometry(0.4, 0.6, 4, 5, 1, true).translate(0, 2, 0), trees, p => { o.position.set(p[0], p[1], p[2]); o.scale.set(p[3], p[3], p[3]); ic.setRGB(0.42, 0.30, 0.2); }, true);
  add('Farm_TreeCrowns', new THREE.IcosahedronGeometry(1, 1), trees.slice(0, 70), p => { const s = p[3]; o.position.set(p[0], p[1] + 6.2 * s, p[2]); o.rotation.set(0, r() * 6.28, 0); o.scale.set(3.4 * s, 3.0 * s, 3.4 * s); ic.setRGB(0.20 + r() * 0.1, 0.44 + r() * 0.14, 0.14 + r() * 0.06); }, true);
  add('Farm_FarTreeCrowns', new THREE.IcosahedronGeometry(1, 0), trees.slice(70), p => { const s = p[3]; o.position.set(p[0], p[1] + 6.2 * s, p[2]); o.rotation.set(r(), r() * 6.28, r()); o.scale.set(3.6 * s, 3.2 * s, 3.6 * s); ic.setRGB(0.20 + r() * 0.1, 0.44 + r() * 0.14, 0.14 + r() * 0.06); }, true);
  // the orchard: rows of apple trees either side of the road through sections C and D
  const orchard = [], apples = [];
  for (let s = T.sAtU(5.3); s < T.sAtU(7.9); s += 9) for (const side of [1, -1]) for (const row of [0, 1, 2]) {
    if (Math.abs(lapGap(s, T.sheepLane.s)) < 9) continue;
    const p = beside(s + row * 3, side * (T.pointAt(s).halfWidth + 7 + row * 8)); orchard.push([p.x, p.y, p.z, 0.85 + r() * 0.3]);
    for (let k = 0; k < 3; k++) { const a = r() * 6.28, e = r() * 1.2 - 0.3; apples.push([p.x + Math.cos(a) * 2.0 * Math.cos(e), p.y + 4.0 + Math.sin(e) * 1.6, p.z + Math.sin(a) * 2.0 * Math.cos(e)]); }
  }
  add('Farm_OrchardTrunks', new THREE.CylinderGeometry(0.28, 0.4, 2.6, 5, 1, true).translate(0, 1.3, 0), orchard, p => { o.position.set(p[0], p[1], p[2]); o.scale.setScalar(p[3]); ic.setRGB(0.40, 0.28, 0.18); }, true);
  add('Farm_OrchardCrowns', new THREE.IcosahedronGeometry(1, 0), orchard, p => { o.position.set(p[0], p[1] + 4.0 * p[3], p[2]); o.rotation.set(r(), r() * 6.28, r()); o.scale.set(2.3 * p[3], 1.9 * p[3], 2.3 * p[3]); ic.setRGB(0.30 + r() * 0.08, 0.58 + r() * 0.1, 0.20); }, true);
  add('Farm_Apples', new THREE.OctahedronGeometry(0.2, 0), apples, p => { o.position.set(p[0], p[1], p[2]); o.scale.setScalar(1); ic.setRGB(0.86, 0.14 + r() * 0.1, 0.12); });
  // a field of sunflowers behind the farmyard
  const sun = []; for (let k = 0; k < 110; k++) { const p = beside(T.sAtU(0.3) + r() * 150, -(26 + r() * 34)); sun.push([p.x, p.y, p.z, 0.8 + r() * 0.5, r() * 0.5 - 0.25]); }
  add('Farm_SunflowerStems', new THREE.CylinderGeometry(0.06, 0.08, 2.6, 3, 1, true).translate(0, 1.3, 0), sun, p => { o.position.set(p[0], p[1], p[2]); o.scale.setScalar(p[3]); ic.setRGB(0.32, 0.56, 0.18); });
  add('Farm_SunflowerHeads', new THREE.CylinderGeometry(0.5, 0.5, 0.1, 6).rotateX(Math.PI / 2 - 0.3).translate(0, 2.7, 0.1), sun, p => { o.position.set(p[0], p[1], p[2]); o.rotation.set(0, 2.4 + p[4], 0); o.scale.setScalar(p[3]); ic.setRGB(0.98, 0.80, 0.12); });
  add('Farm_SunflowerHearts', new THREE.CylinderGeometry(0.24, 0.24, 0.14, 5).rotateX(Math.PI / 2 - 0.3).translate(0, 2.7, 0.13), sun, p => { o.position.set(p[0], p[1], p[2]); o.rotation.set(0, 2.4 + p[4], 0); o.scale.setScalar(p[3]); ic.setRGB(0.36, 0.22, 0.1); });
  // grass tufts and wildflowers along the verges and through the fields
  const blades = []; for (let k = 0; k < 3; k++) { const a = k / 3 * 6.28; blades.push(new THREE.ConeGeometry(0.1, 0.9, 3, 1, true).translate(0, 0.45, 0).rotateZ(0.3).rotateY(a).translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12)); }
  const tuft = mergeGeometries(blades); blades.forEach(bl => bl.dispose());
  const near = (count, min, max) => { const out = []; let tries = 0; while (out.length < count && tries++ < count * 30) { const i = Math.floor(r() * N), sec = S.section[i]; if (sec === 'H' || sec === 'B') continue; const side = r() < 0.5 ? 1 : -1, lat = side * (S.width[i] / 2 + T.verge[sec] + min + r() * (max - min)), x = S.x[i] + S.normalX[i] * lat, z = S.z[i] + S.normalZ[i] * lat; if (!clear(x, z, S.width[i] / 2 + T.verge[sec] + 0.8)) continue; out.push([x, ground(x, z), z]); } return out; };
  add('Farm_Grass', tuft, near(720, 0.8, 34), p => { const s = 0.9 + r() * 1.4; o.position.set(p[0], p[1] - 0.05, p[2]); o.rotation.set(0, r() * 6.28, 0); o.scale.set(s, s * (0.8 + r() * 0.6), s); ic.setRGB(0.30 + r() * 0.16, 0.56 + r() * 0.18, 0.16 + r() * 0.08); });
  const palette = [[1, 0.86, 0.2], [0.98, 0.5, 0.72], [1, 1, 1], [0.66, 0.45, 0.92], [0.95, 0.3, 0.25]];
  add('Farm_Wildflowers', new THREE.OctahedronGeometry(0.17, 0).translate(0, 0.45, 0), near(520, 0.6, 20), p => { const s = 0.8 + r() * 0.9; o.position.set(p[0], p[1], p[2]); o.rotation.set(0, r() * 6.28, 0); o.scale.setScalar(s); const c = palette[Math.floor(r() * palette.length)]; ic.setRGB(c[0], c[1], c[2]); });
}

// ---------- sky, clouds, crows over the maize
function buildSky(group, D, animated) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: SUN_DIRECTION } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 c = mix(vec3(0.80, 0.91, 1.0), vec3(0.24, 0.54, 0.95), pow(h, 0.5));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.95, 0.8) * (pow(s, 24.0) * 0.35 + smoothstep(0.9993, 0.9997, s) * 3.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sg = new THREE.SphereGeometry(6500, 24, 12), sky = new THREE.Mesh(sg, mat); sky.name = 'Farm_Sky'; sky.frustumCulled = false; sky.renderOrder = -10; group.add(sky); D.push(sg, mat);
  const r = rng(77), o = new THREE.Object3D(), cg = new THREE.IcosahedronGeometry(1, 1), cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xaab8cc, emissiveIntensity: 0.55, fog: false, flatShading: true });
  const puffs = [];
  for (let k = 0; k < 15; k++) { const a = r() * 6.28, d = 500 + r() * 3200, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 330 + r() * 300, size = 70 + r() * 130; for (let p = 0; p < 3; p++) puffs.push([cx + (r() - 0.5) * size * 2.2, cy + (r() - 0.5) * size * 0.2, cz + (r() - 0.5) * size * 1.2, size * (0.5 + r() * 0.6)]); }
  const clouds = new THREE.InstancedMesh(cg, cm, puffs.length);
  puffs.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.scale.set(p[3], p[3] * 0.36, p[3] * 0.8); o.updateMatrix(); clouds.setMatrixAt(k, o.matrix); });
  clouds.name = 'Farm_Clouds'; clouds.frustumCulled = false; group.add(clouds); D.push(cg, cm, clouds);
  // crows wheeling over the maize
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, 0, 0, -0.3, 1.5, 0.08, -0.08], 3)); wing.computeVertexNormals();
  const bm = new THREE.MeshBasicMaterial({ color: 0x18181c, side: THREE.DoubleSide }), body = new THREE.SphereGeometry(0.2, 6, 5).scale(1, 0.8, 2.4), maize = T.pointAt(T.sAtU(16)), crows = [];
  for (let k = 0; k < 9; k++) { const b = new THREE.Group(), l = new THREE.Mesh(wing, bm), rr = new THREE.Mesh(wing, bm); rr.scale.x = -1; b.add(l, rr, new THREE.Mesh(body, bm)); b.scale.setScalar(1.2 + r() * 0.6); group.add(b); crows.push({ b, l, rr, cx: maize.x + (r() - 0.5) * 120, cz: maize.z + (r() - 0.5) * 160, rad: 18 + r() * 40, y: 14 + r() * 22, sp: (0.2 + r() * 0.2) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28 }); }
  D.push(wing, bm, body);
  animated.push(t => { for (const q of crows) { const a = q.ph + t * q.sp; q.b.position.set(q.cx + Math.cos(a) * q.rad, q.y + Math.sin(t * 0.5 + q.ph) * 2, q.cz + Math.sin(a) * q.rad); q.b.rotation.y = -a + (q.sp > 0 ? 0 : Math.PI); const f = Math.sin(t * 7 + q.ph) * 0.6; q.l.rotation.z = f; q.rr.rotation.z = -f; } });
}

/** Build the whole farm. */
export function createFarm() {
  const group = new THREE.Group(); group.name = 'MuddyPawsFarm';
  const D = [], animated = [], movers = {};
  buildSky(group, D, animated); buildTerrain(group, D); buildTrail(group, D); buildFences(group, D); buildBuildings(group, D, animated);
  buildWindmill(group, D, movers); buildHay(group, D, movers); buildAnimals(group, D, movers, animated); buildMaize(group, D, animated); buildPond(group, D, animated);
  buildSigns(group, D); buildNature(group, D);
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0xb9c98a, 1.05), sun = new THREE.DirectionalLight(0xfff1d6, 3.3);
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  const lights = new THREE.Group(); lights.name = 'Farm_Lights'; lights.add(hemi, sun, sun.target); group.add(lights);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(300);
  const placeHazards = raceSeconds => { for (const h of T.hazardsAt(raceSeconds)) movers[h.id]?.(h); };
  placeHazards(0);
  return {
    group, track: T, sun,
    /** t = seconds (cosmetic).  focus = {x,y,z} of the dog to light and for the chickens to run from.  raceSeconds = time since GO. */
    update(t, focus, raceSeconds = 0) {
      for (const f of animated) f(t, focus);
      placeHazards(raceSeconds);
      if (focus) { sun.target.position.set(focus.x, focus.y, focus.z); sun.position.set(focus.x, focus.y, focus.z).addScaledVector(SUN_DIRECTION, 300); }
    },
    /** how many triangles the whole farm is (instances counted) */
    triangles() { let n = 0; group.traverse(m => { if (!m.isMesh) return; const g = m.geometry, tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3; n += tris * (m.isInstancedMesh ? m.count : 1); }); return Math.round(n); },
    /** Summer daylight: fog, tone mapping, optional sun shadows.  Returns a function that undoes it. */
    applyEnvironment(scene, renderer, { shadows = true } = {}) {
      const prev = { fog: scene.fog, bg: scene.background, tm: renderer?.toneMapping, ex: renderer?.toneMappingExposure, sh: renderer?.shadowMap.enabled };
      scene.fog = new THREE.Fog(0xcfe6fa, 700, 6000); scene.background = new THREE.Color(0x9ccbf5);
      if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85; if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; sun.castShadow = true; } }
      return () => { scene.fog = prev.fog; scene.background = prev.bg; if (renderer) { renderer.toneMapping = prev.tm; renderer.toneMappingExposure = prev.ex; renderer.shadowMap.enabled = prev.sh; } };
    },
    dispose() { for (const d of D) d.dispose?.(); },
  };
}
