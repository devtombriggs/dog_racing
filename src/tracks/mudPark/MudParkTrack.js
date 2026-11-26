// Squelch Hollow Mud Run — the look of it: a dirt-bike course in a muddy field in the pouring rain, marshals' tape, the event
// village by the start, stacks of tyres, logs rolling down the bank, the marshal's quad bike, dirt ramps under the kickers, and
// the big ramp at the top of Welly Hill that fires the dogs over the middle of the figure of eight.  The track itself is
// shared/mudParkData.js; the parts every kit map shares are in ../trackKit3d.js.
import * as THREE from 'three';
import { MUD_PARK as T } from '../../../shared/mudParkData.js';
import { createKitWorld, rng, box, cyl, ball, cone, merge } from '../trackKit3d.js';

const TRAIL = { A: [0x8a6f45, 0x836a42], B: [0xc08a52, 0xb8824c], C: [0x5e4630, 0x58422d], D: [0x6b4f33, 0x664b30], E: [0x6b4f33, 0x634a31], F: [0x4a3524, 0x463222], H: [0x6b4f33, 0x664b30] };

export const createMudPark = () => createKitWorld(T, {
  name: 'SquelchHollow', sunDirection: [0.3, 0.8, 0.4],
  sky: { top: 0x5d6670, horizon: 0xb9c2c8, clouds: 0x8a9299, cloudCount: 34 },
  ground: { color: 0x4f6b35, y: -0.6 },
  road: { color: i => (T.depthAt(T.samples.s[i]) > 0.05 ? 0x4a3524 : TRAIL[T.samples.section[i]][Math.floor(i / 3) % 2]), side: 0x4a5e30, skirt: { out: 4, drop: 0.9 }, roughness: 0.35 },
  edges: [
    // marshals' tape on posts: red and white
    { height: 1.1, every: 4, size: [64, 32], cutout: true, draw(g) { g.clearRect(0, 0, 64, 32); g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 5, 32); for (let x = 0; x < 64; x += 16) { g.fillStyle = '#e2303a'; g.fillRect(x, 6, 8, 5); g.fillStyle = '#f4f4f4'; g.fillRect(x + 8, 6, 8, 5); } } },
  ],
  start: { text: 'SQUELCH HOLLOW', color: 0xe2303a, background: '#f3ead2', ink: '#5a3a1a' },
  strips: { color: '#ffd23a', background: 'rgba(60,40,20,0.9)' },
  water: { color: 0x5a4029 },
  patches: { color: 0x2c1e12, roughness: 0.1 },
  env: { fog: [0xb9c2c8, 90, 900], background: 0xb9c2c8, exposure: 0.95 },
  lights: { hemi: [0xdde6ee, 0x5a5a40, 1.5], sun: [0xe8eef4, 1.4] },

  build({ group, D, movers, herd, clear, beside, add, keep, prop, terrain, rain }) {
    const r = rng(23), field = new THREE.Color();
    const ground = terrain({ size: 900, cell: 8, centre: [0, 10], height: (x, z) => 0.4 * Math.sin(x / 37) * Math.cos(z / 41) - 0.4, blend: 30,
      color: (x, z) => field.setRGB(0.27 + 0.05 * Math.sin(x * 0.07), 0.38 + 0.04 * Math.cos(z * 0.05), 0.2) });
    rain({ count: 1600 });

    // ---------- the kickers: a dirt ramp under each, sloping up to its lip; and the big ramp at the top of Welly Hill
    const rampG = new THREE.BufferGeometry();
    rampG.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 1, -0.5, 0, 0, 0.5, 1, 1, -0.5, 1, 1, -0.5, 0, 1, 0.5, 0, 1, 0.5, 1, 1, -0.5, 0, 1, 0.5, 1, 1, -0.5, 1, 1,
      -0.5, 0, 0, -0.5, 1, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0, 1, 0.5, 1, 1], 3));
    rampG.computeVertexNormals(); D.push(rampG);
    const dirt = keep(new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9, side: THREE.DoubleSide }));
    for (const kicker of T.strips.filter(strip => strip.hop)) {
      const p = T.pointAt(kicker.sStart), w = p.halfWidth * 2 - 1;
      const ramp = new THREE.Mesh(rampG, dirt); ramp.position.set(p.x, p.y - 0.02, p.z); ramp.rotation.y = p.rotationY; ramp.scale.set(w, 0.7, kicker.sEnd - kicker.sStart); ramp.receiveShadow = true; ramp.name = 'Kicker'; group.add(ramp);
    }
    { const L = T.launch, a = T.pointAt(L.padStart), b = T.pointAt(L.gapStart), long = L.gapStart - L.padStart, w = a.halfWidth * 2;
      // (the road climbs to the edge by itself: a short lip of dirt at the very end, where the flight begins)
      const lip = T.pointAt(L.gapStart - 5), ramp = new THREE.Mesh(rampG, dirt); ramp.position.set(lip.x, lip.y - 0.02, lip.z); ramp.rotation.y = lip.rotationY; ramp.scale.set(w, 0.9, 5); ramp.name = 'Big_Ramp_Lip'; group.add(ramp);
      void long; void a;
      // its sides boarded up, and a banner over the lip
      for (const side of [-1, 1]) { const p = T.pointAt(L.gapStart - 3, side * (b.halfWidth + 0.4)); add('Ramp_Board', new THREE.BoxGeometry(0.3, 3, 10), keep(new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 }))).position.set(p.x, b.y - 0.5, p.z); }
 }

    // ---------- stacks of tyres standing in the trail
    const stack = []; for (let k = 0; k < 4; k++) stack.push(new THREE.TorusGeometry(0.78, 0.32, 7, 14).rotateX(Math.PI / 2).translate(0.06 * Math.sin(k * 2), 0.32 + k * 0.6, 0.06 * Math.cos(k * 3)));
    const tyreG = merge(stack.map((g, k) => { const c = new THREE.Color(k % 2 ? 0x26282c : 0x1a1b1e), n = g.getAttribute('position').count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; }));
    herd('Mud_Tyres', tyreG, T.obstacles.map((ob, k) => [ob.x, ob.y, ob.z, k, 1]));

    // ---------- the logs that roll down the bank, and the marshal's quad bike
    const R = T.logRun.radius, logG = merge([cyl(R, R, 4.4, 10, 0x7a5232, 0, 0, 0, Math.PI / 2), cyl(R * 0.8, R * 0.8, 4.44, 9, 0xc9a070, 0, 0, 0, Math.PI / 2), cyl(0.12, 0.1, 0.7, 5, 0x5d3f26, 0.5, R + 0.2, 0.8)]); D.push(logG);
    T.logLanes.forEach((_, k) => {
      const log = new THREE.Mesh(logG, prop); log.rotation.order = 'YZX'; log.castShadow = true; log.name = 'Mud_Log'; group.add(log);
      movers[`log-${k}`] = h => { log.visible = h.fade > 0.01; log.position.set(h.x, h.y + R, h.z); log.rotation.set(0, h.rotationY, h.spin); log.scale.setScalar(0.6 + 0.4 * h.fade); };
    });
    const wheel = (x, z) => cyl(0.55, 0.55, 0.45, 10, 0x1c1d20, x, 0.55, z, 0, Math.PI / 2);
    const quadG = merge([box(1.1, 0.6, 2.3, 0xe2303a, 0, 1.0, 0), box(0.9, 0.3, 0.9, 0x1c1d20, 0, 1.45, -0.4), box(1.5, 0.12, 0.12, 0x30343a, 0, 1.75, 0.7), box(0.12, 0.6, 0.12, 0x30343a, 0, 1.45, 0.7), box(1.9, 0.14, 0.5, 0xe2303a, 0, 1.2, 1.0), box(1.9, 0.14, 0.5, 0xe2303a, 0, 1.2, -1.0),
      box(0.5, 0.3, 0.2, 0xffe08a, 0, 1.15, 1.2), wheel(-0.85, 0.85), wheel(0.85, 0.85), wheel(-0.85, -0.85), wheel(0.85, -0.85),
      ball(0.42, 1, 0xffd23a, 0, 2.55, -0.3), box(0.8, 0.9, 0.5, 0xff8a3c, 0, 1.95, -0.35), box(0.25, 0.25, 0.9, 0xff8a3c, -0.45, 1.95, 0.2), box(0.25, 0.25, 0.9, 0xff8a3c, 0.45, 1.95, 0.2)]); D.push(quadG);
    const quad = new THREE.Mesh(quadG, prop); quad.castShadow = true; quad.name = 'Mud_QuadBike'; group.add(quad);
    movers.quad = h => { quad.position.set(h.x, h.y, h.z); quad.rotation.y = h.rotationY; };

    // ---------- the event village by the start, flags along the paddock, pines all over the field, puddles
    const start = T.pointAt(0);
    const tent = hue => merge([cone(4.2, 2.6, 4, hue, 0, 4.4, 0).rotateY(Math.PI / 4), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => cyl(0.09, 0.09, 3.2, 5, 0xdadada, sx * 2.7, 1.6, sz * 2.7)), box(4, 0.8, 1.4, 0xf2f2f2, 0, 0.4, 0)]);
    [0xe2303a, 0x1e9be0, 0xffd23a, 0x2fae62].forEach((hue, k) => { const [x, , z, yaw] = beside(-30 + k * 14, -1, 14); herd(`Mud_Tent_${k}`, tent(hue), [[x, ground(x, z), z, yaw, 1]]); });
    const flagG = merge([cyl(0.05, 0.05, 4.2, 5, 0xdadada, 0, 2.1, 0), box(0.05, 0.7, 1.4, 0xff8a3c, 0, 3.7, 0.75)]), flags = [];
    for (let s = -60; s < 60; s += 15) for (const side of [-1, 1]) { const [x, y, z, yaw] = beside(s, side, 1.6); flags.push([x, y, z, yaw, 1]); }
    herd('Mud_Flags', flagG, flags);
    const pine = merge([cyl(0.35, 0.5, 3, 6, 0x5d3f26, 0, 1.5, 0), cone(3.0, 5, 7, 0x24452c, 0, 5, 0), cone(2.3, 4.2, 7, 0x2b5234, 0, 7.6, 0), cone(1.5, 3.4, 7, 0x326040, 0, 10, 0)]), pines = []; let tries = 0;
    while (pines.length < 120 && tries++ < 6000) { const x = -420 + r() * 840, z = -330 + r() * 680; if (!clear(x, z, 16) || pines.some(q => Math.hypot(q[0] - x, q[2] - z) < 9)) continue; pines.push([x, ground(x, z), z, r() * 6.28, 0.8 + r() * 0.9]); }
    herd('Mud_Pines', pine, pines);
    const puddles = []; tries = 0; while (puddles.length < 60 && tries++ < 3000) { const x = -380 + r() * 760, z = -300 + r() * 600; if (clear(x, z, 6)) puddles.push([x, ground(x, z) + 0.05, z, r() * 3, 2 + r() * 4]); }
    herd('Mud_Puddles', new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), puddles, keep(new THREE.MeshStandardMaterial({ color: 0x6f7f86, roughness: 0.05 }))).castShadow = false;
    void start;

    // ---------- signs on the way in to each part of the course
  },
});
