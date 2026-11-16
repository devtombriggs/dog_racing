import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareHeadLook, applyHeadLook } from '../src/headLook.js';

for (const name of ['gsp_female', 'meela_greyhound', 'black_lab', 'pablo', 'ralph']) {
  test(`${name}: every clip looks forward or into the turn, including on slopes`, async () => {
    const bytes = await readFile(new URL(`../public/models/${name}.glb`, import.meta.url));
    const loader = new GLTFLoader();
    loader.register(() => ({ name: 'skip-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
    const { scene: model, animations } = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const player = new THREE.Group();
    player.rotation.y = 1.3;
    player.add(model);
    model.rotation.set(0.2, 0, -0.15);
    model.scale.setScalar(3);
    const bones = {};
    model.traverse(object => { if (object.isBone) bones[object.name] = object; });
    prepareHeadLook(model, bones);
    const inverseModel = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const forward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(inverseModel.clone().invert())
      .applyQuaternion(bones.head.getWorldQuaternion(new THREE.Quaternion()).invert());
    const direction = () => forward.clone()
      .applyQuaternion(bones.head.getWorldQuaternion(new THREE.Quaternion()))
      .applyQuaternion(inverseModel);
    const mixer = new THREE.AnimationMixer(model);
    for (const clip of animations) {
      const action = mixer.clipAction(clip).play();
      for (let sample = 0; sample < 12; sample++) {
        for (const steer of [0, 1, -1, 0.4, 0]) {
          mixer.setTime(clip.duration * sample / 12);
          const pitch = direction().y;
          applyHeadLook(model, steer);
          const d = direction();
          assert.ok(Math.abs(Math.atan2(d.x, d.z) - steer * 0.38) < 1e-5, `${clip.name}: gaze does not follow steering`);
          assert.ok(Math.abs(d.y - pitch) < 1e-5, `${clip.name}: head pitch changed`);
          applyHeadLook(model, steer);
          assert.ok(direction().distanceTo(d) < 1e-5, `${clip.name}: repeated correction accumulates`);
        }
      }
      action.stop();
    }
    // Exercise the blended pose, not just each individual clip.
    mixer.clipAction(animations.find(clip => clip.name === 'Run')).setEffectiveWeight(0.5).play();
    mixer.clipAction(animations.find(clip => clip.name === 'Sprint')).setEffectiveWeight(0.5).play();
    mixer.update(0.15);
    applyHeadLook(model, 0);
    assert.ok(Math.abs(direction().x) < 1e-5, 'Blended strides must also look forward');
  });
}
