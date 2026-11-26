// What a dog wears (the Shop and the Garage: shared/shop.js), as you see it: in the race, on every player's dog, and on the
// dog in the Garage.  wear(avatar, { head: 'hat_santa', body: 'coat_pippa' }) puts it on (and takes off whatever was on).
//
// Every dog has the same skeleton (root, hips, spine1, spine2, chest, neck1, neck2, head, ears, legs, tail), so nothing here
// is fitted to a dog by hand:
//   a hat      is measured from the dog's own head: the part of its skin that moves with the `head` bone.  It goes on top of
//              the skull (the ears, which have bones of their own, are not counted), as wide as the head, and is fixed to the
//              head bone, so it nods and turns with the head.
//   a coat     is cut from the dog's own skin: the part over its back and sides that moves with the spine and chest, lifted a
//              little off the body, in the coat's colour, and moved by the same bones.  So it fits, and bends as the dog runs.
import * as THREE from 'three';

const RED = 0xd3202d, WHITE = 0xf6f4ee;

// ---------- the dog's skin, and which bone each part of it follows
/** The dog's body: the skinned mesh with the most of it (some dogs have a cart, a collar and eyes as meshes of their own) */
function bodyMesh(model, boneName) {
  let best = null;
  model.traverse((object) => {
    if (!object.isSkinnedMesh || object.userData.cosmetic) return;
    if (boneName && !object.skeleton.bones.some(bone => bone.name === boneName)) return;
    if (!best || object.geometry.getAttribute('position').count > best.geometry.getAttribute('position').count) best = object;
  });
  return best;
}
/** how much of vertex i follows any of these bones (by their numbers in the skeleton): 0 to 1 */
function weightOn(geometry, i, bones) {
  const index = geometry.getAttribute('skinIndex'), weight = geometry.getAttribute('skinWeight');
  let sum = 0;
  for (let k = 0; k < 4; k++) if (bones.has(index.getComponent(i, k))) sum += weight.getComponent(i, k);
  return sum;
}
const boneNumbers = (mesh, names) => new Set(mesh.skeleton.bones.map((bone, k) => (names.includes(bone.name) ? k : -1)).filter(k => k >= 0));

// ---------- the Santa hat: a red cone that flops over, a band of white fur, a white bobble.  One unit across.
function santaHat() {
  const cone = new THREE.ConeGeometry(0.5, 1.05, 18, 8, true).translate(0, 0.52, 0), p = cone.getAttribute('position');
  // (it flops over to one side and back, more towards the tip)
  for (let i = 0; i < p.count; i++) { const up = Math.max(0, p.getY(i)) / 1.05, bend = up * up; p.setXYZ(i, p.getX(i) + 0.42 * bend, p.getY(i) - 0.3 * bend * up, p.getZ(i) - 0.3 * bend); }
  cone.computeVertexNormals();
  const hat = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.85, side: THREE.DoubleSide }), white = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 1 });
  const band = new THREE.TorusGeometry(0.5, 0.13, 8, 20).rotateX(Math.PI / 2), bobble = new THREE.IcosahedronGeometry(0.17, 1);
  const tip = new THREE.Vector3(0.42, 1.05 - 0.3, -0.3);
  const parts = [[cone, red, null], [band, white, null], [bobble, white, tip]];
  for (const [geometry, material, at] of parts) { const mesh = new THREE.Mesh(geometry, material); if (at) mesh.position.copy(at); mesh.castShadow = true; hat.add(mesh); }
  hat.userData.dispose = () => { cone.dispose(); band.dispose(); bobble.dispose(); red.dispose(); white.dispose(); };
  return hat;
}
const HATS = { hat_santa: { build: santaHat, wide: 0.92, sink: 0.12, tilt: -0.16 } };       // wide: across, as a share of the head; sink: how far down on to it

/** Where the top of the dog's head is, in the dog's own space (y up): { x, y, z, wide } or null if it has no head to measure */
function measureHead(model) {
  const mesh = bodyMesh(model, 'head');
  if (!mesh) return null;
  // (wherever the dog is standing: its place, its bones' places, and the skin's own reckoning of where it is, all up to date.
  // updateMatrixWorld, not updateWorldMatrix: only that one tells a skinned mesh it has moved)
  model.parent?.updateWorldMatrix(true, false); model.updateMatrixWorld(true); mesh.skeleton.update();
  const head = boneNumbers(mesh, ['head']), geometry = mesh.geometry, count = geometry.getAttribute('position').count;
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld), v = new THREE.Vector3(), points = [];
  for (let i = 0; i < count; i++) {
    if (weightOn(geometry, i, head) < 0.6) continue;
    mesh.getVertexPosition(i, v); v.applyMatrix4(toModel); points.push([v.x, v.y, v.z]);
  }
  if (points.length < 12) return null;
  const xs = points.map(q => q[0]), min = Math.min(...xs), max = Math.max(...xs), mid = (min + max) / 2, wide = max - min;
  // the top of the skull: the highest of the head down its middle (not the brows either side), and where along it that is
  const middle = points.filter(q => Math.abs(q[0] - mid) < wide * 0.22), top = Math.max(...middle.map(q => q[1]));
  const crown = middle.filter(q => q[1] > top - wide * 0.12), z = crown.reduce((sum, q) => sum + q[2], 0) / crown.length;
  return { x: mid, y: top, z, wide };
}

function putOnHat(avatar, id) {
  const spec = HATS[id], head = avatar.bones.head, at = spec && head ? measureHead(avatar.model) : null;
  if (!at) return null;
  const hat = spec.build(), size = at.wide * spec.wide;
  // where it goes in the dog's own space...
  const inModel = new THREE.Matrix4().compose(new THREE.Vector3(at.x, at.y - size * spec.sink, at.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(spec.tilt, 0, 0)), new THREE.Vector3(size, size, size));
  // ...and so where that is for the head bone, as the head is now: from then on it moves with the head
  const local = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(avatar.model.matrixWorld).multiply(inModel);
  local.decompose(hat.position, hat.quaternion, hat.scale);
  hat.name = `Cosmetic_${id}`; hat.userData.cosmetic = true;
  head.add(hat);
  return { object: hat, dispose: () => { head.remove(hat); hat.userData.dispose(); } };
}

// ---------- a coat: the dog's own back and sides, lifted off the body
const COATS = { coat_pippa: { color: RED, trim: 0xf3e6c8, lift: 0.012, bones: ['spine1', 'spine2', 'chest'], under: 0.3 } };       // under: how far round under the belly it comes (0: the top half only)

function putOnCoat(avatar, id) {
  const spec = COATS[id], mesh = spec ? bodyMesh(avatar.model, 'chest') : null;
  if (!mesh) return null;
  const from = mesh.geometry, position = from.getAttribute('position'), normal = from.getAttribute('normal'), count = position.count;
  if (!normal || !from.getAttribute('skinIndex')) return null;
  const torso = boneNumbers(mesh, spec.bones);
  // which of the dog's skin the coat covers: what follows the spine and chest, and is not underneath
  let low = Infinity, high = -Infinity;
  const on = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (weightOn(from, i, torso) > 0.55) { on[i] = 1; low = Math.min(low, position.getY(i)); high = Math.max(high, position.getY(i)); }
  const belly = low + (high - low) * (0.5 - spec.under * 0.5);
  for (let i = 0; i < count; i++) if (on[i] && position.getY(i) < belly) on[i] = 0;
  // its triangles: those with every corner covered.  (The dog's skin is drawn in pieces, by material: the piece it is cut from
  // is whichever has the triangles)
  const index = from.getIndex(), corners = index ? index.count : count, at = k => (index ? index.getX(k) : k), kept = [];
  for (let k = 0; k < corners; k += 3) { const a = at(k), b = at(k + 1), c = at(k + 2); if (on[a] && on[b] && on[c]) kept.push(a, b, c); }
  if (kept.length < 30) return null;
  // the edge of the coat (a triangle's side that no other of its triangles shares) is trimmed in another colour
  const sides = new Map();
  for (let k = 0; k < kept.length; k += 3) for (const [a, b] of [[kept[k], kept[k + 1]], [kept[k + 1], kept[k + 2]], [kept[k + 2], kept[k]]]) { const key = a < b ? `${a}_${b}` : `${b}_${a}`; sides.set(key, (sides.get(key) ?? 0) + 1); }
  const edge = new Set();
  for (const [key, n] of sides) if (n === 1) for (const i of key.split('_')) edge.add(Number(i));
  // a geometry of its own, with only the corners it uses
  const remap = new Map(), used = [];
  for (const i of kept) if (!remap.has(i)) { remap.set(i, used.length); used.push(i); }
  const geometry = new THREE.BufferGeometry(), pos = new Float32Array(used.length * 3), nor = new Float32Array(used.length * 3), col = new Float32Array(used.length * 3);
  const main = new THREE.Color(spec.color), trim = new THREE.Color(spec.trim);
  used.forEach((i, n) => {
    const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
    pos.set([position.getX(i) + nx * spec.lift, position.getY(i) + ny * spec.lift, position.getZ(i) + nz * spec.lift], n * 3); nor.set([nx, ny, nz], n * 3);
    const c = edge.has(i) ? trim : main; col.set([c.r, c.g, c.b], n * 3);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const name of ['skinIndex', 'skinWeight']) {
    const source = from.getAttribute(name), array = new source.array.constructor(used.length * 4);
    used.forEach((i, n) => { for (let k = 0; k < 4; k++) array[n * 4 + k] = source.getComponent(i, k); });
    geometry.setAttribute(name, new THREE.BufferAttribute(array, 4, source.normalized));
  }
  geometry.setIndex(kept.map(i => remap.get(i)));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const coat = new THREE.SkinnedMesh(geometry, material);
  coat.name = `Cosmetic_${id}`; coat.userData.cosmetic = true; coat.castShadow = mesh.castShadow; coat.frustumCulled = false;
  coat.position.copy(mesh.position); coat.quaternion.copy(mesh.quaternion); coat.scale.copy(mesh.scale);
  mesh.parent.add(coat);
  coat.bind(mesh.skeleton, mesh.bindMatrix);
  return { object: coat, dispose: () => { coat.parent?.remove(coat); geometry.dispose(); material.dispose(); } };
}

const PUT_ON = { head: putOnHat, body: putOnCoat };

/**
 * Puts on a dog what it is wearing, taking off whatever it had on.  avatar: a DogAvatar whose model has loaded (LocalDog,
 * RemoteDog, or the one in the Garage).  cosmetics: { slot: item id } (shared/shop.js cosmeticsFor), or nothing.
 */
export function wear(avatar, cosmetics) {
  for (const worn of avatar.worn ?? []) worn.dispose();
  avatar.worn = [];
  if (!avatar.model) return;
  for (const [slot, id] of Object.entries(cosmetics ?? {})) {
    let worn = null;
    try { worn = PUT_ON[slot]?.(avatar, id) ?? null; } catch (error) { console.warn(`[Cosmetics] ${id} could not be put on ${avatar.dogId}:`, error); }
    if (worn) avatar.worn.push(worn);
  }
}
