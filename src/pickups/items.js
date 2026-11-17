// Items in the race, as the players see them: what each dog is holding (floating above its head),
// tennis balls in flight, chew toys lying on the road and the burst when something hits.
// The server decides everything (shared/items.js); this only draws it.
//
//   const items = createItems({ scene, renderer });
//   items.setHeld(playerId, 'ball' | 'toy' | 'bone' | null);
//   items.throwBall({ id, origin, direction });   items.removeBall(id, position);
//   items.placeHazard({ id, position, rotationY }); items.removeHazard(id, burst);
//   each frame: items.update(delta, anchors)       // anchors: Map playerId -> Object3D (the dog's head)
//   items.dispose();
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BALL, ballPositionAt } from '../../shared/items.js';

const MODELS = { ball: '/models/tennis_ball.glb', toy: '/models/chew_toy.glb', bone: '/models/golden_bone.glb' };
// Size shown above a dog's head, a vertical nudge to centre it, and the glow colour (as on the HUD sheet)
const HELD = {
  ball: { scale: 1.5, lift: 0, glow: 0x3fc8ff },
  toy: { scale: 0.6, lift: -0.36, glow: 0xb45cff },
  bone: { scale: 1.4, lift: 0, glow: 0xffc040 },
};
const ABOVE_HEAD = 1.3;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createItems({ scene, renderer }) {
  const root = new THREE.Group(); root.name = 'Items'; scene.add(root);
  const templates = {};
  const held = new Map(), balls = new Map(), hazards = new Map(), bursts = [];
  const glowTex = glowTexture();
  const additive = { map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false };
  const owned = [glowTex];
  let disposed = false;

  let envTex = null;                         // gold needs something to reflect (the game has no environment map)
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose(); owned.push(envTex);
  }

  const loader = new GLTFLoader();
  for (const [id, url] of Object.entries(MODELS)) {
    loader.loadAsync(url).then(gltf => {
      if (disposed) return;
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        owned.push(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (id === 'bone' && envTex) { m.envMap = envTex; m.envMapIntensity = 1.3; }
          owned.push(m);
          for (const k in m) if (m[k]?.isTexture) owned.push(m[k]);
        }
      });
      templates[id] = gltf.scene;
    }).catch(err => console.warn(`[Items] ${id} model failed to load:`, err));
  }

  function makeHeld(item) {
    const group = new THREE.Group();
    const spec = HELD[item];
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ ...additive, color: spec.glow, opacity: 0.8 }));
    glow.scale.setScalar(1.9);
    group.add(glow);
    const model = templates[item].clone(true);
    model.scale.setScalar(spec.scale);
    model.position.y = spec.lift;
    group.add(model);
    group.userData.model = model;
    return group;
  }

  function burst(position, color) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ ...additive, color, opacity: 1 }));
    sprite.position.fromArray(position);
    root.add(sprite);
    bursts.push({ sprite, age: 0 });
  }

  const anchorPos = new THREE.Vector3();
  return {
    setHeld(playerId, item) {
      const current = held.get(playerId);
      if (current?.object) { root.remove(current.object); current.object.children[0].material.dispose(); }
      if (item) held.set(playerId, { item, object: null }); else held.delete(playerId);
    },

    throwBall({ id, origin, direction }) {
      balls.set(id, { ball: { origin, direction }, startedAt: performance.now(), object: null });
    },
    removeBall(id, position) {
      const entry = balls.get(id);
      if (entry?.object) root.remove(entry.object);
      balls.delete(id);
      if (position) burst(position, 0x9cf0ff);
    },

    placeHazard({ id, position, rotationY }) {
      hazards.set(id, { position, rotationY, object: null, placedAt: performance.now() });
    },
    removeHazard(id, showBurst = false) {
      const entry = hazards.get(id);
      if (entry?.object) root.remove(entry.object);
      hazards.delete(id);
      if (showBurst && entry) burst([entry.position[0], entry.position[1] + 0.6, entry.position[2]], 0xff6a6a);
    },

    update(delta, anchors) {
      const t = performance.now() / 1000;
      for (const [playerId, entry] of held) {
        if (!entry.object && templates[entry.item]) { entry.object = makeHeld(entry.item); root.add(entry.object); }
        if (!entry.object) continue;
        const anchor = anchors.get(playerId);
        entry.object.visible = !!anchor;
        if (!anchor) continue;
        anchor.getWorldPosition(anchorPos);
        entry.object.position.set(anchorPos.x, anchorPos.y + ABOVE_HEAD + Math.sin(t * 3) * 0.08, anchorPos.z);
        entry.object.userData.model.rotation.y += delta * 2.2;
      }
      for (const [id, entry] of balls) {
        const age = (performance.now() - entry.startedAt) / 1000;
        if (age > BALL.duration) { this.removeBall(id); continue; }
        if (!entry.object && templates.ball) { entry.object = templates.ball.clone(true); root.add(entry.object); }
        if (!entry.object) continue;
        const p = ballPositionAt(entry.ball, age);
        entry.object.position.set(p[0], p[1] + Math.abs(Math.sin(age * 7)) * 0.5, p[2]);   // skips along
        entry.object.rotation.x += delta * 18;
      }
      for (const entry of hazards.values()) {
        if (!entry.object && templates.toy) {
          entry.object = templates.toy.clone(true);
          entry.object.position.fromArray(entry.position);
          entry.object.rotation.y = entry.rotationY;
          root.add(entry.object);
        }
        if (!entry.object) continue;
        const age = (performance.now() - entry.placedAt) / 1000;          // lands with a little bounce
        entry.object.scale.setScalar(age < 0.35 ? 0.4 + 0.6 * Math.sin(age / 0.35 * Math.PI / 2) * 1.08 : 1);
        entry.object.rotation.z = Math.sin(t * 2.5 + entry.position[0]) * 0.05;
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.age += delta;
        b.sprite.scale.setScalar(1 + b.age * 14);
        b.sprite.material.opacity = Math.max(0, 1 - b.age / 0.4);
        if (b.age > 0.4) { root.remove(b.sprite); b.sprite.material.dispose(); bursts.splice(i, 1); }
      }
    },

    dispose() {
      disposed = true;
      scene.remove(root);
      for (const entry of held.values()) entry.object?.children[0].material.dispose();
      for (const b of bursts) b.sprite.material.dispose();
      for (const d of new Set(owned)) d.dispose?.();
    },
  };
}
