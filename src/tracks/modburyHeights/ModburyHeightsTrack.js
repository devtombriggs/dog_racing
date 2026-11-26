// Modbury Heights — Three.js visuals: terrain, trail, ravine bridges, sea, foam, boardwalk, rocks, plants, gulls, sky.
// Everything is generated at runtime from modburyData.js (no model files).
//
//   const world = createModburyHeights();
//   scene.add(world.group);
//   const restore = world.applyEnvironment(scene, renderer);
//   each frame: world.update(elapsedSeconds, leadDogPosition);   // waves, foam, gulls, shadow box
//   leaving the map: restore(); scene.remove(world.group); world.dispose();
//
// Gameplay never reads these meshes: use MODBURY_HEIGHTS.query() for ground, water, edges and falls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODBURY_HEIGHTS as T, fbm } from '../../../shared/modburyData.js';

const S = T.samples, N = T.sampleCount;
export const SUN_DIRECTION = new THREE.Vector3(0.38, 0.80, 0.46).normalize();
const BOUNDS = { x0: -820, x1: 540, z0: -600, z1: 228, step: 4 };       // (z1: out past the Seabed Tunnel, which goes 175 m out to sea)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const C = { sandDry: [0.93, 0.80, 0.54], sandWet: [0.76, 0.64, 0.43], sandSub: [0.86, 0.80, 0.58], grassA: [0.24, 0.52, 0.14], grassB: [0.42, 0.64, 0.20],
  rock: [0.58, 0.54, 0.48], rockDark: [0.42, 0.39, 0.36], firm: [0.62, 0.50, 0.33], dirt: [0.50, 0.35, 0.21], gravel: [0.66, 0.60, 0.50] };

function groundColor(x, z, h, ny) {
  const n = fbm(x / 30, z / 30, 3), n2 = fbm(x / 9 + 40, z / 9, 2);
  let c = h < 0.45 ? mix(C.sandSub, C.sandWet, sstep(-0.9, 0.45, h)) : mix(C.sandWet, C.sandDry, sstep(0.45, 1.4, h));
  c = mix(c, mix(C.grassA, C.grassB, 0.5 + 0.5 * n2), sstep(3.0, 5.6, h + n * 1.4));
  c = mix(c, mix(C.rockDark, C.rock, 0.5 + 0.5 * n2), sstep(0.82, 0.62, ny) * sstep(1.2, 3.2, h));
  const v = 1 + 0.06 * n; return [c[0] * v, c[1] * v, c[2] * v];
}

function noiseTexture(size, lo, hi, scale, speck = 0) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), im = g.createImageData(size, size), r = rng(size + scale);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * scale, w = y / size * scale;      // tile by cross-fading the four wrapped copies
    const fx = x / size, fy = y / size, a = fbm(u, w, 4), b = fbm(u - scale, w, 4), cc = fbm(u, w - scale, 4), d = fbm(u - scale, w - scale, 4);
    let v = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
    v = lo + (hi - lo) * (0.5 + 0.5 * v) - (r() < speck ? 0.12 : 0);
    const i = (y * size + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.max(0, Math.min(255, v * 255)); im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// ---------- terrain
function buildTerrain(group, D) {
  const { x0, x1, z0, z1, step } = BOUNDS, nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = T.terrainHeight(x, z); pos[k * 3 + 2] = z; uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const nrm = g.getAttribute('normal'), col = new Float32Array(nx * nz * 3);
  for (let k = 0; k < nx * nz; k++) { const c = groundColor(pos[k * 3], pos[k * 3 + 2], pos[k * 3 + 1], nrm.getY(k)); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tex = noiseTexture(256, 0.82, 1.0, 8, 0.02), mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95 });
  const m = new THREE.Mesh(g, mat); m.name = 'Modbury_Terrain'; m.receiveShadow = true; group.add(m); D.push(g, mat, tex);

  // the wider landscape, coarse: same hills, cliffs and coast continuing out of the playable area
  const fs = 60, fx0 = -3400, fx1 = 3100, fz0 = -3200, fz1 = 232, fnx = Math.round((fx1 - fx0) / fs) + 1, fnz = Math.round((fz1 - fz0) / fs) + 1;
  const fp = new Float32Array(fnx * fnz * 3), fi = [];
  for (let j = 0; j < fnz; j++) for (let i = 0; i < fnx; i++) {
    const x = fx0 + i * fs, z = fz0 + j * fs, k = j * fnx + i, inside = x > x0 + 8 && x < x1 - 8 && z > z0 + 8 && z < z1 - 8;
    fp[k * 3] = x; fp[k * 3 + 1] = T.naturalHeight(x, z) - (inside ? 14 : 1.5) + 60 * sstep(-900, -3000, z) * (0.5 + 0.5 * fbm(x / 700, z / 700, 3)); fp[k * 3 + 2] = z;
  }
  for (let j = 0; j < fnz - 1; j++) for (let i = 0; i < fnx - 1; i++) { const a = j * fnx + i, b = a + 1, c = a + fnx, d = c + 1; fi.push(a, c, b, b, c, d); }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setIndex(fi); fg.computeVertexNormals();
  const fn = fg.getAttribute('normal'), fc = new Float32Array(fnx * fnz * 3);
  for (let k = 0; k < fnx * fnz; k++) { const c = groundColor(fp[k * 3], fp[k * 3 + 2], fp[k * 3 + 1] + 1.5, fn.getY(k)); fc[k * 3] = c[0]; fc[k * 3 + 1] = c[1]; fc[k * 3 + 2] = c[2]; }
  fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const fm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), far = new THREE.Mesh(fg, fm); far.name = 'Modbury_FarLand'; group.add(far); D.push(fg, fm);
}

// ---------- the trail, cut into the terrain
function buildTrail(group, D) {
  const secCol = { A: C.firm, F: C.firm, E: C.firm, B: C.dirt, D: C.dirt, C: C.gravel, T: [0.50, 0.56, 0.62] };       // (T: the tunnel's floor)
  const raw = S.section.map(s => secCol[s]), cols = [];
  for (let i = 0; i < N; i++) { let c = [0, 0, 0]; for (let k = -8; k <= 8; k++) { const r = raw[(i + k + N) % N]; c = [c[0] + r[0] / 17, c[1] + r[1] / 17, c[2] + r[2] / 17]; } cols.push(c); }
  const pos = [], col = [], uv = [], idx = [], K = 7, vRep = Math.round(T.length / 6) / T.length;
  for (let r = 0; r <= N; r++) {
    const i = r % N, hw = S.width[i] / 2, lat = [-hw - 1.9, -hw, -hw * 0.5, 0, hw * 0.5, hw, hw + 1.9], dy = [-0.55, 0, 0.03, 0.04, 0.03, 0, -0.55];
    const wetK = S.section[i] === 'T' ? 0 : sstep(0.5, -0.2, S.y[i]), base = mix(cols[i], C.sandSub, wetK * 0.6);       // (the tunnel is dry)
    for (let k = 0; k < K; k++) {
      const x = S.x[i] + S.normalX[i] * lat[k], z = S.z[i] + S.normalZ[i] * lat[k];
      const edge = k === 0 || k === K - 1, c = edge ? groundColor(x, z, S.y[i], 1) : (k === 1 || k === K - 2 ? mix(base, groundColor(x, z, S.y[i], 1), 0.35) : base);
      pos.push(x, S.y[i] + dy[k], z); col.push(c[0], c[1], c[2]); uv.push(lat[k] / 6, (r === N ? T.length : S.s[i]) * vRep);
    }
  }
  for (let r = 0; r < N; r++) {
    if (T.chasms.some(c => r >= c.firstIndex && r < c.lastIndex)) continue;      // the trail stops at a ravine: a bridge carries on
    for (let k = 0; k < K - 1; k++) { const a = r * K + k, b = a + 1, c = a + K, d = c + 1; idx.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  let up = 0; const nn = g.getAttribute('normal'); for (let i = 3; i < nn.count; i += 7) up += nn.getY(i);
  if (up < 0) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.computeVertexNormals(); }
  const tex = noiseTexture(256, 0.80, 1.0, 16, 0.06), mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.9 });
  const m = new THREE.Mesh(g, mat); m.name = 'Modbury_Trail'; m.receiveShadow = true; group.add(m); D.push(g, mat, tex);

  // boardwalk planks over the dunes (section F)
  const b0 = T.boardwalk.firstIndex, b1 = T.boardwalk.lastIndex, per = 4, count = (b1 - b0) * per;
  const pg = new THREE.BoxGeometry(1, 0.09, 0.44), pm = new THREE.MeshStandardMaterial({ color: 0xb48a58, roughness: 0.85 }), planks = new THREE.InstancedMesh(pg, pm, count), o = new THREE.Object3D(), r = rng(3), ic = new THREE.Color();
  for (let n = 0; n < count; n++) {
    const i = b0 + Math.floor(n / per), t = (n % per) / per, k = i + 1;
    o.position.set(S.x[i] + (S.x[k] - S.x[i]) * t, S.y[i] + (S.y[k] - S.y[i]) * t + 0.07, S.z[i] + (S.z[k] - S.z[i]) * t);
    o.rotation.set(0, Math.atan2(S.tangentX[i], S.tangentZ[i]) + (r() - 0.5) * 0.02, 0); o.scale.set(S.width[i] + 0.3, 1, 1); o.updateMatrix(); planks.setMatrixAt(n, o.matrix);
    planks.setColorAt(n, ic.setScalar(0.82 + r() * 0.3));
  }
  planks.name = 'Modbury_Boardwalk'; planks.receiveShadow = true; group.add(planks); D.push(pg, pm, planks);

  // start/finish: chequered line and a driftwood gate
  const cc = document.createElement('canvas'); cc.width = 256; cc.height = 32; const cg = cc.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { cg.fillStyle = (x + y) % 2 ? '#111' : '#fff'; cg.fillRect(x * 16, y * 16, 16, 16); }
  const ct = new THREE.CanvasTexture(cc); ct.magFilter = THREE.NearestFilter; ct.colorSpace = THREE.SRGBColorSpace;
  const hw0 = T.startFinish.halfWidth, holder = new THREE.Group(); holder.position.set(...T.startFinish.position); holder.rotation.y = T.startFinish.rotationY;
  const lg = new THREE.PlaneGeometry(hw0 * 2, 1.6), lm = new THREE.MeshBasicMaterial({ map: ct, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const line = new THREE.Mesh(lg, lm); line.rotation.x = -Math.PI / 2; line.position.y = 0.06; line.name = 'Modbury_StartFinishLine'; holder.add(line);
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.9 }), postG = new THREE.CylinderGeometry(0.28, 0.34, 7.4, 8), beamG = new THREE.BoxGeometry(hw0 * 2 + 3.4, 0.5, 0.5), banG = new THREE.PlaneGeometry(hw0 * 2 + 2, 1.5);
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(postG, wood); p.position.set(sx * (hw0 + 1.4), 3.2, 0); p.castShadow = true; holder.add(p); }
  const beam = new THREE.Mesh(beamG, wood); beam.position.y = 6.8; holder.add(beam);
  const ban = new THREE.Mesh(banG, new THREE.MeshBasicMaterial({ map: ct, side: THREE.DoubleSide })); ban.position.y = 5.75; holder.add(ban);
  group.add(holder); D.push(ct, lg, lm, wood, postG, beamG, banG, ban.material);

  // red-and-white poles marking the route through the water
  const wc = T.waterCrossing, poleG = new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), poleM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const ids = []; for (let i = wc.firstIndex - 10; i <= wc.lastIndex + 10; i += 6) ids.push(i);
  for (let i = 0; i < N; i += 14) if ('AFE'.includes(S.section[i]) && !S.boardwalk[i] && (i < wc.firstIndex - 12 || i > wc.lastIndex + 12)) ids.push(i);
  const poles = new THREE.InstancedMesh(poleG, poleM, ids.length * 2); let pn = 0;
  for (const i of ids) for (const sd of [-1, 1]) {
    const l = sd * (S.width[i] / 2 + 0.6); o.position.set(S.x[i] + S.normalX[i] * l, Math.max(0, S.y[i]) + 0.7, S.z[i] + S.normalZ[i] * l); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix();
    poles.setMatrixAt(pn, o.matrix); poles.setColorAt(pn, ic.set((Math.floor(i / 6) + (sd > 0 ? 1 : 0)) % 2 ? 0xd9372b : 0xffffff)); pn++;
  }
  poles.name = 'Modbury_WaterMarkers'; group.add(poles); D.push(poleG, poleM, poles);
}

// ---------- the ravine bridges: plank decks reaching in from both sides of each ravine, with the middle missing
function buildBridges(group, D, animated) {
  const o = new THREE.Object3D(), ic = new THREE.Color(), r = rng(29);
  o.rotation.order = 'YXZ';
  const planks = [], posts = [], rails = [], legs = [], flags = [];
  for (const c of T.chasms) {
    for (const [from, to, towardsBreak] of [[c.ravineStart, c.gapStart, 1], [c.gapEnd, c.ravineEnd, -1]]) {
      const n = Math.max(1, Math.round((to - from) / 0.5));
      for (let k = 0; k < n; k++) {
        const s = from + (k + 0.5) * (to - from) / n, fromBreak = towardsBreak > 0 ? to - s : s - from;
        // the last planks before the break hang down into it
        planks.push({ p: T.pointAt(s), sag: Math.max(0, 1 - fromBreak / 1.3), dir: towardsBreak });
      }
      // rails both sides: a post every couple of metres, two ropes between them
      const count = Math.max(2, Math.round((to - from) / 2.2) + 1);
      for (const side of [-1, 1]) {
        let last = null;
        for (let k = 0; k < count; k++) {
          const p = T.pointAt(from + (to - from) * k / (count - 1), side * 1), hw = p.halfWidth;
          const q = T.pointAt(from + (to - from) * k / (count - 1), side * (hw + 0.1));
          const atBreak = towardsBreak > 0 ? k === count - 1 : k === 0;
          posts.push({ q, tall: atBreak });
          if (atBreak) flags.push({ q, yaw: q.rotationY, phase: r() * 6.28 });
          if (last) for (const h of [0.55, 1.1]) rails.push({ a: last, b: q, h });
          last = q;
        }
      }
      // legs down into the ravine under the broken end and half-way along each deck
      for (const s of [towardsBreak > 0 ? to - 0.5 : from + 0.5, (from + to) / 2]) for (const side of [-1, 1]) {
        const c0 = T.pointAt(s), q = T.pointAt(s, side * (c0.halfWidth - 0.4)), ground = T.terrainHeight(q.x, q.z);
        if (q.y - ground > 0.6) legs.push({ q, height: q.y - ground + 0.6 });
      }
    }
  }
  const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
  const instanced = (name, geo, list, place, shadow = false) => {
    const m = new THREE.InstancedMesh(geo, wood, list.length);
    list.forEach((item, k) => { o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); place(item); o.updateMatrix(); m.setMatrixAt(k, o.matrix); m.setColorAt(k, ic); });
    m.name = name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); D.push(geo, m);
  };
  D.push(wood);
  instanced('Modbury_BridgePlanks', new THREE.BoxGeometry(1, 0.1, 0.46), planks, ({ p, sag, dir }) => {
    o.position.set(p.x, p.y + 0.07 - sag * sag * 0.5, p.z); o.rotation.set(dir * sag * 0.55, p.rotationY + (r() - 0.5) * 0.03, (r() - 0.5) * 0.02 * (1 + 6 * sag));
    o.scale.set(p.halfWidth * 2 + 0.3, 1, 1); const v = 0.6 + r() * 0.22; ic.setRGB(v * 1.12, v * 0.86, v * 0.56);
  }, true);
  instanced('Modbury_BridgePosts', new THREE.CylinderGeometry(0.09, 0.11, 1, 7), posts, ({ q, tall }) => {
    const h = tall ? 3.4 : 1.25; o.position.set(q.x, q.y + h / 2 - 0.1, q.z); o.scale.set(tall ? 1.5 : 1, h, tall ? 1.5 : 1);
    tall ? ic.setRGB(0.85, 0.2, 0.16) : ic.setRGB(0.5, 0.38, 0.25);            // the posts at the break are red, like the water markers
  }, true);
  instanced('Modbury_BridgeRails', new THREE.BoxGeometry(0.07, 0.07, 1), rails, ({ a, b, h }) => {
    o.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + h, (a.z + b.z) / 2); o.lookAt(b.x, b.y + h, b.z); o.scale.set(1, 1, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    ic.setRGB(0.78, 0.68, 0.48);
  });
  instanced('Modbury_BridgeLegs', new THREE.CylinderGeometry(0.2, 0.26, 1, 8), legs, ({ q, height }) => {
    o.position.set(q.x, q.y - height / 2, q.z); o.scale.set(1, height, 1); ic.setRGB(0.42, 0.32, 0.22);
  }, true);

  // a red flag on each of the four posts at the break
  const flagG = new THREE.BufferGeometry(); flagG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.9, 0, 0, -0.45, -1.4], 3)); flagG.computeVertexNormals();
  const flagM = new THREE.MeshBasicMaterial({ color: 0xe5352b, side: THREE.DoubleSide });
  D.push(flagG, flagM);
  const flying = [];
  for (const f of flags) {
    const flag = new THREE.Mesh(flagG, flagM); flag.position.set(f.q.x, f.q.y + 3.25, f.q.z); flag.rotation.y = f.yaw; flag.name = 'Modbury_BridgeFlag'; group.add(flag);
    flying.push({ flag, yaw: f.yaw, phase: f.phase });
  }
  animated.push(t => { for (const f of flying) f.flag.rotation.y = f.yaw + 0.35 * Math.sin(t * 3.1 + f.phase) + 0.12 * Math.sin(t * 7.3 + f.phase); });
}

// ---------- sea
function buildSea(group, D, animated) {
  const x0 = -1500, x1 = 1200, z0 = -40, z1 = 760, cs = 12, nx = Math.round((x1 - x0) / cs) + 1, nz = Math.round((z1 - z0) / cs) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * cs, z = z0 + j * cs, c = mix([0.20, 0.86, 0.80], [0.04, 0.40, 0.66], sstep(0, 300, z - T.shorelineZ(x)));
    pos[k * 3] = x; pos[k * 3 + 2] = z; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; uv[k * 2] = x / 40; uv[k * 2 + 1] = z / 40;
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const bump = noiseTexture(256, 0.0, 1.0, 12);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.80, roughness: 0.14, metalness: 0.05, bumpMap: bump, bumpScale: 1.4 });
  cutForTunnel(mat);
  const sea = new THREE.Mesh(g, mat); sea.name = 'Modbury_Sea'; sea.renderOrder = 2; group.add(sea);
  const dg = new THREE.PlaneGeometry(26000, 26000).rotateX(-Math.PI / 2), dm = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.04, 0.40, 0.66), roughness: 0.2 });
  cutForTunnel(dm);
  const deep = new THREE.Mesh(dg, dm); deep.position.set(0, -0.5, 0); deep.name = 'Modbury_DeepSea'; group.add(deep);
  // foam where the gentle waves meet the sand
  const fp = [], fi = []; let n = 0;
  for (let x = -1400; x <= 1100; x += 6) { const z = T.shorelineZ(x); fp.push(x, 0.05, z - 1.6, x, 0.05, z + 1.6); if (n > 0) { const a = (n - 1) * 2; fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } n++; }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setIndex(fi);
  const fm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const foam = new THREE.Mesh(fg, fm); foam.name = 'Modbury_Foam'; foam.renderOrder = 3; group.add(foam);
  D.push(g, mat, bump, dg, dm, fg, fm);
  const pa = g.getAttribute('position');
  animated.push(t => {                                           // cheap swell: three sine waves on a 12 m grid
    for (let k = 0; k < pa.count; k++) {
      const x = pos[k * 3], z = pos[k * 3 + 2];
      pos[k * 3 + 1] = 0.10 * Math.sin(x * 0.045 + t * 0.9) + 0.08 * Math.sin(z * 0.07 - t * 1.1) + 0.05 * Math.sin((x + z) * 0.11 + t * 1.6);
    }
    pa.needsUpdate = true; bump.offset.set(t * 0.012, t * 0.02);
    foam.position.z = Math.sin(t * 0.7) * 1.5; fm.opacity = 0.42 + 0.22 * Math.sin(t * 0.7 + 1.2);
  });
}

// ---------- scattered nature (all instanced)
function buildNature(group, D) {
  const r = rng(11), o = new THREE.Object3D(), ic = new THREE.Color();
  const spots = (sections, count, minOff, maxOff, test) => {
    const out = []; let guard = 0;
    while (out.length < count && guard++ < count * 40) {
      const i = Math.floor(r() * N); if (!sections.includes(S.section[i])) continue;
      const sd = r() < 0.5 ? 0 : 1, sgn = sd === 0 ? 1 : -1; if (S.exposed[sd][i] && maxOff > 3) continue;       // nothing growing in mid-air past the cliff edge
      const lat = sgn * (S.width[i] / 2 + S.shoulder[sd][i] * (minOff < 0 ? 0 : 1) + Math.abs(minOff) + r() * (maxOff - Math.abs(minOff)));
      const x = S.x[i] + S.normalX[i] * lat, z = S.z[i] + S.normalZ[i] * lat, y = T.terrainHeight(x, z);
      if (T.query(x, z).distance < S.width[i] / 2 + 1.2) continue;                                            // never on the racing surface
      if (test && !test(x, y, z, i)) continue; out.push([x, y, z, i]);
    }
    return out;
  };
  const add = (name, geo, mat, list, place, shadow = false) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, k) => { place(p, k); o.updateMatrix(); m.setMatrixAt(k, o.matrix); m.setColorAt(k, ic); });
    m.name = name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); D.push(geo, mat, m);
  };
  // rocks: one lumpy boulder, varied by scale/rotation
  const rg = new THREE.IcosahedronGeometry(1, 1), rp = rg.getAttribute('position');
  for (let k = 0; k < rp.count; k++) { const x = rp.getX(k), y = rp.getY(k), z = rp.getZ(k), s = 0.78 + 0.34 * (0.5 + 0.5 * fbm(x * 1.3 + 5, y * 1.3 + z, 2)); rp.setXYZ(k, x * s, y * s * 0.8, z * s); }
  rg.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const rockList = [
    ...spots(['B', 'D'], 190, 1.2, 5, null).map(p => [...p, 0.6 + r() * 1.5]),
    ...spots(['C'], 70, 1.0, 26, (x, y, z, i) => y > S.y[i] - 6).map(p => [...p, 0.8 + r() * 3.2]),
    ...spots(['A', 'F', 'E'], 90, 3, 40, (x, y) => y > -0.4).map(p => [...p, 0.4 + r() * 1.6]),
    ...spots(['D', 'E'], 40, 4, 50, (x, y) => y > -1 && y < 12).map(p => [...p, 1.5 + r() * 3.5]),
  ];
  add('Modbury_Rocks', rg, rockMat, rockList, p => { const s = p[4]; o.position.set(p[0], p[1] + s * 0.15, p[2]); o.rotation.set(r() * 0.5, r() * 6.28, r() * 0.5); o.scale.set(s * (0.8 + r() * 0.5), s * (0.6 + r() * 0.5), s * (0.8 + r() * 0.5)); const v = 0.42 + r() * 0.22; ic.setRGB(v * 1.05, v, v * 0.93); }, true);
  // grass tufts
  const blades = []; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28, b = new THREE.ConeGeometry(0.07, 0.75, 3).translate(0, 0.37, 0).rotateZ(0.3).rotateY(a).translate(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1); blades.push(b); }
  const tg = mergeGeometries(blades); blades.forEach(b => b.dispose());
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const green = spots(['B', 'C', 'D'], 2400, 0.4, 34, (x, y, z, i) => y > S.y[i] - 8 && y > 4);
  add('Modbury_Grass', tg, tuftMat, green, p => { const s = 0.8 + r() * 1.3; o.position.set(p[0], p[1] - 0.05, p[2]); o.rotation.set(0, r() * 6.28, 0); o.scale.set(s, s * (0.8 + r() * 0.6), s); ic.setRGB(0.30 + r() * 0.2, 0.55 + r() * 0.2, 0.16 + r() * 0.1); });
  const dune = spots(['A', 'F', 'E'], 520, 2, 38, (x, y) => y > 1.9);
  add('Modbury_DuneGrass', tg.clone(), tuftMat, dune, p => { const s = 1.2 + r() * 1.4; o.position.set(p[0], p[1] - 0.05, p[2]); o.rotation.set(0, r() * 6.28, 0); o.scale.set(s, s * 1.3, s); ic.setRGB(0.62 + r() * 0.12, 0.66 + r() * 0.1, 0.34 + r() * 0.08); });
  // gorse / bramble bushes
  const bg = new THREE.IcosahedronGeometry(1, 1), bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const bushes = spots(['B', 'C', 'D', 'F'], 300, 1.5, 44, (x, y, z, i) => y > S.y[i] - 8 && y > 2.8);
  add('Modbury_Bushes', bg, bushMat, bushes, p => { const s = 0.7 + r() * 1.3; o.position.set(p[0], p[1] + s * 0.3, p[2]); o.rotation.set(0, r() * 6.28, 0); o.scale.set(s * (1 + r() * 0.6), s * 0.75, s * (1 + r() * 0.6)); r() < 0.3 ? ic.setRGB(0.80, 0.70, 0.16) : ic.setRGB(0.16 + r() * 0.1, 0.40 + r() * 0.14, 0.14); }, true);
  // wildflowers
  const fl = new THREE.OctahedronGeometry(0.16, 0).translate(0, 0.42, 0), flMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const palette = [[1, 0.86, 0.2], [0.98, 0.5, 0.72], [1, 1, 1], [0.66, 0.45, 0.92], [0.95, 0.3, 0.25]];
  const flowers = spots(['B', 'C', 'D'], 1700, 0.3, 16, (x, y, z, i) => y > S.y[i] - 3 && y > 4);
  add('Modbury_Wildflowers', fl, flMat, flowers, p => { const s = 0.8 + r() * 0.9; o.position.set(p[0], p[1], p[2]); o.rotation.set(0, r() * 6.28, 0); o.scale.setScalar(s); const c = palette[Math.floor(r() * palette.length)]; ic.setRGB(c[0], c[1], c[2]); });
  // rock pools in the cove
  const poolG = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), poolM = new THREE.MeshStandardMaterial({ color: 0x1f8f93, roughness: 0.08, transparent: true, opacity: 0.85 });
  const pools = spots(['E'], 7, 3, 9, (x, y) => y > 0.5 && y < 3);
  add('Modbury_RockPools', poolG, poolM, pools, p => { const s = 1.3 + r() * 1.6; o.position.set(p[0], p[1] + 0.06, p[2]); o.rotation.set(0, r() * 6.28, 0); o.scale.set(s, 1, s * (0.6 + r() * 0.5)); ic.setRGB(1, 1, 1); });
  const rim = []; pools.forEach(p => { for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + r(); rim.push([p[0] + Math.cos(a) * 2.6, p[1], p[2] + Math.sin(a) * 2.2]); } });
  add('Modbury_PoolRocks', rg.clone(), rockMat, rim, p => { const s = 0.35 + r() * 0.5; o.position.set(p[0], p[1] + 0.1, p[2]); o.rotation.set(r(), r() * 6.28, r()); o.scale.set(s, s * 0.7, s); const v = 0.36 + r() * 0.16; ic.setRGB(v, v, v); });
}

// ---------- sky, clouds, far coast, gulls
function buildSky(group, D, animated) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: SUN_DIRECTION } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 c = mix(vec3(0.74, 0.89, 1.0), vec3(0.20, 0.50, 0.93), pow(h, 0.55));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.95, 0.8) * (pow(s, 24.0) * 0.35 + smoothstep(0.9993, 0.9997, s) * 3.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sg = new THREE.SphereGeometry(9500, 32, 16), sky = new THREE.Mesh(sg, mat); sky.name = 'Modbury_Sky'; sky.frustumCulled = false; sky.renderOrder = -10; group.add(sky); D.push(sg, mat);
  const r = rng(77), o = new THREE.Object3D(), cg = new THREE.IcosahedronGeometry(1, 2), cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xaab8cc, emissiveIntensity: 0.55, fog: false });
  const puffs = [];
  for (let k = 0; k < 34; k++) { const a = r() * 6.28, d = 600 + r() * 5200, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 420 + r() * 380, size = 90 + r() * 170;
    for (let p = 0; p < 5 + r() * 4; p++) puffs.push([cx + (r() - 0.5) * size * 2.2, cy + (r() - 0.5) * size * 0.2, cz + (r() - 0.5) * size * 1.2, size * (0.5 + r() * 0.6)]); }
  const clouds = new THREE.InstancedMesh(cg, cm, puffs.length);
  puffs.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(0, 0, 0); o.scale.set(p[3], p[3] * 0.36, p[3] * 0.8); o.updateMatrix(); clouds.setMatrixAt(k, o.matrix); });
  clouds.name = 'Modbury_Clouds'; clouds.frustumCulled = false; group.add(clouds); D.push(cg, cm, clouds);
  // distant coastline across the water
  const parts = [];
  for (let k = 0; k < 46; k++) { const a = -0.25 + k / 45 * 3.6, d = 6500 + r() * 1800, h = 120 + r() * 260; parts.push(new THREE.ConeGeometry(700 + r() * 900, h, 7, 1).scale(1, 1, 0.6).rotateY(r() * 3).translate(Math.cos(a) * d, h / 2 - 20, Math.abs(Math.sin(a)) * d * 0.9 + 2600)); }
  const hg = mergeGeometries(parts); parts.forEach(p => p.dispose());
  const hm = new THREE.MeshStandardMaterial({ color: 0x7fa6a0, roughness: 1 }), hills = new THREE.Mesh(hg, hm); hills.name = 'Modbury_DistantCoast'; group.add(hills); D.push(hg, hm);
  // seagulls
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.22, 0, 0, -0.22, 1.25, 0.06, -0.05], 3)); wing.computeVertexNormals();
  const gm = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), body = new THREE.SphereGeometry(0.16, 6, 5).scale(1, 0.8, 2.4), gulls = [];
  for (let k = 0; k < 16; k++) {
    const b = new THREE.Group(), l = new THREE.Mesh(wing, gm), rr = new THREE.Mesh(wing, gm); rr.scale.x = -1; b.add(l, rr, new THREE.Mesh(body, gm)); b.scale.setScalar(1.3 + r() * 0.8); group.add(b);
    gulls.push({ b, l, rr, cx: -520 + r() * 900, cz: -130 + r() * 230, rad: 35 + r() * 90, y: 22 + r() * 60, sp: (0.12 + r() * 0.14) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28 });
  }
  D.push(wing, gm, body);
  animated.push(t => { for (const q of gulls) { const a = q.ph + t * q.sp; q.b.position.set(q.cx + Math.cos(a) * q.rad, q.y + Math.sin(t * 0.4 + q.ph) * 3, q.cz + Math.sin(a) * q.rad); q.b.rotation.y = -a + (q.sp > 0 ? 0 : Math.PI); const f = Math.sin(t * 5 + q.ph) * 0.5; q.l.rotation.z = f; q.rr.rotation.z = -f; } });
}

// ---------- the Seabed Tunnel (Tom, 2026-11-26: "an underwater bit with fish swimming about")
// The tube comes up through the surface of the sea at both ends.  The sea is one flat sheet, so where the tube is at the
// surface the sheet is not drawn inside it: these are the middles of the tube there, and how far out its glass is.
const TUBE = (() => {
  const K = T.tunnel, segs = []; let prev = null;
  // (wherever any of the inside of the tube is at the height of the sea, with a little to spare)
  for (let i = K.firstIndex - 2; i <= K.lastIndex + 2; i += 2) {
    const at = S.y[i] < 1.4 && S.y[i] + K.height > -0.7;
    if (at && prev !== null) segs.push([S.x[prev], S.z[prev], S.x[i], S.z[i], (S.width[prev] + S.width[i]) / 4 + 0.12]);
    prev = at ? i : null;
  }
  return { segs, max: 48 };
})();
/** A material of the sea's: nothing of it is drawn inside the tube where the tube breaks the surface. */
function cutForTunnel(material) {
  const flat = []; for (const seg of TUBE.segs.slice(0, TUBE.max)) flat.push(new THREE.Vector4(seg[0], seg[1], seg[2], seg[3]));
  const half = TUBE.segs.slice(0, TUBE.max).map(seg => seg[4]);
  while (flat.length < TUBE.max) { flat.push(new THREE.Vector4(0, 1e6, 0, 1e6)); half.push(0); }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tubeSegs = { value: flat }; shader.uniforms.tubeHalf = { value: half };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTubeWorld;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTubeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vTubeWorld;\nuniform vec4 tubeSegs[${TUBE.max}];\nuniform float tubeHalf[${TUBE.max}];`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        for (int k = 0; k < ${TUBE.max}; k++) { vec2 a = tubeSegs[k].xy, b = tubeSegs[k].zw, ab = b - a, ap = vTubeWorld.xz - a; float h = clamp(dot(ap, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0); if (length(ap - ab * h) < tubeHalf[k]) discard; }`);
  };
  material.customProgramCacheKey = () => 'modbury-tube-cut';
}

function buildTunnel(group, D, animated) {
  // (shapes of different kinds put together as one: some come with their corners shared and some do not)
  const merged = list => mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)));
  const K = T.tunnel, a = K.firstIndex, b = K.lastIndex, H = K.height, r = rng(2611), o = new THREE.Object3D(), ic = new THREE.Color();
  // the shape of the tube across the road: [share of the half width, height]: upright sides, an arch over
  const SHAPE = [[-1, 0], [-1, 1.5], [-0.82, 2.75], [-0.5, 3.75], [0, H], [0.5, 3.75], [0.82, 2.75], [1, 1.5], [1, 0]];
  const out = i => S.width[i] / 2 + 0.12;
  const place = (i, share, up) => [S.x[i] + S.normalX[i] * share * out(i), S.y[i] + up, S.z[i] + S.normalZ[i] * share * out(i)];

  // ----- the glass
  { const pos = [], idx = [], P = SHAPE.length;
    for (let i = a; i <= b; i++) for (const [share, up] of SHAPE) pos.push(...place(i, share, up));
    for (let n = 0; n < b - a; n++) for (let k = 0; k < P - 1; k++) { const p = n * P + k, q = p + 1, u = p + P, v = u + 1; idx.push(p, u, q, q, u, v); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const glass = new THREE.Mesh(g, m); glass.name = 'Modbury_Tunnel_Glass'; glass.renderOrder = 4; group.add(glass); D.push(g, m); }

  // ----- the frame: a steel rib every 8 m, a rail along the foot of the glass each side and one along the top
  { const ribs = []; for (let i = a; i <= b; i += 4) ribs.push(i); if (ribs.at(-1) !== b) ribs.push(b);
    const bg = new THREE.BoxGeometry(1, 1, 1), bm = new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.45, metalness: 0.35 });
    const mesh = new THREE.InstancedMesh(bg, bm, ribs.length * (SHAPE.length - 1)); let n = 0;
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
    for (const i of ribs) {
      const mouth = i === a || i === b, thick = mouth ? 0.9 : 0.3;
      for (let k = 0; k < SHAPE.length - 1; k++) {
        va.set(...place(i, SHAPE[k][0], SHAPE[k][1])); vb.set(...place(i, SHAPE[k + 1][0], SHAPE[k + 1][1]));
        o.position.copy(va).add(vb).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(up, vb.clone().sub(va).normalize()); o.scale.set(thick, thick, va.distanceTo(vb) + thick * 0.6); o.updateMatrix();
        mesh.setMatrixAt(n, o.matrix); mesh.setColorAt(n, ic.set(mouth ? 0xffc83a : 0xe9eef2)); n++;
      }
    }
    mesh.name = 'Modbury_Tunnel_Ribs'; mesh.castShadow = true; group.add(mesh); D.push(bg, bm, mesh);
    const rail = (share, up, wide, high, color, name) => { const pos = [], idx = [];
      for (let i = a; i <= b; i++) { const [x, y, z] = place(i, share, up), nx = S.normalX[i] * wide / 2, nz = S.normalZ[i] * wide / 2; pos.push(x - nx, y, z - nz, x + nx, y, z + nz, x - nx, y + high, z - nz, x + nx, y + high, z + nz); }
      for (let n2 = 0; n2 < b - a; n2++) { const p = n2 * 4, q = p + 4; idx.push(p + 2, q + 2, p + 3, p + 3, q + 2, q + 3, p, q, p + 2, p + 2, q, q + 2, p + 1, p + 3, q + 1, q + 1, p + 3, q + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }), mesh2 = new THREE.Mesh(g, m); mesh2.name = name; group.add(mesh2); D.push(g, m); };
    rail(-0.97, 0, 0.5, 0.45, 0x2b6ea8, 'Modbury_Tunnel_Kerb'); rail(0.97, 0, 0.5, 0.45, 0x2b6ea8, 'Modbury_Tunnel_Kerb'); rail(0, H - 0.1, 0.22, 0.16, 0xe9eef2, 'Modbury_Tunnel_Spine');
    // a line of lights along the floor either side, so the way through shows
    const lg = new THREE.BoxGeometry(0.5, 0.08, 1.2), lm = new THREE.MeshBasicMaterial({ color: 0xbff6ff }), lights = new THREE.InstancedMesh(lg, lm, Math.floor((b - a) / 3 + 1) * 2); let ln = 0;
    for (let i = a; i <= b; i += 3) for (const side of [-0.8, 0.8]) { const [x, y, z] = place(i, side, 0.07); o.position.set(x, y, z); o.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(S.tangentX[i], S.tangentZ[i])); o.scale.set(1, 1, 1); o.updateMatrix(); lights.setMatrixAt(ln++, o.matrix); }
    lights.count = ln; lights.name = 'Modbury_Tunnel_Lights'; group.add(lights); D.push(lg, lm, lights); }

  // ----- under the sea: the water all round (a box seen from inside it: deep blue below, lighter towards the surface), and the
  // surface overhead from below
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = a; i <= b; i++) if (S.y[i] < -0.3) { x0 = Math.min(x0, S.x[i]); x1 = Math.max(x1, S.x[i]); z0 = Math.min(z0, S.z[i]); z1 = Math.max(z1, S.z[i]); }
  x0 -= 95; x1 += 95; z0 -= 30; z1 += 95;
  { const top = -0.56, floor = -11, g = new THREE.BoxGeometry(x1 - x0, top - floor, z1 - z0).translate((x0 + x1) / 2, (top + floor) / 2, (z0 + z1) / 2), p = g.getAttribute('position'), col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) { const c = mix([0.03, 0.22, 0.42], [0.16, 0.62, 0.78], sstep(floor, top, p.getY(k))); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }); cutForTunnel(m);
    const water = new THREE.Mesh(g, m); water.name = 'Modbury_Underwater'; group.add(water); D.push(g, m);
    // (the surface from below: bright, with the light coming through it)
    const cg = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2).translate((x0 + x1) / 2, top - 0.02, (z0 + z1) / 2);
    const rip = noiseTexture(128, 0.55, 1.0, 10); rip.repeat.set(14, 9);
    const cm = new THREE.MeshBasicMaterial({ color: 0x8fe6f2, map: rip, fog: false }); cutForTunnel(cm);
    const under = new THREE.Mesh(cg, cm); under.name = 'Modbury_Surface_From_Below'; group.add(under); D.push(cg, cm, rip);
    animated.push(t => { rip.offset.set(t * 0.02, t * 0.013); }); }

  // ----- places out on the sea bed, beside the tube: [x, sea bed, z, how far along the tube]
  const beside = (count, near, far) => { const list = []; let tries = 0;
    while (list.length < count && tries++ < count * 40) { const i = a + Math.floor(r() * (b - a)); if (S.y[i] > -4.5) continue; const side = r() < 0.5 ? -1 : 1, d = S.width[i] / 2 + near + r() * (far - near), x = S.x[i] + S.normalX[i] * side * d, z = S.z[i] + S.normalZ[i] * side * d;
      if (T.query(x, z).distance < S.width[i] / 2 + near - 0.5) continue; list.push([x, T.terrainHeight(x, z), z, i]); }
    return list; };

  // ----- kelp, coral and rocks on the sea bed
  { const blade = new THREE.ConeGeometry(0.22, 1, 5).translate(0, 0.5, 0), bm = new THREE.MeshStandardMaterial({ color: 0x2f8f4a, roughness: 0.8 }), spots = beside(150, 2.2, 40);
    const kelp = new THREE.InstancedMesh(blade, bm, spots.length), tall = spots.map(() => 1.6 + r() * 3.4), lean = spots.map(() => r() * 6.28);
    const sway = t => { spots.forEach(([x, y, z], k) => { o.position.set(x, y - 0.1, z); o.rotation.set(0.16 * Math.sin(t * 0.9 + lean[k]), lean[k], 0.16 * Math.cos(t * 0.7 + lean[k])); o.scale.set(1 + (k % 3) * 0.4, tall[k], 1); o.updateMatrix(); kelp.setMatrixAt(k, o.matrix); }); kelp.instanceMatrix.needsUpdate = true; };
    spots.forEach((_, k) => kelp.setColorAt(k, ic.set(k % 3 ? 0x2f8f4a : 0x4aa03a))); sway(0); animated.push(sway);
    kelp.name = 'Modbury_Kelp'; group.add(kelp); D.push(blade, bm, kelp);
    const coralG = merged([new THREE.IcosahedronGeometry(0.7, 1).translate(0, 0.5, 0), new THREE.IcosahedronGeometry(0.45, 1).translate(0.6, 0.9, 0.2), new THREE.IcosahedronGeometry(0.4, 1).translate(-0.5, 0.8, -0.3), new THREE.CylinderGeometry(0.12, 0.2, 1.4, 5).translate(0.2, 1.2, -0.4)]);
    const coralM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), cs = beside(70, 2.5, 34), coral = new THREE.InstancedMesh(coralG, coralM, cs.length);
    cs.forEach(([x, y, z], k) => { o.position.set(x, y - 0.15, z); o.rotation.set(0, r() * 6.28, 0); o.scale.setScalar(0.7 + r() * 1.3); o.updateMatrix(); coral.setMatrixAt(k, o.matrix); coral.setColorAt(k, ic.set([0xff6f91, 0xff9a3c, 0xc86bff, 0xffd166, 0x4fd1c5][k % 5])); });
    coral.name = 'Modbury_Coral'; group.add(coral); D.push(coralG, coralM, coral); }

  // ----- fish.  One is a body, a tail and a fin, nose along +z.  They go round in shoals, each round a place beside the tube or
  // over the top of it
  const fishG = merged([new THREE.IcosahedronGeometry(0.5, 1).scale(0.42, 0.62, 1.15), new THREE.ConeGeometry(0.34, 0.6, 4).rotateX(-Math.PI / 2).scale(0.35, 1, 1).translate(0, 0, -0.78), new THREE.ConeGeometry(0.16, 0.4, 3).translate(0, 0.42, 0)]);
  const fishM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x333333 });
  const shoals = [];
  { const centres = [...beside(9, 6, 20), ...[0.22, 0.4, 0.56, 0.72].map(share => { const i = a + Math.round((b - a) * share); return [S.x[i], S.y[i], S.z[i], i]; })];
    centres.forEach(([x, y, z, i], k) => {
      const over = k >= 9, count = 9 + (k * 5) % 9, hue = [0xff8a1f, 0xffd23a, 0xc9d6e2, 0x3aa0ff, 0xff5a7a, 0x8ff0d0][k % 6];
      // (those over the tube go across it, above the glass; the others stay out at the side, between the sea bed and the surface)
      const yaw = Math.atan2(S.tangentX[i], S.tangentZ[i]) + (over ? Math.PI / 2 : r() * 6.28), height = over ? Math.min(-1.3, S.y[i] + H + 1.1) : Math.min(-1.6, y + 1.6 + r() * 2.2);
      shoals.push({ x, z, height, yaw, rx: over ? 15 : 7 + r() * 6, rz: over ? 5 : 4 + r() * 4, pace: (0.32 + r() * 0.3) * (k % 2 ? 1 : -1), count, hue, phase: r() * 6.28, size: 0.55 + r() * 0.5 });
    }); }
  const total = shoals.reduce((n, shoal) => n + shoal.count, 0), fish = new THREE.InstancedMesh(fishG, fishM, total);
  { let n = 0; for (const shoal of shoals) for (let k = 0; k < shoal.count; k++) fish.setColorAt(n++, ic.set(shoal.hue).offsetHSL(0, 0, (k % 3 - 1) * 0.05)); }
  const swim = (t) => { let n = 0;
    for (const shoal of shoals) { const cy = Math.cos(shoal.yaw), sy = Math.sin(shoal.yaw);
      for (let k = 0; k < shoal.count; k++) {
        // (each a little behind the last, and a little in or out of the ring, and bobbing)
        const ang = t * shoal.pace + shoal.phase - k * 0.22 * Math.sign(shoal.pace), ring = 1 + 0.22 * Math.sin(k * 2.4), lx = Math.cos(ang) * shoal.rx * ring, lz = Math.sin(ang) * shoal.rz * ring;
        const tx = -Math.sin(ang) * shoal.rx * Math.sign(shoal.pace), tz = Math.cos(ang) * shoal.rz * Math.sign(shoal.pace);
        o.position.set(shoal.x + lx * cy + lz * sy, shoal.height + 0.45 * Math.sin(k * 1.7) + 0.2 * Math.sin(t * 1.3 + k), shoal.z - lx * sy + lz * cy);
        o.rotation.set(0, Math.atan2(tx * cy + tz * sy, -tx * sy + tz * cy) + 0.25 * Math.sin(t * 7 + k), 0); o.scale.setScalar(shoal.size); o.updateMatrix(); fish.setMatrixAt(n++, o.matrix);
      } }
    fish.instanceMatrix.needsUpdate = true; };
  swim(0); animated.push(swim);
  fish.name = 'Modbury_Fish'; fish.frustumCulled = false; group.add(fish); D.push(fishG, fishM, fish);

  // ----- a shark, going slowly round the far bend of the tube and over the top of it
  { const sharkG = merged([new THREE.IcosahedronGeometry(1, 2).scale(0.75, 0.8, 3.4), new THREE.ConeGeometry(0.9, 1.6, 4).rotateX(-Math.PI / 2).scale(0.3, 1.5, 1).translate(0, 0.2, -3.6), new THREE.ConeGeometry(0.5, 1.5, 4).scale(0.35, 1, 1.2).translate(0, 1.2, 0.2),
      new THREE.ConeGeometry(0.4, 1.5, 3).rotateZ(Math.PI / 2).scale(1, 0.25, 1).translate(1.1, -0.2, 0.9), new THREE.ConeGeometry(0.4, 1.5, 3).rotateZ(-Math.PI / 2).scale(1, 0.25, 1).translate(-1.1, -0.2, 0.9)]);
    const sharkM = new THREE.MeshStandardMaterial({ color: 0x7d8b99, roughness: 0.6 }), shark = new THREE.Mesh(sharkG, sharkM); shark.name = 'Modbury_Shark'; group.add(shark); D.push(sharkG, sharkM);
    const mid = a + Math.round((b - a) * 0.5), cx = S.x[mid], cz = S.z[mid] - 6, top = Math.min(-1.5, S.y[mid] + H + 1.3);
    animated.push(t => { const ang = t * 0.16, x = cx + Math.cos(ang) * 46, z = cz + Math.sin(ang) * 20; shark.position.set(x, top + 0.3 * Math.sin(t * 0.5), z); shark.rotation.y = Math.atan2(-Math.sin(ang) * 46, Math.cos(ang) * 20) + 0.12 * Math.sin(t * 2.2); }); }

  // ----- jellyfish, rising and sinking
  { const bell = merged([new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ...[0, 1, 2, 3, 4].map(k => new THREE.CylinderGeometry(0.03, 0.02, 1.3, 4).translate(Math.cos(k * 1.257) * 0.35, -0.65, Math.sin(k * 1.257) * 0.35))]);
    const jm = new THREE.MeshStandardMaterial({ color: 0xff9ad5, transparent: true, opacity: 0.7, roughness: 0.3, emissive: 0x7a2a5a }), spots = beside(14, 4, 22), jelly = new THREE.InstancedMesh(bell, jm, spots.length);
    const bob = t => { spots.forEach(([x, y, z], k) => { const pulse = 1 + 0.12 * Math.sin(t * 2 + k); o.position.set(x, Math.min(-1.4, y + 2.6 + 1.1 * Math.sin(t * 0.4 + k * 1.9)), z); o.rotation.set(0, k, 0); o.scale.set(pulse, 2 - pulse, pulse); o.updateMatrix(); jelly.setMatrixAt(k, o.matrix); }); jelly.instanceMatrix.needsUpdate = true; };
    bob(0); animated.push(bob); jelly.name = 'Modbury_Jellyfish'; jelly.renderOrder = 3; group.add(jelly); D.push(bell, jm, jelly); }
}

/** Build the whole Modbury Heights scene graph. */
export function createModburyHeights() {
  const group = new THREE.Group(); group.name = 'ModburyHeights';
  const D = [], animated = [];
  buildSky(group, D, animated); buildTerrain(group, D); buildTrail(group, D); buildBridges(group, D, animated); buildSea(group, D, animated); buildTunnel(group, D, animated); buildNature(group, D);
  const hemi = new THREE.HemisphereLight(0xbfdcff, 0xcdb78a, 1.0), sun = new THREE.DirectionalLight(0xfff1d6, 3.4);
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  const lights = new THREE.Group(); lights.name = 'Modbury_Lights'; lights.add(hemi, sun, sun.target); group.add(lights);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(300);
  return {
    group, track: T, sun,
    /** t = seconds (cosmetic only). focus = optional {x,y,z} of the dog to keep the shadow box around. */
    update(t, focus) { for (const f of animated) f(t); if (focus) { sun.target.position.set(focus.x, focus.y, focus.z); sun.position.set(focus.x, focus.y, focus.z).addScaledVector(SUN_DIRECTION, 300); } },
    /** Summer daylight: fog, tone mapping, optional sun shadows. Returns a function that undoes it. */
    applyEnvironment(scene, renderer, { shadows = true } = {}) {
      const prev = { fog: scene.fog, bg: scene.background, tm: renderer?.toneMapping, ex: renderer?.toneMappingExposure, sh: renderer?.shadowMap.enabled };
      scene.fog = new THREE.Fog(0xc4e0fa, 900, 13000); scene.background = new THREE.Color(0x8ec5f5);
      if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82; if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; sun.castShadow = true; } }
      return () => { scene.fog = prev.fog; scene.background = prev.bg; if (renderer) { renderer.toneMapping = prev.tm; renderer.toneMappingExposure = prev.ex; renderer.shadowMap.enabled = prev.sh; } };
    },
    dispose() { for (const d of D) d.dispose?.(); },
  };
}
