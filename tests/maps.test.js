import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MAPS, crossedFinishLine, sampleGroundHeight } from '../shared/maps.js';
import { TREAT_ROAD } from '../shared/treatRoadData.js';
import { MODBURY_HEIGHTS as COAST } from '../shared/modburyData.js';

test('Treat Road has half as much road, supported spawns, and open edges', () => {
  assert.equal(MAPS.treat_road.startPositions.length, 5);
  assert.equal(MAPS.treat_road.checkpoints.length, TREAT_ROAD.checkpoints.length - 1);
  assert.ok(Math.abs(TREAT_ROAD.roadLength - 1450) < 5);
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
  for (const name of ['Collision_Cabins', 'Collision_Trees', 'Collision_Rocks', 'Collision_Fences', 'Collision_Bridge_Rails', 'Collision_Obstacle_Log_01']) {
    assert.ok(gltf.scene.getObjectByName(name)?.isMesh, `${name} exists`);
  }
});


test('Modbury has supported spawns, continuous terrain, water and open cliff edges', () => {
  assert.equal(MAPS.modbury_heights.startPositions.length, 5);
  assert.ok(Math.abs(COAST.length - 3121) < 5);
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
    assert.ok(Math.abs(COAST.terrainHeight(s.x[i], s.z[i]) - s.y[i]) < 0.4);
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
