// Neon Nexus — the look of it: a dark road with glowing edges high over a city at night, the second
// roads that leave it and join it again, the platform crossings, rings of light over the road, and the accelerator.
// The track itself is shared/neonData.js; the parts every kit map shares are in ../trackKit3d.js.
import * as THREE from 'three';
import { NEON as T } from '../../../shared/neonData.js';
import { createKitWorld, rng, cyl, canvasTexture } from '../trackKit3d.js';

const CYAN = 0x29e6ff, PINK = 0xff3df0, CITY_Y = -170, RED = 0xff2a3a;

// The Undercity: the dark road under each crossing (shared/neonData.js).  Its deck, walls of light, steam, a sign at each
// end; the lift shaft up to the road; and the robots, each a chunky droid on one wheel with one big eye, that glows red before
// it fires its ring of lightning
function buildUndercity({ group, D, add, keep, band, span, movers, animated }) {
  const S = T.samples;
  // (lit by its own glow: shiny metal renders black in this game's light, so the deck is matt, with lit lines in it)
  const deckTex = canvasTexture(64, 64, (g) => { g.fillStyle = '#1a1f3a'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#3d4d9a'; g.lineWidth = 3; g.strokeRect(1, 1, 62, 62); g.fillStyle = '#ff3df0'; g.fillRect(0, 29, 8, 6); g.fillRect(56, 29, 8, 6); g.fillStyle = '#2a3366'; g.fillRect(30, 0, 4, 64); }, true);
  deckTex.repeat.set(3, 1); D.push(deckTex);
  const deckM = keep(new THREE.MeshBasicMaterial({ map: deckTex, side: THREE.DoubleSide }));
  const sideM = keep(new THREE.MeshStandardMaterial({ color: 0x232842, roughness: 0.7, side: THREE.DoubleSide }));
  const glowM = [PINK, CYAN].map(hue => keep(new THREE.MeshBasicMaterial({ color: hue, side: THREE.DoubleSide })));
  for (const u of T.undercity) {
    const [a, b] = span(T, u.sStart, u.sEnd), low = i => S.y[i] - u.depth, half = i => S.width[i] / 2;
    add('Undercity_Deck', band(T, a, b, i => ({ lat: -half(i) - 0.5, y: low(i) }), i => ({ lat: half(i) + 0.5, y: low(i) }), { every: 2 }), deckM).receiveShadow = true;
    add('Undercity_Slab', band(T, a, b, i => ({ lat: -half(i) - 0.5, y: low(i) - 1.2 }), i => ({ lat: half(i) + 0.5, y: low(i) - 1.2 })), sideM);
    for (const side of [-1, 1]) {
      add('Undercity_Wall', band(T, a, b, i => ({ lat: side * (half(i) + 0.5), y: low(i) - 1.2 }), i => ({ lat: side * (half(i) + 0.5), y: low(i) + 3.2 })), sideM);
      add('Undercity_Light', band(T, a, b, i => ({ lat: side * (half(i) + 0.3), y: low(i) + 0.15 }), i => ({ lat: side * (half(i) + 0.3), y: low(i) + 0.5 })), glowM[0]);
      add('Undercity_Light', band(T, a, b, i => ({ lat: side * (half(i) + 0.3), y: low(i) + 2.6 }), i => ({ lat: side * (half(i) + 0.3), y: low(i) + 2.8 })), glowM[1]);
    }
    // the back wall where it starts, with a warning band across it
    { const p = T.pointAt(u.sStart), w = p.halfWidth * 2 + 1, endG = new THREE.PlaneGeometry(w, 4.4); D.push(endG);
      const end = new THREE.Mesh(endG, sideM); end.position.set(p.x, p.y - u.depth + 1, p.z); end.rotation.y = p.rotationY; end.name = 'Undercity_End'; group.add(end);
      const stripeG = new THREE.PlaneGeometry(w, 0.5); D.push(stripeG); const stripe = new THREE.Mesh(stripeG, glowM[0]); stripe.position.set(p.x, p.y - u.depth + 2.4, p.z); stripe.rotation.y = p.rotationY; stripe.translateZ(0.05); group.add(stripe); }
    const lift = T.launches.find(l => l.under === u.id);

    // the lift: four posts from the deck to above the road, rings of light running up them, and a glowing floor
    const top = T.launchPoint(lift.duration * 0.86, 0, lift), bottom = T.launchPoint(lift.duration * 0.16, 0, lift), mid = { x: (top.x + bottom.x) / 2, z: (top.z + bottom.z) / 2 };
    const high = top.y - bottom.y + 4, postG = new THREE.CylinderGeometry(0.25, 0.25, high, 8).translate(0, high / 2, 0), ringG = new THREE.TorusGeometry(1, 0.08, 6, 32).rotateX(Math.PI / 2); D.push(postG, ringG);
    const shaft = new THREE.Group(); shaft.position.set(mid.x, bottom.y - 0.2, mid.z); shaft.rotation.y = bottom.rotationY; shaft.name = 'Undercity_Lift'; group.add(shaft);
    const w = T.pointAt(lift.takeoffS).halfWidth;
    for (const [x, z] of [[-w, -3], [w, -3], [-w, 3], [w, 3]]) { const post = new THREE.Mesh(postG, glowM[1]); post.position.set(x, 0, z); shaft.add(post); }
    const floorG = new THREE.PlaneGeometry(w * 2, 6).rotateX(-Math.PI / 2); D.push(floorG); const floor = new THREE.Mesh(floorG, glowM[1]); floor.position.y = 0.25; shaft.add(floor);
    const rings = Array.from({ length: 4 }, () => { const ring = new THREE.Mesh(ringG, glowM[0]); ring.scale.set(w + 0.4, 1, 3.4); shaft.add(ring); return ring; });
    animated.push(t => rings.forEach((ring, k) => { ring.position.y = ((t * 0.45 + k / rings.length) % 1) * high; }));
  }
  // steam from the vents in the walls
  const puffG = new THREE.IcosahedronGeometry(1, 1), puffM = keep(new THREE.MeshBasicMaterial({ color: 0x8f9ad6, transparent: true, opacity: 0.18, depthWrite: false })); D.push(puffG);
  const puffs = [];
  for (const u of T.undercity) for (let s = u.sStart + 30, k = 0; s < u.sEnd - 30; s += 37, k++) { const p = T.pointAt(s, (k % 2 ? 1 : -1) * (T.pointAt(s).halfWidth + 0.2)); const m = new THREE.Mesh(puffG, puffM); m.position.set(p.x, p.y - u.depth + 2, p.z); group.add(m); puffs.push({ m, y: p.y - u.depth + 2, k }); }
  animated.push(t => puffs.forEach(({ m, y, k }) => { const f = (t * 0.6 + k * 0.37) % 1; m.position.y = y + f * 3; m.scale.setScalar(0.6 + f * 1.8); m.material.opacity = 0.18; }));

  // ---------- the robots
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xdfe6f5, roughness: 0.35, metalness: 0.25, emissive: 0x2a3260, emissiveIntensity: 0.6 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x3a4060, roughness: 0.5, metalness: 0.2 }));
  const wheelG = new THREE.TorusGeometry(0.55, 0.22, 10, 24).rotateY(Math.PI / 2), bodyG = new THREE.CapsuleGeometry(0.75, 0.9, 6, 16), headG = new THREE.SphereGeometry(0.62, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.6);
  const eyeG = new THREE.CircleGeometry(0.32, 24), armG = new THREE.CylinderGeometry(0.12, 0.1, 1.1, 8), clawG = new THREE.TorusGeometry(0.2, 0.06, 6, 12, Math.PI * 1.4), antennaG = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), tipG = new THREE.SphereGeometry(0.1, 8, 8);
  const zapG = new THREE.TorusGeometry(1, 0.09, 6, 48).rotateX(Math.PI / 2), boltG = new THREE.CylinderGeometry(0.05, 0.05, 1, 4).translate(0, 0.5, 0);
  D.push(wheelG, bodyG, headG, eyeG, armG, clawG, antennaG, tipG, zapG, boltG);
  for (const robot of T.robots) {
    const bot = new THREE.Group(); bot.name = 'Robot'; group.add(bot);
    const wheel = new THREE.Mesh(wheelG, dark); wheel.position.y = 0.75; bot.add(wheel);
    const body = new THREE.Mesh(bodyG, chrome); body.position.y = 1.85; body.castShadow = true; bot.add(body);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.06, 6, 28).rotateX(Math.PI / 2), glowM[1]); band.position.y = 1.7; bot.add(band); D.push(band.geometry);
    const head = new THREE.Mesh(headG, chrome); head.position.y = 2.75; bot.add(head);
    const eyeM = keep(new THREE.MeshBasicMaterial({ color: CYAN })), eye = new THREE.Mesh(eyeG, eyeM); eye.position.set(0, 2.8, 0.6); bot.add(eye);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armG, chrome); arm.position.set(side * 0.95, 1.85, 0.15); arm.rotation.z = side * 0.5; bot.add(arm);
      const claw = new THREE.Mesh(clawG, dark); claw.position.set(side * 1.25, 1.3, 0.2); claw.rotation.y = Math.PI / 2; bot.add(claw);
    }
    const antenna = new THREE.Mesh(antennaG, dark); antenna.position.y = 3.5; bot.add(antenna);
    const tipM = keep(new THREE.MeshBasicMaterial({ color: PINK })), tip = new THREE.Mesh(tipG, tipM); tip.position.y = 3.82; bot.add(tip);
    // the lightning: a ring round it, and bolts from the antenna down to the ring
    const zapM = keep(new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.9 })), ring = new THREE.Mesh(zapG, zapM); ring.position.y = 0.3; ring.visible = false; bot.add(ring);
    const bolts = Array.from({ length: 6 }, (_, k) => { const bolt = new THREE.Mesh(boltG, zapM); bolt.visible = false; bot.add(bolt); return { bolt, a: k * Math.PI / 3 }; });
    movers[robot.id] = (h, t = 0) => {
      bot.position.set(h.x, h.y, h.z); bot.rotation.y = h.rotationY;
      wheel.rotation.x = t * 6;
      eyeM.color.set(h.zapping ? 0xffffff : h.warn > 0 ? (Math.floor(t * 12) % 2 ? RED : 0xff8a3a) : CYAN);
      tipM.color.set(h.warn > 0 || h.zapping ? RED : PINK);
    };
    movers[`${robot.id}-zap`] = (h, t = 0) => {
      ring.visible = h.active; for (const { bolt } of bolts) bolt.visible = h.active;
      if (!h.active) return;
      const r = h.radius * (0.85 + 0.15 * Math.sin(t * 40));
      ring.scale.set(r, 1, r);
      for (const { bolt, a } of bolts) { const x = Math.cos(a + t * 9) * r, z = Math.sin(a + t * 9) * r; bolt.position.set(0, 3.7, 0); bolt.lookAt(bot.localToWorld(new THREE.Vector3(x, 0.3, z))); bolt.rotateX(Math.PI / 2); bolt.scale.set(1, Math.hypot(x, 3.4, z), 1); }
    };
  }
}

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
    const { group, D, animated, herd, add, keep, S } = ctx;
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
    // (none through the Undercity's road)
    const pylons = []; for (let s = 0; s < T.length; s += 55) { if (T.isGap(s) || T.isHole(s) || T.underAt(s)) continue; const p = T.pointAt(s); pylons.push([p.x, p.y, p.z]); const br = T.branchAt(s, p.halfWidth); if (br?.open) { const q = T.pointAt(s, br.side * br.centre); pylons.push([q.x, q.y, q.z]); } }
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
    for (const launch of T.launches.filter(l => !l.under)) {        // (the lifts up from the Undercity are drawn with it, below)
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

    }

    buildUndercity(ctx);
    void herd;
  },
});
