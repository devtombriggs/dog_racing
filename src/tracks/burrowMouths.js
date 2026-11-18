// The mouths of Ralph's burrows, for the maps that do not have them built in (Wendover's are part of
// its model): at each end of a burrow, a mound of earth at the side of the road with a dark hole in
// it and a little signpost.  The way in faces the dogs coming up the road; the way out faces on.
// Nothing here is solid: the server takes Ralph through (shared/burrows.js).
//
//   const mouths = createBurrowMouths({ scene, mapId });     mouths.dispose();
import * as THREE from 'three';
import { BURROWS } from '../../shared/burrows.js';

function signTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#f4e7c4'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#8a5a2a'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 58);
  g.fillStyle = '#8a5a2a'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RALPH', 64, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createBurrowMouths({ scene, mapId }) {
  const group = new THREE.Group(); group.name = 'BurrowMouths';
  const tunnels = mapId === 'wendover' ? [] : BURROWS[mapId] ?? [];
  const disposables = [];
  if (tunnels.length) {
    const earth = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 1, flatShading: true });
    const dark = new THREE.MeshBasicMaterial({ color: 0x120a06 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.9 });
    const text = signTexture(), board = new THREE.MeshBasicMaterial({ map: text, side: THREE.DoubleSide });
    const moundG = new THREE.SphereGeometry(1.7, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1.15);
    const holeG = new THREE.CircleGeometry(0.72, 14), rimG = new THREE.TorusGeometry(0.74, 0.14, 5, 14);
    const postG = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 5), boardG = new THREE.PlaneGeometry(1.3, 0.65);
    disposables.push(earth, dark, wood, text, board, moundG, holeG, rimG, postG, boardG);
    for (const tunnel of tunnels) {
      for (const [position, yaw, facing] of [[tunnel.entry, tunnel.entryYaw, -1], [tunnel.exit, tunnel.exitYaw, 1]]) {
        const mouth = new THREE.Group();
        mouth.position.fromArray(position); mouth.rotation.y = yaw;
        // the mound sits just past the way in (or just before the way out), so the hole is at the burrow's own spot
        const mound = new THREE.Mesh(moundG, earth); mound.position.z = -facing * 1.35; mound.castShadow = true; mound.receiveShadow = true;
        const hole = new THREE.Mesh(holeG, dark); hole.position.set(0, 0.62, facing * 0.3); hole.rotation.y = facing > 0 ? 0 : Math.PI;      // (on the face of the mound)
        const rim = new THREE.Mesh(rimG, earth); rim.position.copy(hole.position);
        const side = tunnel.side === 'left' ? 1 : -1;
        const post = new THREE.Mesh(postG, wood); post.position.set(side * 1.5, 0.75, -facing * 1.0);
        const sign = new THREE.Mesh(boardG, board); sign.position.set(side * 1.5, 1.6, -facing * 1.0); sign.rotation.y = Math.PI;
        mouth.add(mound, hole, rim, post, sign);
        group.add(mouth);
      }
    }
  }
  scene.add(group);
  return {
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
