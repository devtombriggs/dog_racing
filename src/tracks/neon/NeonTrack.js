// Neon Nexus — the look of it: a dark road with glowing edges high over a city at night, the second
// roads that leave it and join it again, the platform crossings, rings of light over the road, and the accelerator.
// The track itself is shared/neonData.js; the parts every kit map shares are in ../trackKit3d.js.
import * as THREE from 'three';
import { NEON as T } from '../../../shared/neonData.js';
import { createKitWorld, rng, cyl, canvasTexture } from '../trackKit3d.js';

const CYAN = 0x29e6ff, PINK = 0xff3df0, CITY_Y = -170;

export const createNeon = () => createKitWorld(T, {
  name: 'NeonNexus', sunDirection: [0.2, 0.9, 0.3],
  sky: { top: 0x05030f, horizon: 0x2a0f4a, stars: 900 },
  road: { color: i => (i % 8 < 1 ? 0x4a5a8c : 0x232a40), side: 0x0b0c14, slab: 1.0, grit: false, roughness: 0.35, metalness: 0.3 },
  edges: [
    { from: 0.1, height: 0.45, glow: true, color: CYAN },                          // a rail of light
    { from: 0.55, height: 1.7, glow: true, color: CYAN, opacity: 0.1 },            // and a faint wall above it
  ],
  start: { text: 'NEON NEXUS', color: PINK, glow: true, background: '#12051f', ink: '#29e6ff' },
  strips: { color: '#29e6ff', background: 'rgba(8,10,28,0.92)' },
  megaStrips: { color: '#ffffff', background: 'rgba(255,40,170,0.95)' },       // the mega pads: hot pink, and the arrows run twice as fast
  // the second roads: all edged in pink, whichever is the longer
  branch: { color: i => (i % 8 < 1 ? 0x8c4a7a : 0x33203a), edgeColor: PINK },
  platform: { color: 0x2a3050, edge: 0xffd23a },
  signPost: 0x30343a,
  env: { fog: [0x140a2a, 220, 2400], background: 0x0a0616, exposure: 1.05 },
  lights: { hemi: [0x9fb4ff, 0x4a2a70, 1.5], sun: [0xc8d6ff, 1.4] },

  build(ctx) {
    const { group, D, animated, movers, herd, sign, add, keep, S } = ctx;
    const r = rng(77), o = new THREE.Object3D();
    // is (x, z) within `margin` of the road, or of a second road beside it?
    const nearRoad = (x, z, margin) => { const q = T.query(x, z), br = T.branchAt(q.s, q.halfWidth); return q.distance < q.halfWidth + margin + (br ? br.centre + br.half : 0); };
    // ---------- the city far below: a floor of streets and towers with lit windows
    const streets = canvasTexture(128, 128, (g) => { g.fillStyle = '#080a16'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#1b2a5a'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeStyle = '#3a1a5a'; g.lineWidth = 1; g.strokeRect(32, 32, 64, 64); }, true);
    streets.repeat.set(60, 60);
    const floor = add('City_Floor', new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), keep(new THREE.MeshBasicMaterial({ map: streets }))); floor.position.y = CITY_Y; D.push(streets);
    const windows = canvasTexture(64, 128, (g) => { g.fillStyle = '#0c0f1c'; g.fillRect(0, 0, 64, 128); for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) if (r() < 0.45) { g.fillStyle = ['#29e6ff', '#ff3df0', '#ffd23a', '#7a8cff'][Math.floor(r() * 4)]; g.fillRect(x, y, 4, 4); } }, true);
    const towerG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), towerM = keep(new THREE.MeshBasicMaterial({ map: windows })); D.push(windows, towerG);
    const towers = [];
    for (let x = -780; x <= 780; x += 65) for (let z = -720; z <= 720; z += 65) {
      const px = x + (r() - 0.5) * 22, pz = z + (r() - 0.5) * 22, h = 70 + r() * 150;
      // (none poking up through the road: near it they stop well below)
      if (nearRoad(px, pz, 30) && h > 105) continue;
      towers.push([px, pz, 22 + r() * 22, h]);
    }
    const city = new THREE.InstancedMesh(towerG, towerM, towers.length);
    towers.forEach(([x, z, w, h], k) => { o.position.set(x, CITY_Y, z); o.rotation.set(0, 0, 0); o.scale.set(w, h, w); o.updateMatrix(); city.setMatrixAt(k, o.matrix); });
    city.name = 'City_Towers'; group.add(city); D.push(city);
    // pylons holding the road up
    const pylons = []; for (let s = 0; s < T.length; s += 55) { if (T.isGap(s) || T.isHole(s)) continue; const p = T.pointAt(s); pylons.push([p.x, p.y, p.z]); const br = T.branchAt(s, p.halfWidth); if (br?.open) { const q = T.pointAt(s, br.side * br.centre); pylons.push([q.x, q.y, q.z]); } }
    const pylonG = cyl(0.9, 1.4, 1, 6, 0x1c2238, 0, 0.5, 0), pylonMesh = new THREE.InstancedMesh(pylonG, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })), pylons.length);
    pylons.forEach(([x, y, z], k) => { o.position.set(x, CITY_Y, z); o.scale.set(1, y - 1 - CITY_Y, 1); o.updateMatrix(); pylonMesh.setMatrixAt(k, o.matrix); });
    pylonMesh.name = 'Pylons'; group.add(pylonMesh); D.push(pylonG, pylonMesh);

    // ---------- rings of light over the road (where it is one road)
    const ringG = new THREE.TorusGeometry(1, 0.035, 6, 40), ringM = [CYAN, PINK].map(hue => keep(new THREE.MeshBasicMaterial({ color: hue }))); D.push(ringG);
    for (let s = 60, n = 0; s < T.length; s += 95, n++) {
      if (T.isGap(s) || T.isHole(s) || T.branchAt(s) || T.branchAt(s + 20) || T.branchAt(s - 20) || T.launches.some(l => T.along(s, l.padStart - 30) > 0 && T.along(s, l.landingS + 30) < 0)) continue;
      const p = T.pointAt(s), ring = new THREE.Mesh(ringG, ringM[n % 2]); ring.position.set(p.x, p.y + 1.5, p.z); ring.rotation.y = p.rotationY; ring.scale.setScalar(p.halfWidth + 2.5); ring.name = 'Light_Ring'; group.add(ring);
    }

    // ---------- the accelerator: gates of light closing in down the run-up, then a line of rings right
    // across the city that the dogs are fired through, lit one after another
    // (and the same, smaller, at the two catapults)
    const gold = 0xffd23a, gateG = new THREE.TorusGeometry(1, 0.05, 6, 40), flightG = new THREE.TorusGeometry(1, 0.06, 8, 40); D.push(gateG, flightG);
    const dim = new THREE.Color();
    for (const launch of T.launches) {
      const pulse = [], rings = launch.index ? 16 : 26;
      for (let s = launch.padStart, k = 0; s < launch.takeoffS; s += 4.5, k++) {
        const p = T.pointAt(s), m = keep(new THREE.MeshBasicMaterial({ color: gold })), gate = new THREE.Mesh(gateG, m), f = (s - launch.padStart) / (launch.takeoffS - launch.padStart);
        gate.position.set(p.x, p.y + 0.6, p.z); gate.rotation.y = p.rotationY; gate.scale.setScalar(p.halfWidth + 2.2 - f * 2.4); gate.name = 'Accelerator_Gate'; group.add(gate); pulse.push({ m, at: k * 0.09, hue: gold });
      }
      const first = pulse.length * 0.09;
      for (let k = 0; k < rings; k++) {
        const f = 0.02 + k * 0.96 / rings, p = T.launchPoint(launch.duration * f, 0, launch), m = keep(new THREE.MeshBasicMaterial({ color: k % 2 ? CYAN : PINK })), ring = new THREE.Mesh(flightG, m);
        ring.position.set(p.x, p.y + 1.0, p.z); ring.rotation.order = 'YXZ'; ring.rotation.set(p.pitch, p.rotationY, 0); ring.scale.setScalar(5 + 3.5 * Math.sin(Math.PI * f)); ring.name = 'Accelerator_Ring'; group.add(ring);
        pulse.push({ m, at: first + k * 0.06, hue: k % 2 ? CYAN : PINK });
      }
      const cycle = first + rings * 0.06 + 0.5;
      animated.push(t => { const now = t % cycle; for (const q of pulse) { const d = now - q.at, glow = d >= 0 && d < 0.35 ? 1 : 0.32; q.m.color.set(dim.set(q.hue).multiplyScalar(glow)); } });
      // two rails down the run-up, and the muzzle
      for (const side of [-1, 1]) {
        const [a, b] = ctx.span(T, launch.padStart, launch.takeoffS + 3);
        add('Accelerator_Rail', ctx.band(T, a, b, i => ({ lat: side * (S.width[i] / 2 + 0.4), y: S.y[i] + 1.9 }), i => ({ lat: side * (S.width[i] / 2 + 0.4), y: S.y[i] + 2.6 })), keep(new THREE.MeshBasicMaterial({ color: gold, side: THREE.DoubleSide })));
      }
      sign(launch.index ? 'CATAPULT!' : 'ACCELERATOR!', launch.padStart - 40, 1, '#12051f', '#29e6ff');
    }

    for (const zone of T.platforms) sign('JUMP!', zone.sStart - 34, 1, '#12051f', '#ffd23a');
    void herd; void movers;
  },
});
