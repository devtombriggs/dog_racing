// The Speed Bowl — the look of it: a tarmac oval with red and white barriers, grandstands down both
// straights, floodlights, and an infield with tyres and a pit building.  The track itself
// is shared/speedBowlData.js; the parts every kit map shares are in ../trackKit3d.js.
import * as THREE from 'three';
import { SPEED_BOWL as T } from '../../../shared/speedBowlData.js';
import { createKitWorld, rng, box, cyl, torus, merge, band, canvasTexture } from '../trackKit3d.js';

const S = T.samples, N = T.sampleCount;
const GRASS = 0x4f9a48;

export const createSpeedBowl = () => createKitWorld(T, {
  name: 'SpeedBowl', sunDirection: [0.35, 0.8, 0.35],
  sky: { top: 0x2f86e0, horizon: 0xcfe8fb, clouds: 0xffffff, cloudCount: 16 },
  ground: { color: GRASS },
  road: { color: i => (i % 8 < 4 ? 0x3a3d44 : 0x40444c), side: 0x6f7480, bank: 3, roughness: 0.9 },
  edges: [{ height: 1.0, every: 4, size: [64, 32], draw(g) { g.fillStyle = '#e2303a'; g.fillRect(0, 0, 32, 32); g.fillStyle = '#f4f4f4'; g.fillRect(32, 0, 32, 32); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 64, 5); } }],
  start: { text: 'SPEED BOWL', color: 0x30343a, background: '#e2303a', ink: '#ffffff' },
  env: { fog: [0xcfe8fb, 220, 1800], background: 0xcfe8fb, exposure: 1.0 },
  lights: { hemi: [0xe6f1ff, 0x7fae6a, 1.5], sun: [0xfff6e0, 2.3] },

  build({ group, D, movers, herd, beside, add, keep }) {
    const r = rng(8);
    // white lines: a dashed one down the middle, a solid one just inside each edge
    const white = keep(new THREE.MeshBasicMaterial({ color: 0xf4f4f4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    add('Centre_Line', band(T, 0, N, i => ({ lat: -0.14, y: S.y[i] + 0.04 }), i => ({ lat: 0.14, y: S.y[i] + 0.04 }), { skip: i => i % 6 > 2 }), white);
    for (const side of [1, -1]) add('Edge_Line', band(T, 0, N, i => ({ lat: side * (S.width[i] / 2 - 0.9), y: S.y[i] + 0.04 }), i => ({ lat: side * (S.width[i] / 2 - 0.65), y: S.y[i] + 0.04 })), white);

    // a grandstand down the outside of each straight: steps of seats full of spectators, and a roof
    const crowd = canvasTexture(256, 64, (g) => { g.fillStyle = '#5a606b'; g.fillRect(0, 0, 256, 64); for (let k = 0; k < 500; k++) { g.fillStyle = ['#e2303a', '#ffd23a', '#1e9be0', '#f4f4f4', '#2fae62', '#ff8a3c'][Math.floor(r() * 6)]; g.fillRect(Math.floor(r() * 64) * 4, Math.floor(r() * 8) * 8 + 1, 3, 5); } }, true);
    crowd.repeat.set(4, 1);
    const crowdM = keep(new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 })), roofM = keep(new THREE.MeshStandardMaterial({ color: 0xe2303a, roughness: 0.6 })); D.push(crowd);
    for (const section of ['A', 'C']) {
      const sec = T.sections.find(q => q.id === section), [x, y, z, yaw] = beside((sec.sStart + sec.sEnd) / 2, 1, 16);
      const stand = new THREE.Group(); stand.position.set(x, y, z); stand.rotation.y = yaw; stand.name = 'Grandstand';
      for (let k = 0; k < 6; k++) { const g = new THREE.BoxGeometry(2.2, 1.3 + k * 1.3, 96).translate(-(k * 2.2), (1.3 + k * 1.3) / 2, 0); D.push(g); const step = new THREE.Mesh(g, crowdM); step.castShadow = true; stand.add(step); }
      const roofG = new THREE.BoxGeometry(15, 0.4, 100).translate(-6, 11.5, 0); D.push(roofG); stand.add(new THREE.Mesh(roofG, roofM));
      group.add(stand);
    }
    // floodlights at the four corners, tyres and a pit building in the middle
    const lamp = merge([cyl(0.25, 0.35, 22, 6, 0x9aa3ad, 0, 11, 0), box(4.5, 2.2, 0.6, 0xf6f6e0, 0, 22.5, 0)]);
    herd('Floodlights', lamp, [[80, 0, 62], [-80, 0, 62], [80, 0, -62], [-80, 0, -62]].map(([x, z]) => [x * 1.45, 0, z * 1.25, Math.atan2(-x, -z), 1]));
    const tyre = merge([0, 1, 2].map(k => torus(0.6, 0.26, k % 2 ? 0xf4f4f4 : 0x1c1d20, 0, 0.26 + k * 0.5, 0, Math.PI / 2, 12)));
    const stacks = []; for (let s = 0; s < T.length; s += 9) { const [x, y, z] = beside(s, -1, 1.6); stacks.push([x, y, z, s, 1]); }
    herd('Tyre_Stacks', tyre, stacks);
    herd('Pit_Building', merge([box(34, 5, 12, 0xf2f2f2, 0, 2.5, 0), box(35, 0.6, 13, 0xe2303a, 0, 5.3, 0), box(34, 1.4, 0.2, 0x1c1d20, 0, 3.4, 6.05)]), [[0, 0, 0, 0, 1]]);
    herd('Flags', merge([cyl(0.06, 0.06, 6, 5, 0xdadada, 0, 3, 0), box(0.05, 1.0, 1.8, 0xffd23a, 0, 5.4, 0.95)]), Array.from({ length: 12 }, (_, k) => [-55 + k * 10, 0, 14 * (k % 2 ? 1 : -1), 0, 1]));

    void movers; void D; void group;
  },
});
