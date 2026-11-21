// Dune Dash — the look of it: sand to the horizon, dunes, cacti, an oasis at the start, the canyon's
// boulders, pyramids in the distance, the whirlwinds and the tumbleweed.  The track itself is
// shared/desertData.js; the parts every kit map shares are in ../trackKit3d.js.
import * as THREE from 'three';
import { DESERT as T } from '../../../shared/desertData.js';
import { createKitWorld, rng, cyl, ball, cone, merge, canvasTexture } from '../trackKit3d.js';

const S = T.samples;
const SAND = 0xe2c285, ROCK = 0xa9683f;

export const createDesert = () => createKitWorld(T, {
  name: 'DuneDash', sunDirection: [0.45, 0.75, 0.3],
  sky: { top: 0x3f8fe0, horizon: 0xf3dcae, clouds: 0xffffff, cloudCount: 8 },
  ground: { color: SAND },
  // the trail: packed sand, a little darker than the dunes, redder through the canyon
  road: { color: i => (S.section[i] === 'D' ? (i % 4 < 2 ? 0xb98a5e : 0xb18358) : i % 6 < 3 ? 0xcfa765 : 0xc99f5c), side: SAND, bank: 14 },
  edges: [{ height: 0.75, every: 3, size: [96, 32], cutout: true, draw(g) {            // posts and two ropes
    g.clearRect(0, 0, 96, 32); g.fillStyle = '#7a5230'; g.fillRect(0, 0, 10, 32); g.fillStyle = '#d9c9a3'; g.fillRect(0, 5, 96, 4); g.fillRect(0, 17, 96, 4);
  }, color: 0xffffff }],
  start: { text: 'DUNE DASH', color: 0x8a5a2b, background: '#f4d58a', ink: '#5a3a1a' },
  patches: { color: 0xf6e7bd, roughness: 1 },
  env: { fog: [0xf1dcae, 160, 1900], background: 0xf1dcae, exposure: 1.0 },
  lights: { hemi: [0xfff3d6, 0xd9b26e, 1.5], sun: [0xfff1cf, 2.4] },

  build({ group, D, movers, herd, clear, beside, sign, add, keep, prop, animated }) {
    const r = rng(31);
    const scatter = (count, margin, make, far = 520) => { const list = []; let tries = 0; while (list.length < count && tries++ < 6000) { const x = -far + r() * far * 2, z = -far + r() * far * 2; if (clear(x, z, margin)) list.push(make(x, z)); } return list; };
    // dunes: long low humps of sand, everywhere but on the trail
    herd('Dunes', ball(1, 2, SAND, 0, 0, 0, 1, 0.22, 0.62), scatter(70, 75, (x, z) => [x, -1.5, z, r() * 3.14, 34 + r() * 50], 800));
    herd('Dunes_Near', ball(1, 2, 0xe6c88d, 0, 0, 0, 1, 0.3, 0.7), scatter(60, 26, (x, z) => [x, -1.2, z, r() * 3.14, 9 + r() * 9], 330));
    // cacti
    const cactus = merge([cyl(0.45, 0.5, 4.4, 8, 0x4f8a45, 0, 2.2, 0), cyl(0.28, 0.28, 1.2, 6, 0x4f8a45, 0.95, 2.3, 0, 0, Math.PI / 2), cyl(0.28, 0.28, 1.6, 6, 0x4f8a45, 1.45, 3.0, 0),
      cyl(0.26, 0.26, 1.0, 6, 0x4f8a45, -0.85, 1.7, 0, 0, Math.PI / 2), cyl(0.26, 0.26, 1.3, 6, 0x4f8a45, -1.3, 2.3, 0), ball(0.46, 1, 0x4f8a45, 0, 4.4, 0)]);
    herd('Cacti', cactus, scatter(70, 18, (x, z) => [x, 0, z, r() * 6.28, 0.7 + r() * 0.8], 380));
    // the oasis by the start: a pool and palms
    const [ox, , oz] = beside(-10, -1, 34);
    const pond = add('Oasis_Pool', new THREE.CircleGeometry(16, 28).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: 0x3fb7d6, roughness: 0.08 }))); pond.position.set(ox, 0.02, oz);
    const fronds = [0, 1, 2, 3, 4, 5].map(k => cone(0.9, 4.6, 4, 0x3f9a4b, Math.cos(k * 1.047) * 2.0, 8.3, Math.sin(k * 1.047) * 2.0, Math.sin(k * 1.047) * 1.15, -Math.cos(k * 1.047) * 1.15));
    const palm = merge([cyl(0.3, 0.45, 8.6, 7, 0x8a6a44, 0, 4.3, 0), ...fronds, ball(0.5, 1, 0x6b4a2c, 0, 8.4, 0)]);
    herd('Palms', palm, Array.from({ length: 11 }, (_, k) => { const a = k * 0.57 + 0.3, d = 19 + (k % 3) * 4; return [ox + Math.cos(a) * d, 0, oz + Math.sin(a) * d, k, 0.8 + (k % 4) * 0.12]; }));
    // the canyon: boulders piled down both sides of it
    const walls = [], canyon = T.sections.find(sec => sec.id === 'D');
    for (let s = canyon.sStart + 6; s < canyon.sEnd - 4; s += 9) for (const side of [-1, 1]) { const [x, y, z] = beside(s, side, 5.5 + r() * 3); walls.push([x, y - 1, z, r() * 6.28, 4.5 + r() * 3.5]); }
    herd('Canyon_Rocks', ball(1, 0, ROCK, 0, 0.5, 0, 1, 1.25, 1), walls);
    herd('Boulders', ball(1, 0, 0x8f6a4c, 0, 0.75, 0, 1.25, 1.0, 1.25), T.obstacles.map((ob, k) => [ob.x, ob.y, ob.z, k * 1.3, 1]));
    herd('Pyramids', cone(1, 0.9, 4, 0xd9b877), [[-640, 0, -420, 0.4, 150], [-470, 0, -560, 0.4, 100], [690, 0, 380, 0.2, 180]]);
    // the sinkhole: a funnel of sand spiralling down into the dark, turning, with a ring of rocks round the rim
    { const hole = T.sinkholes[0], swirl = canvasTexture(128, 128, (g) => {
        const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64); grad.addColorStop(0, '#2a1608'); grad.addColorStop(0.25, '#6b4320'); grad.addColorStop(0.7, '#c99a5a'); grad.addColorStop(1, '#d9b06a');
        g.fillStyle = grad; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(90,55,25,0.55)'; g.lineWidth = 3;
        for (let arm = 0; arm < 5; arm++) { g.beginPath(); for (let k = 0; k <= 40; k++) { const t = k / 40, a = arm * 1.2566 + t * 4.2, r = 6 + t * 58; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.stroke(); }
      });
      D.push(swirl);
      // (laid on the sand of the road, turning, darker and darker towards the throat)
      const funnel = add('Sinkhole', new THREE.CircleGeometry(hole.radius, 48).rotateX(-Math.PI / 2),
        keep(new THREE.MeshStandardMaterial({ map: swirl, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
      funnel.position.set(hole.x, hole.y + 0.05, hole.z); funnel.renderOrder = 1;
      animated.push(t => { funnel.rotation.y = -t * 0.9; });
      const throat = add('Sinkhole_Throat', new THREE.CircleGeometry(hole.core, 32).rotateX(-Math.PI / 2), keep(new THREE.MeshBasicMaterial({ color: 0x120804, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
      throat.position.set(hole.x, hole.y + 0.07, hole.z); throat.renderOrder = 2;
      const rim = [];
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.2; rim.push([hole.x + Math.cos(a) * (hole.radius + 0.8), hole.y - 0.3, hole.z + Math.sin(a) * (hole.radius + 0.8), a, 0.45 + (k % 3) * 0.15]); }
      herd('Sinkhole_Rim', ball(1, 0, 0x8f6a4c, 0, 0.4, 0, 1.3, 0.7, 1), rim); }

    // the whirlwinds: a funnel of rings, wider towards the top, each turning
    const funnelM = keep(new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    T.twisters.forEach((_, k) => {
      const twister = new THREE.Group(), rings = [];
      for (let n = 0; n < 9; n++) { const g = new THREE.CylinderGeometry(0.7 + n * 0.42, 0.5 + n * 0.36, 1.3, 12, 1, true); D.push(g); const ring = new THREE.Mesh(g, funnelM); ring.position.y = 0.65 + n * 1.25; twister.add(ring); rings.push(ring); }
      twister.name = 'Twister'; group.add(twister);
      movers[`twister-${k}`] = h => { twister.position.set(h.x, h.y, h.z); rings.forEach((ring, n) => { ring.rotation.y = h.rotationY * (1 + n * 0.1); ring.position.x = Math.sin(h.rotationY * 0.35 + n * 0.7) * 0.12 * n; }); };
    });
    // the tumbleweed
    const weedG = new THREE.IcosahedronGeometry(T.weedRun.radius, 1), weedM = keep(new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1, wireframe: true })); D.push(weedG);
    T.weedLanes.forEach((_, k) => {
      const weed = new THREE.Mesh(weedG, weedM); weed.rotation.order = 'YZX'; weed.name = 'Tumbleweed'; group.add(weed);
      movers[`weed-${k}`] = h => { weed.visible = h.fade > 0.01; weed.position.set(h.x, h.y + T.weedRun.radius, h.z); weed.rotation.set(0, h.rotationY, h.spin); weed.scale.setScalar(0.5 + 0.5 * h.fade); };
    });
    void prop;
    for (const [text, s] of [['SOFT SAND', T.mud[0].s - 26], ['TWISTERS!', T.twisters[0] - 44], ['TUMBLEWEED', T.weedLanes[0] - 24], ['ROCKS', T.obstacles[0].s - 16], ['SINKHOLE!', T.sinkholes[0].s - 40]]) sign(text, s, 1, '#f4d58a', '#5a3a1a');
  },
});
