import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MAPS, crossedFinishLine, sampleGroundHeight } from '../shared/maps.js';
import { TREAT_ROAD } from '../shared/treatRoadData.js';

test('Treat Road has a continuous elevated road, supported spawns, and open edges', () => {
  assert.equal(MAPS.treat_road.startPositions.length, 5);
  assert.equal(MAPS.treat_road.checkpoints.length, 28);
  assert.ok(Math.abs(TREAT_ROAD.length - 2900) < 5);
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
