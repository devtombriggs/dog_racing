import * as THREE from 'three';

// Nacho's taco (Tom, 2026-11-27: "do the mexican dog drifting style on a taco"): he hops into a hard-shell taco to drift
// round a corner, stood in the filling between the two sides of the shell, and out of it again into his run.  The same
// interface as Ralph's skateboard (skateboard.js), so skidView.js treats the two alike.
//
//   const taco = createTaco({ length, width, size });   // metres: how long, and how far apart the dog's paws are; size: 1
//                                                       // is a taco for a big dog, less for a small one
//   group.add(taco.object);                             // its origin is on the ground, under its middle; it runs along +z
//   taco.deckTop                                        // how high the filling he stands on is
//   each frame: taco.update(delta, speed);              // it rocks as it slides, more the faster he goes
//   taco.dispose();

const FOLD = 86 * Math.PI / 180;       // how far round each side of the shell comes up from the fold, at its middle

export function createTaco({ length = 1.2, width = 0.4, size = 1 } = {}) {
  const object = new THREE.Group(); object.name = 'Taco';
  const rock = new THREE.Group(); object.add(rock);
  // (a big, tall shell: from the chase camera a taco that only fits his paws is a thin board; its sides come up to his belly,
  // and narrow for its height, as a taco is: RX half its width at the top, R how tall its sides would be if they came right over)
  const R = width * 1.35, RX = width * 0.9, halfL = length / 2;
  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: 0xf2b53a, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
    meat: new THREE.MeshStandardMaterial({ color: 0x7a4326, roughness: 0.95, metalness: 0 }),
    lettuce: new THREE.MeshStandardMaterial({ color: 0x5fc23f, roughness: 0.8, metalness: 0, flatShading: true }),
    tomato: new THREE.MeshStandardMaterial({ color: 0xe23a2e, roughness: 0.6, metalness: 0 }),
    cheese: new THREE.MeshStandardMaterial({ color: 0xffd84a, roughness: 0.7, metalness: 0 }),
  };
  // where the shell is: u along it (-1 back to 1 front), v across it (-1 to 1, 0 the fold underneath).  A round tortilla
  // folded in half: each side comes up highest in the middle and down to the fold at the two ends
  const side = (u, v, out = new THREE.Vector3()) => {
    const angle = v * FOLD * Math.sqrt(Math.max(0, 1 - u * u));
    return out.set(RX * Math.sin(angle), R * (1 - Math.cos(angle)), u * halfL);
  };
  const ALONG = 16, ACROSS = 10, at = new THREE.Vector3(), positions = [], indices = [];
  for (let i = 0; i <= ALONG; i++) for (let j = 0; j <= ACROSS; j++) { side(i / ALONG * 2 - 1, j / ACROSS * 2 - 1, at); positions.push(at.x, at.y, at.z); }
  for (let i = 0; i < ALONG; i++) for (let j = 0; j < ACROSS; j++) {
    const a = i * (ACROSS + 1) + j, b = a + ACROSS + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const shellGeometry = new THREE.BufferGeometry();
  shellGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shellGeometry.setIndex(indices); shellGeometry.computeVertexNormals();
  rock.add(new THREE.Mesh(shellGeometry, materials.shell));

  // the filling he stands on: a bed of mince down the fold, flat on top
  const deckTop = R * 0.26;
  const meatWide = RX * Math.sqrt(Math.max(0, 1 - (1 - deckTop / R) ** 2)) * 2 * 0.96;
  const meat = new THREE.Mesh(new THREE.BoxGeometry(meatWide, deckTop * 0.5, length * 0.8), materials.meat);
  meat.position.y = deckTop * 0.75;
  rock.add(meat);

  // along the top of each side: lettuce, with a piece of tomato and a strip of cheese here and there (he is seen between them)
  const lettuce = new THREE.IcosahedronGeometry(0.07 * size, 0), tomato = new THREE.BoxGeometry(0.07 * size, 0.07 * size, 0.07 * size);
  const cheese = new THREE.BoxGeometry(0.028 * size, 0.028 * size, 0.16 * size);
  const count = Math.max(5, Math.round(length / (0.11 * size)));
  for (const way of [-1, 1]) for (let k = 0; k < count; k++) {
    const u = (k + 0.5) / count * 1.7 - 0.85;
    side(u, way * 0.9, at);
    const leaf = new THREE.Mesh(lettuce, materials.lettuce);
    leaf.position.copy(at); leaf.position.x -= way * 0.02 * size;
    leaf.rotation.set(k * 1.7, k * 2.3 + way, k * 0.9); leaf.scale.set(1, 0.7 + 0.3 * ((k * 7) % 3) / 2, 1.25);
    rock.add(leaf);
    if (k % 3 === (way > 0 ? 0 : 1)) { const bit = new THREE.Mesh(tomato, materials.tomato); side(u + 0.04, way * 0.74, bit.position); bit.position.x -= way * 0.035 * size; bit.rotation.set(k, k * 2, 0.4); rock.add(bit); }
    if (k % 3 === 2) { const strip = new THREE.Mesh(cheese, materials.cheese); side(u, way * 0.8, strip.position); strip.position.x -= way * 0.03 * size; strip.rotation.set(0.3 * way, 0.5 - k, 0.6); rock.add(strip); }
  }
  object.traverse(o => { if (o.isMesh) o.castShadow = true; });

  let time = 0;
  return {
    object,
    deckTop,
    // (no wheels: it slides on its fold, and rocks from side to side as it goes)
    update(delta, speed) {
      time += delta * (4 + Math.min(14, Math.abs(speed) * 0.5));
      rock.rotation.z = Math.sin(time) * 0.07;
      rock.rotation.x = Math.sin(time * 0.6) * 0.03;
    },
    dispose() {
      object.removeFromParent();
      object.traverse(o => o.geometry?.dispose());
      Object.values(materials).forEach(m => m.dispose());
    },
  };
}
