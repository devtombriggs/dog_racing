// Treat Road — Three.js visuals (road, glow edges, bone bridge, gates, floating treats, clouds, sky).
// Everything is generated at runtime from treatRoadData.js; there is no model file to load.
// (Treat Boxes and Golden Bones are added for every map by src/pickups/, not here.)
//
//   const treatRoad = createTreatRoad();
//   scene.add(treatRoad.group);
//   const restore = treatRoad.applyEnvironment(scene, renderer);   // sunset lights, fog, tone mapping
//   ... each frame: treatRoad.update(elapsedSeconds);
//   ... when leaving the map: restore(); scene.remove(treatRoad.group); treatRoad.dispose();
//
// There are deliberately NO collision meshes and NO barriers here: use TREAT_ROAD.query() for gameplay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREAT_ROAD as T } from '../../../shared/treatRoadData.js';

const TILE = 4;                    // metres per biscuit tile
const TEX_TILES_U = 4, TEX_TILES_V = 8;
const GLOW = 0.4;                  // width of the glowing edge strip
export const SUN_DIRECTION = new THREE.Vector3(0.80, 0.30, -0.52).normalize();   // direction TO the low sun

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- textures (drawn once on a canvas)
function drawPaw(ctx, cx, cy, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.28, r * 0.62, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  for (const [dx, dy, s] of [[-0.62, -0.25, 0.26], [-0.22, -0.62, 0.28], [0.22, -0.62, 0.28], [0.62, -0.25, 0.26]]) {
    ctx.beginPath(); ctx.ellipse(cx + dx * r, cy + dy * r, r * s, r * s * 1.2, dx * 0.5, 0, Math.PI * 2); ctx.fill();
  }
}

function makeTileTextures() {
  const px = 128, W = px * TEX_TILES_U, H = px * TEX_TILES_V, rnd = rng(42);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = W / 2; e.height = H / 2; const ge = e.getContext('2d');
  g.fillStyle = '#f2b23e'; g.fillRect(0, 0, W, H);                // warm glowing grooves between tiles
  ge.fillStyle = '#6b4208'; ge.fillRect(0, 0, e.width, e.height);
  const paws = new Set([1, 6, 8, 15, 18, 21, 27, 28]);            // which of the 32 tiles carry a paw print
  for (let r = 0; r < TEX_TILES_V; r++) for (let q = 0; q < TEX_TILES_U; q++) {
    const x = q * px, y = r * px, m = 3, v = rnd();
    const grad = g.createLinearGradient(x, y, x + px, y + px);
    grad.addColorStop(0, `hsl(${38 + v * 5}, 80%, ${70 + v * 5}%)`); grad.addColorStop(1, `hsl(${35 + v * 5}, 78%, ${63 + v * 5}%)`);
    g.fillStyle = grad; g.beginPath(); g.roundRect(x + m, y + m, px - 2 * m, px - 2 * m, 14); g.fill();
    ge.fillStyle = '#000'; ge.beginPath(); ge.roundRect((x + m) / 2, (y + m) / 2, (px - 2 * m) / 2, (px - 2 * m) / 2, 7); ge.fill();
    g.strokeStyle = 'rgba(255,236,170,0.55)'; g.lineWidth = 3; g.beginPath(); g.roundRect(x + m + 3, y + m + 3, px - 2 * m - 6, px - 2 * m - 6, 11); g.stroke();
    for (let k = 0; k < 90; k++) {                                // baked speckle
      g.fillStyle = rnd() < 0.5 ? 'rgba(120,70,20,0.16)' : 'rgba(255,240,190,0.2)';
      g.fillRect(x + m + rnd() * (px - 2 * m), y + m + rnd() * (px - 2 * m), 1 + rnd() * 2.5, 1 + rnd() * 2.5);
    }
    if (paws.has(r * TEX_TILES_U + q)) {
      drawPaw(g, x + px / 2, y + px / 2, px * 0.27, 'rgba(255,226,120,0.98)');
      drawPaw(ge, (x + px / 2) / 2, (y + px / 2) / 2, px * 0.27 / 2, '#ffc94d');
    } else {
      g.fillStyle = 'rgba(110,64,18,0.45)';                       // docker holes like a real biscuit
      for (const [dx, dy] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]]) { g.beginPath(); g.arc(x + dx * px, y + dy * px, 3.2, 0, Math.PI * 2); g.fill(); }
    }
  }
  const map = new THREE.CanvasTexture(c), emissive = new THREE.CanvasTexture(e);
  for (const t of [map, emissive]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }
  return { map, emissive };
}

function makeCheckerTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}

// ---------- road ribbons
const S = T.samples, N = T.sampleCount;
const bridge = T.sections.find(s => s.id === 'E');
function bridgeBlend(i) {           // 0 = biscuit slab, 1 = bone bridge (eased over 12 samples at each end)
  const a = i - bridge.firstIndex, b = bridge.lastIndex - i;
  if (a < 0 || b < 0) return 0;
  const t = Math.min(1, Math.min(a, b) / 12); return t * t * (3 - 2 * t);
}

/** Builds a strip along the lap from a cross-section: profile(i) -> [[lateral, dy, r, g, b, u], ...] */
function ribbon(profile, vRepeat) {
  const P0 = profile(0), K = P0.length, pos = [], col = [], uv = [], idx = [];
  for (let r = 0; r <= N; r++) {
    const i = r % N, P = profile(i), v = (r === N ? T.length : S.s[i]) * vRepeat;
    for (let k = 0; k < K; k++) {
      const [l, dy, cr, cg, cb, u] = P[k];
      pos.push(S.x[i] + S.normalX[i] * l, S.y[i] + dy, S.z[i] + S.normalZ[i] * l); col.push(cr, cg, cb); uv.push(u, v);
    }
  }
  for (let r = 0; r < N; r++) for (let k = 0; k < K - 1; k++) {
    if (T.isGapSegment(r)) continue;
    const a = r * K + k, b = a + 1, c = a + K, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function faceUp(g) {                 // make sure the walking surface faces the sky
  const n = g.getAttribute('normal'); let sum = 0;
  for (let i = 0; i < n.count; i += 7) sum += n.getY(i);
  if (sum < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

function buildRoad(group, disposables) {
  const tex = makeTileTextures(); disposables.push(tex.map, tex.emissive);
  const vRepeat = Math.round(T.length / (TILE * TEX_TILES_V)) / T.length;       // whole number of repeats => no seam at the line
  const cream = [1.0, 0.95, 0.84];

  // walking surface
  const top = faceUp(ribbon(i => {
    const hw = S.width[i] / 2 - GLOW, b = bridgeBlend(i), c = [1 + (cream[0] - 1) * b, 1 + (cream[1] - 1) * b, 1 + (cream[2] - 1) * b];
    return [[-hw, 0, ...c, 0.5 - hw / (TILE * TEX_TILES_U)], [0, 0, ...c, 0.5], [hw, 0, ...c, 0.5 + hw / (TILE * TEX_TILES_U)]];
  }, vRepeat));
  const topMat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: 0xffc04a, emissiveIntensity: 1.25, roughness: 0.8, metalness: 0, vertexColors: true });
  const topMesh = new THREE.Mesh(top, topMat); topMesh.name = 'TreatRoad_Surface'; topMesh.receiveShadow = true; group.add(topMesh);

  // glowing edges (one mesh, both sides) — the only thing marking the edge; there is nothing to stop a dog
  const glowGeos = [];
  for (const sd of [-1, 1]) {
    glowGeos.push(ribbon(i => {
      const hw = S.width[i] / 2;
      return [[sd * (hw - GLOW), 0.015, 1, 1, 1, 0], [sd * hw, 0.03, 1, 1, 1, 0.5], [sd * (hw + 0.04), -0.32, 1, 1, 1, 1]];
    }, 1));
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd257, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const glow = new THREE.Mesh(mergeGeometries(glowGeos), glowMat); glow.name = 'TreatRoad_EdgeGlow'; group.add(glow);
  glowGeos.forEach(g => g.dispose());

  // body: biscuit slab that morphs into a rounded bone shaft on the bridge
  const K = 11;
  const body = ribbon(i => {
    const hw = S.width[i] / 2, b = bridgeBlend(i), out = [];
    for (let k = 0; k < K; k++) {
      const a = Math.PI * k / (K - 1), ca = Math.cos(a), sa = Math.sin(a);
      const slabX = (hw + 0.04) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.22) * (1 - 0.1 * sa), slabY = -0.32 - 1.25 * Math.pow(sa, 0.35);
      const boneX = (hw + 0.5) * ca, boneY = -0.32 - (hw + 1.2) * sa;
      const shade = 0.55 + 0.45 * (1 - sa);
      const base = [0.80 * shade, 0.52 * shade, 0.20 * shade], bone = [0.98 * (0.7 + 0.3 * shade), 0.93 * (0.7 + 0.3 * shade), 0.80 * (0.7 + 0.3 * shade)];
      out.push([slabX + (boneX - slabX) * b, slabY + (boneY - slabY) * b, base[0] + (bone[0] - base[0]) * b, base[1] + (bone[1] - base[1]) * b, base[2] + (bone[2] - base[2]) * b, k / (K - 1)]);
    }
    return out;
  }, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const bodyMesh = new THREE.Mesh(body, bodyMat); bodyMesh.name = 'TreatRoad_Body'; group.add(bodyMesh);

  // the four knobs that make the bridge read as one giant bone (below the walking surface: not obstacles)
  const knobGeo = new THREE.SphereGeometry(1, 20, 14), knobMat = new THREE.MeshStandardMaterial({ color: 0xfff0d2, roughness: 0.75 });
  for (const i of [bridge.firstIndex + 4, bridge.lastIndex - 4]) for (const sd of [-1, 1]) {
    const m = new THREE.Mesh(knobGeo, knobMat), r = 7.2;
    m.scale.setScalar(r); m.position.set(S.x[i] + S.normalX[i] * sd * 5.6, S.y[i] - r - 0.5, S.z[i] + S.normalZ[i] * sd * 5.6); group.add(m);
  }

  // chequered start/finish line
  const ck = makeCheckerTexture(), hw0 = T.startFinish.halfWidth - GLOW;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(hw0 * 2, 1.6), new THREE.MeshBasicMaterial({ map: ck, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  line.rotation.set(-Math.PI / 2, 0, 0); line.name = 'TreatRoad_StartFinishLine';
  const holder = new THREE.Group(); holder.position.set(...T.startFinish.position); holder.position.y += 0.02; holder.rotation.y = T.startFinish.rotationY; holder.add(line); group.add(holder);
  disposables.push(top, topMat, glow.geometry, glowMat, body, bodyMat, knobGeo, knobMat, ck, line.geometry, line.material);
}

// ---------- boost pads (Tom, 2026-11-21: "way more boosts"): arrows running along the road, pink on the mega pads
function buildPads(group, disposables, animated) {
  const arrows = (background, ink) => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = background; g.fillRect(0, 0, 64, 64); g.strokeStyle = ink; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const x of [8, 40]) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 18, 32); g.lineTo(x, 56); g.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; disposables.push(tex); return tex;
  };
  const kinds = { pad: arrows('rgba(255,160,40,0.92)', '#fff6d8'), mega: arrows('rgba(255,40,170,0.95)', '#ffffff') };
  for (const [kind, tex] of Object.entries(kinds)) {
    const list = T.strips.filter(strip => Boolean(strip.mega) === (kind === 'mega'));
    if (!list.length) continue;
    const pos = [], uv = [], idx = [];
    for (const strip of list) {
      const steps = Math.max(2, Math.round((strip.sEnd - strip.sStart) / 1.5)), base = pos.length / 3;
      for (let k = 0; k <= steps; k++) {
        const s = strip.sStart + (strip.sEnd - strip.sStart) * k / steps, u = (s - strip.sStart) / 3.2;
        for (const [lat, v] of [[strip.latMin, 0], [strip.latMax, 1]]) { const p = T.pointAt(s, lat); pos.push(p.x, p.y + 0.06, p.z); uv.push(u, v * (strip.latMax - strip.latMin) / 3.2); }
        if (k < steps) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); disposables.push(g);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); disposables.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.name = kind === 'mega' ? 'TreatRoad_MegaPads' : 'TreatRoad_BoostPads'; mesh.renderOrder = 1; group.add(mesh);
    animated.push(t => { tex.offset.x = -t * (kind === 'mega' ? 3.4 : 1.8); });
  }
}

// ---------- decorations
function boneGeometry(detail = 10) {          // a bone 2 units long, lying along X
  const shaft = new THREE.CylinderGeometry(0.2, 0.2, 1.5, detail, 1).rotateZ(Math.PI / 2), parts = [shaft];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push(new THREE.SphereGeometry(0.3, detail, Math.max(6, detail - 2)).translate(sx * 0.78, sy * 0.21, 0));
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}

function buildGates(group, disposables) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffa21f, emissiveIntensity: 1.5, roughness: 0.5 });
  const banner = new THREE.MeshBasicMaterial({ map: makeCheckerTexture(), side: THREE.DoubleSide });
  disposables.push(mat, banner, banner.map);
  for (const gt of T.gates) {
    const R = gt.halfWidth + 3.2, parts = [new THREE.TorusGeometry(R, 0.75, 10, 36, Math.PI)];
    for (const sx of [-1, 1]) for (const dz of [-1, 1]) parts.push(new THREE.SphereGeometry(1.35, 14, 10).translate(sx * R, -0.3, dz * 0.95));
    const geo = mergeGeometries(parts); parts.forEach(p => p.dispose()); disposables.push(geo);
    const m = new THREE.Mesh(geo, mat); m.position.set(gt.position[0], gt.position[1] - 0.6, gt.position[2]); m.rotation.y = gt.rotationY; m.name = 'TreatRoad_Gate'; group.add(m);
    if (gt.isStartGate) {
      const bg = new THREE.PlaneGeometry(R * 1.2, 1.8); disposables.push(bg);
      const b = new THREE.Mesh(bg, banner); b.position.set(gt.position[0], gt.position[1] + R * 0.62, gt.position[2]); b.rotation.y = gt.rotationY; group.add(b);
    }
  }
}

function buildLauncher(group, disposables, animated) {
  const pad = new THREE.Group(); pad.name = 'TreatRoad_LaunchPad';
  const start = T.pointAt((T.launch.padStart + T.launch.takeoffS) / 2);
  pad.position.set(start.x, start.y + 0.08, start.z); pad.rotation.set(-Math.atan(T.query(start.x,start.z).grade), start.rotationY, 0, 'YXZ');
  const mat = new THREE.MeshBasicMaterial({ color: 0x36ffe3, toneMapped: false, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17466a, emissive: 0x063b45, emissiveIntensity: 1.3 });
  const base = new THREE.BoxGeometry(start.halfWidth * 2, 0.12, 15);
  pad.add(new THREE.Mesh(base, dark));
  const chevron = new THREE.BufferGeometry();
  chevron.setAttribute('position', new THREE.Float32BufferAttribute([-3,0,0, 0,0,2, 3,0,0, 3,0,-0.7, 0,0,1.3, -3,0,-0.7],3));
  chevron.setIndex([0,1,5,1,4,5,1,2,4,2,3,4]);
  for (const z of [-5,-1,3]) { const arrow = new THREE.Mesh(chevron,mat); arrow.position.set(0,0.09,z); pad.add(arrow); }
  group.add(pad);
  // Rings make the flight direction and landing point readable from the approach.
  const ringGeo=new THREE.TorusGeometry(4,0.16,8,40);
  for (const t of [0.2,0.4,0.6,0.8]) {
    const p=T.launchPoint(t*T.launch.duration), ring=new THREE.Mesh(ringGeo,mat);
    ring.position.set(p.x,p.y+2,p.z); ring.rotation.set(p.pitch,p.rotationY,0,'YXZ'); group.add(ring);
  }
  const landing=T.pointAt(T.launch.landingS), landingGeo=new THREE.RingGeometry(2.8,3.2,40);
  const target=new THREE.Mesh(landingGeo,mat); target.rotation.x=-Math.PI/2; target.position.set(landing.x,landing.y+0.09,landing.z); target.name='TreatRoad_LandingTarget';group.add(target);
  animated.push(t => { mat.color.setRGB(0.15,0.8+0.2*Math.sin(t*6),0.75); });
  disposables.push(mat,dark,base,chevron,ringGeo,landingGeo);
}

function buildTreats(group, disposables, animated) {
  const rnd = rng(7), dummy = new THREE.Object3D();
  const defs = [
    { geo: boneGeometry(10), mat: new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.7 }), count: 46, scale: [2.2, 5.5], flat: 1 },
    { geo: boneGeometry(8).scale(1, 1, 0.42), mat: new THREE.MeshStandardMaterial({ color: 0xe0a04a, roughness: 0.85, emissive: 0x5a2e00, emissiveIntensity: 0.25 }), count: 64, scale: [2.5, 7.5], flat: 1 },
    { geo: new THREE.CylinderGeometry(1, 1, 0.32, 14).rotateX(Math.PI / 2), mat: new THREE.MeshStandardMaterial({ color: 0xc9853a, roughness: 0.9 }), count: 40, scale: [1.2, 2.8], flat: 1 },
  ];
  for (const d of defs) {
    const mesh = new THREE.InstancedMesh(d.geo, d.mat, d.count), items = [];
    for (let k = 0; k < d.count; k++) {
      const i = Math.floor(rnd() * N), side = rnd() < 0.5 ? -1 : 1, lat = side * (S.width[i] / 2 + 9 + rnd() * 55);
      items.push({ x: S.x[i] + S.normalX[i] * lat, y: S.y[i] + (rnd() * 46 - 20), z: S.z[i] + S.normalZ[i] * lat, s: d.scale[0] + rnd() * (d.scale[1] - d.scale[0]),
        rx: rnd() * 6.28, ry: rnd() * 6.28, rz: rnd() * 6.28, spin: (rnd() - 0.5) * 0.5, bob: 0.6 + rnd() * 1.4, ph: rnd() * 6.28 });
    }
    mesh.name = 'TreatRoad_FloatingTreats'; mesh.frustumCulled = false; group.add(mesh);
    disposables.push(d.geo, d.mat, mesh);
    animated.push(t => {
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        dummy.position.set(it.x, it.y + Math.sin(t * 0.6 + it.ph) * it.bob, it.z); dummy.rotation.set(it.rx + t * it.spin * 0.4, it.ry + t * it.spin, it.rz); dummy.scale.setScalar(it.s); dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  // treat jars: glass jar, gold lid, biscuits inside
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.1, depthWrite: false });
  const lid = new THREE.MeshStandardMaterial({ color: 0xd9a531, roughness: 0.35, metalness: 0.7 });
  const jarGeo = new THREE.LatheGeometry([[0, 0], [3.4, 0], [3.9, 0.6], [3.9, 6.2], [3.0, 7.4], [3.0, 8.2]].map(p => new THREE.Vector2(p[0], p[1])), 24);
  const lidGeo = new THREE.CylinderGeometry(3.25, 3.25, 0.9, 24).translate(0, 8.6, 0);
  const fillGeo = boneGeometry(6).scale(1, 1, 0.42), fillMat = new THREE.MeshStandardMaterial({ color: 0xe2a14c, roughness: 0.85 });
  const jarSpots = [...[0.02, 0.2, 0.38, 0.58, 0.76, 0.9].map(f => T.indexAtS(T.length * f))];
  const fill = new THREE.InstancedMesh(fillGeo, fillMat, jarSpots.length * 26); let fi = 0;
  jarSpots.forEach((i, n) => {
    const side = n % 2 ? -1 : 1, lat = side * (S.width[i] / 2 + 16 + rnd() * 10), jar = new THREE.Group();
    jar.position.set(S.x[i] + S.normalX[i] * lat, S.y[i] + 4 + rnd() * 10, S.z[i] + S.normalZ[i] * lat);
    jar.rotation.set((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7); jar.scale.setScalar(1.3 + rnd() * 0.8);
    jar.add(new THREE.Mesh(jarGeo, glass), new THREE.Mesh(lidGeo, lid)); jar.updateMatrixWorld(true); group.add(jar);
    for (let k = 0; k < 26; k++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 3.0;
      dummy.position.set(Math.cos(a) * r, 0.5 + rnd() * 4.6, Math.sin(a) * r); dummy.rotation.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28); dummy.scale.setScalar(1.0 + rnd() * 0.5); dummy.updateMatrix();
      dummy.matrix.premultiply(jar.matrixWorld); fill.setMatrixAt(fi++, dummy.matrix);
    }
  });
  fill.frustumCulled = false; group.add(fill);
  disposables.push(glass, lid, jarGeo, lidGeo, fillGeo, fillMat, fill);
}

function buildClouds(group, disposables, animated) {
  const rnd = rng(99), dummy = new THREE.Object3D(), geo = new THREE.IcosahedronGeometry(1, 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xfff3ee, roughness: 1, emissive: 0xa0507a, emissiveIntensity: 0.5, flatShading: false });
  const puffs = [];
  const addCluster = (cx, cy, cz, size) => {
    const n = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.28, r = rnd() * size * 0.9, s = size * (0.45 + rnd() * 0.6);
      puffs.push([cx + Math.cos(a) * r, cy + (rnd() - 0.5) * size * 0.25, cz + Math.sin(a) * r, s, s * (0.32 + rnd() * 0.16), s * (0.8 + rnd() * 0.4)]);
    }
  };
  for (let k = 0; k < 150; k++) {                                  // the cloud sea below the whole lap
    const a = rnd() * 6.28, r = 80 + Math.sqrt(rnd()) * 2300;
    addCluster(Math.cos(a) * r, T.minY - 75 - rnd() * 45, Math.sin(a) * r, 70 + rnd() * 130);
  }
  for (let k = 0; k < 46; k++) {                                   // closer puffs beside the road, always below it
    const i = Math.floor(rnd() * N), lat = (rnd() < 0.5 ? -1 : 1) * (S.width[i] / 2 + 26 + rnd() * 80);
    addCluster(S.x[i] + S.normalX[i] * lat, S.y[i] - 22 - rnd() * 34, S.z[i] + S.normalZ[i] * lat, 14 + rnd() * 22);
  }
  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length);
  puffs.forEach((p, k) => { dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(p[3], p[4], p[5]); dummy.rotation.set(0, rnd() * 6.28, 0); dummy.updateMatrix(); mesh.setMatrixAt(k, dummy.matrix); });
  mesh.name = 'TreatRoad_Clouds'; mesh.frustumCulled = false; group.add(mesh);
  // soft floor under the cloud sea so there is never a hole to the void
  const floorGeo = new THREE.CircleGeometry(6000, 48).rotateX(-Math.PI / 2), floorMat = new THREE.MeshBasicMaterial({ color: 0xf2b7b0 });
  const floor = new THREE.Mesh(floorGeo, floorMat); floor.position.y = T.minY - 150; group.add(floor);
  disposables.push(geo, mat, mesh, floorGeo, floorMat);
  animated.push(t => { mesh.position.x = Math.sin(t * 0.02) * 30; });
}

function buildMountains(group, disposables) {
  const rnd = rng(5), parts = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * 6.28 + rnd() * 0.08, r = 2600 + rnd() * 1400, h = 260 + rnd() * 330, w = h * (1.5 + rnd() * 1.2);
    const g = new THREE.ConeGeometry(w, h, 6 + Math.floor(rnd() * 3), 3);
    const p = g.getAttribute('position');
    for (let v = 0; v < p.count; v++) if (p.getY(v) < h / 2 - 1) p.setXYZ(v, p.getX(v) * (0.8 + rnd() * 0.45), p.getY(v), p.getZ(v) * (0.8 + rnd() * 0.45));
    g.rotateY(rnd() * 6.28).translate(Math.cos(a) * r, T.minY - 330 + h / 2, Math.sin(a) * r); parts.push(g);
  }
  const geo = mergeGeometries(parts); parts.forEach(p => p.dispose()); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a5596, roughness: 1 });
  const m = new THREE.Mesh(geo, mat); m.name = 'TreatRoad_Mountains'; group.add(m); disposables.push(geo, mat);
}

function buildSky(group, disposables) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIRECTION } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 horizon = vec3(1.0, 0.56, 0.22), pink = vec3(0.95, 0.36, 0.50), purple = vec3(0.34, 0.20, 0.60), top = vec3(0.10, 0.07, 0.28);
        float s0 = max(dot(d, normalize(sunDir)), 0.0);
        vec3 c = mix(horizon, pink, smoothstep(0.02, 0.22 + 0.12 * s0, h));
        c = mix(c, purple, smoothstep(0.16, 0.50, h));
        c = mix(c, top, smoothstep(0.45, 0.95, h));
        c = mix(c, vec3(0.98, 0.66, 0.56), smoothstep(0.0, -0.12, h));          // haze below the horizon
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.66, 0.25) * pow(s, 5.0) * 0.7 * smoothstep(-0.15, 0.1, h);   // wide glow
        c += vec3(1.0, 0.93, 0.75) * smoothstep(0.9990, 0.9996, s) * 2.5;            // sun disc
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.SphereGeometry(9000, 32, 20), sky = new THREE.Mesh(geo, mat);
  sky.name = 'TreatRoad_Sky'; sky.frustumCulled = false; sky.renderOrder = -10; group.add(sky); disposables.push(geo, mat);
}

/** Build the whole Treat Road scene graph. */
export function createTreatRoad() {
  const group = new THREE.Group(); group.name = 'TreatRoad';
  const disposables = [], animated = [];
  buildSky(group, disposables);
  buildMountains(group, disposables);
  buildClouds(group, disposables, animated);
  buildRoad(group, disposables);
  buildPads(group, disposables, animated);
  buildGates(group, disposables);
  buildLauncher(group, disposables, animated);
  buildTreats(group, disposables, animated);

  const hemi = new THREE.HemisphereLight(0xd9c2ff, 0xffb27a, 1.7);
  const sun = new THREE.DirectionalLight(0xffc08a, 4.2);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(400);
  const lights = new THREE.Group(); lights.name = 'TreatRoad_Lights'; lights.add(hemi, sun, sun.target); group.add(lights);

  return {
    group, track: T, sun,
    /** Animate floating treats and clouds. Pass seconds (any monotonic clock; purely cosmetic). */
    update(t) { for (const f of animated) f(t); },
    /** Sunset fog / tone mapping. Returns a function that puts the scene and renderer back as they were. */
    applyEnvironment(scene, renderer) {
      const prev = { fog: scene.fog, bg: scene.background, tm: renderer?.toneMapping, ex: renderer?.toneMappingExposure };
      scene.fog = new THREE.Fog(0xf3a590, 300, 4600); scene.background = new THREE.Color(0x3a2a66);
      if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; }
      return () => { scene.fog = prev.fog; scene.background = prev.bg; if (renderer) { renderer.toneMapping = prev.tm; renderer.toneMappingExposure = prev.ex; } };
    },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}
