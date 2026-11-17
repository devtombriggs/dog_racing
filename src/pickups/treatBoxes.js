// Treat Boxes on any map: the floating crates (model built by treat_box/create_treat_box.py) at the
// spots in shared/treatBoxes.js.  The server decides when a crate is taken and when it comes back;
// this only draws them.
//
//   const boxes = createTreatBoxes({ scene, mapId });
//   boxes.setVisible(id, visible);   // from the server's 'treatBoxChanged'
//   boxes.update(seconds);           // each frame
//   boxes.dispose();
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TREAT_BOXES_BY_MAP, TREAT_BOX_SCALE } from '../../shared/treatBoxes.js';

export function createTreatBoxes({ scene, mapId, model = '/models/treat_box.glb' }) {
  const definitions = TREAT_BOXES_BY_MAP[mapId] ?? [];
  const holder = new THREE.Group(); holder.name = 'TreatBoxes'; scene.add(holder);
  const mixers = [], boxes = new Map(), hidden = new Set();
  let last = null, disposed = false;

  if (definitions.length) {
    new GLTFLoader().loadAsync(model).then(gltf => {
      if (disposed) return;
      const idle = THREE.AnimationClip.findByName(gltf.animations, 'Idle');
      definitions.forEach((definition, n) => {
        const box = gltf.scene.clone(true);
        box.name = 'TreatBox';
        box.userData.treatBoxId = definition.id;
        box.scale.setScalar(TREAT_BOX_SCALE);
        box.position.fromArray(definition.position);
        box.rotation.y = definition.rotationY;
        box.visible = !hidden.has(definition.id);
        boxes.set(definition.id, box);
        holder.add(box);
        if (idle) {
          const mixer = new THREE.AnimationMixer(box), action = mixer.clipAction(idle);
          action.time = (n * 0.618) % 1 * idle.duration;   // out of step, so a row doesn't spin together
          action.play(); mixers.push(mixer);
        }
      });
    }).catch(err => console.warn('[TreatBoxes] model failed to load:', err));
  }

  return {
    group: holder,
    setVisible(id, visible) {
      if (visible) hidden.delete(id); else hidden.add(id);
      const box = boxes.get(id);
      if (box) box.visible = visible;
    },
    update(seconds) {
      const dt = last === null ? 0 : Math.min(Math.max(seconds - last, 0), 0.1); last = seconds;
      for (const m of mixers) m.update(dt);
    },
    dispose() {
      disposed = true;
      for (const m of mixers) m.stopAllAction();
      scene.remove(holder);
      const seen = new Set();
      holder.traverse(o => {
        if (!o.isMesh) return;
        if (!seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (seen.has(m)) continue;
          seen.add(m);
          for (const k in m) if (m[k]?.isTexture) m[k].dispose();
          m.dispose();
        }
      });
    },
  };
}
