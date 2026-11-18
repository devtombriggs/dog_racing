import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { MAPS, DEFAULT_MAP, sampleGroundHeight, PROCEDURAL_TRACKS } from '../../shared/maps.js';
import { createTreatBoxes } from '../pickups/treatBoxes.js';
import { createGoldenBones } from '../pickups/goldenBones.js';
import { GOLDEN_BONE_SPOTS, racingLineAt } from '../../shared/pickupSpots.js';
import { createItems } from '../pickups/items.js';
import { createSpecials } from '../abilities/specials.js';
import { createMinimap } from '../minimap.js';
import { SPECIALS } from '../../shared/specials.js';
import { WENDOVER, woodlandWaterAt, woodlandPlankAt, woodlandSwimMultiplier, woodlandDogY, woodlandBogAt, BOG_SPEED } from '../../shared/wendoverData.js';
import { FROSTPEAK_CANNON } from '../../shared/frostpeakCannon.js';
import { DOGS, STAT_EFFECT, WATER_SPEED, WATER_ACCELERATION, statScale, swimShare } from '../config/dogs.js';
import { HANDLING, RUNNING_JUMP_SPEED } from '../config/handling.js';
import { formatTime } from '../utils/format.js';
import { CONTACT, dogMass, dogOverlap } from '../game/dogs/contact.js';
import { switchAction, gaitTimeScale, sprintFraction, collectBones, applyTurnPose } from '../game/dogs/animation.js';
import { Standings } from './race/Standings.jsx';
import { HudPanel } from './race/HudPanel.jsx';
import { CountdownOverlay } from './race/CountdownOverlay.jsx';
import { ResultsPanel } from './race/ResultsPanel.jsx';

// The race: the 3D view with the course map, race order, HUD, countdown and results over it
export function RaceScreen({ session, state }) {
  const containerRef = useRef(null);
  const minimapRef = useRef(null);
  const speedDisplayRef = useRef(null);
  const timerDisplayRef = useRef(null);
  const surfaceDisplayRef = useRef(null);
  const rescueDisplayRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const socket = session.socket;
    const currentRoom = session.state.room;

    if (!container || !socket || !currentRoom) {
      return;
    }

    const map = MAPS[currentRoom.mapId ?? DEFAULT_MAP];
    const proceduralTrack = PROCEDURAL_TRACKS[currentRoom.mapId] ?? null;
    // Treat Road's catapult and Frostpeak's cannon fly the dog the same way
    const launchTrack = proceduralTrack?.launch ? proceduralTrack
      : currentRoom.mapId === 'frostpeak' ? FROSTPEAK_CANNON : null;
    // Frostpeak's black run: steep enough that gravity, not legs, sets the pace
    const steepRun = currentRoom.mapId === 'frostpeak';
    let proceduralWorld = null;
    const woodland = currentRoom.mapId === 'wendover';
    let woodlandWorld = null, tunnelRide = null, burrowBoostUntil = 0;
    const burrowOverlay = document.createElement('div');
    burrowOverlay.className = 'burrow-overlay'; burrowOverlay.hidden = true;
    burrowOverlay.textContent = 'BURROW BOOST'; container.appendChild(burrowOverlay);
    let restoreEnvironment = null;
    let fall = null;
    let launchFlight = null;
    let launchBoostUntil = 0;
    let respawnRevision = 0;
    let recoveryUntil = 0;

    // ---------------------------------
    // SCENE
    // ---------------------------------

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth /
        container.clientHeight,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true
    });

    renderer.setSize(
      container.clientWidth,
      container.clientHeight
    );

    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(
      0xffffff,
      1
    );

    scene.add(ambientLight);

    const sunlight = new THREE.DirectionalLight(
      0xffffff,
      2
    );

    sunlight.position.set(5, 10, 5);
    scene.add(sunlight);

    if (map.lighting) {
      const light = map.lighting;
      scene.background = new THREE.Color(light.background);
      scene.fog = new THREE.Fog(light.fogColor, light.fogNear, light.fogFar);
      camera.far = 2200;
      camera.updateProjectionMatrix();
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = light.exposure;
      scene.remove(ambientLight);
      scene.add(new THREE.HemisphereLight(light.hemisphereSky, light.hemisphereGround, light.hemisphereIntensity));
      sunlight.color.set(light.sunColor);
      sunlight.intensity = light.sunIntensity;
      sunlight.position.fromArray(light.sunDirection).multiplyScalar(250);
    }

    const loader = new GLTFLoader();
    let isMounted = true;

    // ---------------------------------
    // MODEL LOADING
    // ---------------------------------

    let trackLoaded = false;
    let dogLoaded = false;
    let remoteModelsPending = 0;
    let readySent = false;

    // Frostpeak supplies simplified hidden colliders; Wendover uses visual meshes.
    const trackMeshes = [];
    const groundMeshes = [];   // track + terrain tiles: what the dogs stand on
    const waterMeshes = [];
    const obstacleMeshes = [];
    const obstacleBoxes = [];
    const surfaceRaycaster = new THREE.Raycaster();
    const obstacleRaycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const OFF_TRACK_SPEED_MULTIPLIER = 0.5;
    const OFF_TRACK_ACCELERATION_MULTIPLIER = 0.6;
    const DOG_COLLISION_RADIUS = 0.65;
    let offTrack = false;
    // A jump that starts on the road is free in the air (that is how the stream is cleared).  A jump
    // that starts off the road is not: otherwise hopping along beside the road dodges the off-track
    // slowdown, and with it every slow stretch (the pools, the hay bales) can be skipped round the side.
    let jumpedFromOffTrack = false;
    let inBog = false;             // on the boggy bank beside a Wendover pool (shared/wendoverData.js)
    let heightmap = null;

    function isTrackSurface(position) {
      if (woodland && woodlandWaterAt(position.x, position.z, position.y)) return true;
      if (proceduralTrack) return proceduralTrack.query(position.x, position.z).onTrack;
      // Fail open if the GLB has no identifiable track surface.
      if (trackMeshes.length === 0) return true;
      const origin = new THREE.Vector3(position.x, position.y + 25, position.z);
      surfaceRaycaster.set(origin, down);
      surfaceRaycaster.near = 0;
      surfaceRaycaster.far = 70;
      return surfaceRaycaster.intersectObjects(trackMeshes, false).length > 0;
    }

    const groundRaycaster = new THREE.Raycaster();

    // Height of the ground under a point.  The ray starts just above the
    // dog, so inside a tunnel or on the bridge it finds the surface the dog
    // is on, not the roof above or the stream below.
    function groundHeightAt(position, fallback = 0) {
      const pool = woodland && woodlandWaterAt(position.x, position.z, position.y);
      if (pool) return woodlandDogY(pool, localPlayer.dog);
      if (proceduralTrack) {
        const ground = proceduralTrack.query(position.x, position.z);
        return ground.onTrack ? (ground.dogY ?? ground.y) : fallback;
      }
      if (heightmap) {
        // The track ray takes precedence on the bridge; snow uses O(1) sampling.
        groundRaycaster.set(new THREE.Vector3(position.x, position.y + 60, position.z), down);
        groundRaycaster.near = 0;
        groundRaycaster.far = 200;
        const hit = groundRaycaster.intersectObjects(groundMeshes, false)[0];
        if (hit?.object.name === 'Collision_Track_Surface') return hit.point.y;
        const snow = sampleGroundHeight(heightmap, map.heightmap, position.x, position.z);
        return Math.max(snow, hit?.point.y ?? snow);
      }
      if (groundMeshes.length === 0) return fallback;

      for (const lift of [3, 60]) {
        groundRaycaster.set(
          new THREE.Vector3(
            position.x,
            position.y + lift,
            position.z
          ),
          down
        );
        groundRaycaster.near = 0;
        groundRaycaster.far = lift + 40;

        const hits = groundRaycaster.intersectObjects(
          groundMeshes,
          false
        );

        if (hits.length > 0) return hits[0].point.y;
      }

      return fallback;
    }

    function isOverWater(position) {
      if (waterMeshes.length === 0) return false;

      groundRaycaster.set(
        new THREE.Vector3(
          position.x,
          position.y + 3,
          position.z
        ),
        down
      );
      groundRaycaster.near = 0;
      groundRaycaster.far = 8;

      return (
        groundRaycaster.intersectObjects(waterMeshes, false)
          .length > 0
      );
    }

    const exitNormal = new THREE.Vector3();
    function blockedByObstacle(from, to) {
      const movement = to.clone().sub(from);
      movement.y = 0;
      const distance = movement.length();
      if (distance < 0.00001) return false;
      movement.normalize();

      // A few horizontal rays approximate the dog's width and body height.
      // A small dog's rays sit lower and closer in, so it fits under and
      // through things the big dogs cannot.
      const size = dogConfig.size ?? 1;
      const side = new THREE.Vector3(-movement.z, 0, movement.x);
      const origins = [
        new THREE.Vector3(0, 0.55 * size, 0),
        new THREE.Vector3(0, 1.15 * size, 0),
        new THREE.Vector3(0, 0.55 * size, 0).addScaledVector(side, 0.45 * size),
        new THREE.Vector3(0, 0.55 * size, 0).addScaledVector(side, -0.45 * size)
      ];
      const sweepLength = distance + DOG_COLLISION_RADIUS;
      for (let i = 0; i < obstacleMeshes.length; i++) {
        const box = obstacleBoxes[i];
        // Coarse filter avoids raycasting against distant forest geometry.
        const expanded = box.clone().expandByScalar(sweepLength + 1.5);
        if (!expanded.containsPoint(from) && !expanded.containsPoint(to)) {
          const segmentBox = new THREE.Box3().setFromPoints([from, to]);
          if (!expanded.intersectsBox(segmentBox)) continue;
        }
        const mesh = obstacleMeshes[i];
        // A solid block (Frostpeak's hidden collision boxes: slalom gates, snowmen, logs, rocks...):
        // only running INTO it blocks.  A dog that ends up inside one (a jump at black-run speed can
        // carry it in) hits the block's far wall from the inside, an exit face, and may walk out.
        // Thin fences and nets have no inside, so any hit on them blocks.
        const solid = /^Collision_/.test(mesh.name) && !/Fences|Nets/.test(mesh.name);
        for (const offset of origins) {
          const origin = from.clone().add(offset);
          obstacleRaycaster.set(origin, movement);
          obstacleRaycaster.near = 0;
          obstacleRaycaster.far = sweepLength;
          const hits = obstacleRaycaster.intersectObject(mesh, false);
          if (hits.length === 0) continue;
          if (!solid) return true;
          if (hits.some(hit => hit.face && exitNormal.copy(hit.face.normal).transformDirection(mesh.matrixWorld).dot(movement) < 0)) {
            return true;
          }
        }
      }
      return false;
    }


    function notifyRaceLoaded() {
      if (
        !isMounted ||
        readySent ||
        !trackLoaded ||
        !dogLoaded ||
        remoteModelsPending > 0
      ) {
        return;
      }

      readySent = true;

      console.log(
        'All models loaded. Ready for countdown.'
      );

      socket.emit('raceLoaded');
    }

    function handleLoadError(name, error) {
      console.error(
        `Failed to load ${name}:`,
        error
      );

      if (isMounted) {
        session.set({ racePhase: `Failed to load ${name}` });
      }
    }

    // ---------------------------------
    // LOAD SELECTED MAP
    // ---------------------------------

    const mapAbort = new AbortController();
    const heightmapRequest = map.heightmap
      ? fetch(map.heightmap.file, { signal: mapAbort.signal }).then(async response => {
          if (!response.ok) throw new Error(`Heightmap request failed: ${response.status}`);
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength !== map.heightmap.width * map.heightmap.height * 4) {
            throw new Error('Invalid heightmap size');
          }
          return new Float32Array(buffer);
        })
      : Promise.resolve(null);

    if (proceduralTrack) {
      const worldRequest = currentRoom.mapId === 'modbury_heights'
        ? import('../tracks/modburyHeights/ModburyHeightsTrack.js').then(module => module.createModburyHeights)
        : currentRoom.mapId === 'farmyard'
          ? import('../tracks/farm/FarmTrack.js').then(module => module.createFarm)
          : import('../tracks/treatRoad/TreatRoadTrack.js').then(module => module.createTreatRoad);
      worldRequest.then(createWorld => {
        if (!isMounted) return;
        proceduralWorld = createWorld();
        scene.add(proceduralWorld.group);
        scene.remove(ambientLight, sunlight);
        restoreEnvironment = proceduralWorld.applyEnvironment(scene, renderer);
        camera.far = 20000;
        camera.updateProjectionMatrix();
        groundY = groundHeightAt(player.position);
        player.position.y = groundY;
        trackLoaded = true;
        notifyRaceLoaded();
      }).catch(error => handleLoadError(map.name, error));
    } else Promise.all([loader.loadAsync(map.model), heightmapRequest,
      woodland ? import('../tracks/wendover/WendoverWorld.js') : Promise.resolve(null)]).then(
      ([gltf, heights, woodlandModule]) => {
        if (!isMounted) return;

        heightmap = heights;
        scene.add(gltf.scene);
        gltf.scene.updateMatrixWorld(true);
        const collisionRoot = gltf.scene.getObjectByName('Frostpeak_Collision');
        if (collisionRoot) collisionRoot.visible = false;

        gltf.scene.traverse((object) => {
          if (!object.isMesh) return;
          let name = '';
          for (let node = object; node && node !== gltf.scene.parent; node = node.parent) {
            name += ` ${node.name}`;
          }
          name = name.toLowerCase();
          const isCollision = /collision_/.test(object.name.toLowerCase());
          const track = collisionRoot
            ? object.name === 'Collision_Track_Surface'
            : /track[_\s-]*surface/.test(name);
          if (track) {
            trackMeshes.push(object);
            groundMeshes.push(object);
          }
          if (!collisionRoot && /terrain[_\s-]*ground/.test(name)) groundMeshes.push(object);
          // Stand on the frozen surface above the lake/stream bed.
          if (collisionRoot && /^Water_Frozen_/.test(object.name)) groundMeshes.push(object);
          if (!collisionRoot && /water/.test(name)) waterMeshes.push(object);
          const obstacle = collisionRoot
            ? isCollision && !['Collision_Track_Surface', 'Collision_Terrain'].includes(object.name)
            : /(scenery[_\s-]*(trees|rocks|fences)|obstacle[_\s-]*log)/.test(name);
          if (obstacle) {
            obstacleMeshes.push(object);
            obstacleBoxes.push(new THREE.Box3().setFromObject(object));
            // Raycasts must hit either side of thin fence and log geometry.
            object.material = Array.isArray(object.material)
              ? object.material.map((material) => {
                  const copy = material.clone();
                  copy.side = THREE.DoubleSide;
                  return copy;
                })
              : (() => {
                  const copy = object.material.clone();
                  copy.side = THREE.DoubleSide;
                  return copy;
                })();
          }
        });
        if (woodlandModule) woodlandWorld = woodlandModule.createWendoverWorld(scene, renderer, gltf.scene);
        console.log('Track collision geometry:', {
          trackMeshes: trackMeshes.map((mesh) => mesh.name),
          obstacleMeshes: obstacleMeshes.map((mesh) => mesh.name)
        });
        if (!trackMeshes.length) {
          console.warn('Track_Surface mesh not found: off-track penalty disabled.');
        }

        // Stand the dog on the ground it starts on
        groundY = groundHeightAt(player.position, 0);
        player.position.y = groundY;

        trackLoaded = true;
        notifyRaceLoaded();
      }
    ).catch(error => handleLoadError(map.name, error));

    // ---------------------------------
    // LOCAL PLAYER
    // ---------------------------------

    const player = new THREE.Group();
    scene.add(player);

    // Pickups on every map: Treat Boxes (the server says when one is taken) and Golden Bones
    // (speed boosts, local to this player). Spots come from shared/pickupSpots.js.
    const pickupMapId = currentRoom.mapId ?? DEFAULT_MAP;
    const treatBoxes = createTreatBoxes({ scene, mapId: pickupMapId });
    const goldenBones = createGoldenBones({ scene, renderer, placements: GOLDEN_BONE_SPOTS[pickupMapId] ?? [] });
    // Items from the boxes: held above heads, thrown balls, dropped chew toys (the server decides)
    const items = createItems({ scene, renderer });
    // Special abilities: each dog's own move (the server decides when and who is hit; shared/specials.js)
    const specials = createSpecials({
      scene,
      resolve: id => (id === socket.id ? player : remotePlayers.get(id)?.group ?? null)
    });
    // The course map, bottom left: the whole lap from above with a dot for every dog (src/minimap.js)
    const minimap = createMinimap({
      canvas: minimapRef.current, mapId: pickupMapId,
      marks: (PROCEDURAL_TRACKS[pickupMapId]?.chasms ?? []).map(chasm => chasm.s)    // Modbury's broken bridges
    });
    let myItem = null;
    let stunUntil = 0, stunLength = 1;
    // Lost dogs: seconds off the track / running the wrong way, and whether a rescue is on its way
    const RESCUE_AFTER = 5;
    let offTrackFor = 0, wrongWayFor = 0, rescuePending = false, lineCheckTimer = 0, wrongWayNow = false, lineS = null;

    const localPlayer =
      currentRoom.players.find(
        (p) => p.id === socket.id
      );


    if (localPlayer) {
      player.position.fromArray(
        localPlayer.position
      );

      player.rotation.y =
        localPlayer.rotation;
    }

    let dogMixer = null;
    let dogModel = null;
    let dogBones = {};
    let groundY = 0;       // height of the ground under the dog
    let jumpHeight = 0;    // how far the dog is above it
    let slope = 0;         // rise per unit forward: + uphill
    let steer = 0;
    let travelYaw = player.rotation.y;

    const actions = {};
    let currentAction = null;
    let currentAnimation = 'Idle';

    let verticalVelocity = 0;
    let isJumping = false;
    let isLanding = false;

    function playAnimation(name) {
      const nextAction = switchAction(
        actions,
        currentAction,
        name
      );

      if (!nextAction) return;

      currentAction = nextAction;
      currentAnimation = name;
    }

    const dogConfig =
      DOGS[localPlayer?.dog || 'gsp'];

    loader.load(
      dogConfig.model,
      (gltf) => {
        if (!isMounted) return;

        const dog = gltf.scene;

        dog.scale.setScalar(
          dogConfig.scale
        );

        if (woodland || currentRoom.mapId === 'modbury_heights' || currentRoom.mapId === 'farmyard') {
          dog.traverse(object => { if (object.isMesh) object.castShadow = true; });
        }
        player.add(dog);
        dogModel = dog;
        dogBones = collectBones(dog);

        dogMixer =
          new THREE.AnimationMixer(dog);

        gltf.animations.forEach((clip) => {
          actions[clip.name] =
            dogMixer.clipAction(clip);
        });

        if (actions.Jump) {
          actions.Jump.setLoop(
            THREE.LoopOnce,
            1
          );

          actions.Jump.clampWhenFinished =
            true;
        }

        if (actions.Land) {
          actions.Land.setLoop(
            THREE.LoopOnce,
            1
          );

          actions.Land.clampWhenFinished =
            true;
        }

        dogMixer.addEventListener(
          'finished',
          (event) => {
            if (
              event.action === actions.Land
            ) {
              isLanding = false;
            }
          }
        );

        if (actions.Idle) {
          currentAction = actions.Idle;
          currentAction.play();
        }

        specials.register(socket.id, {
          dogId: localPlayer?.dog || 'gsp', group: player, model: dog, mixer: dogMixer, animations: gltf.animations,
          getAction: () => currentAction, setAction: action => { currentAction = action; }
        });

        dogLoaded = true;
        notifyRaceLoaded();
      },
      undefined,
      (error) => {
        handleLoadError(
          'dog model',
          error
        );
      }
    );

    // ---------------------------------
    // REMOTE PLAYERS
    // ---------------------------------

    const remotePlayers = new Map();

    function playRemoteAnimation(
      remote,
      name
    ) {
      remote.currentAction =
        switchAction(
          remote.actions,
          remote.currentAction,
          name
        );
    }

    function spawnRemotePlayer(data) {
      if (
        data.id === socket.id ||
        remotePlayers.has(data.id)
      ) {
        return;
      }

      const config =
        DOGS[data.dog] || DOGS.gsp;

      const group = new THREE.Group();

      group.position.fromArray(
        data.position
      );

      group.rotation.y =
        data.rotation;

      scene.add(group);

      const remote = {
        group,
        targetPosition:
          new THREE.Vector3().fromArray(
            data.position
          ),
        targetRotation: data.rotation,
        mixer: null,
        config,
        speed: 0,
        velocity: new THREE.Vector3(),
        lastMoveTime: 0,
        dog: null,
        bones: {},
        steer: 0,
        steerTarget: 0,
        actions: {},
        currentAction: null,
        animation:
          data.animation || 'Idle'
      };

      remotePlayers.set(
        data.id,
        remote
      );

      remoteModelsPending += 1;

      loader.load(
        config.model,
        (gltf) => {
          if (
            !isMounted ||
            !remotePlayers.has(data.id)
          ) {
            return;
          }

          const dog = gltf.scene;

          dog.scale.setScalar(
            config.scale
          );

          if (woodland || currentRoom.mapId === 'modbury_heights' || currentRoom.mapId === 'farmyard') {
            dog.traverse(object => { if (object.isMesh) object.castShadow = true; });
          }
          group.add(dog);
          remote.dog = dog;
          remote.bones = collectBones(dog);

          remote.mixer =
            new THREE.AnimationMixer(dog);

          gltf.animations.forEach(
            (clip) => {
              remote.actions[clip.name] =
                remote.mixer.clipAction(
                  clip
                );
            }
          );

          if (remote.actions.Jump) {
            remote.actions.Jump.setLoop(
              THREE.LoopOnce,
              1
            );
          }

          if (remote.actions.Land) {
            remote.actions.Land.setLoop(
              THREE.LoopOnce,
              1
            );
          }

          playRemoteAnimation(
            remote,
            remote.animation
          );
          specials.register(data.id, {
            dogId: data.dog, group, model: dog, mixer: remote.mixer, animations: gltf.animations,
            getAction: () => remote.currentAction, setAction: action => { remote.currentAction = action; }
          });

          remoteModelsPending -= 1;
          notifyRaceLoaded();
        },
        undefined,
        (error) => {
          handleLoadError(
            'remote dog',
            error
          );
        }
      );
    }

    // Spawn players already in the race
    currentRoom.players.forEach(
      spawnRemotePlayer
    );

    function handlePlayerMoved(data) {
      const remote = remotePlayers.get(
        data.playerId
      );

      if (!remote) return;

      const now = performance.now();

      const elapsed =
        (now - remote.lastMoveTime) /
        1000;

      const previous =
        remote.targetPosition.clone();

      remote.targetPosition.fromArray(
        data.position
      );

      if (
        remote.lastMoveTime &&
        elapsed > 0.01 &&
        elapsed < 0.5
      ) {
        previous.y =
          remote.targetPosition.y;

        remote.speed =
          previous.distanceTo(
            remote.targetPosition
          ) / elapsed;

        remote.velocity
          .subVectors(remote.targetPosition, previous)
          .divideScalar(elapsed);
      }

      if (
        remote.lastMoveTime &&
        elapsed > 0.01 &&
        elapsed < 0.5
      ) {
        // How hard the other dog is turning, from how fast its heading changes
        const yawRate =
          Math.atan2(
            Math.sin(
              data.rotation - remote.targetRotation
            ),
            Math.cos(
              data.rotation - remote.targetRotation
            )
          ) / elapsed;

        remote.steerTarget = THREE.MathUtils.clamp(
          yawRate / HANDLING.turnRateSprint,
          -1,
          1
        );
      }

      remote.lastMoveTime = now;
      remote.targetRotation =
        data.rotation;
      remote.animation =
        data.animation;

      // (a dog in the middle of its special keeps the special's own clips)
      if (!specials.animating(data.playerId)) playRemoteAnimation(remote, data.animation);
    }

    function handlePlayerLeft(data) {
      const remote = remotePlayers.get(
        data.playerId
      );

      if (!remote) return;

      scene.remove(remote.group);
      specials.unregister(data.playerId);
      items.setHeld(data.playerId, null);
      remotePlayers.delete(
        data.playerId
      );
    }

    socket.on(
      'playerMoved',
      handlePlayerMoved
    );

    socket.on(
      'playerLeft',
      handlePlayerLeft
    );

    function handlePlayerFell(data) {
      if (!proceduralTrack || data.playerId !== socket.id) return;
      fall = { position: new THREE.Vector3().fromArray(data.position), startedAt: performance.now() };
      currentSpeed = 0;
      goldenBones.cancelBoost();
      knock.set(0, 0, 0);
      playAnimation('Jump');
    }

    function handlePlayerRespawned(data) {
      if (!proceduralTrack && !data.rescued) return;
      if (data.playerId === socket.id) {
        offTrackFor = wrongWayFor = 0;
        rescuePending = false;
        wrongWayNow = false;
        lineS = null;
        if (rescueDisplayRef.current) rescueDisplayRef.current.hidden = true;
        fall = null;
        launchFlight = null;
        tunnelRide = null; burrowBoostUntil = 0; burrowOverlay.hidden = true;
        if (dogModel) dogModel.visible = true;
        launchBoostUntil = 0;
        goldenBones.cancelBoost();
        respawnRevision = data.respawnRevision;
        recoveryUntil = performance.now() + data.penaltySeconds * 1000;
        player.position.fromArray(data.position);
        player.rotation.set(0, data.rotation, 0);
        travelYaw = data.rotation;
        groundY = data.position[1];
        currentSpeed = jumpHeight = verticalVelocity = slope = steer = 0;
        isJumping = isLanding = false;
        knock.set(0, 0, 0);
        if (dogModel) dogModel.rotation.set(0, 0, 0);
        playAnimation('Idle');
        // A checkpoint can be far away: snap the chase camera with the dog.
        camera.position.copy(player.position).add(cameraOffset.clone().applyQuaternion(player.quaternion));
      } else {
        const remote = remotePlayers.get(data.playerId);
        if (!remote) return;
        remote.group.visible = true;
        remote.group.position.fromArray(data.position);
        remote.targetPosition.copy(remote.group.position);
        remote.group.rotation.set(0, data.rotation, 0);
        remote.targetRotation = data.rotation;
        remote.speed = 0;
        remote.velocity.set(0, 0, 0);
        remote.lastMoveTime = 0;
        playRemoteAnimation(remote, 'Idle');
      }
    }
    function handlePlayerLaunched(data) {
      if (!launchTrack || data.playerId !== socket.id) return;
      launchFlight = { startedAt: performance.now(), lateral: data.lateral };
      fall = null;
      knock.set(0,0,0);
      isJumping = isLanding = false;
      jumpHeight = verticalVelocity = 0;
      playAnimation('Jump');
      currentAction?.reset();
    }
    function handlePlayerLanded(data) {
      if (!launchTrack) return;
      if (data.playerId !== socket.id) {
        const remote = remotePlayers.get(data.playerId);
        if (remote) {
          remote.targetPosition.fromArray(data.position);
          remote.targetRotation = data.rotation;
          playRemoteAnimation(remote, 'Sprint');
        }
        return;
      }
      launchFlight = null;
      respawnRevision = data.respawnRevision;
      launchBoostUntil = performance.now() + data.boostSeconds * 1000;
      player.position.fromArray(data.position);
      player.rotation.set(0,data.rotation,0);
      travelYaw = data.rotation;
      groundY = data.position[1];
      currentSpeed = sprintSpeed * data.speedMultiplier;
      jumpHeight = verticalVelocity = slope = steer = 0;
      isJumping = isLanding = false;
      if (dogModel) dogModel.rotation.set(0,0,0);
      playAnimation('Sprint');
    }
    function handleTreatBoxChanged({ id, visible }) {
      treatBoxes.setVisible(id, visible);
    }
    socket.on('treatBoxChanged', handleTreatBoxChanged);
    // A golden bone on the road went: pop it here too.  If it was us and our game had not already
    // counted it (the server saw it first), boost now.
    function handleGoldenBoneTaken({ index, playerId }) {
      const stillShowing = goldenBones.take(index);
      if (playerId !== socket.id) { goldenBones.showBoost(playerId); return; }
      if (stillShowing) {
        goldenBones.startBoost();
        if (currentSpeed > 0) currentSpeed += goldenBones.instantKick(sprintSpeed);
      }
    }
    function handleGoldenBoneRespawned({ index }) { goldenBones.respawn(index); }
    socket.on('goldenBoneTaken', handleGoldenBoneTaken);
    socket.on('goldenBoneRespawned', handleGoldenBoneRespawned);

    // ---------------------------------
    // ITEMS
    // ---------------------------------
    function handleItemChanged({ playerId, item }) {
      items.setHeld(playerId, item);
      if (playerId === socket.id) { myItem = item; session.set({ heldItem: item }); }
    }
    function handleItemUsed({ playerId, item }) {
      if (item !== 'bone') return;
      if (playerId !== socket.id) { goldenBones.showBoost(playerId); return; }   // their golden trail
      goldenBones.startBoost();
      if (currentSpeed > 0) currentSpeed += goldenBones.instantKick(sprintSpeed);
    }
    function handleHazardPlaced(data) { items.placeHazard(data); }
    function handleHazardRemoved(data) { items.removeHazard(data.id, !!data.hitBy); }
    function handleBallThrown(data) { items.throwBall(data); }
    function handleBallHit(data) { items.removeBall(data.id, data.position); }
    function handlePlayerHit({ playerId, stunMs }) {
      if (playerId !== socket.id) { goldenBones.stopBoost(playerId); return; }
      stunLength = stunMs;
      stunUntil = performance.now() + stunMs;
      currentSpeed *= 0.15;
      goldenBones.cancelBoost();
    }
    // Red frisbee: the server flies it; we draw it, and warn the dog it is chasing
    function handleFrisbeeThrown(data) {
      items.throwFrisbee(data);
      if (data.target === socket.id) session.update('frisbeesIncoming', list => [...list, data.id]);
    }
    function handleFrisbeesMoved({ frisbees }) { items.moveFrisbees(frisbees); }
    // someone overtook the thrower: the frisbee is after a different dog now
    function handleFrisbeeTarget({ id, target }) {
      session.update('frisbeesIncoming', list => (target === socket.id ? [...new Set([...list, id])] : list.filter(f => f !== id)));
    }
    function handleFrisbeeEnded({ id, position }) {
      items.removeFrisbee(id, position);
      session.update('frisbeesIncoming', list => list.filter(f => f !== id));
    }
    // Special abilities: the server says when one starts, who it knocks over and when it ends
    function handleSpecialStarted(data) {
      specials.start(data.playerId, data);
      if (data.playerId !== socket.id) return;
      const spec = SPECIALS[localPlayer?.dog];
      if (spec?.speed && currentSpeed > 0) currentSpeed = Math.max(currentSpeed, sprintSpeed);   // straight up to full pace
      if (spec?.flyHeight) { jumpGravity = gravity; verticalVelocity = 0; }
    }
    function handleSpecialHit({ playerId }) { specials.hit(playerId); }
    function handleSpecialEnded({ playerId, reason }) { specials.end(playerId, reason); }
    function handlePheasantLanded({ owner, playerId, hit }) { specials.pheasantLanded(owner, playerId, hit); }
    const itemEvents = {
      specialStarted: handleSpecialStarted, specialHit: handleSpecialHit, specialEnded: handleSpecialEnded,
      pheasantLanded: handlePheasantLanded,
      itemChanged: handleItemChanged, itemUsed: handleItemUsed, hazardPlaced: handleHazardPlaced,
      hazardRemoved: handleHazardRemoved, ballThrown: handleBallThrown, ballHit: handleBallHit, playerHit: handlePlayerHit,
      frisbeeThrown: handleFrisbeeThrown, frisbeesMoved: handleFrisbeesMoved, frisbeeTarget: handleFrisbeeTarget,
      frisbeeHit: handleFrisbeeEnded, frisbeeGone: handleFrisbeeEnded,
    };
    for (const [event, handler] of Object.entries(itemEvents)) socket.on(event, handler);
    function handleBurrowEntered(data) {
      if (!woodland) return;
      if (data.playerId === socket.id) {
        const tunnel = WENDOVER.tunnels.find(t => t.id === data.tunnelId);
        if (!tunnel) return;
        tunnelRide = { tunnel, startedAt: performance.now() };
        burrowOverlay.hidden = false;
        currentSpeed = 0; knock.set(0,0,0); goldenBones.cancelBoost();
        player.position.fromArray(tunnel.entry); player.rotation.y = tunnel.entryYaw;
        jumpHeight = verticalVelocity = 0; isJumping = isLanding = false;
        playAnimation('Run');
      } else {
        const remote = remotePlayers.get(data.playerId);
        if (remote) remote.group.visible = false;
      }
    }
    function handleBurrowExited(data) {
      if (!woodland) return;
      handlePlayerRespawned({ ...data, rescued: true, penaltySeconds: 0 });
      if (data.playerId === socket.id) {
        burrowBoostUntil = performance.now() + data.boostSeconds * 1000;
        currentSpeed = sprintSpeed * data.speedMultiplier;
        playAnimation('Sprint');
      }
    }
    socket.on('playerBurrowEntered', handleBurrowEntered);
    socket.on('playerBurrowExited', handleBurrowExited);
    socket.on('playerLaunched', handlePlayerLaunched);
    socket.on('playerLanded', handlePlayerLanded);
    socket.on('playerFell', handlePlayerFell);
    socket.on('playerRespawned', handlePlayerRespawned);

    // ---------------------------------
    // MOVEMENT SETTINGS
    // ---------------------------------

    // Real dog speeds at the dogs' scale of 3: an easy canter and a gallop
    // ...then each dog's own stats on top (STAT_EFFECT)
    const stats = dogConfig.stats ?? {};
    const speedScale = statScale(stats.speed, STAT_EFFECT.speed);
    const runSpeed = 11 * speedScale;
    const sprintSpeed = 17 * speedScale;
    const reverseSpeed = 2.5;

    const acceleration =
      14 * statScale(stats.acceleration, STAT_EFFECT.acceleration);
    const turnRateSlow = HANDLING.turnRateSlow *
      statScale(stats.agility, STAT_EFFECT.agilityTurnSlow);
    const turnRateSprint = HANDLING.turnRateSprint *
      statScale(stats.agility, STAT_EFFECT.agilityTurn);
    const gripSprint = HANDLING.gripSprint *
      statScale(stats.agility, STAT_EFFECT.agilityGrip);
    // The supplied coastal map uses 0–1 stats; existing dog stats use 1–10.
    const coastalStats = {
      stamina: stats.stamina == null ? 0.5 : THREE.MathUtils.clamp(stats.stamina / 10, 0, 1),
      swimming: stats.swimming == null ? 0.5 : THREE.MathUtils.clamp(stats.swimming / 10, 0, 1)
    };
    const coastalTrack = proceduralTrack?.speedFactor ? proceduralTrack : null;
    const waterSpeed = swimShare(stats.swimming, WATER_SPEED);
    const waterAcceleration = swimShare(stats.swimming, WATER_ACCELERATION);
    const braking = 22;
    const friction = 9;

    let currentSpeed = 0;

    // Speed a bump from another dog has given this one, on top of its own running
    const knock = new THREE.Vector3();

    const forwardDirection =
      new THREE.Vector3(0, 0, 1);

    const jumpForce = 7;
    const gravity = 16;
    // On Frostpeak's black run a normal jump at full speed sails 25 m down the mountain: there the
    // dog does a short, snappy hop instead: about 2 m high (clears the padded slalom gates, solid to
    // 1.7 m; the snowmen are too tall and must be steered round) and 0.6 s in the air
    const STEEP_JUMP = { force: 12.9, gravity: 41.6, below: -0.12 };
    let jumpGravity = gravity;

    // ---------------------------------
    // KEYBOARD AND MOUSE CONTROLS
    // ---------------------------------

    const keys = {};
    const controlKeys = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight'
    ]);

    function tryJump() {
      if (
        !session.raceGo ||
        session.raceFinished ||
        isJumping ||
        tunnelRide ||
        specials.busy(socket.id) ||          // no jumping in the middle of a special
        (woodland && woodlandWaterAt(player.position.x, player.position.z, player.position.y)?.swimming) ||
        !dogMixer
      ) {
        return;
      }

      isJumping = true;
      isLanding = false;
      jumpedFromOffTrack = offTrack || inBog;
      const steepHop = steepRun && slope < STEEP_JUMP.below;
      verticalVelocity = steepHop ? STEEP_JUMP.force : jumpForce;
      jumpGravity = steepHop ? STEEP_JUMP.gravity : gravity;
      playAnimation('Jump');

      // A running dog takes off in stride: skip the standing crouch.
      if (
        currentAction === actions.Jump &&
        Math.abs(currentSpeed) > RUNNING_JUMP_SPEED
      ) {
        currentAction.time = 0.2;
      }
    }

    function handleKeyDown(event) {
      if (!controlKeys.has(event.code)) return;
      event.preventDefault();
      if (!session.raceGo || session.raceFinished) return;

      keys[event.code] = true;
      const accessible = session.state.accessibilityMode;
      const jumpKey = event.code === 'Space' ||
        (accessible && (event.code === 'ArrowUp' || event.code === 'KeyW'));
      // Shift (or E) throws the ball, drops the chew toy or eats the golden bone;
      // in accessibility mode Down (or S) does too
      const itemKey = event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyE' ||
        (accessible && (event.code === 'ArrowDown' || event.code === 'KeyS'));
      if (jumpKey && !event.repeat) tryJump();
      if (itemKey && !event.repeat && myItem) socket.emit('useItem');
    }

    function handleWheel(event) {
      if (event.deltaY <= 0 || event.ctrlKey) return;
      event.preventDefault();
      tryJump();
    }

    function handleKeyUp(event) {
      if (!controlKeys.has(event.code)) return;
      event.preventDefault();
      keys[event.code] = false;
    }

    function clearKeys() {
      Object.keys(keys).forEach(key => { keys[key] = false; });
    }

    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('blur', clearKeys);

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    window.addEventListener(
      'keyup',
      handleKeyUp
    );

    // ---------------------------------
    // CAMERA
    // ---------------------------------

    // A small dog gets a closer, lower camera so it is not lost on screen
    const cameraOffset =
      new THREE.Vector3(
        ...(dogConfig.cameraOffset || [0, 4, -8])
      );

    const cameraSmoothness = 6;
    const cameraLookHeight =
      dogConfig.cameraLookHeight ?? 1.5;

    const initialOffset =
      cameraOffset.clone();

    initialOffset.applyQuaternion(
      player.quaternion
    );

    camera.position.copy(
      player.position
        .clone()
        .add(initialOffset)
    );

    camera.lookAt(
      player.position.x,
      player.position.y +
        cameraLookHeight,
      player.position.z
    );

    // ---------------------------------
    // GAME LOOP
    // ---------------------------------

    const timer = new THREE.Timer();
    timer.connect(document);

    let animationId;
    let networkTimer = 0;
    let lastGoState = false;
    let goBannerCleared = false;

    function animate() {
      animationId =
        requestAnimationFrame(
          animate
        );

      timer.update();

      const delta = Math.min(
        timer.getDelta(),
        0.05
      );
      // (the third number is the time since GO: the farm's tractor, animals and sails are placed by it,
      // exactly where the server has them)
      proceduralWorld?.update(performance.now() / 1000, player.position,
        session.raceStart !== null ? (performance.now() - session.raceStart) / 1000 : 0);
      woodlandWorld?.update(performance.now() / 1000, player.position,
        [player.position, ...[...remotePlayers.values()].filter(r => r.group.visible).map(r => r.group.position)]);
      treatBoxes.update(performance.now() / 1000);
      minimap.draw([
        { x: player.position.x, z: player.position.z, rotation: player.rotation.y, color: dogConfig.accent, me: true },
        ...[...remotePlayers.values()].filter(remote => remote.group.visible)
          .map(remote => ({ x: remote.group.position.x, z: remote.group.position.z, color: remote.config.accent }))
      ]);
      const itemAnchors = new Map([[socket.id, dogBones.head ?? player]]);
      remotePlayers.forEach((remote, id) => itemAnchors.set(id, remote.bones.head ?? remote.group));
      items.update(delta, itemAnchors, heightmap
        ? (x, z) => sampleGroundHeight(heightmap, map.heightmap, x, z)   // Frostpeak balls skim the ground
        : null);
      // knocked over by a ball or a chew toy: a couple of spins on the spot
      if (dogModel) {
        const stunLeft = stunUntil - performance.now();
        dogModel.rotation.y = stunLeft > 0 ? (1 - stunLeft / stunLength) * Math.PI * 4 : 0;
      }

      const canMove =
        session.raceGo &&
        !session.raceFinished;

      // Golden Bones: running through one is the whole pickup, no button needed.  Your own boost starts
      // at once; the server tells everyone (you included) which bone went, so it vanishes for all.
      const otherDogs = new Map();
      remotePlayers.forEach((remote, id) => otherDogs.set(id, remote.group.position));
      if (goldenBones.update(delta, player.position, canMove && !fall && !launchFlight && !tunnelRide, otherDogs) && currentSpeed > 0) {
        currentSpeed += goldenBones.instantKick(sprintSpeed);
      }

      // ---------------------------------
      // RACE TIMER
      // ---------------------------------

      if (
        session.raceStart !== null &&
        timerDisplayRef.current &&
        !session.raceFinished
      ) {
        const elapsed =
          (performance.now() -
            session.raceStart) /
          1000;

        timerDisplayRef.current.textContent =
          formatTime(elapsed);

        if (
          elapsed >= 1 &&
          !goBannerCleared
        ) {
          goBannerCleared = true;
          session.set({ racePhase: '' });
        }
      }

      // ---------------------------------
      // LOCK MOVEMENT BEFORE GO
      // ---------------------------------

      if (!canMove) {
        currentSpeed = 0;

        if (lastGoState) {
          Object.keys(keys).forEach(
            (key) => {
              keys[key] = false;
            }
          );
        }

        lastGoState = false;

        if (dogMixer) {
          dogMixer.update(delta);
        }

        remotePlayers.forEach(
          (remote) => {
            if (remote.mixer) {
              remote.mixer.update(delta);
            }
          }
        );

        renderer.render(
          scene,
          camera
        );

        return;
      }

      lastGoState = true;

      const desiredFov = launchFlight ? 94
        : performance.now() < launchBoostUntil || goldenBones.isBoosting() || specials.physics(socket.id)?.speed ? 84 : 75;
      if (Math.abs(camera.fov - desiredFov) > 0.01) {
        camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-8 * delta));
        camera.updateProjectionMatrix();
      }
      if (tunnelRide) {
        const elapsed = (performance.now() - tunnelRide.startedAt) / 1000;
        if (dogModel) dogModel.visible = elapsed < 0.12;
        if (dogMixer) dogMixer.update(delta);
        if (surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = 'RALPH’S BURROW BOOST';
          surfaceDisplayRef.current.style.color = '#ffc478';
        }
        if (speedDisplayRef.current) speedDisplayRef.current.textContent = '»';
      } else if (launchFlight) {
        const elapsed = (performance.now() - launchFlight.startedAt) / 1000;
        const point = launchTrack.launchPoint(elapsed, launchFlight.lateral);
        player.position.set(point.x, point.y, point.z);
        player.rotation.y = point.rotationY;
        if (dogModel) dogModel.rotation.x = point.pitch;
        if (dogMixer) dogMixer.update(delta);
        if (speedDisplayRef.current) speedDisplayRef.current.textContent = (point.speed * 3.6).toFixed(1);
        if (surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = 'ZOOM!';
          surfaceDisplayRef.current.style.color = '#62ffe6';
        }
      } else if (fall) {
        const elapsed = (performance.now() - fall.startedAt) / 1000;
        player.position.copy(fall.position);
        player.position.y -= 0.5 * proceduralTrack.rules.gravity * elapsed * elapsed;
        if (dogMixer) dogMixer.update(delta);
        if (speedDisplayRef.current) speedDisplayRef.current.textContent = '0.0';
        if (surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = 'FELL — RETURNING TO CHECKPOINT';
          surfaceDisplayRef.current.style.color = '#ffbc75';
        }
      } else {

        // ---------------------------------
        // ACCELERATION AND BRAKING
        // ---------------------------------

        // This dog's special, while it is in force: faster, flying (Ralph) or steering itself (Poppy)
        const special = specials.physics(socket.id);

        // In the air the dog is off nothing: that is how the stream is cleared
        offTrack = !(isJumping && !jumpedFromOffTrack) && !isTrackSurface(player.position);
        const woodlandSurface = woodland && woodlandWaterAt(player.position.x, player.position.z, player.position.y);
        // the bog beside a pool: slower than swimming, and no hopping out of it (a jump from the road sails over)
        inBog = Boolean(woodland && !(isJumping && !jumpedFromOffTrack) && woodlandBogAt(player.position.x, player.position.z));
        const inWater = !isJumping && (woodlandSurface?.inWater || (offTrack && isOverWater(player.position)));
        const coastalGround = coastalTrack?.query(player.position.x, player.position.z);
        const terrainMultiplier = inWater && woodlandSurface
          ? woodlandSwimMultiplier(stats.swimming)
          : coastalGround
          ? coastalTrack.speedFactor(coastalGround, coastalStats)
          : inBog
          ? BOG_SPEED
          : inWater
          ? waterSpeed
          : offTrack ? OFF_TRACK_SPEED_MULTIPLIER : 1;
        // A climb takes a little off the top speed, a descent gives a little back.
        // On Frostpeak's black run a descent gives a LOT back: up to 1.75x on the steepest pitches.
        const hillMultiplier = coastalTrack || (inWater && woodlandSurface) ? 1
          : steepRun && slope < 0 ? Math.min(1.75, 1 - 1.7 * slope)
          : THREE.MathUtils.clamp(1 - HANDLING.hillEffect * slope, 0.8, 1.08);
        const maxSpeed =
          sprintSpeed *
          terrainMultiplier *
          hillMultiplier *
          (performance.now() < burrowBoostUntil ? 1.3 : 1) *
          (performance.now() < launchBoostUntil ? launchTrack.launch.exitSpeedMultiplier : 1) *
          (proceduralTrack && performance.now() < recoveryUntil ? proceduralTrack.rules.respawnSpeedMultiplier : 1) *
          goldenBones.speedMultiplier() *
          (special?.speed ?? 1) *
          (performance.now() < stunUntil ? 0.15 : 1);
        const effectiveAcceleration = acceleration *
          (special?.speed ? 2.5 : 1) *
          goldenBones.accelerationMultiplier() *
          (steepRun && slope < 0 ? 1 - 4 * slope : 1) *      // gravity does the work going down the black run
          (inWater
            ? waterAcceleration
            : offTrack ? OFF_TRACK_ACCELERATION_MULTIPLIER : 1);
        if (surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK';
          surfaceDisplayRef.current.style.color = offTrack ? '#ffbc75' : '#9fe49b';
        }

        // Accessibility mode runs the dog for the player; Up and Down are jump and item there
        const autoRun = session.state.accessibilityMode;
        const running = autoRun
          ? session.raceGo && !session.raceFinished
          : keys.KeyW || keys.ArrowUp || Boolean(special?.speed);   // a special carries the dog along by itself
        if (running) {
          currentSpeed +=
            effectiveAcceleration * delta;

          currentSpeed = Math.min(
            currentSpeed,
            maxSpeed
          );
        } else if (!autoRun && (keys.KeyS || keys.ArrowDown)) {
          currentSpeed -=
            braking * delta;

          currentSpeed = Math.max(
            currentSpeed,
            -reverseSpeed
          );
        } else {
          if (currentSpeed > 0) {
            currentSpeed = Math.max(
              0,
              currentSpeed -
                friction * delta
            );
          } else if (
            currentSpeed < 0
          ) {
            currentSpeed = Math.min(
              0,
              currentSpeed +
                friction * delta
            );
          }
        }

        if (
          currentSpeed > maxSpeed
        ) {
          currentSpeed = Math.max(
            maxSpeed,
            currentSpeed -
              braking * delta
          );
        }

        // ---------------------------------
        // SPEED HUD
        // ---------------------------------

        if (speedDisplayRef.current) {
          const speedKmh =
            Math.abs(currentSpeed) *
            3.6;

          speedDisplayRef.current.textContent =
            speedKmh.toFixed(1);
        }

        // ---------------------------------
        // STEERING AND LEAN
        // ---------------------------------

        const steeringFactor =
          Math.min(
            Math.abs(currentSpeed) /
              HANDLING.fullSteerSpeed,
            1
          );

        const effort = sprintFraction(
          currentSpeed,
          runSpeed,
          sprintSpeed
        );

        const turnInput = special?.steerLocked ? 0 :
          (keys.KeyA || keys.ArrowLeft ? 1 : 0) -
          (keys.KeyD || keys.ArrowRight ? 1 : 0);

        // The turn builds and fades: a running dog cannot change line instantly
        steer +=
          (turnInput - steer) *
          (1 -
            Math.exp(
              -HANDLING.steerResponse * delta
            ));

        // Fast means wide: the turn rate falls away as the dog stretches out
        const turnRate = THREE.MathUtils.lerp(
          turnRateSlow,
          turnRateSprint,
          effort
        );

        // (standing still or stuck against something, left and right still turn the dog on the spot)
        player.rotation.y +=
          turnRate *
          steer *
          Math.max(steeringFactor, HANDLING.pivotSteer) *
          delta;

        // Poppy's wave steers itself: it follows the road, wandering from side to side, so it only
        // hits the dogs that happen to be in its way
        if (special?.steerLocked) {
          const line = racingLineAt(pickupMapId, player.position.x, player.position.z, lineS);
          if (line) {
            const leftX = Math.cos(line.rotationY), leftZ = -Math.sin(line.rotationY);
            const offset = (player.position.x - line.x) * leftX + (player.position.z - line.z) * leftZ;
            const wander = Math.sin(performance.now() / 1000 * 1.1) * 0.5 * line.halfWidth;
            const want = line.rotationY +
              THREE.MathUtils.clamp((wander - offset) / Math.max(line.halfWidth, 1) * 0.9, -0.6, 0.6);
            player.rotation.y +=
              Math.atan2(Math.sin(want - player.rotation.y), Math.cos(want - player.rotation.y)) *
              (1 - Math.exp(-5 * delta));
          }
        }

        // Turning hard at speed costs speed
        const turnLimit =
          maxSpeed *
          (1 -
            HANDLING.turnSpeedLoss *
              Math.abs(steer) *
              effort);

        if (currentSpeed > turnLimit) {
          currentSpeed = Math.max(
            turnLimit,
            currentSpeed -
              braking * 0.5 * delta
          );
        }

        // ---------------------------------
        // MOVEMENT
        // ---------------------------------

        // The dog travels where its momentum takes it, which trails the way
        // its nose points: at a sprint it drifts a little through a turn
        const grip = THREE.MathUtils.lerp(
          HANDLING.gripSlow,
          gripSprint,
          effort
        );

        travelYaw +=
          Math.atan2(
            Math.sin(player.rotation.y - travelYaw),
            Math.cos(player.rotation.y - travelYaw)
          ) *
          (1 - Math.exp(-grip * delta));

        const forward = forwardDirection
          .clone()
          .applyAxisAngle(
            THREE.Object3D.DEFAULT_UP,
            travelYaw
          );

        const previousPosition = player.position.clone();
        const proposedPosition = previousPosition.clone().addScaledVector(
          forward,
          currentSpeed * delta
        );
        if (blockedByObstacle(previousPosition, proposedPosition)) {
          // Stop forward movement; steering and jumping remain available.
          currentSpeed = 0;
        } else {
          player.position.copy(proposedPosition);
        }

        // ---------------------------------
        // BUMPING OTHER DOGS
        // ---------------------------------

        const mySize = dogConfig.size ?? 1;
        const myMass = dogMass(dogConfig);
        const myVelocity = forward
          .clone()
          .multiplyScalar(currentSpeed)
          .add(knock);
        const push = new THREE.Vector3();

        remotePlayers.forEach((remote) => {
          if (!remote.group.visible) return; // Dogs travelling underground cannot be bumped.
          const other = remote.group.position;
          const otherSize = remote.config.size ?? 1;
          const lift = player.position.y - other.y;

          // One dog is jumping clean over the other
          if (
            lift > CONTACT.clearHeight * otherSize ||
            -lift > CONTACT.clearHeight * mySize
          ) {
            return;
          }

          const hit = dogOverlap(
            player.position,
            player.rotation.y,
            mySize,
            other,
            remote.group.rotation.y,
            otherSize
          );

          if (!hit) return;

          // The lighter dog gives more of the ground
          const share =
            dogMass(remote.config) /
            (myMass + dogMass(remote.config));

          push.x += hit.x * hit.depth * share;
          push.z += hit.z * hit.depth * share;

          const fresh =
            performance.now() - remote.lastMoveTime <
            CONTACT.staleAfter * 1000;
          const closing =
            ((fresh ? remote.velocity.x : 0) - myVelocity.x) * hit.x +
            ((fresh ? remote.velocity.z : 0) - myVelocity.z) * hit.z;

          if (closing > 0) {
            // Thrown the way the other dog was driving, harder the faster
            // they met.  Topped up to that speed, never stacked every frame.
            const wanted = closing * (1 + CONTACT.bounce) * share;
            const already = knock.x * hit.x + knock.z * hit.z;

            if (already < wanted) {
              knock.x += hit.x * (wanted - already);
              knock.z += hit.z * (wanted - already);
            }
          }
        });

        knock.clampLength(0, CONTACT.maxKnock);
        push.addScaledVector(knock, delta);
        knock.multiplyScalar(Math.exp(-CONTACT.fade * delta));

        if (push.lengthSq() > 1e-10) {
          const from = player.position.clone();
          const to = from.clone().add(push);

          if (blockedByObstacle(from, to)) {
            knock.set(0, 0, 0);
          } else {
            player.position.copy(to);
          }
        }

        // Slide along the coastal banks and dunes; exposed cliff edges remain open.
        let coastalSurface = coastalTrack?.query(player.position.x, player.position.z);
        if (coastalSurface?.blocked) {
          player.position.x = coastalSurface.clampX;
          player.position.z = coastalSurface.clampZ;
          coastalSurface = coastalTrack.query(player.position.x, player.position.z);
        }
        if (coastalSurface) {
          currentSpeed = Math.min(currentSpeed, sprintSpeed * coastalTrack.speedFactor(coastalSurface, coastalStats)
            * (performance.now() < recoveryUntil ? coastalTrack.rules.respawnSpeedMultiplier : 1));
        }

        // Recheck at the new location, so the slowdown begins immediately.
        offTrack = !(isJumping && !jumpedFromOffTrack) && !isTrackSurface(player.position);
        const poolNow = woodland && woodlandWaterAt(player.position.x, player.position.z, player.position.y);
        const swimming = Boolean(poolNow?.swimming) && !isJumping;
        const wading = !isJumping && (poolNow?.inWater || (offTrack && isOverWater(player.position)));
        if (poolNow?.inWater && !isJumping) {
          currentSpeed = Math.min(currentSpeed, sprintSpeed * woodlandSwimMultiplier(stats.swimming)
            * goldenBones.speedMultiplier() * (performance.now() < stunUntil ? 0.15 : 1));
        }
        inBog = Boolean(woodland && !(isJumping && !jumpedFromOffTrack) && woodlandBogAt(player.position.x, player.position.z));
        if (inBog) currentSpeed = Math.min(currentSpeed, sprintSpeed * BOG_SPEED);
        if (offTrack) {
          const offTrackLimit = sprintSpeed *
            (wading ? waterSpeed : OFF_TRACK_SPEED_MULTIPLIER);
          currentSpeed = Math.min(currentSpeed, offTrackLimit);
        }
        if (surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = wading
            ? poolNow ? swimming ? 'SWIMMING' : 'WADING' : 'IN THE WATER — JUMP IT NEXT TIME'
            : offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK';
          surfaceDisplayRef.current.style.color = wading
            ? '#8fd0ff'
            : offTrack ? '#ffbc75' : '#9fe49b';
        }

        // ---------------------------------
        // LOST? Off the track or running the wrong way for 5 s: back to the last checkpoint
        // ---------------------------------

        lineCheckTimer -= delta;
        if (lineCheckTimer <= 0) {
          lineCheckTimer = 0.1;
          const line = racingLineAt(pickupMapId, player.position.x, player.position.z, lineS);
          lineS = line?.s ?? null;
          // which way the dog is actually moving (reversing counts), against the way the race goes
          const moving = Math.abs(currentSpeed) > 2;   // reversing (up to 2.5 m/s) counts too
          const along = Math.cos(travelYaw - (line?.rotationY ?? travelYaw)) * Math.sign(currentSpeed);
          wrongWayNow = Boolean(line) && moving && along < -0.4;
        }
        offTrackFor = offTrack ? offTrackFor + delta : 0;      // (hopping about off the road counts as lost too)
        wrongWayFor = wrongWayNow ? wrongWayFor + delta : 0;
        const lostFor = Math.max(offTrackFor, wrongWayFor);
        if (lostFor >= RESCUE_AFTER && !rescuePending) {
          rescuePending = true;
          socket.emit('requestRescue', response => {
            if (!response?.success) { rescuePending = false; offTrackFor = wrongWayFor = 0; }
          });
        }
        if (rescueDisplayRef.current) {
          const show = lostFor > 1.5 && !rescuePending;
          rescueDisplayRef.current.hidden = !show;
          if (show) {
            rescueDisplayRef.current.textContent = `${wrongWayFor >= offTrackFor ? 'WRONG WAY' : 'OFF TRACK'} — back to your checkpoint in ${Math.ceil(RESCUE_AFTER - lostFor)}`;
          }
        }

        // ---------------------------------
        // JUMPING
        // ---------------------------------

        if (special?.flyHeight) {
          // Ralph's rocket paws: up to flying height and held there, over the other dogs and
          // anything on the road; when they go out he drops and lands in his stride
          isJumping = true;
          isLanding = false;
          jumpedFromOffTrack = false;          // flying is flying, wherever he took off
          verticalVelocity = 0;
          jumpGravity = gravity;
          jumpHeight += (special.flyHeight - jumpHeight) * (1 - Math.exp(-4 * delta));
        } else if (isJumping) {
          verticalVelocity -=
            jumpGravity * delta;

          jumpHeight +=
            verticalVelocity * delta;

          if (jumpHeight <= 0) {
            jumpHeight = 0;
            verticalVelocity = 0;
            isJumping = false;

            // Landing at a run goes straight back into the stride; only a
            // standing jump plays the settle-and-stand landing
            if (
              Math.abs(currentSpeed) > RUNNING_JUMP_SPEED
            ) {
              isLanding = false;
            } else {
              isLanding = true;
              playAnimation('Land');
            }
          }
        }

        // ---------------------------------
        // FOLLOW THE GROUND
        // ---------------------------------

        // Over a dip (the stream) a jumping dog keeps the height it took off
        // from; it only meets lower ground once it comes down
        const groundBelow = groundHeightAt(player.position, groundY);
        // ...except down Frostpeak's black run, where that would sail the dog out level over a
        // 45 % slope: there a jump is a hop that follows the mountain down
        const groundNow = isJumping && !steepRun && !special?.flyHeight   // (flying, he follows the ground)
          ? Math.max(groundBelow, groundY)
          : groundBelow;

        // Ease onto the new height so tile edges and kerbs do not jolt the dog,
        // but go straight there after a big change (a respawn, a drop)
        groundY =
          Math.abs(groundNow - groundY) > 2.5
            ? groundNow
            : groundY +
              (groundNow - groundY) *
                (1 - Math.exp(-22 * delta));

        player.position.y = groundY + jumpHeight;

        // Slope under the dog, from the ground a stride ahead
        const ahead = player.position
          .clone()
          .addScaledVector(forward, 1.6);
        ahead.y = groundY;

        const slopeNow =
          (groundHeightAt(ahead, groundY) - groundY) / 1.6;

        slope +=
          (THREE.MathUtils.clamp(slopeNow, steepRun ? -0.55 : -0.4, 0.4) - slope) *
          (1 - Math.exp(-8 * delta));

        // ---------------------------------
        // DOG ANIMATIONS
        // ---------------------------------

        const isMoving =
          Math.abs(currentSpeed) >
          0.1;

        if (
          !isJumping &&
          !isLanding &&
          !specials.animating(socket.id)       // a special plays its own clips
        ) {
          // A little overlap between strides stops them flickering
          // The stride follows the speed, as a dog's does.  A little overlap
          // between strides stops them flickering at the changeover.
          // A short-legged dog changes stride at lower speeds
          const bands = dogConfig.strideBands ?? 1;
          const pace = Math.abs(currentSpeed) / bands;
          const holding = (name, margin) =>
            currentAnimation === name ? margin : 0;

          if (swimming) {
            playAnimation('Trot');
          } else if (!isMoving) {
            // turning on the spot: it steps round rather than swivelling like a statue
            playAnimation(Math.abs(steer) > 0.3 ? 'Walk' : 'Idle');
          } else if (
            pace <
            HANDLING.walkBelow + holding('Walk', 0.5)
          ) {
            playAnimation('Walk');
          } else if (
            pace <
            HANDLING.trotBelow + holding('Trot', 0.7)
          ) {
            playAnimation('Trot');
          } else if (
            pace >
            HANDLING.runBelow - holding('Sprint', 1.0)
          ) {
            playAnimation('Sprint');
          } else {
            playAnimation('Run');
          }
        }

        if (currentAction && !specials.animating(socket.id)) {
          currentAction.timeScale = swimming ? (isMoving ? 1.1 : 0.6) :
            gaitTimeScale(
              currentAction,
              currentSpeed,
              dogConfig
            );
        }

        if (dogMixer) {
          dogMixer.update(delta);

          applyTurnPose(
            dogModel,
            dogBones,
            steer * steeringFactor,
            effort
          );

          // Nose up the hills and down the far side (not while in the air)
          if (dogModel) {
            dogModel.rotation.x = swimming ? -0.06 : isJumping
              ? 0
              : -Math.atan(slope);
          }
        }

        if (woodland && surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = woodlandPlankAt(player.position.x, player.position.z, player.position.y)
            ? 'TIGHTROPE — STAY ON IT!'
            : swimming
            ? localPlayer.dog === 'black_lab' ? 'POPPY’S WATER DASH' : 'SWIMMING'
            : wading ? 'WADING'
            : inBog ? 'BOG — SWIM OR TAKE THE PLANK'
            : performance.now() < burrowBoostUntil ? 'BURROW EXIT BOOST!'
            : goldenBones.isBoosting() ? 'GOLDEN BONE BOOST!'
            : offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK';
          surfaceDisplayRef.current.style.color = wading ? '#9de5df' : '#cbe4ae';
        }
        if (steepRun && !offTrack && surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = performance.now() < launchBoostUntil ? 'LANDING BOOST!'
            : goldenBones.isBoosting() ? 'GOLDEN BONE BOOST!'
            : slope < -0.2 ? 'BLACK RUN — FULL SEND!' : 'ON TRACK';
          surfaceDisplayRef.current.style.color = slope < -0.2 ? '#ffd166' : '#9fe49b';
        }
        if (proceduralTrack && surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = performance.now() < recoveryUntil
            ? 'RECOVERING — REDUCED SPEED'
            : performance.now() < launchBoostUntil ? 'LANDING BOOST!'
            : goldenBones.isBoosting() ? 'GOLDEN BONE BOOST!'
            : offTrack ? 'OFF THE EDGE'
            : coastalSurface?.movement === 'swim' ? 'SWIMMING'
            : coastalSurface?.movement === 'wade' ? 'WADING'
            : coastalSurface?.mud ? 'MUD — SLOW GOING'
            : coastalSurface?.surface === 'shoulder' || coastalSurface?.surface === 'verge' ? 'SOFT GROUND — SLOWDOWN' : 'ON TRACK';
          surfaceDisplayRef.current.style.color = coastalSurface?.inWater ? '#8fd0ff'
            : offTrack || coastalSurface?.mud || coastalSurface?.surface === 'shoulder' || coastalSurface?.surface === 'verge' ? '#ffbc75' : '#9fe49b';
        }
        if (special && surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = `${special.name.toUpperCase()}!`;
          surfaceDisplayRef.current.style.color = '#ffe45c';
        }
      }

      // ---------------------------------
      // NETWORK UPDATES
      // ---------------------------------

      networkTimer += delta;

      if (
        networkTimer >= 0.05
      ) {
        networkTimer = 0;

        socket.emit(
          'playerMove',
          {
            position:
              player.position.toArray(),
            rotation:
              player.rotation.y,
            animation:
              currentAnimation,
            respawnRevision
          }
        );
      }

      // ---------------------------------
      // REMOTE PLAYER UPDATES
      // ---------------------------------

      remotePlayers.forEach(
        (remote, remoteId) => {
          const smoothing =
            1 -
            Math.exp(
              -12 * delta
            );

          remote.group.position.lerp(
            remote.targetPosition,
            smoothing
          );

          const rotationDifference =
            Math.atan2(
              Math.sin(
                remote.targetRotation -
                  remote.group.rotation.y
              ),
              Math.cos(
                remote.targetRotation -
                  remote.group.rotation.y
              )
            );

          remote.group.rotation.y +=
            rotationDifference *
            smoothing;

          if (
            remote.currentAction &&
            !specials.animating(remoteId)
          ) {
            remote.currentAction.timeScale = woodland && woodlandWaterAt(remote.group.position.x, remote.group.position.z, remote.group.position.y)?.swimming
              ? (remote.speed > 0.1 ? 1.1 : 0.6) : gaitTimeScale(
                remote.currentAction,
                remote.speed,
                remote.config
              );
          }

          remote.steer +=
            (remote.steerTarget - remote.steer) *
            (1 -
              Math.exp(
                -HANDLING.steerResponse * delta
              ));

          if (remote.mixer) {
            remote.mixer.update(
              delta
            );

            applyTurnPose(
              remote.dog,
              remote.bones,
              remote.steer,
              sprintFraction(
                remote.speed,
                runSpeed,
                sprintSpeed
              )
            );
          }
        }
      );

      // Special abilities: their clips, effects and timing, for every dog (after the dogs have moved)
      specials.update(delta);

      // ---------------------------------
      // THIRD-PERSON CAMERA
      // ---------------------------------

      const rotatedOffset =
        cameraOffset.clone();

      rotatedOffset.applyQuaternion(
        player.quaternion
      );

      const targetPosition =
        player.position
          .clone()
          .add(rotatedOffset);

      const cameraLerp =
        1 -
        Math.exp(
          -cameraSmoothness *
            delta
        );

      if (launchFlight) camera.position.copy(targetPosition);
      else camera.position.lerp(targetPosition, cameraLerp);

      const lookTarget =
        player.position.clone();

      lookTarget.y +=
        cameraLookHeight;

      camera.lookAt(
        lookTarget
      );

      renderer.render(
        scene,
        camera
      );
    }

    animate();

    // ---------------------------------
    // CLEANUP
    // ---------------------------------

    return () => {
      isMounted = false;
      mapAbort.abort();

      cancelAnimationFrame(
        animationId
      );

      socket.off(
        'playerMoved',
        handlePlayerMoved
      );

      socket.off(
        'playerLeft',
        handlePlayerLeft
      );
      socket.off('treatBoxChanged', handleTreatBoxChanged);
      socket.off('goldenBoneTaken', handleGoldenBoneTaken);
      socket.off('goldenBoneRespawned', handleGoldenBoneRespawned);
      for (const [event, handler] of Object.entries(itemEvents)) socket.off(event, handler);
      socket.off('playerBurrowEntered', handleBurrowEntered);
      socket.off('playerBurrowExited', handleBurrowExited);
      socket.off('playerLaunched', handlePlayerLaunched);
      socket.off('playerLanded', handlePlayerLanded);
      socket.off('playerFell', handlePlayerFell);
      socket.off('playerRespawned', handlePlayerRespawned);
      restoreEnvironment?.();
      proceduralWorld?.dispose();
      woodlandWorld?.dispose();
      burrowOverlay.remove();
      treatBoxes.dispose();
      items.dispose();
      specials.dispose();
      minimap.dispose();
      goldenBones.dispose();

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );

      window.removeEventListener(
        'keyup',
        handleKeyUp
      );
      window.removeEventListener('blur', clearKeys);
      renderer.domElement.removeEventListener('wheel', handleWheel);

      timer.disconnect();

      if (
        renderer.domElement.parentNode ===
        container
      ) {
        container.removeChild(
          renderer.domElement
        );
      }

      renderer.dispose();
    };
  }, [session]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#87ceeb'
      }}
    >
      {/* Three.js canvas container */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0
        }}
      />

      {/* Course map, bottom left: where every dog is on the lap */}
      <canvas
        ref={minimapRef}
        aria-label="Course map"
        style={{ position: 'absolute', left: 16, bottom: 16, pointerEvents: 'none' }}
      />

      <Standings standings={state.standings} socketId={state.socketId} />

      {/* Lost: off the track or the wrong way, counting down to the rescue */}
      <div ref={rescueDisplayRef} className="race-rescue" role="status" hidden />
      {state.frisbeesIncoming.length > 0 && <div className="race-incoming" role="alert">FRISBEE INCOMING!</div>}

      <HudPanel state={state} speedRef={speedDisplayRef} timerRef={timerDisplayRef} surfaceRef={surfaceDisplayRef} />
      <CountdownOverlay racePhase={state.racePhase} />
      <ResultsPanel session={session} finishTime={state.finishTime} lobbyReturnAt={state.lobbyReturnAt} />
    </div>
  );
}
