import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MAPS, crossedFinishLine, sampleGroundHeight } from '../shared/maps.js';
import { TREAT_ROAD } from '../shared/treatRoadData.js';
import { MODBURY_HEIGHTS as COAST } from '../shared/modburyData.js';
import { TREAT_BOXES_BY_MAP } from '../shared/treatBoxes.js';
import { FARMYARD as FARM } from '../shared/farmData.js';
import { GOLDEN_BONE_SPOTS, BOX_ROW_S, BONE_S } from '../shared/pickupSpots.js';
import { FROSTPEAK_CANNON, FROSTPEAK_SLALOM, FROSTPEAK_SKI_SLOPE } from '../shared/frostpeakCannon.js';
import frostpeak from '../shared/frostpeak.json' with { type: 'json' };

test('Treat Road (bigger since Tom, 2026-11-21) has its catapult gap, supported spawns, and open edges', () => {
  assert.equal(MAPS.treat_road.startPositions.length, 6);
  assert.equal(MAPS.treat_road.checkpoints.length, TREAT_ROAD.checkpoints.length - 1);
  assert.ok(Math.abs(TREAT_ROAD.roadLength - 2150) < 5);
  const samples = TREAT_ROAD.samples;
  for (let i = 0; i < TREAT_ROAD.sampleCount; i++) {
    const j = (i + 1) % TREAT_ROAD.sampleCount;
    assert.ok(Math.hypot(samples.x[j] - samples.x[i], samples.y[j] - samples.y[i], samples.z[j] - samples.z[i]) < 2.6);
  }
  for (const { position } of MAPS.treat_road.startPositions) {
    const ground = TREAT_ROAD.query(position[0], position[2]);
    assert.ok(ground.onTrack);
    assert.ok(Math.abs(ground.y - position[1]) < 0.1);
  }
  for (const cp of TREAT_ROAD.checkpoints) {
    for (const sign of [-1, 1]) {
      const inside = TREAT_ROAD.pointAt(cp.s, sign * (cp.halfWidth - 0.5));
      const outside = TREAT_ROAD.pointAt(cp.s, sign * (cp.halfWidth + 2));
      assert.ok(TREAT_ROAD.query(inside.x, inside.z).onTrack);
      assert.equal(TREAT_ROAD.query(outside.x, outside.z).onTrack, false);
    }
  }
});

for (const [id, map] of Object.entries(MAPS)) {
  test(`${id}: finish requires forward crossing within the course width`, () => {
    const { position, forward, halfWidth } = map.startFinish;
    const point = (distance, lateral = 0) => [
      position[0] + distance * forward[0] - lateral * forward[2],
      position[1],
      position[2] + distance * forward[2] + lateral * forward[0]
    ];
    assert.equal(crossedFinishLine(point(-2), point(2), map.startFinish), true);
    assert.equal(crossedFinishLine(point(2), point(-2), map.startFinish), false);
    assert.equal(crossedFinishLine(point(-2), point(-1), map.startFinish), false);
    assert.equal(crossedFinishLine(point(-2, halfWidth + 3), point(2, halfWidth + 3), map.startFinish), false);
    for (const start of map.startPositions) {
      assert.equal(crossedFinishLine(start.position, point(2), map.startFinish), true);
    }
  });
}

test('Frostpeak ground sampling is bilinear and handles map boundaries', async () => {
  const bytes = await readFile(new URL('../public/models/frostpeak_heightmap.bin', import.meta.url));
  const heights = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const metadata = MAPS.frostpeak.heightmap;
  assert.equal(heights.length, metadata.width * metadata.height);
  assert.ok(heights.every(Number.isFinite));
  for (const start of MAPS.frostpeak.startPositions) {
    assert.ok(Math.abs(sampleGroundHeight(heights, metadata, start.position[0], start.position[2]) - start.position[1]) < 0.1);
  }
  const simple = { width: 2, height: 2, originX: 0, originZ: 0, cellSize: 1 };
  assert.equal(sampleGroundHeight([0, 2, 4, 6], simple, 0.5, 0.5), 3);
  assert.equal(sampleGroundHeight([0, 2, 4, 6], simple, -1, -1), 0);
  assert.equal(sampleGroundHeight([0, 2, 4, 6], simple, 2, 2), 6);
});

test('Frostpeak GLB has usable hidden collision geometry and every spawn is on track', async () => {
  const bytes = await readFile(new URL('../public/models/frostpeak_alpine.glb', import.meta.url));
  const loader = new GLTFLoader();
  // Geometry checks run without browser image decoding or a graphics context.
  loader.register(() => ({ name: 'test-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const root = gltf.scene.getObjectByName('Frostpeak_Collision');
  assert.ok(root);
  root.visible = false;
  gltf.scene.updateMatrixWorld(true);
  const track = gltf.scene.getObjectByName('Collision_Track_Surface');
  const ray = new THREE.Raycaster();
  for (const { position } of MAPS.frostpeak.startPositions) {
    ray.set(new THREE.Vector3(position[0], position[1] + 5, position[2]), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(track, false)[0];
    assert.ok(hit, `Spawn ${position} must hit the track`);
    assert.ok(Math.abs(hit.point.y - position[1]) < 0.1);
  }
  for (const name of ['Collision_Cabins', 'Collision_Trees', 'Collision_Rocks', 'Collision_Fences', 'Collision_Nets',
    'Collision_Cannon_Wheels', 'Collision_Obstacle_Log_01', 'Collision_Slalom', 'Scenery_Cannon', 'Scenery_Slalom', 'Scenery_Bar360_Sign']) {
    assert.ok(gltf.scene.getObjectByName(name)?.isMesh, `${name} exists`);
  }
  const roadAt = (x, y, z) => {
    ray.set(new THREE.Vector3(x, y + 5, z), new THREE.Vector3(0, -1, 0));
    return ray.intersectObject(track, false)[0];
  };
  // road on the launch pad and at the landing, none under the flight
  const { takeoff, landing, padLength, takeoffRotationY } = FROSTPEAK_CANNON;
  const pad = [takeoff[0] - Math.sin(takeoffRotationY) * padLength / 2, takeoff[1], takeoff[2] - Math.cos(takeoffRotationY) * padLength / 2];
  assert.ok(roadAt(...pad), 'launch pad sits on the road');
  const landed = FROSTPEAK_CANNON.launchPoint(FROSTPEAK_CANNON.launch.duration);
  assert.ok(Math.abs(roadAt(landed.x, landed.y, landed.z).point.y - landed.y) < 0.3, 'the flight lands on the road');
  const mid = FROSTPEAK_CANNON.launchPoint(FROSTPEAK_CANNON.launch.duration / 2);
  assert.equal(roadAt(mid.x, landing[1] + 20, mid.z), undefined, 'no road under the flight');
  assert.equal(gltf.scene.getObjectByName('Scenery_Boost_Pads_Glow'), undefined, 'no boost pads');
  for (const o of FROSTPEAK_SLALOM) {
    const hit = roadAt(...o.position);
    assert.ok(hit && Math.abs(hit.point.y - o.position[1]) < 0.3, `slalom ${o.kind} at ${o.position} stands on the road`);
  }
});

test('Frostpeak: the cannon fires off the pad and flies way up to the top of a steep black run', () => {
  const C = FROSTPEAK_CANNON;
  const back = (d, lat = 0) => [
    C.takeoff[0] + Math.sin(C.takeoffRotationY) * d + Math.cos(C.takeoffRotationY) * lat,
    C.takeoff[1],
    C.takeoff[2] + Math.cos(C.takeoffRotationY) * d - Math.sin(C.takeoffRotationY) * lat];
  assert.ok(Math.abs(C.cannonFired(back(-5), back(1))) < 1e-6);
  assert.ok(Math.abs(C.cannonFired(back(-5, 2), back(1, 2)) - 2) < 1e-6, 'fired from where the dog ran in');
  assert.equal(C.cannonFired(back(-30), back(-25)), null, 'not before the end of the pad');
  assert.equal(C.cannonFired(back(-5, 9), back(1, 9)), null, 'not from beside the cannon');
  assert.equal(C.cannonFired(back(5), back(-1)), null, 'not running back out of it');
  const start = C.launchPoint(0), end = C.launchPoint(C.launch.duration);
  assert.ok(Math.hypot(start.x - C.takeoff[0], start.z - C.takeoff[2]) < 1e-6);
  assert.ok(Math.hypot(end.x - C.landing[0], end.y - C.landing[1], end.z - C.landing[2]) < 1e-6);
  assert.ok(C.landing[1] - C.takeoff[1] > 350, 'the cannon fires the dog right up the mountain');
  for (let t = 0.05; t < 1; t += 0.05) {             // always above the straight climb, and coming down onto the landing
    const p = C.launchPoint(t * C.launch.duration);
    assert.ok(p.y >= C.takeoff[1] + (C.landing[1] - C.takeoff[1]) * t - 1e-6);
  }
  assert.ok(C.launchPoint(C.launch.duration * 0.98).pitch > 0, 'the dog is coming down as it lands');
  // a black run: drops most of the climb back to the village, steeply, with plenty to dodge
  assert.ok(FROSTPEAK_SKI_SLOPE.drop > 350);
  assert.ok(frostpeak.track.maxGradePercent > 35);
  assert.ok(FROSTPEAK_SLALOM.length >= 20);
  // the ski slope (landing to the bottom corner) is about half the lap, and the finish is just round the corner
  assert.ok(frostpeak.track.skiSlopeMeters / frostpeak.track.lengthMeters > 0.45);
  // no checkpoint in mid-air; one required on the landing
  const landingCp = frostpeak.checkpoints.find(cp => cp.cannonLanding);
  assert.ok(landingCp && Math.hypot(landingCp.position[0] - C.landing[0], landingCp.position[2] - C.landing[2]) < landingCp.radius);
});


test('Modbury: the Seabed Tunnel (Tom, 2026-11-26) is under the sea, dry, walled in glass, with bends, and everything before the cove is where it was', () => {
  const K = COAST.tunnel, s = COAST.samples;
  assert.ok(K.sEnd - K.sStart > 380 && K.depth > 6);
  let under = 0, turned = 0, bends = 0, way = 0;
  for (let i = K.firstIndex + 1; i < K.lastIndex; i++) {          // (the first and last places are its mouths)
    const q = COAST.query(s.x[i], s.z[i]);
    assert.ok(q.inTunnel && !q.inWater && q.movement === 'run' && q.onTrack && !q.blocked, `at ${s.s[i].toFixed(0)} m`);
    // no way out by the side: a dog against the glass is held inside the road
    for (const side of [-1, 1]) { const out = COAST.pointAt(s.s[i], side * (s.width[i] / 2 + 3)), w = COAST.query(out.x, out.z); if (w.inTunnel) { assert.ok(w.blocked && !w.inWater); assert.ok(Math.hypot(w.clampX - s.x[i], w.clampZ - s.z[i]) < s.width[i] / 2); } }
    if (s.y[i] + K.height < COAST.seaLevel - 0.5) under += COAST.sampleSpacing;         // the whole tube is under the sea here
    assert.ok(Math.abs(s.grade[i]) < 0.13);
    const turn = s.curvature[i] * COAST.sampleSpacing; turned += Math.abs(turn);
    if (Math.abs(s.curvature[i]) > 1 / 70 && Math.sign(turn) !== way) { way = Math.sign(turn); bends += 1; }
    assert.ok(Math.abs(s.curvature[i]) < 1 / 20, `a bend ${Math.abs(1 / s.curvature[i]).toFixed(0)} m round at ${s.s[i].toFixed(0)} m`);
  }
  // (Tom, 2026-11-27: "make it bigger so the camera doesn't stick out": 14 m wide and 7.5 m high, so less of it is wholly under)
  assert.ok(under > 180, `${under.toFixed(0)} m of it wholly under water`);
  assert.ok(K.height >= 7 && s.width[Math.round((K.firstIndex + K.lastIndex) / 2)] >= 13.5);
  // the camera's roof: highest in the middle, lower at the glass, and nothing outside the tunnel
  assert.equal(COAST.enclosed, 'T');
  assert.equal(COAST.headroom({ inTunnel: true, lateral: 0, halfWidth: 7 }), K.height);
  assert.ok(COAST.headroom({ inTunnel: true, lateral: 6.9, halfWidth: 7 }) > 3.5 && COAST.headroom({ inTunnel: false }) === Infinity);
  // speed pads in the tunnel (Tom, 2026-11-27), each one found by a dog running over it, none beside it, none on a pickup
  assert.equal(COAST.strips.length, 5);
  for (const pad of COAST.strips) {
    assert.ok(pad.sStart > K.sStart + 20 && pad.sEnd < K.sEnd - 20 && pad.speed > 1 && pad.hold > 0);
    const on = COAST.pointAt((pad.sStart + pad.sEnd) / 2, (pad.latMin + pad.latMax) / 2), off = COAST.pointAt((pad.sStart + pad.sEnd) / 2, pad.latMax + 1.5);
    assert.equal(COAST.query(on.x, on.z).kick, pad); assert.equal(COAST.query(off.x, off.z).kick, undefined);
    for (const spot of [...BOX_ROW_S.modbury_heights, ...BONE_S.modbury_heights]) assert.ok(spot < pad.sStart - 12 || spot > pad.sEnd + 12, `a pickup at ${spot.toFixed(0)} on the pad at ${pad.sStart.toFixed(0)}`);
  }
  assert.ok(bends >= 4 && turned > Math.PI, `${bends} bends, ${(turned * 180 / Math.PI).toFixed(0)} degrees of turning`);
  // out of the tunnel there is dry land before the start line, and the cove is still the only swim
  assert.ok(COAST.waterCrossing.sEnd < K.sStart && COAST.length - K.sEnd > 90);
  assert.deepEqual(COAST.chasms.map(c => c.s), [1070, 1175, 1570, 1680, 1975]);
  assert.ok(Math.hypot(COAST.startFinish.position[0], COAST.startFinish.position[2] - 8) < 1.5, 'the start line has not moved');
});

test('Modbury has supported spawns, continuous terrain, water and open cliff edges', () => {
  assert.equal(MAPS.modbury_heights.startPositions.length, 6);
  assert.ok(Math.abs(COAST.length - 3251) < 8);        // (3121 m before the Seabed Tunnel, 2026-11-26)
  for (const { position } of COAST.startPositions) {
    const q = COAST.query(position[0], position[2]);
    assert.ok(q.onTrack && !q.blocked && !q.inWater);
    assert.ok(Math.abs(q.y - position[1]) < 0.1);
  }
  const s = COAST.samples;
  for (let i = 0; i < COAST.sampleCount; i++) {
    const j = (i + 1) % COAST.sampleCount;
    assert.ok(Math.hypot(s.x[j] - s.x[i], s.y[j] - s.y[i], s.z[j] - s.z[i]) < 2.6);
    const q = COAST.query(s.x[i], s.z[i]);
    assert.ok(q.onTrack && !q.blocked);
    // the ground is at the trail everywhere except in a ravine, where a bridge carries the trail over it
    const ravine = COAST.chasms.find(c => i > c.firstIndex && i < c.lastIndex);
    if (!ravine) assert.ok(Math.abs(COAST.terrainHeight(s.x[i], s.z[i]) - s.y[i]) < 0.4);
    assert.equal(Boolean(q.onBridge), COAST.chasms.some(c => s.s[i] >= c.ravineStart && s.s[i] <= c.ravineEnd));
  }
  const water = COAST.pointAt((COAST.waterCrossing.sStart + COAST.waterCrossing.sEnd) / 2);
  const wet = COAST.query(water.x, water.z);
  assert.equal(wet.movement, 'swim');
  assert.equal(wet.dogY, COAST.seaLevel - 0.42);
  assert.ok(COAST.speedFactor(wet, { swimming: 1 }) > COAST.speedFactor(wet, { swimming: 0 }));
  const hill = COAST.pointAt(COAST.sections.find(section => section.id === 'B').sStart + 150);
  const uphill = COAST.query(hill.x, hill.z);
  assert.ok(COAST.speedFactor(uphill, { stamina: 1 }) > COAST.speedFactor(uphill, { stamina: 0 }));
  const i = Math.floor((COAST.exposedEdge.firstIndex + COAST.exposedEdge.lastIndex) / 2);
  const sign = s.exposed[0][i] ? 1 : -1;
  const edge = COAST.pointAt(s.s[i], sign * (s.width[i] / 2 + 3));
  assert.equal(COAST.query(edge.x, edge.z).fall, true);
  const inland = COAST.pointAt(s.s[i], -sign * 30);
  const bank = COAST.query(inland.x, inland.z);
  assert.ok(bank.blocked && !bank.fall);
});


test('Treat Road catapult bridges a real gap and lands facing the supported road', () => {
  const T = TREAT_ROAD, pad = T.launch;
  assert.ok(pad.gapEnd - pad.gapStart > 145);
  assert.ok(T.checkpoints.every(cp => !T.isGap(cp.s)));
  assert.equal(T.checkpoints.filter(cp => cp.launchLanding).length, 1);
  for (let s = pad.gapStart + 3; s < pad.gapEnd - 3; s += 2) {
    const p = T.pointAt(s);
    assert.equal(T.query(p.x,p.z).onTrack, false);
  }
  for (const lateral of [-3,0,3]) {
    for (const [time,s] of [[0,pad.takeoffS],[pad.duration,pad.landingS]]) {
      const p = T.launchPoint(time,lateral), road=T.pointAt(s,lateral);
      assert.ok(Math.hypot(p.x-road.x,p.y-road.y,p.z-road.z)<1e-6);
      assert.ok(T.query(p.x,p.z).onTrack);
      assert.ok(Math.abs(Math.sin(p.rotationY-road.rotationY))<1e-6);
    }
    let previous=T.launchPoint(0,lateral);
    for (let time=0.01;time<=pad.duration;time+=0.01) {
      const p=T.launchPoint(time,lateral);
      assert.ok(Object.values(p).every(Number.isFinite));
      assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z)<2);
      previous=p;
    }
    assert.ok(T.launchPoint(pad.duration/2,lateral).y > Math.max(T.pointAt(pad.takeoffS).y,T.pointAt(pad.landingS).y)+20);
  }
});

test('Frostpeak solid collision faces point outwards (a dog stuck inside a block can walk out, never in)', async () => {
  const bytes = await readFile(new URL('../public/models/frostpeak_alpine.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const solids = [];
  scene.traverse(o => { if (o.isMesh && /^Collision_/.test(o.name) && !/Fences|Nets|Track_Surface|Terrain/.test(o.name)) solids.push(o); });
  assert.ok(solids.some(o => o.name === 'Collision_Slalom'));
  for (const o of solids) {
    o.material.side = THREE.DoubleSide;
    const box = new THREE.Box3().setFromObject(o);
    // aim at each slalom block / object from outside along x and z, at mid height of a few parts
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    let checked = 0;
    for (let t = 0; t < idx.count / 3 && checked < 40; t += Math.max(1, Math.floor(idx.count / 3 / 40))) {
      const p = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(pos, idx.getX(t * 3 + k)).applyMatrix4(o.matrixWorld));
      const centre = p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1 / 3);
      const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])); n.y = 0;
      if (n.lengthSq() < 1e-8) continue;
      n.normalize();
      // which way is really outside?  A ray from the face out to open space crosses the rest of the
      // (closed) mesh an even number of times on the outside, an odd number on the inside.
      ray.set(centre.clone().addScaledVector(n, 0.01), n); ray.near = 0; ray.far = 200;
      const crossings = ray.intersectObject(o, false).filter(h => h.distance > 0.02).length;
      const outside = crossings % 2 === 0 ? n : n.clone().negate();
      // the face's own normal (from its winding: what the game's exit test reads) must point outside
      const faceNormal = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])); faceNormal.y = 0;
      assert.ok(faceNormal.dot(outside) > 0, `${o.name}: a face points inwards`);
      checked++;
    }
    assert.ok(checked > 0 || box.isEmpty(), `${o.name}: nothing checked`);
  }
});

test('Modbury ravines: a broken bridge on a straight after every checkpoint run-up, railed, with a break to jump', () => {
  const T = COAST;
  assert.equal(T.chasms.length, 5);
  for (const c of T.chasms) {
    const mid = T.pointAt(c.s), q = T.query(mid.x, mid.z);
    assert.ok(q.gap && q.onBridge && q.onTrack, 'the break is in the middle of the bridge');
    assert.ok(Math.abs(q.y - mid.y) < 0.05, 'the deck is at trail height, break included: a jumping dog lands level');
    assert.ok(T.terrainHeight(mid.x, mid.z) < mid.y - 10, 'a real drop underneath');
    assert.ok(c.gap >= 6 && c.gap <= 8, 'a sprinting jump (about 13 m) clears it with room to spare');
    // planks right up to the break at both ends, and solid trail either side of the ravine
    for (const sOn of [c.ravineStart + 0.5, c.gapStart - 0.1, c.gapEnd + 0.1, c.ravineEnd - 0.5]) {
      const p = T.pointAt(sOn), on = T.query(p.x, p.z);
      assert.ok(on.onBridge && !on.gap, `planks at ${sOn.toFixed(1)}`);
    }
    for (const sOff of [c.ravineStart - 1, c.ravineEnd + 1]) {
      const p = T.pointAt(sOff), off = T.query(p.x, p.z);
      assert.ok(!off.onBridge && !off.gap);
      assert.ok(Math.abs(T.terrainHeight(p.x, p.z) - p.y) < 0.4, 'the trail meets the bridge on solid ground');
    }
    // rails: no way off the side of the bridge, on either side
    for (const side of [1, -1]) {
      const p = T.pointAt(c.ravineStart + 3, side * (mid.halfWidth + 2)), railed = T.query(p.x, p.z);
      assert.ok(railed.blocked && !railed.fall);
      assert.ok(Math.abs(T.query(railed.clampX, railed.clampZ).lateral) < mid.halfWidth);
    }
    // a fall puts the dog back at the last checkpoint: far enough back to be at full speed again
    // (Tom, 2026-11-27: "the dogs got stuck at the last two jumps": the one a fallen dog goes back to is the last one before the
    // BREAK, and two of those were on the bridge itself, a metre or two short of it)
    const before = T.checkpoints.filter(cp => cp.s < c.gapEnd).at(-1);
    assert.ok(c.gapStart - before.s > 45, `run-up of ${(c.gapStart - before.s).toFixed(0)} m`);
    assert.ok(Math.abs(T.samples.curvature[T.indexAtS(c.s)]) < 0.01, 'on a straight');
  }
  // pickups keep clear of the bridges and their run-ups
  for (const box of TREAT_BOXES_BY_MAP.modbury_heights) {
    assert.ok(!T.chasms.some(c => box.s > c.ravineStart - 30 && box.s < c.ravineEnd + 15), `box at ${box.s.toFixed(0)}`);
  }
});

test('Muddy Paws Farm: a fenced lap with a barn to run through, things standing in the road, mud and a pond to jump', () => {
  const T = FARM, s = T.samples;
  assert.equal(MAPS.farmyard.procedural, true);
  assert.equal(MAPS.farmyard.startPositions.length, 6);
  assert.ok(Math.abs(T.length - 1684) < 10, `lap of ${T.length.toFixed(0)} m`);        // (the maze since Tom, 2026-11-21; 1648 m before the bends of 2026-11-26)
  assert.deepEqual(T.sections.map(sec => sec.id).join(''), 'ABCDEFGHIJA', 'all ten parts of the farm, in order');
  const bridge = T.chasms[0];
  for (let i = 0; i < T.sampleCount; i++) {
    const q = T.query(s.x[i], s.z[i]);
    assert.ok(q.onTrack && !q.fall, 'nowhere to fall off: the farm is fenced');
    const onObstacle = T.obstacles.some(o => Math.hypot(o.x - s.x[i], o.z - s.z[i]) < o.radius + 0.7);
    // (in the maze the rows of corn cross the middle of the field: Tom, 2026-11-21)
    const inMaze = T.along(s.s[i], T.maze.sStart - 3) >= 0 && T.along(s.s[i], T.maze.sEnd + 3) <= 0;
    if (!inMaze) assert.equal(q.blocked, onObstacle, `centreline at ${s.s[i].toFixed(0)} m`);
    const overPond = i > bridge.firstIndex && i < bridge.lastIndex;
    if (!overPond) assert.ok(Math.abs(T.terrainHeight(s.x[i], s.z[i]) - s.y[i]) < 0.5, 'the ground is at the road');
    assert.ok(Math.abs(s.grade[i]) < 0.08, 'gentle hills only');
    // fences (or the barn walls, the corn, the bridge rails): no way off the side, either side
    for (const side of [1, -1]) {
      const out = T.pointAt(s.s[i], side * (s.width[i] / 2 + 9)), fenced = T.query(out.x, out.z);
      assert.ok(fenced.blocked, `fenced at ${s.s[i].toFixed(0)} m`);
      assert.ok(T.query(fenced.clampX, fenced.clampZ).distance < s.width[i] / 2 + 4.5);
    }
  }
  for (const { position } of T.startPositions) {
    const q = T.query(position[0], position[2]);
    assert.ok(q.onTrack && !q.blocked && !q.mud && Math.abs(q.y - position[1]) < 0.1);
  }
  // the barn: walls close in either side
  const inBarn = T.pointAt(T.barn.s, T.barn.inside + 1.5), walled = T.query(inBarn.x, inBarn.z);
  assert.ok(walled.inBarn && walled.blocked);
  assert.ok(T.pointAt(T.barn.s).halfWidth > T.barn.inside - 0.6, 'the road fills the barn');
  // bales and the scarecrow stand in the road: a dog is kept to their edge, and there is room to pass
  for (const o of T.obstacles) {
    const q = T.query(o.x + 0.2, o.z);
    assert.ok(q.blocked, o.id);
    assert.ok(Math.hypot(q.clampX - o.x, q.clampZ - o.z) >= o.radius + 0.69, `${o.id} pushes the dog out to its edge`);
    if (o.kind === 'mill') continue;
    const c = T.pointAt(o.s), free = c.halfWidth - Math.abs(o.lateral) - o.radius - 0.7 + (o.lateral === 0 ? 0 : c.halfWidth + Math.abs(o.lateral) - o.radius - 0.7);
    assert.ok(o.lateral === 0 ? c.halfWidth - o.radius - 0.7 > 2.2 : free > 4, `${o.id}: room to get past`);
  }
  // mud slows a dog; the other side of the road at each wallow is dry
  for (const patch of T.mud) {
    const wet = T.query(patch.x, patch.z), dry = T.pointAt(patch.s, -patch.lateral * 1.6), other = T.query(dry.x, dry.z);
    assert.ok(wet.mud && T.speedFactor(wet) < 0.65);
    assert.ok(!other.mud && !other.blocked, 'a dry line past each wallow');
  }
  // the pond: a railed bridge with a break in the middle, a real drop into the water, a run-up from the last checkpoint
  const mid = T.pointAt(bridge.s), gap = T.query(mid.x, mid.z);
  assert.ok(gap.gap && gap.onBridge && Math.abs(gap.y - mid.y) < 0.05);
  assert.ok(T.terrainHeight(mid.x, mid.z) < mid.y - 2.5);
  for (const sOn of [bridge.ravineStart + 0.5, bridge.gapStart - 0.1, bridge.gapEnd + 0.1, bridge.ravineEnd - 0.5]) {
    const p = T.pointAt(sOn), on = T.query(p.x, p.z);
    assert.ok(on.onBridge && !on.gap);
  }
  const before = T.checkpoints.filter(cp => cp.s < bridge.ravineStart).at(-1);
  assert.ok(bridge.gapStart - before.s > 45 && bridge.gap <= 7);
  assert.ok(T.length - bridge.ravineEnd > 60, 'the bridge is well clear of the starting grid');
  // pickups: on the road, clear of everything that has to be dodged
  for (const [x, y, z] of [...TREAT_BOXES_BY_MAP.farmyard.map(b => b.groundPosition), ...GOLDEN_BONE_SPOTS.farmyard.map(b => [b.x, b.y, b.z])]) {
    const q = T.query(x, z);
    assert.ok(q.onTrack && !q.blocked && !q.gap && !q.inBarn && Math.abs(q.y - y) < 0.3, `pickup at ${q.s.toFixed(0)} m`);
    for (let t = 0; t < 40; t += 0.5) assert.equal(T.hazardHit([x, y, z], t), null, `nothing runs over the pickup at ${q.s.toFixed(0)} m`);
  }
});

test('Muddy Paws Farm hazards: the same for everyone at the same moment, they cross the road, and a jump clears the small ones', () => {
  const T = FARM;
  assert.deepEqual(T.hazardsAt(12.34), T.hazardsAt(12.34), 'a pure function of the time since GO');
  const kinds = new Set(T.hazardsAt(0).map(h => h.kind));
  assert.deepEqual([...kinds].sort(), ['pig', 'rolling', 'sails', 'sheep', 'tractor', 'trailer']);
  // each kind is on the road some of the time and off it (or switched off) some of the time
  const onRoad = {}, total = {};
  for (let t = 0; t < 120; t += 0.25) for (const h of T.hazardsAt(t)) {
    const q = T.query(h.x, h.z);
    total[h.kind] = (total[h.kind] ?? 0) + 1;
    if (h.active && Math.abs(q.lateral) < q.halfWidth) onRoad[h.kind] = (onRoad[h.kind] ?? 0) + 1;
  }
  for (const kind of ['tractor', 'sheep', 'rolling']) {          // (the sails are placed by their hub, off the road: they have their own checks below)
    const share = onRoad[kind] / total[kind];
    assert.ok(share > 0.08 && share < 0.6, `${kind}: on the road ${(share * 100).toFixed(0)} % of the time`);
  }
  assert.equal(onRoad.pig, total.pig, 'the pigs never leave their wallows');
  // nothing ever reaches the starting grid or a checkpoint (where a fallen dog is put back)
  for (const position of [...T.startPositions.map(p => p.position), ...T.checkpoints.map(cp => cp.position)]) {
    for (let t = 0; t < 60; t += 0.25) assert.equal(T.hazardHit(position, t), null);
  }
  // standing in the tractor's way when it comes: hit.  In the air above it: still hit.  Above a sheep: clear.
  const at = (kind, t) => T.hazardsAt(t).find(h => h.kind === kind);
  let when = 0; while (Math.abs(T.query(at('tractor', when).x, at('tractor', when).z).lateral) > 0.5) when += 0.05;
  const tractor = at('tractor', when);
  assert.equal(T.hazardHit([tractor.x, tractor.y, tractor.z], when).kind, 'tractor');
  assert.equal(T.hazardHit([tractor.x, tractor.y + 1.5, tractor.z], when).kind, 'tractor', 'no jumping a tractor');
  assert.equal(T.hazardHit([tractor.x, tractor.y, tractor.z], when + 4), null, 'it has gone by');
  const sheep = at('sheep', 3);
  assert.equal(T.hazardHit([sheep.x, sheep.y, sheep.z], 3).kind, 'sheep');
  assert.equal(T.hazardHit([sheep.x, sheep.y + 1.4, sheep.z], 3), null, 'a jump clears a sheep');
  // the sails (Tom, 2026-11-26: "should only damage you if you hit the spinning bit, you should be able to go under it all other
  // times"): a dog is hit only where a blade is.  Blade 0 hangs straight down from the hub at angle 0; they turn across the road
  const mill = T.pointAt(T.mill.s), sails = t => T.hazardsAt(t).find(h => h.kind === 'sails');
  const spot = lateral => { const p = T.pointAt(T.mill.s, lateral); return [p.x, p.y, p.z]; };
  const inside = spot(T.mill.side * (mill.halfWidth - 1.5)), middle = spot(0), outside = spot(-T.mill.side * (mill.halfWidth - 1.7));
  let swept = 0, runs = 0, was = false;
  for (let t = 0; t < 12; t += 0.02) {
    const hit = T.hazardHit(inside, t)?.kind === 'sails';
    if (hit) {
      swept += 1;
      // ...and when it is hit there is a blade there: one of the four is within half a radian of pointing at the dog from the hub
      const a = sails(t).angle, toDog = Math.atan2(Math.hypot(inside[0] - T.mill.x, inside[2] - T.mill.z), T.mill.hubHeight - 0.75);
      const off = Math.min(...[0, 1, 2, 3].flatMap(b => [1, -1].map(way => Math.abs(Math.atan2(Math.sin(a + b * Math.PI / 2 - way * toDog), Math.cos(a + b * Math.PI / 2 - way * toDog))))));
      assert.ok(off < 0.5, `hit with no blade near (${off.toFixed(2)} rad) at ${t.toFixed(2)} s`);
    }
    if (hit && !was) runs += 1; was = hit;
    assert.equal(T.hazardHit(middle, t), null, 'the middle of the road is never swept: the blades do not reach it');
    assert.equal(T.hazardHit(outside, t), null, 'the outside of the bend is always safe');
  }
  assert.equal(runs, 4, 'four blades a turn, and clear between them');
  assert.ok(swept > 600 * 0.15 && swept < 600 * 0.4, `the inside is swept ${(swept / 6).toFixed(0)} % of the time`);
  // a few metres before or after the mill, under the same blade: nothing (the sails are thin)
  for (const ds of [-3, 3]) { const p = T.pointAt(T.mill.s + ds, T.mill.side * (mill.halfWidth - 1.5)); for (let t = 0; t < 12; t += 0.05) assert.equal(T.hazardHit([p.x, p.y, p.z], t), null); }
  // a jump puts a dog up into blades it would have run under
  const inner = spot(T.mill.side * (mill.halfWidth - 4.5)); let low = 0, high = 0;
  for (let t = 0; t < 12; t += 0.02) { if (T.hazardHit(inner, t)) low += 1; if (T.hazardHit([inner[0], inner[1] + 1.4, inner[2]], t)) high += 1; }
  assert.ok(low === 0 && high > 50, `4.5 m in from the edge: hit ${low} on the ground, ${high} in a jump`);
});

test('Muddy Paws Farm\'s maize maze (Tom, 2026-11-21): rows of corn with gaps in different places, dead ends, and a way through', () => {
  const T = FARM, m = T.maze, laneMid = j => (j - m.lanes / 2 + 0.5) * m.lane;
  const at = (s, lateral) => { const p = T.pointAt(s, lateral); return T.query(p.x, p.z); };
  // each row of corn across the field is a wall but for its gaps
  for (let b = 1; b < m.cells; b++) {
    const s = m.sStart + b * m.cell;
    for (let j = 0; j < m.lanes; j++) assert.equal(at(s, laneMid(j)).blocked, !m.open[b].includes(j), `row ${b}, lane ${j}`);
  }
  // the quickest way through never touches the corn, and goes through a gap in every row
  for (let s = m.sStart - m.from; s < m.sEnd + 24; s += 2) assert.equal(at(s, m.line(s)).blocked, false, `the way through at ${s.toFixed(0)} m`);
  for (let b = 1; b < m.cells; b++) assert.ok(m.open[b].includes(m.route[b]));
  // and there is more than one way in: a gap in the first row that leads nowhere (the scarecrow stands in it)
  const deadEnd = m.open[1].find(j => j !== m.route[1]);
  assert.ok(deadEnd !== undefined);
  const scarecrow = T.obstacles.find(o => o.kind === 'scarecrow');
  assert.ok(Math.abs(scarecrow.lateral - laneMid(deadEnd)) < 0.01 && scarecrow.s > m.sStart + m.cell && scarecrow.s < m.sStart + 2 * m.cell);
  assert.ok(m.sEnd - m.sStart >= 200 && T.pointAt((m.sStart + m.sEnd) / 2).halfWidth > 22, 'a big field');
});

// Tom, 2026-11-26: "more bends" on Muddy Paws Farm and Pet Mall Mayhem, which each had one tight corner in the lap.
test('Muddy Paws Farm and Pet Mall weave: several real corners each, no long straight but the start and the maze, and the barn is still straight', async () => {
  const { PROCEDURAL_TRACKS } = await import('../shared/maps.js');
  const shape = (T) => {
    const step = 2, n = Math.floor(T.length / step), P = Array.from({ length: n }, (_, i) => T.pointAt(i * step));
    const H = P.map((p, i) => { const q = P[(i + 3) % n], r = P[(i - 3 + n) % n]; return Math.atan2(q.x - r.x, q.z - r.z); }), dif = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    let corners = 0, acc = 0, total = 0, tightest = Infinity;
    for (let i = 0; i < n; i++) { const d = dif(H[(i + 1) % n], H[i]), R = Math.abs(step / d); total += Math.abs(d); tightest = Math.min(tightest, R); if (R < 90) acc += Math.abs(d); else { if (acc > Math.PI / 4) corners += 1; acc = 0; } }
    if (acc > Math.PI / 4) corners += 1;
    let longest = 0; for (let i = 0; i < n; i++) { let j = 0; while (j < n && Math.abs(dif(H[(i + j) % n], H[i])) < 12 * Math.PI / 180) j++; longest = Math.max(longest, j * step); }
    return { corners, perKm: total * 180 / Math.PI / (T.length / 1000), tightest, longest };
  };
  const farm = shape(PROCEDURAL_TRACKS.farmyard), mall = shape(PROCEDURAL_TRACKS.pet_mall);
  assert.ok(farm.corners >= 4 && farm.perKm > 440 && farm.tightest > 20 && farm.longest < 240, JSON.stringify(farm));        // (it was 1 corner, 343 degrees a km, 362 m straight)
  assert.ok(mall.corners >= 6 && mall.perKm > 540 && mall.tightest > 20 && mall.longest < 200, JSON.stringify(mall));        // (it was 1 corner, 283 degrees a km, 260 m straight)
  // the barn: the road through it does not bend
  const F = PROCEDURAL_TRACKS.farmyard;
  for (let s = F.barn.start; s <= F.barn.end; s += 2) assert.ok(Math.abs(F.samples.curvature[F.indexAtS(s)]) < 1 / 120, `the road bends in the barn at ${s.toFixed(0)} m`);
  // no checkpoint is in among the corn of the maze
  for (const cp of F.checkpoints) assert.ok(!F.query(cp.position[0], cp.position[2]).blocked, `checkpoint ${cp.index} is in the corn`);
});
