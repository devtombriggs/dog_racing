import * as THREE from 'three';

// Ralph's little skateboard: he hops on to it to drift round a corner and off it again into his run.
//
//   const board = createSkateboard({ length, width, colour, size });   // metres; colour: the deck; size: 1 is a
//                                                                       // board for a person, less for a small dog
//   group.add(board.object);                                      // its origin is on the ground, under its middle; it runs along +z
//   board.deckTop                                                 // how high the top of the deck is (what he stands on)
//   each frame: board.update(delta, speed);                       // the wheels turn with his speed
//   board.dispose();

export function createSkateboard({ length = 1.5, width = 0.5, colour = 0xff7a1a, size = 1 } = {}) {
  const WHEEL = 0.075 * size, DECK = 0.035 * size, TRUCK = 0.05 * size;
  const object = new THREE.Group(); object.name = 'Skateboard';
  const deckY = WHEEL * 2 + TRUCK;
  const materials = {
    grip: new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.95, metalness: 0 }),
    deck: new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, metalness: 0 }),
    truck: new THREE.MeshStandardMaterial({ color: 0xb9bcc4, roughness: 0.5, metalness: 0.15 }),
    wheel: new THREE.MeshStandardMaterial({ color: 0xfff1c9, roughness: 0.7, metalness: 0 }),
  };
  // the deck: a rounded plank, turned up a little at the nose and the tail
  const shape = new THREE.Shape(), halfW = width / 2, halfL = length / 2, r = halfW;
  shape.moveTo(-halfW, -halfL + r); shape.absarc(0, -halfL + r, r, Math.PI, 0, false);
  shape.lineTo(halfW, halfL - r); shape.absarc(0, halfL - r, r, 0, Math.PI, false); shape.closePath();
  const kickUp = geometry => {
    const at = geometry.attributes.position;
    for (let i = 0; i < at.count; i++) { const kick = Math.max(0, Math.abs(at.getZ(i)) - (halfL - r * 1.3)); at.setY(i, at.getY(i) + kick * kick * 0.9); }
    geometry.computeVertexNormals();
    return geometry;
  };
  // (a shape is drawn in x and y: laid flat, its y runs along the board and its thickness is up)
  const plank = kickUp(new THREE.ExtrudeGeometry(shape, { depth: DECK, bevelEnabled: false, curveSegments: 10 }).rotateX(-Math.PI / 2));
  const deck = new THREE.Mesh(plank, materials.deck);
  deck.position.y = deckY;
  // the grip tape on top
  const tape = new THREE.Mesh(kickUp(new THREE.ShapeGeometry(shape, 10).rotateX(-Math.PI / 2)), materials.grip);
  tape.scale.set(0.93, 1, 0.96); tape.position.y = deckY + DECK + 0.003;
  object.add(deck, tape);

  const wheels = [];
  const wheelGeometry = new THREE.CylinderGeometry(WHEEL, WHEEL, 0.07 * size, 14); wheelGeometry.rotateZ(Math.PI / 2);
  const truckGeometry = new THREE.BoxGeometry(width * 0.78, TRUCK, 0.09 * size);
  for (const z of [halfL - r * 1.5, -(halfL - r * 1.5)]) {
    const truck = new THREE.Mesh(truckGeometry, materials.truck); truck.position.set(0, WHEEL * 2 + TRUCK / 2 - 0.01 * size, z); object.add(truck);
    for (const x of [width * 0.42, -width * 0.42]) {
      const wheel = new THREE.Mesh(wheelGeometry, materials.wheel); wheel.position.set(x, WHEEL, z); object.add(wheel); wheels.push(wheel);
    }
  }
  object.traverse(o => { if (o.isMesh) o.castShadow = true; });

  return {
    object,
    deckTop: deckY + DECK,
    update(delta, speed) { for (const wheel of wheels) wheel.rotation.x += speed / WHEEL * delta; },
    dispose() {
      object.removeFromParent();
      object.traverse(o => o.geometry?.dispose());
      Object.values(materials).forEach(m => m.dispose());
    },
  };
}
