// Water Park — Three.js visuals: the tiled decks, the pools and their water, the rubber rings, the
// beach balls and fountain jets, the slide tower, the big slide and the splash pool it jumps.
// Everything is generated at runtime from shared/waterParkData.js (no model files).
//
//   const world = createWaterPark();
//   scene.add(world.group);
//   const restore = world.applyEnvironment(scene, renderer);
//   each frame: world.update(elapsedSeconds, leadDogPosition, raceSeconds);
//   leaving the map: restore(); scene.remove(world.group); world.dispose();
//
// raceSeconds is the time since GO: the beach balls and the jets are drawn where
// WATER_PARK.hazardsAt(raceSeconds) says they are, which is exactly where the server has them.
// Gameplay never reads these meshes: use WATER_PARK.query(), ringAt() and hazardHit().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_PARK as T } from '../../../shared/waterParkData.js';

const S = T.samples, N = T.sampleCount;
export const SUN_DIRECTION = new THREE.Vector3(0.36, 0.82, 0.3).normalize();
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lapGap = (s, s0) => { let d = (((s - s0) % T.length) + T.length) % T.length; if (d > T.length / 2) d -= T.length; return d; };
const inPool = s => T.depthAt(s) > 0.02;
const onSlide = s => lapGap(s, T.slide.sStart) >= 0 && lapGap(s, T.slide.sEnd) <= 0;
const raised = i => S.y[i] > T.deckY + 1.5;                 // up on legs (the climb and the slide), not on the ground
/** a point beside the road: distance round the lap, metres to the left of the centreline */
const beside = (s, lateral) => T.pointAt(s, lateral);
/** is (x, z) clear of the road by `margin`, and out of the splash pool? */
let splash = null;
const clear = (x, z, margin) => { const q = T.query(x, z); return q.distance > q.halfWidth + margin && Math.hypot(x - splash.x, z - splash.z) > splash.radius + margin; };

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
const signTexture = text => canvasTexture(256, 128, (g) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#1e9be0'; g.lineWidth = 12; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#ff4f8b'; g.textAlign = 'center'; g.textBaseline = 'middle';
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
  const sg = new THREE.SphereGeometry(6500, 24, 12), sky = new THREE.Mesh(sg, mat); sky.name = 'Park_Sky'; sky.frustumCulled = false; sky.renderOrder = -10; group.add(sky); D.push(sg, mat);
  const r = rng(77), o = new THREE.Object3D(), cg = new THREE.IcosahedronGeometry(1, 1), cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xb8c8dc, emissiveIntensity: 0.6, fog: false, flatShading: true }), puffs = [];
  for (let k = 0; k < 14; k++) { const a = r() * 6.28, d = 600 + r() * 3000, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 330 + r() * 300, size = 70 + r() * 120; for (let p = 0; p < 3; p++) puffs.push([cx + (r() - 0.5) * size * 2.2, cy + (r() - 0.5) * size * 0.2, cz + (r() - 0.5) * size * 1.2, size * (0.5 + r() * 0.6)]); }
  const clouds = new THREE.InstancedMesh(cg, cm, puffs.length);
  puffs.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.scale.set(p[3], p[3] * 0.36, p[3] * 0.8); o.updateMatrix(); clouds.setMatrixAt(k, o.matrix); });
  clouds.name = 'Park_Clouds'; clouds.frustumCulled = false; group.add(clouds); D.push(cg, cm, clouds);
}

// ---------- the lawn the park stands on, and the splash pool under the jump
function buildGround(group, D, animated) {
  const lg = new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), lm = new THREE.MeshStandardMaterial({ color: 0x74c35e, roughness: 1 });
  const lawn = new THREE.Mesh(lg, lm); lawn.name = 'Park_Lawn'; lawn.receiveShadow = true; group.add(lawn); D.push(lg, lm);
  // sandy paving inside the lap
  const pg = new THREE.CircleGeometry(330, 40).rotateX(-Math.PI / 2), pm = new THREE.MeshStandardMaterial({ color: 0xf3e2b3, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const paving = new THREE.Mesh(pg, pm); paving.position.set(10, 0.14, -30); paving.scale.set(1.05, 1, 0.74); paving.name = 'Park_Paving'; paving.receiveShadow = true; group.add(paving); D.push(pg, pm);
  // the splash pool: water, a white rim, and a ring of ripples where the dogs come down
  const wg = new THREE.CircleGeometry(splash.radius, 36).rotateX(-Math.PI / 2), wm = new THREE.MeshStandardMaterial({ color: 0x2fb5e8, roughness: 0.08, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const water = new THREE.Mesh(wg, wm); water.position.set(splash.x, 0.25, splash.z); water.name = 'Park_SplashPool'; group.add(water); D.push(wg, wm);
  const rg = new THREE.TorusGeometry(splash.radius + 0.4, 0.8, 6, 40).rotateX(Math.PI / 2), rm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const rim = new THREE.Mesh(rg, rm); rim.position.set(splash.x, 0.3, splash.z); rim.name = 'Park_SplashRim'; group.add(rim); D.push(rg, rm);
  animated.push(t => { wm.opacity = 0.86 + 0.04 * Math.sin(t * 1.4); });
}

// ---------- the road: tiled decks, pool basins, boards up the tower, the flume
const FLOOR = { A: 0xf6ead2, B: 0x7fdcf2, C: 0xffe2c2, D: 0xdff3f7, E: 0x7fdcf2, F: 0xe0b98a, G: 0xffd23a, H: 0xe0b98a };
const WALL = { A: 0x33b6e6, B: 0x33b6e6, C: 0xff7fa8, D: 0x33b6e6, E: 0x33b6e6, F: 0xff8a3c, G: 0xff5d3a, H: 0xff8a3c };
function buildRoad(group, D, animated) {
  const tiles = canvasTexture(64, 64, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#c9c9c9'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64); }, true);
  const pos = [], col = [], uv = [], idx = [], K = 9, c = new THREE.Color();
  for (let r = 0; r <= N; r++) {
    const i = r % N, s = r === N ? T.length : S.s[i], hw = S.width[i] / 2, sec = S.section[i], slide = onSlide(S.s[i]);
    const top = S.y[i] + (slide ? 1.5 : 0.12), floor = S.y[i] - (inPool(S.s[i]) ? T.water.belowDeck + T.depthAt(S.s[i]) : 0);
    const foot = raised(i) ? S.y[i] - 1.1 : 0, out = slide ? 0.5 : 1.4;
    const lat = [-hw - out, -hw - out, -hw, -hw, 0, hw, hw, hw + out, hw + out], y = [foot, top, top, floor, floor + (slide ? -0.35 : 0), floor, top, top, foot];
    // the slide is striped along its length; everything else is the colour of its part of the park
    const floorColor = slide && Math.floor(S.s[i] / 6) % 2 ? 0xffa23a : FLOOR[sec], rim = slide ? 0xff5d3a : 0xffffff;
    const colors = [WALL[sec], WALL[sec], rim, floorColor, floorColor, floorColor, rim, WALL[sec], WALL[sec]];
    for (let k = 0; k < K; k++) {
      pos.push(S.x[i] + S.normalX[i] * lat[k], y[k], S.z[i] + S.normalZ[i] * lat[k]);
      c.set(colors[k]); col.push(c.r, c.g, c.b); uv.push(lat[k] / 2 + (k < 2 || k > 6 ? y[k] / 2 : 0), s / 2);
    }
  }
  for (let r = 0; r < N; r++) {
    if (T.isGapSegment(r)) continue;                           // nothing between the end of the slide and the dock
    for (let k = 0; k < K - 1; k++) { const a = r * K + k, b = a + 1, cc = a + K, d = cc + 1; idx.push(a, b, cc, b, d, cc); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tiles, roughness: 0.7, side: THREE.DoubleSide });
  const road = new THREE.Mesh(flat, mat); road.name = 'Park_Road'; road.receiveShadow = true; road.castShadow = true; group.add(road); D.push(flat, mat, tiles);

  // water: the lagoon, the river (it flows), and a film of it running down the slide
  const ripples = () => canvasTexture(128, 128, (cg) => {
    cg.fillStyle = '#fff'; cg.fillRect(0, 0, 128, 128); cg.strokeStyle = 'rgba(190,235,255,0.9)'; cg.lineWidth = 3;
    for (let k = 0; k < 9; k++) { cg.beginPath(); for (let x = 0; x <= 128; x += 8) cg.lineTo(x, k * 14.2 + 6 + 4 * Math.sin((x / 128) * Math.PI * 4 + k)); cg.stroke(); }
  }, true);
  const ribbon = (name, from, to, lift, inset, color, opacity, speed) => {
    const p = [], u = [], ix = []; let rows = 0;
    for (let s = from; s <= to + 0.01; s += 2, rows++) {
      const a = T.pointAt(s, -(T.pointAt(s).halfWidth - inset)), b = T.pointAt(s, T.pointAt(s).halfWidth - inset);
      p.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z); u.push(0, s / 9, 2, s / 9);
    }
    for (let r = 0; r < rows - 1; r++) { const a = r * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); wg.setIndex(ix); wg.computeVertexNormals();
    const tex = ripples(), wm = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.1, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(wg, wm); mesh.name = name; mesh.renderOrder = 2; group.add(mesh); D.push(wg, wm, tex);
    animated.push(t => { tex.offset.y = -t * speed; tex.offset.x = 0.03 * Math.sin(t * 0.7); });
  };
  for (const pool of T.pools) ribbon(`Park_Water_${pool.id}`, pool.sStart + 0.6, pool.sEnd - 0.6, -T.water.belowDeck, 0.02, 0x2fb5e8, 0.78, pool.flow ? 0.5 : 0.06);
  ribbon('Park_SlideWater', T.slide.sStart, T.slide.sEnd - 1, -0.12, 0.6, 0x9be7ff, 0.5, 2.2);

  // legs under the climb and the slide
  const legs = [];
  for (let i = 0; i < N; i += 7) {
    if (!raised(i) || T.isGapSegment(i)) continue;
    for (const side of [-1, 1]) { const p = T.pointAt(S.s[i], side * (S.width[i] / 2 - 0.6)); legs.push([p.x, p.y - 1.1, p.z]); }
  }
  const lg = new THREE.CylinderGeometry(0.45, 0.45, 1, 8).translate(0, -0.5, 0), lm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), o = new THREE.Object3D();
  const legMesh = new THREE.InstancedMesh(lg, lm, legs.length);
  legs.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.scale.set(1, p[1], 1); o.updateMatrix(); legMesh.setMatrixAt(k, o.matrix); });
  legMesh.name = 'Park_Legs'; legMesh.castShadow = true; group.add(legMesh); D.push(lg, lm, legMesh);

  // start/finish: a chequered line under an arch of balloons
  const chequer = canvasTexture(256, 32, (cg) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { cg.fillStyle = (x + y) % 2 ? '#111' : '#fff'; cg.fillRect(x * 16, y * 16, 16, 16); } });
  chequer.magFilter = THREE.NearestFilter;
  const hw0 = T.startFinish.halfWidth, holder = new THREE.Group(); holder.position.set(...T.startFinish.position); holder.rotation.y = T.startFinish.rotationY;
  const lineG = new THREE.PlaneGeometry(hw0 * 2, 1.6), lineM = new THREE.MeshBasicMaterial({ map: chequer, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const line = new THREE.Mesh(lineG, lineM); line.rotation.x = -Math.PI / 2; line.position.y = 0.16; holder.add(line);
  const balloons = [], hues = [0xff4f8b, 0xffd23a, 0x33b6e6, 0x7be07b, 0xff8a3c];
  for (let k = 0; k <= 22; k++) { const a = k / 22 * Math.PI, x = -Math.cos(a) * (hw0 + 1.6), y = Math.sin(a) * 8.5 + 0.9; balloons.push(ball(1.05, 1, hues[k % hues.length], x, y, 0)); }
  const archG = merge(balloons), archM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }), arch = new THREE.Mesh(archG, archM); arch.castShadow = true; arch.name = 'Park_StartArch'; holder.add(arch);
  const banner = signTexture('WATER PARK'), bannerG = new THREE.PlaneGeometry(9, 4.5), bannerM = new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide }), sign = new THREE.Mesh(bannerG, bannerM); sign.position.y = 6.2; sign.rotation.y = Math.PI; holder.add(sign);      // (it reads the right way round to the dogs coming up to the line)
  group.add(holder); D.push(chequer, lineG, lineM, archG, archM, banner, bannerG, bannerM);
}

// ---------- white railings along the dry decks (the pools have their edges, the slide its walls)
function buildRailings(group, D) {
  const posts = [], rail = [], idx = []; let v = 0;
  for (const side of [1, -1]) {
    let prev = null;
    for (let r = 0; r <= N; r++) {
      const i = r % N;
      if (inPool(S.s[i]) || onSlide(S.s[i]) || T.isGapSegment(i) || Math.abs(lapGap(S.s[i], 0)) < 3 || T.ballLanes.some(s => Math.abs(lapGap(S.s[i], s)) < 4)) { prev = null; continue; }
      const lat = side * (S.width[i] / 2 + 0.2), x = S.x[i] + S.normalX[i] * lat, z = S.z[i] + S.normalZ[i] * lat, y = S.y[i] + 0.1;
      if (prev === null || r % 3 === 0) posts.push([x, y, z]);
      if (prev) { rail.push(prev[0], prev[1] + 1.0, prev[2], prev[0], prev[1] + 1.16, prev[2], x, y + 1.0, z, x, y + 1.16, z); idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); v += 4; }
      prev = [x, y, z];
    }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rail, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  const rm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide }), rails = new THREE.Mesh(rg, rm); rails.name = 'Park_Rails'; group.add(rails);
  const pg = new THREE.CylinderGeometry(0.09, 0.09, 1.2, 6), pmesh = new THREE.InstancedMesh(pg, rm, posts.length), o = new THREE.Object3D();
  posts.forEach((p, k) => { o.position.set(p[0], p[1] + 0.6, p[2]); o.updateMatrix(); pmesh.setMatrixAt(k, o.matrix); });
  pmesh.name = 'Park_RailPosts'; group.add(pmesh); D.push(rg, rm, pg, pmesh);
}

// ---------- the rubber rings, bobbing and drifting down the lagoon
function buildRings(group, D, animated) {
  const geo = new THREE.TorusGeometry(1.75, 0.62, 10, 22).rotateX(Math.PI / 2), mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const mesh = new THREE.InstancedMesh(geo, mat, T.rings.length), o = new THREE.Object3D(), c = new THREE.Color(), hues = [0xff4f8b, 0xffd23a, 0xff8a3c, 0x8be36b, 0xffffff];
  T.rings.forEach((ring, k) => { mesh.setColorAt(k, c.set(hues[k % hues.length])); });
  mesh.name = 'Park_Rings'; mesh.castShadow = true; group.add(mesh); D.push(geo, mat, mesh);
  // (drifting down the lagoon by the race clock, as the track has them: sinking at the far end and coming up at the start)
  animated.push((t, focus, raceSeconds = 0) => {
    T.ringsAt(raceSeconds).forEach((ring, k) => {
      o.position.set(ring.x, ring.y + 0.18 + 0.1 * Math.sin(t * 1.8 + k * 1.3) - (1 - ring.rise) * 1.4, ring.z);
      o.rotation.set(0.05 * Math.sin(t * 1.4 + k), t * 0.2 + k, 0.05 * Math.cos(t * 1.1 + k * 2));
      o.updateMatrix(); mesh.setMatrixAt(k, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

// ---------- the things that knock dogs over: beach balls and fountain jets
function buildHazards(group, D, movers) {
  // a beach ball: six coloured panels and a white cap at each end
  const sphere = new THREE.SphereGeometry(T.ballRadius, 18, 12).toNonIndexed(), p = sphere.getAttribute('position'), colors = new Float32Array(p.count * 3), c = new THREE.Color();
  const panels = [0xff4f6a, 0xffffff, 0x33b6e6, 0xffd23a, 0xffffff, 0x58d36b];
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    c.set(Math.abs(y) > T.ballRadius * 0.93 ? 0xffffff : panels[Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * 6) % 6]);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  sphere.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ballMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }); D.push(sphere, ballMat);
  T.ballLanes.forEach((_, k) => {
    const mesh = new THREE.Mesh(sphere, ballMat); mesh.rotation.order = 'YXZ'; mesh.castShadow = true; mesh.name = 'Park_BeachBall'; group.add(mesh);
    movers[`beachball-${k}`] = h => { mesh.position.set(h.x, h.y, h.z); mesh.rotation.set(h.spin, h.rotationY, Math.PI / 2); };
  });
  // the jets: a nozzle in the deck, and a column of water that leaps out of it
  const nozzleG = merge([cyl(1.25, 1.25, 0.1, 16, 0x9aa7b4, 0, 0.17, 0), cyl(0.5, 0.5, 0.14, 10, 0x4a5560, 0, 0.2, 0)]);
  const nozzleM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), nozzles = new THREE.InstancedMesh(nozzleG, nozzleM, T.jets.length), o = new THREE.Object3D();
  T.jets.forEach((jet, k) => { o.position.set(jet.x, jet.y, jet.z); o.updateMatrix(); nozzles.setMatrixAt(k, o.matrix); });
  nozzles.name = 'Park_JetNozzles'; group.add(nozzles); D.push(nozzleG, nozzleM, nozzles);
  const columnG = new THREE.CylinderGeometry(0.55, 1.05, 1, 12, 1, true).translate(0, 0.5, 0);
  const columnM = new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.1, transparent: true, opacity: 0.8, emissive: 0x7fcfff, emissiveIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const capG = new THREE.IcosahedronGeometry(1.25, 1); D.push(columnG, columnM, capG);
  for (const jet of T.jets) {
    const column = new THREE.Mesh(columnG, columnM), cap = new THREE.Mesh(capG, columnM); column.position.set(jet.x, jet.y + 0.2, jet.z); column.name = 'Park_Jet'; column.renderOrder = 3; cap.renderOrder = 3; group.add(column, cap);
    movers[jet.id] = h => {
      // (a dribble just before it comes on: the warning)
      const height = h.power > 0 ? 0.4 + 7.6 * h.power : h.warning ? 0.5 : 0;
      column.visible = cap.visible = height > 0;
      column.scale.set(1, height, 1);
      cap.position.set(jet.x, jet.y + 0.2 + height, jet.z); cap.scale.setScalar(h.power > 0 ? 0.6 + 0.4 * h.power : 0.3);
    };
  }
}

// ---------- the tower at the top of the slide, the dock, and the park's furniture
function buildScenery(group, D, animated) {
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true }); D.push(prop);
  const place = (geo, x, y, z, yaw, name, shadow = true) => { const m = new THREE.Mesh(geo, prop); m.position.set(x, y, z); m.rotation.y = yaw; m.name = name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); D.push(geo); return m; };
  const r = rng(31);

  // the slide tower: four posts, a striped cone of a roof, and a flag on top
  {
    const top = T.pointAt(T.slide.sStart - 6), w = top.halfWidth + 1.6, parts = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(cyl(0.5, 0.5, 9, 8, 0xffffff, sx * w, 4.5, sz * 6));
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; parts.push(paint(new THREE.ConeGeometry(w * 1.55, 6, 12, 1, true, a, Math.PI / 6), k % 2 ? 0xff4f8b : 0xffffff).translate(0, 12, 0)); }
    parts.push(cyl(0.12, 0.12, 5, 5, 0xffffff, 0, 17, 0), box(2.4, 1.3, 0.08, 0xffd23a, 1.25, 18.6, 0));
    place(merge(parts), top.x, top.y, top.z, top.rotationY, 'Park_SlideTower');
  }
  // the dock the jump comes down on: a jetty of posts out into the splash pool
  {
    const parts = [], dock = T.pointAt(T.launch.landingS - 6);
    for (const sx of [-1, 1]) for (const dz of [-3, 4, 11]) parts.push(cyl(0.4, 0.4, 3.2, 7, 0xb98a52, sx * (dock.halfWidth + 0.9), -0.4, dz), ball(0.55, 0, 0xff4f6a, sx * (dock.halfWidth + 0.9), 1.5, dz));
    place(merge(parts), dock.x, dock.y, dock.z, dock.rotationY, 'Park_DockPosts');
  }

  // palm trees, parasols and sun loungers round the pools; all kept clear of the road
  const palmG = (() => {
    const parts = [cyl(0.32, 0.5, 7, 6, 0xb98a52, 0, 3.5, 0, 0, 0.06)];
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, leaf = cone(0.85, 4.6, 4, k % 2 ? 0x3fae4f : 0x55c060, 0, 0, 0).scale(1, 1, 0.22).rotateZ(-1.15).translate(2.0, 6.6, 0).rotateY(a); parts.push(leaf); }
    parts.push(ball(0.38, 0, 0x8a5a2a, 0.2, 6.7, 0.25), ball(0.38, 0, 0x8a5a2a, -0.3, 6.7, -0.1));
    return merge(parts);
  })();
  const parasolG = hue => merge([cyl(0.08, 0.08, 3.2, 5, 0xffffff, 0, 1.6, 0), cone(2.3, 1.0, 8, hue, 0, 3.5, 0), box(0.8, 0.3, 2.3, 0xffffff, 1.6, 0.35, 0.2, 0.2), box(0.8, 0.5, 0.7, hue, 1.6, 0.7, -0.75, 0.2, -0.5), box(0.8, 0.3, 2.3, 0xffffff, -1.6, 0.35, 0.2, -0.2), box(0.8, 0.5, 0.7, hue, -1.6, 0.7, -0.75, -0.2, -0.5)]);
  const scatter = (count, sFrom, sTo, latMin, latMax, margin) => {
    const out = []; let tries = 0;
    while (out.length < count && tries++ < count * 40) {
      const s = sFrom + r() * (sTo - sFrom), side = r() < 0.5 ? 1 : -1, c = T.pointAt(s), p = beside(s, side * (c.halfWidth + latMin + r() * (latMax - latMin)));
      if (clear(p.x, p.z, margin) && out.every(q => Math.hypot(q[0] - p.x, q[2] - p.z) > 6)) out.push([p.x, 0, p.z, r() * 6.28, 0.85 + r() * 0.5]);
    }
    return out;
  };
  const herd = (name, geo, list) => { const m = new THREE.InstancedMesh(geo, prop, list.length), o = new THREE.Object3D(); list.forEach((a, k) => { o.position.set(a[0], a[1], a[2]); o.rotation.set(0, a[3], 0); o.scale.setScalar(a[4]); o.updateMatrix(); m.setMatrixAt(k, o.matrix); }); m.name = name; m.castShadow = true; group.add(m); D.push(geo, m); };
  herd('Park_Palms', palmG, [...scatter(46, 0, T.sections.find(sec => sec.id === 'F').sStart, 5, 46, 4), ...scatter(18, T.launch.landingS, T.length, 5, 30, 4)]);
  [0xff4f8b, 0xffd23a, 0x33b6e6].forEach((hue, k) => herd(`Park_Parasols_${k}`, parasolG(hue), scatter(9, 0, T.pools[1].sEnd, 4, 22, 3).map(p => [p[0], p[1], p[2], p[3], 1])));

  // in the middle of the park, for show: a big wave pool with an island, and two spiral slides
  {
    const cx = 25, cz = -35, wg = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), wm = new THREE.MeshStandardMaterial({ color: 0x2fb5e8, roughness: 0.08, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    const pool = new THREE.Mesh(wg, wm); pool.position.set(cx, 0.32, cz); pool.scale.set(105, 1, 62); pool.name = 'Park_WavePool'; group.add(pool); D.push(wg, wm);
    const rimG = new THREE.TorusGeometry(1, 0.012, 6, 48).rotateX(Math.PI / 2), rimM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const rim = new THREE.Mesh(rimG, rimM); rim.position.set(cx, 0.4, cz); rim.scale.set(105, 60, 62); group.add(rim); D.push(rimG, rimM);
    place(merge([cyl(11, 13, 1.6, 14, 0xf3e2b3, 0, 0.8, 0), ball(3, 1, 0x58c060, -4, 2.2, 2, 1, 0.6, 1), ball(2.4, 1, 0x49b055, 4, 2.0, -3, 1, 0.6, 1)]), cx, 0, cz, 0, 'Park_Island');
    herd('Park_IslandPalms', palmG, [[cx - 3, 1.5, cz - 2, 1, 1.5], [cx + 4, 1.5, cz + 3, 3, 1.25], [cx + 1, 1.5, cz - 6, 5, 1.1]]);
    animated.push(t => { wm.opacity = 0.88 + 0.04 * Math.sin(t * 1.1); pool.position.y = 0.32 + 0.05 * Math.sin(t * 0.9); });
    for (const [x, z, hue, turns, flip] of [[-95, -75, 0xff4f8b, 3, 1], [150, 30, 0x8be36b, 2.5, -1], [-60, 40, 0x33b6e6, 2, 1]]) {
      class Helix extends THREE.Curve { getPoint(u, target = new THREE.Vector3()) { const a = u * turns * Math.PI * 2 * flip; return target.set(Math.cos(a) * (7 + 5 * u), 22 * (1 - u) + 1.2, Math.sin(a) * (7 + 5 * u)); } }
      const tube = paint(new THREE.TubeGeometry(new Helix(), 90, 1.5, 8, false), hue);
      const tower = [cyl(1.0, 1.3, 23, 8, 0xffffff, 0, 11.5, 0), cyl(5, 5, 0.5, 10, 0xffd23a, 0, 22.4, 0), cone(6, 4, 10, hue, 0, 27, 0)];
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; tower.push(cyl(0.2, 0.2, 3, 5, 0xffffff, Math.cos(a) * 4.4, 24, Math.sin(a) * 4.4)); }
      place(merge([tube, ...tower]), x, 0, z, 0, 'Park_SpiralSlide');
    }
    // palms and parasols about the middle of the park
    const inside = []; let tries = 0;
    while (inside.length < 34 && tries++ < 2000) {
      const x = -260 + r() * 540, z = -200 + r() * 340;
      if (!clear(x, z, 8) || ((x - cx) / 112) ** 2 + ((z - cz) / 69) ** 2 < 1 || inside.some(q => Math.hypot(q[0] - x, q[2] - z) < 14)) continue;
      if (T.query(x, z).lateral > 0) continue;                 // (inside the lap only: the middle is on the - side)
      inside.push([x, 0, z, r() * 6.28, 0.9 + r() * 0.6]);
    }
    herd('Park_InnerPalms', palmG, inside);
  }

  // rubber ducks the size of a car, drifting about the splash pool
  const duckG = merge([ball(1.5, 1, 0xffd23a, 0, 0.7, 0, 1, 0.75, 1.3), ball(0.95, 1, 0xffd23a, 0, 2.1, 1.0), cone(0.42, 0.9, 5, 0xff8a3c, 0, 2.0, 2.1, Math.PI / 2), ball(0.14, 0, 0x202020, 0.5, 2.4, 1.7), ball(0.14, 0, 0x202020, -0.5, 2.4, 1.7), cone(0.8, 1.2, 4, 0xffd23a, 0, 1.3, -1.9, -1.0)]); D.push(duckG);
  const ducks = Array.from({ length: 5 }, (_, k) => { const m = new THREE.Mesh(duckG, prop); m.name = 'Park_Duck'; m.castShadow = true; group.add(m); return { m, rad: splash.radius * (0.35 + 0.5 * r()), sp: (0.05 + r() * 0.05) * (k % 2 ? 1 : -1), ph: r() * 6.28 }; });
  animated.push(t => { for (const d of ducks) { const a = d.ph + t * d.sp; d.m.position.set(splash.x + Math.cos(a) * d.rad, 0.2 + 0.12 * Math.sin(t * 1.6 + d.ph), splash.z + Math.sin(a) * d.rad); d.m.rotation.y = -a + (d.sp > 0 ? 0 : Math.PI); d.m.rotation.z = 0.06 * Math.sin(t * 1.2 + d.ph); } });

}

/** Build the whole park. */
export function createWaterPark() {
  const group = new THREE.Group(); group.name = 'WaterPark';
  const D = [], animated = [], movers = {};
  // the splash pool lies under the jump
  { const a = T.pointAt(T.launch.gapStart), b = T.pointAt(T.launch.gapEnd); splash = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius: Math.hypot(a.x - b.x, a.z - b.z) / 2 + 9 }; }
  buildSky(group, D); buildGround(group, D, animated); buildRoad(group, D, animated); buildRailings(group, D);
  buildRings(group, D, animated); buildHazards(group, D, movers); buildScenery(group, D, animated);
  const hemi = new THREE.HemisphereLight(0xd6ecff, 0xbfe0b0, 1.15), sun = new THREE.DirectionalLight(0xfff4dc, 3.2);
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  const lights = new THREE.Group(); lights.name = 'Park_Lights'; lights.add(hemi, sun, sun.target); group.add(lights);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(300);
  const placeHazards = raceSeconds => { for (const h of T.hazardsAt(raceSeconds)) movers[h.id]?.(h); };
  placeHazards(0);
  for (const f of animated) f(0, null);
  return {
    group, track: T, sun,
    /** t = seconds (cosmetic).  focus = {x,y,z} of the dog to light.  raceSeconds = time since GO. */
    update(t, focus, raceSeconds = 0) {
      T.setClock(raceSeconds);              // (the rings drift down the lagoon by the race clock)
      for (const f of animated) f(t, focus, raceSeconds);
      placeHazards(raceSeconds);
      if (focus) { sun.target.position.set(focus.x, focus.y, focus.z); sun.position.set(focus.x, focus.y, focus.z).addScaledVector(SUN_DIRECTION, 300); }
    },
    /** how many triangles the whole park is (instances counted) */
    triangles() { let n = 0; group.traverse(m => { if (!m.isMesh) return; const g = m.geometry, tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3; n += tris * (m.isInstancedMesh ? m.count : 1); }); return Math.round(n); },
    /** Bright summer daylight: fog, tone mapping, optional sun shadows.  Returns a function that undoes it. */
    applyEnvironment(scene, renderer, { shadows = true } = {}) {
      const prev = { fog: scene.fog, bg: scene.background, tm: renderer?.toneMapping, ex: renderer?.toneMappingExposure, sh: renderer?.shadowMap.enabled };
      scene.fog = new THREE.Fog(0xcfe9fb, 800, 6000); scene.background = new THREE.Color(0x8fcdf7);
      if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85; if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; sun.castShadow = true; } }
      return () => { scene.fog = prev.fog; scene.background = prev.bg; if (renderer) { renderer.toneMapping = prev.tm; renderer.toneMappingExposure = prev.ex; renderer.shadowMap.enabled = prev.sh; } };
    },
    dispose() { for (const d of D) d.dispose?.(); },
  };
}
