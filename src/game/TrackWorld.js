import * as THREE from 'three';
import { MAPS, sampleGroundHeight, PROCEDURAL_TRACKS } from '../../shared/maps.js';
import { woodlandWaterAt, woodlandDogY } from '../../shared/wendoverData.js';
import { FROSTPEAK_CANNON } from '../../shared/frostpeakCannon.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const DOG_COLLISION_RADIUS = 0.65;

// The generated maps: each builds its own scenery (src/tracks)
const GENERATED_WORLDS = {
  modbury_heights: () => import('../tracks/modburyHeights/ModburyHeightsTrack.js').then(module => module.createModburyHeights),
  farmyard: () => import('../tracks/farm/FarmTrack.js').then(module => module.createFarm),
  treat_road: () => import('../tracks/treatRoad/TreatRoadTrack.js').then(module => module.createTreatRoad)
};

// The map being raced on: its scenery, and the questions the dogs ask of it (is this the road?
// how high is the ground here? is something in the way?)
export class TrackWorld {
  // stage: the RaceScene to build in.  dogId, dogSize: the player's dog (pools are as deep as the
  // dog is tall; a small dog fits under and through things the big dogs cannot)
  constructor({ mapId, stage, dogId, dogSize }) {
    this.mapId = mapId;
    this.stage = stage;
    this.dogId = dogId;
    this.dogSize = dogSize;

    this.map = MAPS[mapId];
    // A generated track answers questions about its ground by itself (shared/*Data.js)
    this.proceduralTrack = PROCEDURAL_TRACKS[mapId] ?? null;
    // Treat Road's catapult and Frostpeak's cannon fly the dog the same way
    this.launchTrack = this.proceduralTrack?.launch ? this.proceduralTrack
      : mapId === 'frostpeak' ? FROSTPEAK_CANNON : null;
    // Frostpeak's black run: steep enough that gravity, not legs, sets the pace
    this.steepRun = mapId === 'frostpeak';
    this.woodland = mapId === 'wendover';
    // The supplied coastal map has its own surfaces (mud, verges, water) and speeds for them
    this.coastalTrack = this.proceduralTrack?.speedFactor ? this.proceduralTrack : null;
    // Dogs cast shadows on the maps lit for them
    this.castsShadows = this.woodland || mapId === 'modbury_heights' || mapId === 'farmyard';

    this.proceduralWorld = null;
    this.woodlandWorld = null;
    this.heightmap = null;

    // Frostpeak supplies simplified hidden colliders; Wendover uses visual meshes.
    this.trackMeshes = [];
    this.groundMeshes = [];   // track + terrain tiles: what the dogs stand on
    this.waterMeshes = [];
    this.obstacleMeshes = [];
    this.obstacleBoxes = [];

  }

  #abort = new AbortController();
  #disposed = false;
  #restoreEnvironment = null;
  #surfaceRaycaster = new THREE.Raycaster();
  #obstacleRaycaster = new THREE.Raycaster();
  #groundRaycaster = new THREE.Raycaster();
  #exitNormal = new THREE.Vector3();

  // ---------------------------------
  // LOADING
  // ---------------------------------

  // Resolves once the scenery is in the scene (never, if the race was left meanwhile)
  load(loader) {
    return this.proceduralTrack ? this.#loadGenerated() : this.#loadModel(loader);
  }

  async #loadGenerated() {
    const createWorld = await (GENERATED_WORLDS[this.mapId] ?? GENERATED_WORLDS.treat_road)();
    if (this.#disposed) return new Promise(() => {});
    const { scene, renderer } = this.stage;
    this.proceduralWorld = createWorld();
    scene.add(this.proceduralWorld.group);
    this.stage.removeDefaultLights();
    this.#restoreEnvironment = this.proceduralWorld.applyEnvironment(scene, renderer);
    return undefined;
  }

  async #loadModel(loader) {
    const map = this.map;
    const heightmapRequest = map.heightmap
      ? fetch(map.heightmap.file, { signal: this.#abort.signal }).then(async response => {
          if (!response.ok) throw new Error(`Heightmap request failed: ${response.status}`);
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength !== map.heightmap.width * map.heightmap.height * 4) {
            throw new Error('Invalid heightmap size');
          }
          return new Float32Array(buffer);
        })
      : Promise.resolve(null);

    const [gltf, heights, woodlandModule] = await Promise.all([
      loader.loadAsync(map.model),
      heightmapRequest,
      this.woodland ? import('../tracks/wendover/WendoverWorld.js') : Promise.resolve(null)
    ]);
    if (this.#disposed) return new Promise(() => {});

    const { scene, renderer } = this.stage;
    this.heightmap = heights;
    scene.add(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    this.#sortMeshes(gltf.scene);
    if (woodlandModule) this.woodlandWorld = woodlandModule.createWendoverWorld(scene, renderer, gltf.scene);

    console.log('Track collision geometry:', {
      trackMeshes: this.trackMeshes.map((mesh) => mesh.name),
      obstacleMeshes: this.obstacleMeshes.map((mesh) => mesh.name)
    });
    if (!this.trackMeshes.length) {
      console.warn('Track_Surface mesh not found: off-track penalty disabled.');
    }
    return undefined;
  }

  // Which of a map model's meshes are road, ground, water and things to run into (by their names)
  #sortMeshes(root) {
    const collisionRoot = root.getObjectByName('Frostpeak_Collision');
    if (collisionRoot) collisionRoot.visible = false;

    root.traverse((object) => {
      if (!object.isMesh) return;
      let name = '';
      for (let node = object; node && node !== root.parent; node = node.parent) {
        name += ` ${node.name}`;
      }
      name = name.toLowerCase();
      const isCollision = /collision_/.test(object.name.toLowerCase());
      const track = collisionRoot
        ? object.name === 'Collision_Track_Surface'
        : /track[_\s-]*surface/.test(name);
      if (track) {
        this.trackMeshes.push(object);
        this.groundMeshes.push(object);
      }
      if (!collisionRoot && /terrain[_\s-]*ground/.test(name)) this.groundMeshes.push(object);
      // Stand on the frozen surface above the lake/stream bed.
      if (collisionRoot && /^Water_Frozen_/.test(object.name)) this.groundMeshes.push(object);
      if (!collisionRoot && /water/.test(name)) this.waterMeshes.push(object);
      const obstacle = collisionRoot
        ? isCollision && !['Collision_Track_Surface', 'Collision_Terrain'].includes(object.name)
        : /(scenery[_\s-]*(trees|rocks|fences)|obstacle[_\s-]*log)/.test(name);
      if (obstacle) {
        this.obstacleMeshes.push(object);
        this.obstacleBoxes.push(new THREE.Box3().setFromObject(object));
        // Raycasts must hit either side of thin fence and log geometry.
        const twoSided = (material) => {
          const copy = material.clone();
          copy.side = THREE.DoubleSide;
          return copy;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(twoSided)
          : twoSided(object.material);
      }
    });
  }

  // ---------------------------------
  // EVERY FRAME
  // ---------------------------------

  // seconds: the clock.  sinceGo: seconds since GO (the farm's tractor, animals and sails are placed
  // by it, exactly where the server has them).  dogPositions(): where every dog in sight is.
  update(seconds, playerPosition, sinceGo, dogPositions) {
    this.proceduralWorld?.update(seconds, playerPosition, sinceGo);
    this.woodlandWorld?.update(seconds, playerPosition, dogPositions());
  }

  // Frostpeak balls skim the ground: the height of the snow at (x, z), or null on other maps
  get ballGround() {
    const { heightmap, map } = this;
    return heightmap ? (x, z) => sampleGroundHeight(heightmap, map.heightmap, x, z) : null;
  }

  // ---------------------------------
  // QUESTIONS
  // ---------------------------------

  // The Wendover pool at this point, if any (how deep, whether the dog must swim)
  poolAt(position) {
    return this.woodland && woodlandWaterAt(position.x, position.z, position.y);
  }

  isTrackSurface(position) {
    if (this.poolAt(position)) return true;
    if (this.proceduralTrack) return this.proceduralTrack.query(position.x, position.z).onTrack;
    // Fail open if the GLB has no identifiable track surface.
    if (this.trackMeshes.length === 0) return true;
    const raycaster = this.#surfaceRaycaster;
    raycaster.set(new THREE.Vector3(position.x, position.y + 25, position.z), DOWN);
    raycaster.near = 0;
    raycaster.far = 70;
    return raycaster.intersectObjects(this.trackMeshes, false).length > 0;
  }

  // Height of the ground under a point.  The ray starts just above the
  // dog, so inside a tunnel or on the bridge it finds the surface the dog
  // is on, not the roof above or the stream below.
  groundHeightAt(position, fallback = 0) {
    const pool = this.poolAt(position);
    if (pool) return woodlandDogY(pool, this.dogId);
    if (this.proceduralTrack) {
      const ground = this.proceduralTrack.query(position.x, position.z);
      return ground.onTrack ? (ground.dogY ?? ground.y) : fallback;
    }
    const raycaster = this.#groundRaycaster;
    if (this.heightmap) {
      // The track ray takes precedence on the bridge; snow uses O(1) sampling.
      raycaster.set(new THREE.Vector3(position.x, position.y + 60, position.z), DOWN);
      raycaster.near = 0;
      raycaster.far = 200;
      const hit = raycaster.intersectObjects(this.groundMeshes, false)[0];
      if (hit?.object.name === 'Collision_Track_Surface') return hit.point.y;
      const snow = sampleGroundHeight(this.heightmap, this.map.heightmap, position.x, position.z);
      return Math.max(snow, hit?.point.y ?? snow);
    }
    if (this.groundMeshes.length === 0) return fallback;

    for (const lift of [3, 60]) {
      raycaster.set(new THREE.Vector3(position.x, position.y + lift, position.z), DOWN);
      raycaster.near = 0;
      raycaster.far = lift + 40;

      const hits = raycaster.intersectObjects(this.groundMeshes, false);
      if (hits.length > 0) return hits[0].point.y;
    }

    return fallback;
  }

  isOverWater(position) {
    if (this.waterMeshes.length === 0) return false;

    const raycaster = this.#groundRaycaster;
    raycaster.set(new THREE.Vector3(position.x, position.y + 3, position.z), DOWN);
    raycaster.near = 0;
    raycaster.far = 8;

    return raycaster.intersectObjects(this.waterMeshes, false).length > 0;
  }

  // Would moving the player's dog from one point to another run it into something?
  blockedByObstacle(from, to) {
    const movement = to.clone().sub(from);
    movement.y = 0;
    const distance = movement.length();
    if (distance < 0.00001) return false;
    movement.normalize();

    // A few horizontal rays approximate the dog's width and body height.
    // A small dog's rays sit lower and closer in, so it fits under and
    // through things the big dogs cannot.
    const size = this.dogSize;
    const side = new THREE.Vector3(-movement.z, 0, movement.x);
    const origins = [
      new THREE.Vector3(0, 0.55 * size, 0),
      new THREE.Vector3(0, 1.15 * size, 0),
      new THREE.Vector3(0, 0.55 * size, 0).addScaledVector(side, 0.45 * size),
      new THREE.Vector3(0, 0.55 * size, 0).addScaledVector(side, -0.45 * size)
    ];
    const sweepLength = distance + DOG_COLLISION_RADIUS;
    const raycaster = this.#obstacleRaycaster;
    const exitNormal = this.#exitNormal;
    for (let i = 0; i < this.obstacleMeshes.length; i++) {
      const box = this.obstacleBoxes[i];
      // Coarse filter avoids raycasting against distant forest geometry.
      const expanded = box.clone().expandByScalar(sweepLength + 1.5);
      if (!expanded.containsPoint(from) && !expanded.containsPoint(to)) {
        const segmentBox = new THREE.Box3().setFromPoints([from, to]);
        if (!expanded.intersectsBox(segmentBox)) continue;
      }
      const mesh = this.obstacleMeshes[i];
      // A solid block (Frostpeak's hidden collision boxes: slalom gates, snowmen, logs, rocks...):
      // only running INTO it blocks.  A dog that ends up inside one (a jump at black-run speed can
      // carry it in) hits the block's far wall from the inside, an exit face, and may walk out.
      // Thin fences and nets have no inside, so any hit on them blocks.
      const solid = /^Collision_/.test(mesh.name) && !/Fences|Nets/.test(mesh.name);
      for (const offset of origins) {
        const origin = from.clone().add(offset);
        raycaster.set(origin, movement);
        raycaster.near = 0;
        raycaster.far = sweepLength;
        const hits = raycaster.intersectObject(mesh, false);
        if (hits.length === 0) continue;
        if (!solid) return true;
        if (hits.some(hit => hit.face && exitNormal.copy(hit.face.normal).transformDirection(mesh.matrixWorld).dot(movement) < 0)) {
          return true;
        }
      }
    }
    return false;
  }

  dispose() {
    this.#disposed = true;
    this.#abort.abort();
    this.#restoreEnvironment?.();
    this.proceduralWorld?.dispose();
    this.woodlandWorld?.dispose();
  }
}
