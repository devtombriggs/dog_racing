// The Three.js side of shared/trackKit.js: the parts every kit-made map is drawn with (sky, ground,
// the road and its edges, start line, boost pads, patches, pools, islands), and the world object the
// game expects.  Each map (src/tracks/desert, speedBowl, kombuHouse, neon) says what its road and sky
// look like and adds its own scenery and moving things.
//
//   export const createDesert = () => createKitWorld(DESERT, { ...look, build(ctx) { ...scenery... } });
//
//   const world = createDesert();
//   scene.add(world.group);
//   const restore = world.applyEnvironment(scene, renderer);
//   each frame: world.update(elapsedSeconds, leadDogPosition, raceSeconds);
//   leaving the map: restore(); scene.remove(world.group); world.dispose();
//
// Gameplay never reads these meshes: it asks the track (query, hazardHit).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- building things out of painted primitives
export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
  const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export const box = (w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => { const g = paint(new THREE.BoxGeometry(w, h, d), color); if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); return g.translate(x, y, z); };
export const cyl = (rt, rb, h, seg, color, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { const g = paint(new THREE.CylinderGeometry(rt, rb, h, seg), color); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };
export const ball = (r, detail, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => paint(new THREE.IcosahedronGeometry(r, detail), color).scale(sx, sy, sz).translate(x, y, z);
export const cone = (r, h, seg, color, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { const g = paint(new THREE.ConeGeometry(r, h, seg), color); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };
export const torus = (r, tube, color, x = 0, y = 0, z = 0, rx = 0, seg = 16) => { const g = paint(new THREE.TorusGeometry(r, tube, 8, seg), color); if (rx) g.rotateX(rx); return g.translate(x, y, z); };
export function merge(parts) { const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g; }

export function canvasTexture(width, height, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = width; c.height = height; draw(c.getContext('2d'), width, height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export const signTexture = (text, background = '#ffd23a', ink = '#202020') => canvasTexture(256, 128, (g) => {
  g.fillStyle = background; g.fillRect(0, 0, 256, 128); g.strokeStyle = ink; g.lineWidth = 12; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 76; do { g.font = `bold ${size}px sans-serif`; size -= 4; } while (g.measureText(text).width > 220 && size > 20);
  g.fillText(text, 128, 68);
});

/**
 * A ribbon along the road between two lines, each given for a sample as { lat, y }: the walls, the
 * boost pads, the water in a pool, the top and sides of an island are all one of these.
 * from, to: sample numbers (to may run past the end of the lap).  skip(i): leave a hole at this sample.
 * The texture runs along the ribbon (u) every `every` metres, and across it (v) from the first line to the second.
 */
export function band(T, from, to, lineA, lineB, { every = 4, skip = null } = {}) {
  const S = T.samples, N = T.sampleCount, pos = [], uv = [], idx = []; let prev = -1, n = 0;
  for (let r = from; r <= to; r++) {
    const i = ((r % N) + N) % N;
    if (skip?.(i)) { prev = -1; continue; }
    const a = lineA(i), b = lineB(i), u = r * T.sampleSpacing / every;
    pos.push(S.x[i] + S.normalX[i] * a.lat, a.y, S.z[i] + S.normalZ[i] * a.lat, S.x[i] + S.normalX[i] * b.lat, b.y, S.z[i] + S.normalZ[i] * b.lat);
    uv.push(u, 0, u, 1);
    if (prev >= 0) idx.push(prev, prev + 1, n, prev + 1, n + 1, n);
    prev = n; n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** The sample numbers a stretch of the lap runs between (the second past the end of the lap if it wraps). */
export function span(T, sStart, sEnd) { const a = T.indexAtS(sStart); let b = T.indexAtS(sEnd); if (b < a) b += T.sampleCount; return [a, b]; }

// ---------- the sky: a colour at the horizon and another overhead, clouds or stars if asked for
function buildSky(group, D, sky) {
  const v = c => new THREE.Color(c);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: v(sky.top) }, horizon: { value: v(sky.horizon) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 horizon;
      void main(){ float h = max(normalize(vDir).y, 0.0);
        gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sg = new THREE.SphereGeometry(6500, 24, 12), mesh = new THREE.Mesh(sg, mat); mesh.name = 'Sky'; mesh.frustumCulled = false; mesh.renderOrder = -10; group.add(mesh); D.push(sg, mat);
  const r = rng(71), o = new THREE.Object3D();
  if (sky.clouds != null) {
    const cg = new THREE.IcosahedronGeometry(1, 1), cm = new THREE.MeshStandardMaterial({ color: sky.clouds, roughness: 1, emissive: sky.clouds, emissiveIntensity: 0.55, fog: false, flatShading: true }), puffs = [];
    for (let k = 0; k < (sky.cloudCount ?? 22); k++) { const a = r() * 6.28, d = 500 + r() * 2600, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 420 + r() * 260, size = 90 + r() * 150; for (let p = 0; p < 3; p++) puffs.push([cx + (r() - 0.5) * size * 2.2, cy + (r() - 0.5) * size * 0.2, cz + (r() - 0.5) * size * 1.2, size * (0.5 + r() * 0.6)]); }
    const clouds = new THREE.InstancedMesh(cg, cm, puffs.length);
    puffs.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.scale.set(p[3], p[3] * 0.3, p[3] * 0.8); o.updateMatrix(); clouds.setMatrixAt(k, o.matrix); });
    clouds.name = 'Clouds'; clouds.frustumCulled = false; group.add(clouds); D.push(cg, cm, clouds);
  }
  if (sky.stars) {
    const p = new Float32Array(sky.stars * 3);
    for (let k = 0; k < sky.stars; k++) { const a = r() * 6.28, e = Math.asin(r() * 0.98 + 0.02), d = 5800; p.set([Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d], k * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false }), stars = new THREE.Points(g, m);
    stars.name = 'Stars'; stars.frustumCulled = false; stars.renderOrder = -9; group.add(stars); D.push(g, m);
  }
}

// ---------- the road
// road.color(i) -> the road's colour at sample i.  road.side: the colour of whatever is beside it.
// road.bank: how far out the ground runs down from the road's edge to road.groundY (a road on the
// ground); or road.slab: how thick the road is (a road in the air).
function buildRoad(group, D, T, road) {
  const S = T.samples, N = T.sampleCount, pos = [], col = [], uv = [], idx = [], c = new THREE.Color();
  const lip = 0.02, slab = road.slab ?? 0, bank = road.bank ?? 12, K = 6;
  for (let r = 0; r <= N; r++) {
    const i = r % N, hw = S.width[i] / 2, y = S.y[i], bed = y - T.depthAt(S.s[i]) - (T.depthAt(S.s[i]) > 0 ? 0.3 : 0);
    // (shoulder: the floor carries on level this far past the edge, under the walls, where the road is a floor indoors)
    // (skirt: the edge runs down `drop` metres over `out` metres, into ground that follows the road: see terrain)
    const out = slab ? hw + lip : road.skirt ? hw + road.skirt.out : road.shoulder ? hw + road.shoulder : hw + bank, low = slab ? y - slab : road.skirt ? y - road.skirt.drop : road.shoulder ? y : road.groundY ?? -0.1;
    const lat = [-out, -hw - lip, -hw, hw, hw + lip, out], h = [low, y, bed, bed, y, low];
    const paintRoad = road.color(i), side = typeof road.side === 'function' ? road.side(i) : road.side;
    [side, side, paintRoad, paintRoad, side, side].forEach((hex, k) => { pos.push(S.x[i] + S.normalX[i] * lat[k], h[k], S.z[i] + S.normalZ[i] * lat[k]); c.set(hex); col.push(c.r, c.g, c.b); uv.push(lat[k] / 4, r * T.sampleSpacing / 4); });
  }
  for (let r = 0; r < N; r++) { if (T.isGapSegment(r) || T.isHoleSegment(r)) continue; for (let k = 0; k < K - 1; k++) { const a = r * K + k, b = a + 1, cc = a + K, d = cc + 1; idx.push(a, b, cc, b, d, cc); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const map = road.grit === false ? null : canvasTexture(128, 128, (cg) => { const r = rng(4); cg.fillStyle = '#fff'; cg.fillRect(0, 0, 128, 128); for (let k = 0; k < 900; k++) { const v = 215 + Math.floor(r() * 40); cg.fillStyle = `rgb(${v},${v},${v})`; cg.fillRect(r() * 128, r() * 128, 2 + r() * 4, 2 + r() * 3); } }, true);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: road.roughness ?? 0.85, metalness: road.metalness ?? 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'Road'; mesh.receiveShadow = true; group.add(mesh); D.push(g, mat); if (map) D.push(map);
}

/**
 * Bombs: a black ball with a fuse that sparks faster and glows redder until it goes off.  One for each
 * id; the track's hazardsAt gives each { x, y, z, active, fuse (0..1), bang (0..1 while it goes off, else -1) }.
 */
export function addBombs({ group, D, movers, keep }, ids, size = 1) {
  const bodyG = new THREE.IcosahedronGeometry(0.72, 2), fuseG = new THREE.CylinderGeometry(0.06, 0.06, 0.45, 5).translate(0, 0.9, 0), sparkG = new THREE.IcosahedronGeometry(0.16, 0), bangG = new THREE.IcosahedronGeometry(1, 2);
  D.push(bodyG, fuseG, sparkG, bangG);
  const fuseM = keep(new THREE.MeshStandardMaterial({ color: 0xc9a070, roughness: 1 })), sparkM = keep(new THREE.MeshBasicMaterial({ color: 0xffe45c }));
  for (const id of ids) {
    const bodyM = keep(new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.35, emissive: 0xff2a1a, emissiveIntensity: 0 }));
    const bangM = keep(new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.8, depthWrite: false }));
    const bomb = new THREE.Group(), body = new THREE.Mesh(bodyG, bodyM), fuse = new THREE.Mesh(fuseG, fuseM), spark = new THREE.Mesh(sparkG, sparkM), bang = new THREE.Mesh(bangG, bangM);
    body.position.y = 0.72; body.castShadow = true; fuse.position.y = 0.72; spark.position.y = 1.85; bomb.add(body, fuse, spark); bomb.name = 'Bomb'; bang.name = 'Bomb_Bang';
    group.add(bomb, bang);
    movers[id] = (h, t) => {
      bomb.visible = h.active; bang.visible = h.bang >= 0;
      bomb.position.set(h.x, h.y, h.z); bang.position.set(h.x, h.y + 0.8, h.z);
      if (h.active) { const hurry = 4 + h.fuse * 22; bodyM.emissiveIntensity = h.fuse * h.fuse * (0.5 + 0.5 * Math.sin(t * hurry)); spark.scale.setScalar(0.7 + 0.6 * Math.abs(Math.sin(t * hurry * 1.3))); bomb.scale.setScalar(size * (1 + 0.06 * h.fuse * Math.sin(t * hurry))); }
      if (h.bang >= 0) { bang.scale.setScalar(size * (1 + h.bang * 4.5)); bangM.opacity = 0.85 * (1 - h.bang); }
    };
  }
}

/** Build a whole map from a kit-made track and a description of its look. */
export function createKitWorld(T, look) {
  const S = T.samples, N = T.sampleCount;
  const group = new THREE.Group(); group.name = look.name;
  const D = [], animated = [], movers = {};
  const o = new THREE.Object3D();
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: look.propRoughness ?? 0.8, flatShading: true }); D.push(prop);
  const lapGap = (s, s0) => T.along(s, s0);
  const add = (name, geometry, material, { shadow = false } = {}) => { const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = shadow; group.add(mesh); D.push(geometry); return mesh; };
  const keep = material => { D.push(material); return material; };
  /** many copies of one thing: list of [x, y, z, rotationY, scale] */
  const herd = (name, geo, list, material = prop) => {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((a, k) => { o.position.set(a[0], a[1], a[2]); o.rotation.set(0, a[3] ?? 0, 0); o.scale.setScalar(a[4] ?? 1); o.updateMatrix(); mesh.setMatrixAt(k, o.matrix); });
    mesh.name = name; mesh.castShadow = true; group.add(mesh); D.push(geo, mesh);
    return mesh;
  };
  /** is (x, z) this far clear of the road? */
  // (nor on a short cut across a bend: the second roads of the older maps keep their own clear, as they always did)
  const clear = (x, z, margin) => { const q = T.query(x, z); if (q.distance <= q.halfWidth + margin) return false;
    const br = T.branches.length ? T.branchAt(q.s, q.halfWidth) : null, L = br?.branch.rough ? br.side * q.lateral : null;
    return !(L !== null && L > br.centre - br.half - margin && L < br.centre + br.half + margin); };
  /** [x, y, z, rotationY] beside the road at s, `out` metres beyond its edge on the given side (+1 or -1) */
  const beside = (s, side, out = 2) => { const c = T.pointAt(s), p = T.pointAt(s, side * (c.halfWidth + out)); return [p.x, p.y, p.z, c.rotationY]; };

  // where a branch is leaving or joining the road there is no wall between them
  const lanes = T.branches.length ? Array.from({ length: N }, (_, i) => T.branchAt(S.s[i], S.width[i] / 2)) : null;
  const joined = (i, side) => { const br = lanes?.[i]; return Boolean(br) && br.side === side && !br.open && br.centre + br.half > S.width[i] / 2 + 0.05; };

  buildSky(group, D, look.sky);
  if (look.ground) {
    const size = look.ground.size ?? 9000, fg = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), fm = keep(new THREE.MeshStandardMaterial({ color: look.ground.color, roughness: look.ground.roughness ?? 0.95 }));
    const field = add('Ground', fg, fm); field.position.y = look.ground.y ?? -0.12; field.receiveShadow = true;
  }
  buildRoad(group, D, T, look.road);

  // the edges of the road: one or more walls (each may leave stretches out)
  for (const [n, edge] of (look.edges ?? []).entries()) {
    const tex = edge.draw ? canvasTexture(edge.size?.[0] ?? 128, edge.size?.[1] ?? 64, edge.draw, true) : null;
    const mat = keep(edge.glow ? new THREE.MeshBasicMaterial({ color: edge.color ?? 0xffffff, map: tex, side: THREE.DoubleSide, transparent: (edge.opacity ?? 1) < 1, opacity: edge.opacity ?? 1, fog: edge.fog ?? true })
      : new THREE.MeshStandardMaterial({ color: edge.color ?? 0xffffff, map: tex, roughness: edge.roughness ?? 0.9, side: THREE.DoubleSide, alphaTest: edge.cutout ? 0.5 : 0 }));      // (cutout: the texture has holes in it)
    if (tex) D.push(tex);
    for (const side of [1, -1]) {
      // A wall that is for some sections only runs on to the first sample of the next section, to meet that section's own
      // wall: otherwise there is a slit one sample wide between them, floor to ceiling, and the outdoors shows through it
      // (Tom, 2026-11-26: "not all the walls are connecting, have a gap so you can see outside")
      const own = i => Boolean(edge.skip?.(S.s[i], side, S.section[i]));
      const meets = i => { const j = (i + N - 1) % N; return S.section[j] !== S.section[i] && !own(j); };
      const at = lift => i => ({ lat: side * (S.width[i] / 2 + (edge.out ?? 0.25)), y: S.y[i] + lift });
      const wall = add(`Edge_${n}`, band(T, 0, N, at(edge.from ?? 0), at((edge.from ?? 0) + edge.height), { every: edge.every ?? 4, skip: i => T.isGapSegment(i) || T.isGapSegment((i + N - 1) % N) || joined(i, side) || (own(i) && !meets(i)) }), mat);
      wall.castShadow = Boolean(edge.shadow);
    }
  }

  // start/finish: a chequered line under an arch
  {
    const chequer = canvasTexture(256, 32, (cg) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { cg.fillStyle = (x + y) % 2 ? '#111' : '#fff'; cg.fillRect(x * 16, y * 16, 16, 16); } });
    chequer.magFilter = THREE.NearestFilter;
    const hw0 = T.startFinish.halfWidth, holder = new THREE.Group(); holder.position.set(...T.startFinish.position); holder.rotation.y = T.startFinish.rotationY;
    const lineG = new THREE.PlaneGeometry(hw0 * 2, 1.6), lineM = new THREE.MeshBasicMaterial({ map: chequer, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const line = new THREE.Mesh(lineG, lineM); line.rotation.x = -Math.PI / 2; line.position.y = 0.12; holder.add(line);
    const post = look.start?.color ?? 0x9aa3ad;
    const arch = merge([box(0.6, 8.5, 0.6, post, -(hw0 + 1.6), 4.25, 0), box(0.6, 8.5, 0.6, post, hw0 + 1.6, 4.25, 0), box(hw0 * 2 + 4.4, 0.6, 0.6, post, 0, 8.4, 0), box(hw0 * 2 + 4.4, 0.6, 0.6, post, 0, 6.1, 0)]);
    const am = look.start?.glow ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    const archMesh = new THREE.Mesh(arch, am); archMesh.castShadow = true; archMesh.name = 'StartArch'; holder.add(archMesh);
    const banner = signTexture(look.start?.text ?? T.name.toUpperCase(), look.start?.background, look.start?.ink), bannerG = new THREE.PlaneGeometry(hw0 * 2 + 3, 2.0), bannerM = new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(bannerG, bannerM); sign.position.y = 7.25; sign.rotation.y = Math.PI; holder.add(sign);
    group.add(holder); D.push(chequer, lineG, lineM, arch, am, banner, bannerG, bannerM);
  }

  // boost pads: arrows running up the road (a mega pad has its own colours and runs faster)
  if (T.strips.length) {
    const kinds = [[T.strips.filter(strip => !strip.mega), look.strips, 1.6], [T.strips.filter(strip => strip.mega), look.megaStrips ?? look.strips, 3.4]];
    for (const [list, style, pace] of kinds) {
      if (!list.length) continue;
      const hue = style?.color ?? '#ffd23a', arrows = canvasTexture(64, 64, (g) => {
        g.fillStyle = style?.background ?? 'rgba(20,20,24,0.85)'; g.fillRect(0, 0, 64, 64); g.strokeStyle = hue; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
        for (const x of [8, 40]) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 18, 32); g.lineTo(x, 56); g.stroke(); }
      }, true);
      const mat = keep(new THREE.MeshBasicMaterial({ map: arrows, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, transparent: true })); D.push(arrows);
      for (const strip of list) {
        const [a, b] = span(T, strip.sStart, strip.sEnd), hwAt = i => S.width[i] / 2 - 0.6;
        // (a pad on a second road lies right across that road, wherever it is beside the main one)
        const onLane = (i, edge) => { const br = T.branchAt(S.s[i % N], S.width[i % N] / 2); return { lat: br.side * (br.centre + edge * (br.half - 0.6)), y: S.y[i % N] + br.lift + 0.07 }; };
        const lines = strip.branch ? [i => onLane(i, -1), i => onLane(i, 1)]
          : [i => ({ lat: Math.max(-hwAt(i), strip.latMin ?? -Infinity), y: S.y[i] + 0.07 }), i => ({ lat: Math.min(hwAt(i), strip.latMax ?? Infinity), y: S.y[i] + 0.07 })];
        const pad = add(strip.mega ? 'MegaPad' : 'BoostPad', band(T, a, b, ...lines, { every: 3 }), mat);
        pad.renderOrder = 1;
      }
      animated.push(t => { arrows.offset.x = -t * pace; });        // the arrows run up the road
    }
  }
  // whatever lies on the road and slows a dog
  if (T.mud.length) {
    const pg = new THREE.CircleGeometry(1, 22).rotateX(-Math.PI / 2), pm = keep(new THREE.MeshStandardMaterial({ color: look.patches?.color ?? 0x2c1e12, roughness: look.patches?.roughness ?? 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const mesh = new THREE.InstancedMesh(pg, pm, T.mud.length);
    T.mud.forEach((patch, k) => { o.position.set(patch.x, patch.y + 0.06, patch.z); o.rotation.set(0, patch.rotationY, 0); o.scale.set(patch.across, 1, patch.along); o.updateMatrix(); mesh.setMatrixAt(k, o.matrix); });
    mesh.name = 'Patches'; group.add(mesh); D.push(pg, mesh);
  }
  // pools: the water lying across the road
  for (const pool of T.water) {
    const [a, b] = span(T, pool.sStart, pool.sEnd), wm = keep(new THREE.MeshStandardMaterial({ color: look.water?.color ?? 0x35b6e6, roughness: 0.08, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
    const level = i => S.y[i] - 0.3;
    add('Pool_Water', band(T, a, b, i => ({ lat: -S.width[i] / 2, y: level(i) }), i => ({ lat: S.width[i] / 2, y: level(i) })), wm);
  }
  // islands: where the road is two roads
  for (const d of T.dividers) {
    const [a, b] = span(T, d.sStart, d.sEnd), high = look.divider?.height ?? 1.4, half = i => Math.max(0.02, T.dividerAt(S.s[i]));
    const body = keep(new THREE.MeshStandardMaterial({ color: look.divider?.color ?? 0x30343a, roughness: 0.6, side: THREE.DoubleSide }));
    add('Island_Top', band(T, a, b, i => ({ lat: -half(i), y: S.y[i] + high }), i => ({ lat: half(i), y: S.y[i] + high })), look.divider?.top ? keep(look.divider.top) : body);
    for (const side of [1, -1]) add('Island_Side', band(T, a, b, i => ({ lat: side * half(i), y: S.y[i] }), i => ({ lat: side * half(i), y: S.y[i] + high })), look.divider?.sideMaterial ? keep(look.divider.sideMaterial) : body);
  }

  // branches: the second road, from where it leaves the main one to where it joins it again
  for (const b of T.branches) {
    const [a0, b0] = span(T, b.sStart, b.sEnd), at = r => lanes[((r % N) + N) % N], hwAt = i => S.width[i] / 2;
    const inner = i => { const br = lanes[i]; return br ? Math.max(br.centre - br.half, hwAt(i)) : 0; }, outer = i => { const br = lanes[i]; return br ? br.centre + br.half : 0; };
    const y = i => S.y[i] + (lanes[i]?.lift ?? 0), none = i => !lanes[i] || outer(i) <= hwAt(i) + 0.05;
    const look2 = look.branch ?? {}, hue = new THREE.Color(), slab = look.road.slab ?? 0;
    const edgeHue = typeof look2.edgeColor === 'function' ? look2.edgeColor(b) : look2.edgeColor;
    const roadM = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: look.road.roughness ?? 0.85, metalness: look.road.metalness ?? 0, side: THREE.DoubleSide }));
    const top = band(T, a0, b0, i => ({ lat: b.side * inner(i), y: y(i) }), i => ({ lat: b.side * outer(i), y: y(i) }), { skip: none });
    { const n = top.getAttribute('position').count, col = new Float32Array(n * 3); let v = 0;
      for (let r = a0; r <= b0; r++) { const i = ((r % N) + N) % N; if (none(i)) continue; hue.set((look2.color ?? look.road.color)(i, b)); for (let k = 0; k < 2; k++) { col[v++] = hue.r; col[v++] = hue.g; col[v++] = hue.b; } }
      top.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    add('Branch_Road', top, roadM).receiveShadow = true;
    if (slab) for (const line of [inner, outer]) add('Branch_Side', band(T, a0, b0, i => ({ lat: b.side * line(i), y: y(i) - slab }), i => ({ lat: b.side * line(i), y: y(i) }), { skip: i => none(i) || (line === inner && !lanes[i].open) }), keep(new THREE.MeshStandardMaterial({ color: look.road.side, roughness: 0.8, side: THREE.DoubleSide })));
    // its own walls: all down the outside, and down the inside wherever there is a gap between the two roads
    for (const edge of look2.edges ?? look.edges ?? []) {
      const mat = keep(edge.glow ? new THREE.MeshBasicMaterial({ color: edgeHue ?? edge.color ?? 0xffffff, side: THREE.DoubleSide, transparent: (edge.opacity ?? 1) < 1, opacity: edge.opacity ?? 1 })
        : new THREE.MeshStandardMaterial({ color: edgeHue ?? edge.color ?? 0xffffff, roughness: edge.roughness ?? 0.9, side: THREE.DoubleSide }));
      const lift = edge.from ?? 0;
      add('Branch_Edge', band(T, a0, b0, i => ({ lat: b.side * (outer(i) + 0.25), y: y(i) + lift }), i => ({ lat: b.side * (outer(i) + 0.25), y: y(i) + lift + edge.height }), { skip: none }), mat);
      add('Branch_Edge', band(T, a0, b0, i => ({ lat: b.side * (inner(i) - 0.25), y: y(i) + lift }), i => ({ lat: b.side * (inner(i) - 0.25), y: y(i) + lift + edge.height }), { skip: i => none(i) || !lanes[i].open }), mat);
      // (and the main road's own wall carries on past the gap: the edges above leave it out only where the two are one)
    }
    void at;
  }

  // moving platforms: a slab for each, slid to where the track says it is
  let arrowsM = null;
  const platformArrows = () => {
    if (arrowsM) return arrowsM;
    const hue = look.strips?.color ?? '#ffd23a', tex = canvasTexture(64, 64, (g) => {
      g.fillStyle = look.strips?.background ?? 'rgba(20,20,24,0.85)'; g.fillRect(0, 0, 64, 64); g.strokeStyle = hue; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
      // (pointing down the canvas: laid flat on the platform, the bottom of the picture is the way the road goes)
      for (const y of [12, 40]) { g.beginPath(); g.moveTo(10, y); g.lineTo(32, y + 16); g.lineTo(54, y); g.stroke(); }
    }, true);
    tex.repeat.set(1, 6); D.push(tex);
    arrowsM = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    animated.push(t => { tex.offset.y = t * 1.6; });         // (running along the platform, the way the road goes)
    return arrowsM;
  };
  if (T.platforms.length && look.platform !== false) {        // (platform: false -> the map draws its own)
    const slabM = keep(new THREE.MeshStandardMaterial({ color: look.platform?.color ?? 0x3a3d44, roughness: 0.5, metalness: 0.2 })), rimM = keep(new THREE.MeshBasicMaterial({ color: look.platform?.edge ?? 0xffd23a }));
    for (const zone of T.platforms) for (const pad of zone.pads) {
      const long = pad.s1 - pad.s0, slabG = new THREE.BoxGeometry(pad.half * 2, 0.6, long).translate(0, -0.3, 0), rimG = new THREE.BoxGeometry(pad.half * 2 + 0.3, 0.14, long + 0.3).translate(0, -0.12, 0); D.push(slabG, rimG);
      const holder = new THREE.Group(), slab = new THREE.Mesh(slabG, slabM); slab.receiveShadow = true; holder.add(slab, new THREE.Mesh(rimG, rimM)); holder.name = 'Platform'; group.add(holder);
      // a platform that is a boost pad (zone.boost) has the arrows on top of it, running the way the road goes
      if (pad.boost ?? zone.boost) {
        const topG = new THREE.PlaneGeometry(pad.half * 2 - 0.6, long - 1).rotateX(-Math.PI / 2).translate(0, 0.02, 0); D.push(topG);
        const arrowsOn = new THREE.Mesh(topG, platformArrows()); arrowsOn.renderOrder = 1; holder.add(arrowsOn);
      }
      animated.push((t, focus, raceSeconds = 0) => { const p = T.padAt(pad, raceSeconds); holder.position.set(p.x, p.y, p.z); holder.rotation.y = p.rotationY; });
    }
  }

  /**
   * Ground with hills in it, that the road lies on: a grid `size` metres square of `cell`-metre squares.  Near the
   * road the ground is just under it; `blend` metres further out it is whatever height(x, z) says.  color(x, z, y, d)
   * -> the ground's colour there (d: metres from the road's edge).  Where there is no road (a leap, a platform crossing) the
   * ground is its own (and gapDrop metres lower, right under where the road would be: a ravine).  aloft(s): the road is up in
   * the air at s (on stilts), and the ground under it is its own too.  Returns groundAt(x, z) -> height, for standing things on it.
   */
  const terrain = ({ size = 1400, cell = 7, centre = [0, 0], height, color, under = 0.45, near = 5, blend = 45, gapDrop = 0, aloft = null, roughness = 0.95, name = 'Terrain' }) => {
    const groundAt = (x, z) => { const q = T.query(x, z), d = Math.max(0, q.distance - q.halfWidth - near), w = Math.min(1, d / blend), gap = T.isGap(q.s) || T.isHole(q.s), open = gap || Boolean(aloft?.(q.s)), k = open ? 1 : w * w * (3 - 2 * w); return { y: (q.trackY - under) * (1 - k) + (height(x, z) - (gap && d < 1 ? gapDrop : 0)) * k, d: q.distance - q.halfWidth }; };
    const n = Math.round(size / cell), pos = new Float32Array((n + 1) * (n + 1) * 3), col = new Float32Array((n + 1) * (n + 1) * 3), idx = [], c = new THREE.Color();
    for (let j = 0, v = 0; j <= n; j++) for (let i = 0; i <= n; i++, v += 3) {
      const x = centre[0] - size / 2 + i * cell, z = centre[1] - size / 2 + j * cell, g = groundAt(x, z);
      pos[v] = x; pos[v + 1] = g.y; pos[v + 2] = z; c.set(color(x, z, g.y, g.d)); col[v] = c.r; col[v + 1] = c.g; col[v + 2] = c.b;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = add(name, g, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness }))); mesh.receiveShadow = true;
    return (x, z) => groundAt(x, z).y;
  };
  /** Rain: streaks falling all round the dog being followed. */
  const rain = ({ count = 1400, color = 0xbfd3e6, box = [70, 34, 70], speed = 38, slant = [0.12, 0.05], opacity = 0.55 } = {}) => {
    const r = rng(9), seeds = new Float32Array(count * 3), pos = new Float32Array(count * 6);
    for (let k = 0; k < count * 3; k++) seeds[k] = r();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(g, keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }))); lines.name = 'Rain'; lines.frustumCulled = false; group.add(lines); D.push(g);
    animated.push((t, focus) => {
      const fx = focus?.x ?? T.startFinish.position[0], fy = focus?.y ?? T.startFinish.position[1], fz = focus?.z ?? T.startFinish.position[2];
      for (let k = 0; k < count; k++) {
        const fall = ((seeds[k * 3 + 1] * box[1] - t * speed * (0.8 + 0.4 * seeds[k * 3])) % box[1] + box[1]) % box[1];
        // (each streak keeps its own place in a box that moves with the dog: wrapped, so none is ever left behind)
        const x = fx + ((seeds[k * 3] * box[0] - fx) % box[0] + box[0]) % box[0] - box[0] / 2 + (box[1] - fall) * -slant[0], z = fz + ((seeds[k * 3 + 2] * box[2] - fz) % box[2] + box[2]) % box[2] - box[2] / 2 + (box[1] - fall) * -slant[1], y = fy - 4 + fall;
        pos.set([x, y, z, x + slant[0] * 1.1, y + 1.1, z + slant[1] * 1.1], k * 6);
      }
      g.attributes.position.needsUpdate = true;
    });
  };
  const ctx = { THREE, group, D, animated, movers, T, S, N, prop, add, keep, herd, clear, beside, lapGap, band, span, lanes, terrain, rain,
    /** a sign on a post beside the road at s (under: on the wall of a level that many metres below the road instead) */
    sign(text, s, side = 1, background, ink, { under = 0 } = {}) {
      const tex = signTexture(text, background, ink), mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); D.push(tex, mat);
      if (under) {
        const c = T.pointAt(s), p = T.pointAt(s, side * (c.halfWidth + 0.35));
        const board = new THREE.Mesh(ctx.signBoard, mat); board.position.set(p.x, c.y - under + 2.1, p.z); board.rotation.y = c.rotationY + Math.PI; board.name = 'Sign'; group.add(board);
        return;
      }
      const [x, y, z, yaw] = beside(s, side, 1.4);
      const post = new THREE.Mesh(ctx.signPost, ctx.signPostMaterial); post.position.set(x, y + 1.1, z); group.add(post);
      const board = new THREE.Mesh(ctx.signBoard, mat); board.position.set(x, y + 3.0, z); board.rotation.y = yaw + Math.PI; board.name = 'Sign'; group.add(board);
    },
    signPost: new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), signPostMaterial: new THREE.MeshStandardMaterial({ color: look.signPost ?? 0x8a6a44, roughness: 0.9 }), signBoard: new THREE.PlaneGeometry(3.0, 1.5),
  };
  D.push(ctx.signPost, ctx.signPostMaterial, ctx.signBoard);
  look.build?.(ctx);

  const SUN = new THREE.Vector3(...(look.sunDirection ?? [0.3, 0.8, 0.4])).normalize();
  const hemi = new THREE.HemisphereLight(...look.lights.hemi), sun = new THREE.DirectionalLight(...look.lights.sun);
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  const lights = new THREE.Group(); lights.name = 'Lights'; lights.add(hemi, sun, sun.target); group.add(lights);
  sun.position.copy(SUN).multiplyScalar(300);
  const placeHazards = raceSeconds => { for (const h of T.hazardsAt(raceSeconds)) movers[h.id]?.(h, raceSeconds); };
  placeHazards(0);
  for (const f of animated) f(0, null);
  return {
    group, track: T, sun,
    /** t = seconds (cosmetic).  focus = {x,y,z} of the dog to light.  raceSeconds = time since GO. */
    update(t, focus, raceSeconds = 0) {
      T.setClock(raceSeconds);
      for (const f of animated) f(t, focus, raceSeconds);
      placeHazards(raceSeconds);
      if (focus) { sun.target.position.set(focus.x, focus.y, focus.z); sun.position.set(focus.x, focus.y, focus.z).addScaledVector(SUN, 300); }
    },
    /** how many triangles the whole course is (instances counted) */
    triangles() { let n = 0; group.traverse(m => { if (!m.isMesh) return; const g = m.geometry, tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3; n += tris * (m.isInstancedMesh ? m.count : 1); }); return Math.round(n); },
    /** The map's own sky, fog and light.  Returns a function that undoes it. */
    applyEnvironment(scene, renderer, { shadows = true } = {}) {
      const prev = { fog: scene.fog, bg: scene.background, tm: renderer?.toneMapping, ex: renderer?.toneMappingExposure, sh: renderer?.shadowMap.enabled };
      scene.fog = new THREE.Fog(...look.env.fog); scene.background = new THREE.Color(look.env.background);
      if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = look.env.exposure ?? 1; if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; sun.castShadow = true; } }
      return () => { scene.fog = prev.fog; scene.background = prev.bg; if (renderer) { renderer.toneMapping = prev.tm; renderer.toneMappingExposure = prev.ex; renderer.shadowMap.enabled = prev.sh; } };
    },
    dispose() { for (const d of D) d.dispose?.(); },
  };
}
