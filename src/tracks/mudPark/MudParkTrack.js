// Squelch Hollow Mud Run — Three.js visuals: the muddy trail on its banks, the marshals' tape, the
// clay, the bog, the tyres, the logs and the quad bike, the mudslide and the pit it leaps, the event
// village, the pines, and the rain.  Everything is generated at runtime from shared/mudParkData.js.
//
//   const world = createMudPark();
//   scene.add(world.group);
//   const restore = world.applyEnvironment(scene, renderer);
//   each frame: world.update(elapsedSeconds, leadDogPosition, raceSeconds);
//   leaving the map: restore(); scene.remove(world.group); world.dispose();
//
// raceSeconds is the time since GO: the quad bike and the logs are drawn where
// MUD_PARK.hazardsAt(raceSeconds) says they are, which is exactly where the server has them.
// Gameplay never reads these meshes: use MUD_PARK.query() and MUD_PARK.hazardHit().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MUD_PARK as T } from '../../../shared/mudParkData.js';

const S = T.samples, N = T.sampleCount;
export const SUN_DIRECTION = new THREE.Vector3(0.3, 0.8, 0.4).normalize();
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lapGap = (s, s0) => { let d = (((s - s0) % T.length) + T.length) % T.length; if (d > T.length / 2) d -= T.length; return d; };
const within = (s, zone) => lapGap(s, zone.sStart) >= 0 && lapGap(s, zone.sEnd) <= 0;
const BANK = 15;                                            // how far out the bank runs down from the edge of the trail

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
  g.fillStyle = '#ffd23a'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#202020'; g.lineWidth = 12; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#202020'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 76; do { g.font = `bold ${size}px sans-serif`; size -= 4; } while (g.measureText(text).width > 220 && size > 20);
  g.fillText(text, 128, 68);
});

// ---------- a low grey sky
function buildSky(group, D) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir;
      void main(){ float h = max(normalize(vDir).y, 0.0);
        vec3 c = mix(vec3(0.72, 0.76, 0.78), vec3(0.42, 0.47, 0.52), pow(h, 0.6));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sg = new THREE.SphereGeometry(6500, 24, 12), sky = new THREE.Mesh(sg, mat); sky.name = 'Mud_Sky'; sky.frustumCulled = false; sky.renderOrder = -10; group.add(sky); D.push(sg, mat);
  const r = rng(71), o = new THREE.Object3D(), cg = new THREE.IcosahedronGeometry(1, 1), cm = new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: 1, emissive: 0x70787f, emissiveIntensity: 0.7, fog: false, flatShading: true }), puffs = [];
  for (let k = 0; k < 26; k++) { const a = r() * 6.28, d = 300 + r() * 2600, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 420 + r() * 220, size = 110 + r() * 160; for (let p = 0; p < 3; p++) puffs.push([cx + (r() - 0.5) * size * 2.2, cy + (r() - 0.5) * size * 0.2, cz + (r() - 0.5) * size * 1.2, size * (0.5 + r() * 0.6)]); }
  const clouds = new THREE.InstancedMesh(cg, cm, puffs.length);
  puffs.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.scale.set(p[3], p[3] * 0.3, p[3] * 0.8); o.updateMatrix(); clouds.setMatrixAt(k, o.matrix); });
  clouds.name = 'Mud_Clouds'; clouds.frustumCulled = false; group.add(clouds); D.push(cg, cm, clouds);
}

// ---------- the sodden field, and the mud pit under the leap
function buildGround(group, D, animated, pit) {
  const fg = new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), fm = new THREE.MeshStandardMaterial({ color: 0x66803f, roughness: 0.85 });
  const field = new THREE.Mesh(fg, fm); field.position.y = -0.08; field.name = 'Mud_Field'; field.receiveShadow = true; group.add(field); D.push(fg, fm);
  const pg = new THREE.CircleGeometry(pit.radius, 32).rotateX(-Math.PI / 2), pm = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.12, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const mud = new THREE.Mesh(pg, pm); mud.position.set(pit.x, 0.3, pit.z); mud.name = 'Mud_Pit'; group.add(mud); D.push(pg, pm);
  const rg = new THREE.TorusGeometry(pit.radius + 0.6, 1.2, 6, 30).rotateX(Math.PI / 2), rm = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 1, flatShading: true });
  const rim = new THREE.Mesh(rg, rm); rim.position.set(pit.x, 0.2, pit.z); rim.name = 'Mud_PitRim'; group.add(rim); D.push(rg, rm);
  // bubbles rising and popping in the pit
  const bg = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), bubbles = [0, 1, 2, 3, 4, 5, 6].map(k => { const m = new THREE.Mesh(bg, pm), a = k * 2.4, d = pit.radius * (0.2 + 0.65 * ((k * 0.37) % 1)); m.position.set(pit.x + Math.cos(a) * d, 0.3, pit.z + Math.sin(a) * d); group.add(m); return m; });
  D.push(bg);
  animated.push(t => bubbles.forEach((m, k) => { const ph = (t * 0.45 + k * 0.31) % 1; m.scale.setScalar(ph < 0.85 ? 0.3 + ph * 1.1 : 0.01); }));
}

// ---------- the trail on its banks, the clay, the mudslide
const TRAIL = { A: 0x8a6f45, B: 0xc08a52, C: 0x5e4630, D: 0x6b4f33, E: 0x6b4f33, F: 0x4a3524, H: 0x6b4f33 };
function buildTrail(group, D) {
  const grit = canvasTexture(128, 128, (g) => { const r = rng(4); g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); for (let k = 0; k < 900; k++) { const v = 200 + Math.floor(r() * 55); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 2 + r() * 4, 2 + r() * 3); } }, true);
  const pos = [], col = [], uv = [], idx = [], c = new THREE.Color(), K = 7, grass = [0x6b8444, 0x66803f];
  for (let r = 0; r <= N; r++) {
    const i = r % N, s = r === N ? T.length : S.s[i], hw = S.width[i] / 2, y = S.y[i];
    const lat = [-hw - BANK, -hw - 1.2, -hw, 0, hw, hw + 1.2, hw + BANK], h = [-0.1, y - 0.15, y, y + (within(S.s[i], T.slide) ? -0.4 : 0.05), y, y - 0.15, -0.1];
    const trail = within(S.s[i], T.slide) && Math.floor(S.s[i] / 5) % 2 ? 0x3d2b1c : TRAIL[S.section[i]];
    const colors = [grass[1], grass[0], trail, trail, trail, grass[0], grass[1]];
    for (let k = 0; k < K; k++) { pos.push(S.x[i] + S.normalX[i] * lat[k], h[k], S.z[i] + S.normalZ[i] * lat[k]); c.set(colors[k]); col.push(c.r, c.g, c.b); uv.push(lat[k] / 4, s / 4); }
  }
  for (let r = 0; r < N; r++) { if (T.isGapSegment(r)) continue; for (let k = 0; k < K - 1; k++) { const a = r * K + k, b = a + 1, cc = a + K, d = cc + 1; idx.push(a, b, cc, b, d, cc); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // (wet: everything shines a little)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grit, roughness: 0.42, side: THREE.DoubleSide });
  const trail = new THREE.Mesh(g, mat); trail.name = 'Mud_Trail'; trail.receiveShadow = true; group.add(trail); D.push(g, mat, grit);

  // marshals' tape down both sides: posts, and a red and white ribbon between them
  const tape = canvasTexture(64, 16, (cg) => { for (let k = 0; k < 4; k++) { cg.fillStyle = k % 2 ? '#fff' : '#e2303a'; cg.fillRect(k * 16, 0, 16, 16); } }, true);
  const posts = [], p = [], u = [], ix = []; let v = 0;
  for (const side of [1, -1]) {
    let prev = null;
    for (let r = 0; r <= N; r++) {
      const i = r % N, s = r === N ? T.length : S.s[i];
      if (T.isGapSegment(i) || Math.abs(lapGap(S.s[i], T.quadLane.s)) < 5 || (side > 0 && T.logLanes.some(l => Math.abs(lapGap(S.s[i], l)) < 4))) { prev = null; continue; }
      const lat = side * (S.width[i] / 2 + 0.25), x = S.x[i] + S.normalX[i] * lat, z = S.z[i] + S.normalZ[i] * lat, y = S.y[i];
      if (prev === null || r % 3 === 0) posts.push([x, y, z]);
      if (prev) { p.push(prev[0], prev[1] + 0.85, prev[2], prev[0], prev[1] + 1.0, prev[2], x, y + 0.85, z, x, y + 1.0, z); u.push(prev[3], 0, prev[3], 1, s / 1.5, 0, s / 1.5, 1); ix.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); v += 4; }
      prev = [x, y, z, s / 1.5];
    }
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); tg.setIndex(ix); tg.computeVertexNormals();
  const tm = new THREE.MeshBasicMaterial({ map: tape, side: THREE.DoubleSide }), ribbon = new THREE.Mesh(tg, tm); ribbon.name = 'Mud_Tape'; group.add(ribbon);
  const pg = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 5), pm = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 }), pmesh = new THREE.InstancedMesh(pg, pm, posts.length), o = new THREE.Object3D();
  posts.forEach((q, k) => { o.position.set(q[0], q[1] + 0.55, q[2]); o.rotation.set(0.1 * Math.sin(k), 0, 0.1 * Math.cos(k * 1.7)); o.updateMatrix(); pmesh.setMatrixAt(k, o.matrix); });
  pmesh.name = 'Mud_TapePosts'; group.add(pmesh); D.push(tape, tg, tm, pg, pm, pmesh);

  // start/finish: a chequered line under a scaffold arch
  const chequer = canvasTexture(256, 32, (cg) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { cg.fillStyle = (x + y) % 2 ? '#111' : '#fff'; cg.fillRect(x * 16, y * 16, 16, 16); } });
  chequer.magFilter = THREE.NearestFilter;
  const hw0 = T.startFinish.halfWidth, holder = new THREE.Group(); holder.position.set(...T.startFinish.position); holder.rotation.y = T.startFinish.rotationY;
  const lineG = new THREE.PlaneGeometry(hw0 * 2, 1.6), lineM = new THREE.MeshBasicMaterial({ map: chequer, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const line = new THREE.Mesh(lineG, lineM); line.rotation.x = -Math.PI / 2; line.position.y = 0.12; holder.add(line);
  const arch = merge([box(0.5, 8.5, 0.5, 0x9aa3ad, -(hw0 + 1.6), 4.25, 0), box(0.5, 8.5, 0.5, 0x9aa3ad, hw0 + 1.6, 4.25, 0), box(hw0 * 2 + 4.2, 0.5, 0.5, 0x9aa3ad, 0, 8.4, 0), box(hw0 * 2 + 4.2, 0.5, 0.5, 0x9aa3ad, 0, 6.2, 0)]);
  const am = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }), archMesh = new THREE.Mesh(arch, am); archMesh.castShadow = true; archMesh.name = 'Mud_StartArch'; holder.add(archMesh);
  const banner = signTexture('MUD RUN'), bannerG = new THREE.PlaneGeometry(hw0 * 2 + 3, 2.0), bannerM = new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide }), sign = new THREE.Mesh(bannerG, bannerM); sign.position.y = 7.3; sign.rotation.y = Math.PI; holder.add(sign);
  group.add(holder); D.push(chequer, lineG, lineM, arch, am, banner, bannerG, bannerM);
}

// ---------- the bog, the tyres, the logs and the quad bike
function buildHazards(group, D, movers) {
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true }), o = new THREE.Object3D(); D.push(prop);
  const bg = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), bm = new THREE.MeshStandardMaterial({ color: 0x2c1e12, roughness: 0.1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const bog = new THREE.InstancedMesh(bg, bm, T.mud.length);
  T.mud.forEach((patch, k) => { o.position.set(patch.x, patch.y + 0.1, patch.z); o.rotation.set(0, patch.rotationY, 0); o.scale.set(patch.across, 1, patch.along); o.updateMatrix(); bog.setMatrixAt(k, o.matrix); });
  bog.name = 'Mud_Bog'; group.add(bog); D.push(bg, bm, bog);
  // stacks of tyres standing in the trail
  const stack = []; for (let k = 0; k < 4; k++) stack.push(paint(new THREE.TorusGeometry(0.78, 0.32, 7, 14).rotateX(Math.PI / 2), k % 2 ? 0x26282c : 0x1a1b1e).translate(0.06 * Math.sin(k * 2), 0.32 + k * 0.6, 0.06 * Math.cos(k * 3)));
  const tyreG = merge(stack), tyres = new THREE.InstancedMesh(tyreG, prop, T.obstacles.length);
  o.scale.set(1, 1, 1); T.obstacles.forEach((ob, k) => { o.position.set(ob.x, ob.y, ob.z); o.rotation.set(0, k, 0); o.updateMatrix(); tyres.setMatrixAt(k, o.matrix); });
  tyres.name = 'Mud_Tyres'; tyres.castShadow = true; group.add(tyres); D.push(tyreG, tyres);
  // the logs that roll down the bank
  const logG = merge([cyl(T.logRun.radius, T.logRun.radius, 4.4, 10, 0x7a5232, 0, 0, 0, Math.PI / 2), cyl(T.logRun.radius * 0.8, T.logRun.radius * 0.8, 4.44, 9, 0xc9a070, 0, 0, 0, Math.PI / 2), cyl(0.12, 0.1, 0.7, 5, 0x5d3f26, 0.5, T.logRun.radius + 0.2, 0.8)]); D.push(logG);
  T.logLanes.forEach((_, k) => {
    const log = new THREE.Mesh(logG, prop); log.rotation.order = 'YZX'; log.castShadow = true; log.name = 'Mud_Log'; group.add(log);
    movers[`log-${k}`] = h => { log.visible = h.fade > 0.01; log.position.set(h.x, h.y + T.logRun.radius, h.z); log.rotation.set(0, h.rotationY, h.spin); log.scale.setScalar(0.6 + 0.4 * h.fade); };
  });
  // the marshal's quad bike
  const wheel = (x, z) => cyl(0.55, 0.55, 0.45, 10, 0x1c1d20, x, 0.55, z, 0, Math.PI / 2);
  const quadG = merge([box(1.1, 0.6, 2.3, 0xe2303a, 0, 1.0, 0), box(0.9, 0.3, 0.9, 0x1c1d20, 0, 1.45, -0.4), box(1.5, 0.12, 0.12, 0x30343a, 0, 1.75, 0.7), box(0.12, 0.6, 0.12, 0x30343a, 0, 1.45, 0.7), box(1.9, 0.14, 0.5, 0xe2303a, 0, 1.2, 1.0), box(1.9, 0.14, 0.5, 0xe2303a, 0, 1.2, -1.0),
    box(0.5, 0.3, 0.2, 0xffe08a, 0, 1.15, 1.2), wheel(-0.85, 0.85), wheel(0.85, 0.85), wheel(-0.85, -0.85), wheel(0.85, -0.85),
    ball(0.42, 1, 0xffd23a, 0, 2.55, -0.3), box(0.8, 0.9, 0.5, 0xff8a3c, 0, 1.95, -0.35), box(0.25, 0.25, 0.9, 0xff8a3c, -0.45, 1.95, 0.2), box(0.25, 0.25, 0.9, 0xff8a3c, 0.45, 1.95, 0.2)]);
  const quad = new THREE.Mesh(quadG, prop); quad.castShadow = true; quad.name = 'Mud_QuadBike'; group.add(quad); D.push(quadG);
  movers.quad = h => { quad.position.set(h.x, h.y, h.z); quad.rotation.y = h.rotationY; };
}

// ---------- the event village, the pines, the signs
function buildScenery(group, D, animated, pit) {
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), r = rng(23), o = new THREE.Object3D(); D.push(prop);
  const clear = (x, z, margin) => { const q = T.query(x, z); return q.distance > q.halfWidth + margin && Math.hypot(x - pit.x, z - pit.z) > pit.radius + margin; };
  const herd = (name, geo, list) => { const m = new THREE.InstancedMesh(geo, prop, list.length); list.forEach((a, k) => { o.position.set(a[0], a[1], a[2]); o.rotation.set(0, a[3], 0); o.scale.setScalar(a[4]); o.updateMatrix(); m.setMatrixAt(k, o.matrix); }); m.name = name; m.castShadow = true; group.add(m); D.push(geo, m); };
  // gazebos and a marshals' cabin by the start, and flags along the paddock
  const start = T.pointAt(0);
  const tent = hue => merge([cone(4.2, 2.6, 4, hue, 0, 4.4, 0).rotateY(Math.PI / 4), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => cyl(0.09, 0.09, 3.2, 5, 0xdadada, sx * 2.7, 1.6, sz * 2.7)), box(4, 0.8, 1.4, 0xf2f2f2, 0, 0.4, 0)]);
  [0xe2303a, 0x1e9be0, 0xffd23a, 0x2fae62].forEach((hue, k) => { const p = T.pointAt(-20 + k * 16, -(start.halfWidth + BANK + 8)); herd(`Mud_Tent_${k}`, tent(hue), [[p.x, 0, p.z, p.rotationY, 1]]); });
  const loo = merge([box(1.4, 2.6, 1.4, 0x2a7fb8, 0, 1.3, 0), box(1.5, 0.2, 1.5, 0xf2f2f2, 0, 2.7, 0), box(0.9, 1.9, 0.06, 0x1e6394, 0, 1.2, 0.72)]);
  herd('Mud_Loos', loo, [0, 1, 2].map(k => { const p = T.pointAt(60 + k * 2.2, start.halfWidth + BANK + 7); return [p.x, 0, p.z, p.rotationY + Math.PI / 2, 1]; }));
  const flagG = merge([cyl(0.05, 0.05, 4.2, 5, 0xdadada, 0, 2.1, 0), box(0.05, 0.7, 1.4, 0xff8a3c, 0, 3.7, 0.75)]), flags = [];
  for (let s = -50; s < 130; s += 15) for (const side of [-1, 1]) { const p = T.pointAt(s, side * (start.halfWidth + 2.2)); flags.push([p.x, p.y, p.z, p.rotationY, 1]); }
  herd('Mud_Flags', flagG, flags);
  // pines all over the field, clear of the trail and its banks
  const pine = merge([cyl(0.35, 0.5, 3, 6, 0x5d3f26, 0, 1.5, 0), cone(3.0, 5, 7, 0x24452c, 0, 5, 0), cone(2.3, 4.2, 7, 0x2b5234, 0, 7.6, 0), cone(1.5, 3.4, 7, 0x326040, 0, 10, 0)]), pines = []; let tries = 0;
  while (pines.length < 110 && tries++ < 5000) { const x = -420 + r() * 860, z = -380 + r() * 720; if (!clear(x, z, BANK + 4) || pines.some(q => Math.hypot(q[0] - x, q[2] - z) < 9)) continue; pines.push([x, 0, z, r() * 6.28, 0.8 + r() * 0.9]); }
  herd('Mud_Pines', pine, pines);
  // puddles standing in the field
  const pg = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), pm = new THREE.MeshStandardMaterial({ color: 0x6f7f86, roughness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), puddles = [];
  tries = 0; while (puddles.length < 60 && tries++ < 3000) { const x = -380 + r() * 780, z = -340 + r() * 640; if (clear(x, z, BANK + 2)) puddles.push([x, z, 2 + r() * 5, r() * 3]); }
  const pmesh = new THREE.InstancedMesh(pg, pm, puddles.length);
  puddles.forEach((q, k) => { o.position.set(q[0], 0.0, q[1]); o.rotation.set(0, q[3], 0); o.scale.set(q[2], 1, q[2] * 0.6); o.updateMatrix(); pmesh.setMatrixAt(k, o.matrix); });
  pmesh.name = 'Mud_Puddles'; group.add(pmesh); D.push(pg, pm, pmesh);
  // signs on the way in to each part of the course
  const postG = new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), postM = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 }), boardG = new THREE.PlaneGeometry(3.0, 1.5); D.push(postG, postM, boardG);
  for (const [text, s] of [['SLIPPERY!', T.clay.sStart - 16], ['DEEP MUD', T.mud[0].s - 24], ['QUAD BIKE!', T.quadLane.s - 26], ['LOGS!', T.logLanes[0] - 24], ['TYRES', T.obstacles[0].s - 14], ['MUDSLIDE', T.slide.sStart - 30], ['LEAP!', T.launch.padStart - 36]]) {
    const c = T.pointAt(s), p = T.pointAt(s, c.halfWidth + 1.3), tex = signTexture(text), mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); D.push(tex, mat);
    const post = new THREE.Mesh(postG, postM); post.position.set(p.x, p.y + 1.1, p.z); group.add(post);
    const board = new THREE.Mesh(boardG, mat); board.position.set(p.x, p.y + 3.0, p.z); board.rotation.y = c.rotationY + Math.PI; board.name = 'Mud_Sign'; group.add(board);
  }
}

// ---------- the rain: streaks falling all round whichever dog the camera is following
function buildRain(group, D, animated) {
  const COUNT = 1500, BOX = { x: 70, y: 34, z: 70 }, FALL = 42, SLANT = 5, LENGTH = 1.5;
  const r = rng(99), drops = Array.from({ length: COUNT }, () => [r() * BOX.x, r() * BOX.y, r() * BOX.z, 0.8 + r() * 0.5]);
  const positions = new Float32Array(COUNT * 6), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xcfe0ea, transparent: true, opacity: 0.38, depthWrite: false, fog: false });
  const rain = new THREE.LineSegments(geometry, material); rain.name = 'Mud_Rain'; rain.frustumCulled = false; rain.renderOrder = 4; group.add(rain); D.push(geometry, material);
  const wrap = (v, size) => ((v % size) + size) % size;
  animated.push((t, focus) => {
    const fx = focus?.x ?? 0, fy = focus?.y ?? 0, fz = focus?.z ?? 0;
    for (let k = 0; k < COUNT; k++) {
      const d = drops[k];
      // each drop keeps its own place in a box that travels with the dog, falling and slanting with the wind
      const x = fx - BOX.x / 2 + wrap(d[0] - t * SLANT - fx, BOX.x), y = fy - 4 + wrap(d[1] - t * FALL * d[3] - fy, BOX.y), z = fz - BOX.z / 2 + wrap(d[2] - fz, BOX.z);
      positions.set([x, y, z, x + SLANT * LENGTH / FALL, y + LENGTH, z], k * 6);
    }
    geometry.attributes.position.needsUpdate = true;
  });
}

/** Build the whole mud run. */
export function createMudPark() {
  const group = new THREE.Group(); group.name = 'MudPark';
  const D = [], animated = [], movers = {};
  // the mud pit lies under the leap
  const a = T.pointAt(T.launch.gapStart), b = T.pointAt(T.launch.gapEnd), pit = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius: Math.hypot(a.x - b.x, a.z - b.z) / 2 + 8 };
  buildSky(group, D); buildGround(group, D, animated, pit); buildTrail(group, D); buildHazards(group, D, movers); buildScenery(group, D, animated, pit); buildRain(group, D, animated);
  const hemi = new THREE.HemisphereLight(0xd4dee6, 0x8a8468, 1.5), sun = new THREE.DirectionalLight(0xe6ecf2, 1.7);
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  const lights = new THREE.Group(); lights.name = 'Mud_Lights'; lights.add(hemi, sun, sun.target); group.add(lights);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(300);
  const placeHazards = raceSeconds => { for (const h of T.hazardsAt(raceSeconds)) movers[h.id]?.(h); };
  placeHazards(0);
  for (const f of animated) f(0, null);
  return {
    group, track: T, sun,
    /** t = seconds (cosmetic).  focus = {x,y,z} of the dog to light and to rain on.  raceSeconds = time since GO. */
    update(t, focus, raceSeconds = 0) {
      for (const f of animated) f(t, focus);
      placeHazards(raceSeconds);
      if (focus) { sun.target.position.set(focus.x, focus.y, focus.z); sun.position.set(focus.x, focus.y, focus.z).addScaledVector(SUN_DIRECTION, 300); }
    },
    /** how many triangles the whole course is (instances counted) */
    triangles() { let n = 0; group.traverse(m => { if (!m.isMesh) return; const g = m.geometry, tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3; n += tris * (m.isInstancedMesh ? m.count : 1); }); return Math.round(n); },
    /** A wet, grey afternoon: close fog, flat light.  Returns a function that undoes it. */
    applyEnvironment(scene, renderer, { shadows = true } = {}) {
      const prev = { fog: scene.fog, bg: scene.background, tm: renderer?.toneMapping, ex: renderer?.toneMappingExposure, sh: renderer?.shadowMap.enabled };
      scene.fog = new THREE.Fog(0xaab4ba, 60, 900); scene.background = new THREE.Color(0x9aa5ac);
      if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85; if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; sun.castShadow = true; } }
      return () => { scene.fog = prev.fog; scene.background = prev.bg; if (renderer) { renderer.toneMapping = prev.tm; renderer.toneMappingExposure = prev.ex; renderer.shadowMap.enabled = prev.sh; } };
    },
    dispose() { for (const d of D) d.dispose?.(); },
  };
}
