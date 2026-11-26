import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { DOGS } from '../config/dogs.js';
import { DogAvatar } from '../game/dogs/DogAvatar.js';
import { wear } from '../cosmetics/cosmetics.js';

// The dog in the Garage: the real model, standing and turning slowly, wearing whatever is put on it (cosmetics/cosmetics.js:
// the same code dresses the dogs in a race, so what is seen here is what is raced in).
//   dogId       which dog (a key of DOGS)
//   cosmetics   { slot: item id }: what it is wearing
export function DogPreview({ dogId, cosmetics }) {
  const holder = useRef(null), live = useRef(null);

  useEffect(() => {
    const box = holder.current, config = DOGS[dogId];
    if (!box || !config) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    box.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94b8, 1.7));
    const sun = new THREE.DirectionalLight(0xfff2d6, 2.2); sun.position.set(3, 6, 5); scene.add(sun);
    // a round mat for it to stand on
    const matG = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), matM = new THREE.MeshBasicMaterial({ color: 0x0f1a3a, transparent: true, opacity: 0.35 });
    const mat = new THREE.Mesh(matG, matM); scene.add(mat);

    const avatar = new DogAvatar({ id: 'garage', dogId, config, scene });
    let alive = true, frame = 0;
    const state = { avatar, ready: false, cosmetics: null };
    live.current = state;
    const fit = () => {
      // how big the dog is: by its bones (nose to tail, paws to the top of its head), with room round it for ears, fur and a hat
      avatar.group.updateWorldMatrix(true, true);
      const reach = new THREE.Box3(), at = new THREE.Vector3();
      for (const bone of Object.values(avatar.bones)) reach.expandByPoint(bone.getWorldPosition(at));
      const size = reach.getSize(new THREE.Vector3()), tall = Math.max(reach.max.y, 0.4) * 1.3, long = Math.max(size.x, size.z, tall * 0.8) * 1.2;
      mat.scale.setScalar(long * 0.6);
      const middle = tall * 0.5, far = Math.max(long * 0.62, tall * 0.62) / Math.tan(camera.fov * Math.PI / 360) * 1.12;
      camera.position.set(far * 0.5, middle + far * 0.2, far * 0.84); camera.lookAt(0, middle, 0);
    };
    avatar.load(new GLTFLoader(), {
      castShadow: false, wanted: () => alive,
      onLoaded: () => { avatar.play('Idle')?.play(); avatar.mixer.update(0); fit(); state.ready = true; wear(avatar, state.cosmetics); },
      onError: error => console.warn('[Garage] the dog would not load:', error),
    });
    const size = () => { const w = box.clientWidth || 300, h = box.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const watch = new ResizeObserver(size); watch.observe(box); size();
    const clock = new THREE.Clock();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), 0.1);
      avatar.mixer?.update(delta);
      avatar.group.rotation.y += delta * 0.6;
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      alive = false; cancelAnimationFrame(frame); watch.disconnect();
      wear(avatar, null); live.current = null;
      scene.traverse((object) => { if (object.isMesh) { object.geometry?.dispose(); for (const material of [].concat(object.material ?? [])) material.dispose?.(); } });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [dogId]);

  // what it is wearing has changed: put it on (once the model is there)
  const key = JSON.stringify(cosmetics ?? {});
  useEffect(() => {
    const state = live.current;
    if (!state) return;
    state.cosmetics = JSON.parse(key);
    if (state.ready) wear(state.avatar, state.cosmetics);
  }, [key, dogId]);

  return <div className="zr-preview" ref={holder} role="img" aria-label={`${DOGS[dogId]?.displayName ?? 'The dog'} as it will race`} />;
}
