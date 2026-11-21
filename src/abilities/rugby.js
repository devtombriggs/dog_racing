// Casper's Try Time, as the players see it (the rules are shared/specials.js SPECIALS.casper): his rugby shirt and
// the ball.  The shirt is a second picture of his coat (casper_patterdale/create_casper.py bakes it), put on his
// model for as long as the charge lasts, with CASPER and his 7 on the back (written here on to a patch his model
// carries for it, the material CASPER_ShirtBack, which is hidden the rest of the time).  The ball sits between his front paws while he runs with it; when he passes
// it, the server flies it up the road (as a firework: src/pickups/firework.js draws it with buildRugbyBall).
//
//   const kit = createRugbyKit({ scene, model });     // model: the loaded Casper (make it as soon as he has loaded: it hides his shirt's back)
//   kit.on();                 // shirt on, ball in his paws
//   each frame: kit.update(group);                    // group: the Object3D moved round the track (after the mixer has run)
//   kit.pass();               // the ball leaves his paws (the shirt stays on until off())
//   kit.off();                // back to himself
//   kit.dispose();
import * as THREE from 'three';

const SHIRT = '/models/specials/casper_rugby_shirt.jpg';
const BALL = { long: 0.42, round: 0.25 };        // half its length and half its width, in the game's metres (big enough to read as a rugby ball from the chase camera)
const HELD = { ahead: 0.32, up: 0.05 };          // where he holds it: this far in front of his paws, and up
const BACK = { name: 'CASPER', number: '7' };

// The ball's skin: white, with a red swoosh and a black one down each side (no maker's name)
function ballTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, 512, 256);
  for (const x of [128, 384]) {                    // (a quarter and three quarters of the way round: its two faces)
    for (const end of [-1, 1]) {
      const swoosh = (colour, width, lift) => {
        g.strokeStyle = colour; g.lineWidth = width; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x + end * 18, 128 - end * (60 + lift));
        g.quadraticCurveTo(x + end * 62, 128 - end * (86 + lift), x + end * 98, 128 - end * (118 + lift));
        g.stroke();
      };
      swoosh('#d5202b', 24, 0); swoosh('#16161a', 15, -26);
    }
    g.fillStyle = '#16161a'; g.fillRect(x - 50, 118, 100, 20);      // a plain black bar where the name would be
  }
  g.strokeStyle = '#b8b3a6'; g.lineWidth = 3;                       // the seams, from point to point
  for (const x of [0, 256, 511]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The ball: a pointed oval about 0.6 m long, its length along +Z (the way it flies). */
export function buildRugbyBall() {
  const ball = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  // (a sphere's poles are on Y: pinch it towards them for a rugby ball's points, then lay it along Z)
  const at = geometry.attributes.position;
  for (let i = 0; i < at.count; i++) {
    const y = at.getY(i), pinch = Math.max(0, 1 - y * y) ** 0.3;     // (pointed ends, not a round ball)
    at.setXYZ(i, at.getX(i) * pinch, y, at.getZ(i) * pinch);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.6, metalness: 0 }));
  mesh.scale.set(BALL.round, BALL.long, BALL.round);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  ball.add(mesh);
  ball.userData.dispose = () => { geometry.dispose(); mesh.material.map.dispose(); mesh.material.dispose(); };
  return ball;
}

// CASPER over a big 7, white edged in navy, on a clear background (the top of the picture is towards his head)
function backTexture() {
  const c = document.createElement('canvas'); c.width = 400; c.height = 520;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.translate(c.width, c.height); g.rotate(Math.PI);          // (the patch's picture runs the other way up: checked in the game, 2026-11-21)
  const write = (text, size, y) => {
    g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
    g.lineWidth = size * 0.16; g.strokeStyle = '#0b1f5c'; g.strokeText(text, 200, y);
    g.fillStyle = '#ffffff'; g.fillText(text, 200, y);
  };
  write(BACK.name, 70, 150);
  write(BACK.number, 230, 330);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;                     // (laid on as the model's own pictures are)
  texture.anisotropy = 4;
  return texture;
}

let shirtTexture = null;          // one picture, shared by every Casper there has been
function shirt() {
  if (!shirtTexture) {
    shirtTexture = new THREE.TextureLoader().load(SHIRT, undefined, undefined, () => console.warn(`[Specials] ${SHIRT} failed to load`));
    shirtTexture.flipY = false;              // (as a model's own pictures are)
    shirtTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return shirtTexture;
}

export function createRugbyKit({ scene, model }) {
  const ball = buildRugbyBall();
  ball.visible = false;
  scene.add(ball);
  // his coat (the material with a picture on it that is not his eyes), and his two front paws
  const coats = [];
  const paws = [];
  let back = null;               // the patch on his back that CASPER and 7 go on
  model.traverse((object) => {
    if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.map && /coat/i.test(material.name) && !coats.some(c => c.material === material)) coats.push({ material, plain: material.map });
      if (/ShirtBack/.test(material.name)) back = material;
    }
    if (object.isBone && /^paw\.?[LR]$/.test(object.name)) paws.push(object);
  });
  if (back) {
    back.map = backTexture();
    back.color.set(0xffffff);
    back.transparent = true; back.alphaTest = 0.4; back.depthWrite = false;
    back.polygonOffset = true; back.polygonOffsetFactor = -2;          // (always drawn over the coat beneath it)
    back.visible = false;
    back.needsUpdate = true;
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), ahead = new THREE.Vector3();
  let holding = false;

  return {
    on() {
      for (const coat of coats) { coat.material.map = shirt(); coat.material.needsUpdate = true; }
      if (back) back.visible = true;
      holding = true;
    },
    pass() { holding = false; ball.visible = false; },
    off() {
      for (const coat of coats) { coat.material.map = coat.plain; coat.material.needsUpdate = true; }
      if (back) back.visible = false;
      holding = false; ball.visible = false;
    },
    update(group) {
      ball.visible = holding && paws.length === 2 && model.visible && group.visible;
      if (!ball.visible) return;
      // just in front of his paws, lying across him (which way he faces includes the spin he starts with)
      const yaw = group.rotation.y + model.rotation.y;
      paws[0].getWorldPosition(a); paws[1].getWorldPosition(b);
      ahead.set(Math.sin(yaw), 0, Math.cos(yaw));
      ball.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(ahead, HELD.ahead);
      ball.position.y += HELD.up;
      ball.rotation.set(0, yaw + Math.PI / 2, 0);
    },
    dispose() {
      this.off();
      ball.removeFromParent();
      ball.userData.dispose();
      back?.map?.dispose();
    },
  };
}
