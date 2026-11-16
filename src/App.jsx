
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { io } from 'socket.io-client';
import { MAPS, DEFAULT_MAP, sampleGroundHeight } from '../shared/maps.js';
import { prepareHeadLook, applyHeadLook } from './headLook.js';

// ---------------------------------
// DOG CONFIGURATION
// ---------------------------------

const DOGS = {
  gsp: {
    name: 'Pippa (German Shorthaired Pointer)',
    model: '/models/gsp_female.glb',
    scale: 3,
    // Speed (model metres per second) at which each stride plays at its
    // natural rhythm: the top of the speed band that stride is used in
    // Ground speed (model metres per second) of each captured stride: at
    // this speed the paws neither slip nor skate (gsp_female/clip_info.json)
    gaitSpeed: {
      Walk: 1.23,
      Trot: 2.09,
      Run: 3.66,
      Sprint: 5.7
    }
  },
  second_dog: {
    name: 'Meela (Greyhound)',
    model: '/models/meela_greyhound.glb',
    scale: 3,
    // meela_greyhound/clip_info.json
    gaitSpeed: {
      Walk: 1.52,
      Trot: 2.587,
      Run: 4.536,
      Sprint: 7.06
    }
  },
  black_lab: {
    name: 'Poppy (Black Labrador)',
    model: '/models/black_lab.glb',
    scale: 3,
    // black_lab/clip_info.json
    gaitSpeed: {
      Walk: 1.21,
      Trot: 2.05,
      Run: 3.6,
      Sprint: 5.6
    }
  },
  pablo: {
    name: 'Pablo (Alaskan Klee Kai)',
    model: '/models/pablo.glb',
    scale: 3,
    size: 0.7,
    strideBands: 0.7,
    maxStrideRate: 1.6,
    cameraOffset: [0, 3.1, -6.4],
    cameraLookHeight: 1.3,
    // pablo_klee_kai/clip_info.json (exported at 70% of the build frame)
    gaitSpeed: {
      Walk: 0.844,
      Trot: 1.436,
      Run: 2.518,
      Sprint: 3.919
    }
  },
  ralph: {
    name: 'Ralph (Dachshund)',
    model: '/models/ralph.glb',
    scale: 3,
    // A dachshund stands about a third as tall as the pointer.  `size`
    // scales the collision rays (so he fits the small-dog tunnel), and the
    // speeds at which he changes stride: short legs break into a gallop
    // much sooner.  His legs also turn over faster than a big dog's can.
    size: 0.45,
    strideBands: 0.5,
    maxStrideRate: 2.0,
    cameraOffset: [0, 2.6, -5.6],
    cameraLookHeight: 0.9,
    // ralph_dachshund/clip_info.json
    gaitSpeed: {
      Walk: 0.39,
      Trot: 0.66,
      Run: 1.16,
      Sprint: 1.8
    }
  }
};

// ---------------------------------
// HANDLING
// ---------------------------------
// How a dog steers.  A dog at full stretch cannot spin on the spot: it
// carves an arc, leans and bends into it, and has to ease off to turn tight.

const HANDLING = {
  turnRateSlow: 2.6,    // turning speed at a walk or trot (radians per second)
  turnRateSprint: 1.5,  // turning speed flat out: lower = wider arcs
  steerResponse: 5,     // how quickly a turn builds and fades: lower = heavier
  turnSpeedLoss: 0.22,  // share of top speed lost while turning hard at a sprint
  gripSlow: 16,         // how tightly travel follows the nose at low speed
  gripSprint: 5,        // ...and flat out: lower = more drift through a turn
  lean: 0.2,            // body roll into a turn (radians)
  bend: 0.07,           // how far the spine, neck and tail curve into a turn
  fullSteerSpeed: 4,    // below this speed the dog turns less (it cannot spin standing still)
  // Which stride is used at which speed.  These follow a real dog: walk to
  // about 1.5 m/s, trot to about 2.8, canter to about 4.5, then gallop
  // (multiplied by the dogs' scale of 3)
  hillEffect: 0.9,      // how much a slope changes top speed (0 = hills are free)
  walkBelow: 4.6,
  trotBelow: 8.5,
  runBelow: 13.5
};

// The rigs' sideways bone axis points so that a negative turn bends the body left
const BEND_SIGN = -1;

// Bones that curve into a turn, and how much each one takes
const BEND_BONES = [
  ['spine1', 0.6],
  ['spine2', 0.8],
  ['chest', 0.8],
  ['neck1', 1.1],
  ['neck2', 1.1],
  ['head', 0.9],
  ['hips', 0.7],
  ['tail1', 1.4],
  ['tail2', 1.2],
  ['tail3', 1.0]
];

const TOTAL_LAPS = 3;
const GAITS = new Set(['Walk', 'Trot', 'Run', 'Sprint']);

// Above this speed a jump is a running leap: no crouch first, no pause after
const RUNNING_JUMP_SPEED = 3.0;

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  window.location.origin;

// ---------------------------------
// ANIMATION HELPERS
// ---------------------------------

function switchAction(actions, current, name) {
  // Dogs without a walk or trot clip fall back to the next stride up
  const next =
    actions[name] ||
    (name === 'Walk' ? actions.Trot || actions.Run : null) ||
    (name === 'Trot' ? actions.Run : null);

  if (!next || next === current) {
    return current;
  }

  const inStride =
    current &&
    GAITS.has(current.getClip().name) &&
    GAITS.has(next.getClip().name);

  // Coming down from a jump into a stride: pick the stride up just before
  // the front paws strike (the strides start on a hind paw), and blend quickly
  const fromJump =
    current &&
    current.getClip().name === 'Jump' &&
    GAITS.has(next.getClip().name);

  const phase = inStride
    ? (current.time / current.getClip().duration) % 1
    : fromJump
      ? 0.15
      : 0;

  const fade = fromJump ? 0.12 : 0.2;

  if (current) {
    current.fadeOut(fade);
  }

  next.reset();

  if (inStride || fromJump) {
    next.time = phase * next.getClip().duration;
  }

  next.fadeIn(fade);
  next.play();

  return next;
}

function gaitTimeScale(action, speed, config) {
  const clipName = action.getClip().name;
  const natural = config.gaitSpeed?.[clipName];

  if (!GAITS.has(clipName) || !natural) {
    return 1;
  }

  const rate = THREE.MathUtils.clamp(
    Math.abs(speed) / (natural * config.scale),
    0.7,
    config.maxStrideRate ?? 1.3
  );

  return speed < 0 ? -rate : rate;
}

// 0 at an easy run, 1 flat out
function sprintFraction(speed, runSpeed, sprintSpeed) {
  return THREE.MathUtils.clamp(
    (Math.abs(speed) - runSpeed * 0.5) /
      (sprintSpeed - runSpeed * 0.5),
    0,
    1
  );
}

function collectBones(root) {
  const bones = {};

  root.traverse((object) => {
    if (object.isBone) {
      bones[object.name] = object;
    }
  });

  prepareHeadLook(root, bones);
  return bones;
}

// Lean the dog and curve its body into a turn.  Call after the animation
// mixer has updated: the mixer resets the bones every frame.
// steer: -1 (right) to 1 (left).  effort: 0 to 1, how hard the dog is running.
function applyTurnPose(model, bones, steer, effort) {
  if (!model) return;

  model.rotation.z =
    -steer * HANDLING.lean * (0.35 + 0.65 * effort);

  const bend =
    steer * HANDLING.bend * (0.5 + 0.5 * effort);

  for (const [name, weight] of BEND_BONES) {
    const bone = bones[name];

    if (bone) {
      bone.rotateZ(BEND_SIGN * bend * weight);
    }
  }
  applyHeadLook(model, steer);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds % 60)
    .toFixed(1)
    .padStart(4, '0');

  return `${minutes}:${remaining}`;
}

// ---------------------------------
// APP
// ---------------------------------

function App() {
  const containerRef = useRef(null);
  const socketRef = useRef(null);
  const roomRef = useRef(null);

  const singlePlayerRef = useRef(false);
  const raceGoRef = useRef(false);
  const raceFinishedRef = useRef(false);
  const raceStartRef = useRef(null);

  const speedDisplayRef = useRef(null);
  const timerDisplayRef = useRef(null);
  const surfaceDisplayRef = useRef(null);

  const [screen, setScreen] = useState('menu');
  const [selectedMap, setSelectedMap] = useState(DEFAULT_MAP);
  const [room, setRoom] = useState(null);

  const [roomCodeInput, setRoomCodeInput] =
    useState('');

  const [socketId, setSocketId] = useState(null);

  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);

  const [racePhase, setRacePhase] =
    useState('');

  const [lap, setLap] = useState(1);
  const [checkpoint, setCheckpoint] = useState(0);
  const [totalCheckpoints, setTotalCheckpoints] =
    useState(5);

  const [finishTime, setFinishTime] =
    useState(null);

  // ---------------------------------
  // SOCKET CONNECTION
  // ---------------------------------

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    function handleConnect() {
      console.log('Connected:', socket.id);
      setConnected(true);
      setSocketId(socket.id);
    }

    function handleDisconnect() {
      setConnected(false);
      setSocketId(null);
    }

    function handleLobbyUpdated(updatedRoom) {
      roomRef.current = updatedRoom;
      setRoom(updatedRoom);
    }

    function handleRaceStarted(data) {
      console.log('Race loading:', data);

      raceGoRef.current = false;
      raceFinishedRef.current = false;
      raceStartRef.current = null;

      setRacePhase('Loading...');
      setTotalCheckpoints(data.totalCheckpoints ?? MAPS[data.mapId ?? DEFAULT_MAP].checkpoints.length);
      setLap(1);
      setCheckpoint(0);
      setFinishTime(null);

      const updatedRoom = {
        ...roomRef.current,
        status: 'loading',
        mapId: data.mapId ?? DEFAULT_MAP,
        players: data.players
      };

      roomRef.current = updatedRoom;
      setRoom(updatedRoom);
      setScreen('race');
    }

    function handleRaceCountdown(data) {
      console.log('Countdown:', data.number);
      setRacePhase(String(data.number));
    }

    function handleRaceGo() {
      console.log('GO!');

      raceStartRef.current = performance.now();
      raceGoRef.current = true;

      setRacePhase('GO!');
    }

    function handleRaceProgress(data) {
      if (data.playerId !== socket.id) return;

      setLap(data.lap);
      setCheckpoint(data.checkpoint);

      if (data.totalCheckpoints !== undefined) {
        setTotalCheckpoints(data.totalCheckpoints);
      }

      if (data.finished) {
        raceFinishedRef.current = true;
        raceGoRef.current = false;

        setFinishTime(data.finishTime);
        setRacePhase('FINISHED!');
      }
    }

    function handlePlayerFinished(data) {
      if (data.playerId === socket.id) {
        console.log(
          'Your finish time:',
          data.finishTime
        );
      } else {
        console.log(
          `${data.name} finished in ${data.finishTime}s`
        );
      }
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    socket.on(
      'lobbyUpdated',
      handleLobbyUpdated
    );

    socket.on(
      'raceStarted',
      handleRaceStarted
    );

    socket.on(
      'raceCountdown',
      handleRaceCountdown
    );

    socket.on('raceGo', handleRaceGo);

    socket.on(
      'raceProgress',
      handleRaceProgress
    );

    socket.on(
      'playerFinished',
      handlePlayerFinished
    );

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('lobbyUpdated', handleLobbyUpdated);
      socket.off('raceStarted', handleRaceStarted);
      socket.off('raceCountdown', handleRaceCountdown);
      socket.off('raceGo', handleRaceGo);
      socket.off('raceProgress', handleRaceProgress);
      socket.off('playerFinished', handlePlayerFinished);

      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ---------------------------------
  // HOST GAME
  // ---------------------------------

  function hostGame() {
    singlePlayerRef.current = false;
    setError('');

    socketRef.current.emit(
      'hostGame',
      { mapId: selectedMap },
      (response) => {
        if (!response?.success) {
          setError(
            response?.error || 'Failed to host game'
          );
          return;
        }

        roomRef.current = response.room;
        setRoom(response.room);
        setScreen('selection');
      }
    );
  }

  // ---------------------------------
  // SINGLE PLAYER
  // ---------------------------------

  function singlePlayer() {
    setError('');

    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }

    singlePlayerRef.current = true;

    socketRef.current.emit(
      'hostGame',
      { mapId: selectedMap },
      (response) => {
        if (!response?.success) {
          singlePlayerRef.current = false;

          setError(
            response?.error ||
            'Failed to create single-player game'
          );

          return;
        }

        roomRef.current = response.room;
        setRoom(response.room);
        setScreen('selection');
      }
    );
  }

  // ---------------------------------
  // JOIN GAME
  // ---------------------------------

  function joinGame() {
    singlePlayerRef.current = false;
    setError('');

    socketRef.current.emit(
      'joinGame',
      { roomCode: roomCodeInput },
      (response) => {
        if (!response?.success) {
          setError(
            response?.error || 'Failed to join game'
          );
          return;
        }

        roomRef.current = response.room;
        setRoom(response.room);
        setScreen('selection');
      }
    );
  }

  // ---------------------------------
  // MAP AND DOG SELECTION
  // ---------------------------------

  function selectMap(mapId) {
    setError('');
    socketRef.current?.emit('selectMap', { mapId }, (response) => {
      if (!response?.success) setError(response?.error || 'Failed to select map');
    });
  }

  function selectDog(dogId) {
    setError('');

    const socket = socketRef.current;

    if (!socket?.connected) {
      setError('Not connected to server');
      return;
    }

    socket.emit(
      'selectDog',
      { dog: dogId },
      (response) => {
        if (!response?.success) {
          setError(
            response?.error ||
            'Failed to select dog'
          );
          return;
        }

        // Normal multiplayer lobby
        if (!singlePlayerRef.current) {
          setScreen('lobby');
          return;
        }

        // Single player: automatically ready up
        socket.emit(
          'setReady',
          { ready: true },
          (readyResponse) => {
            if (!readyResponse?.success) {
              setError(
                readyResponse?.error ||
                'Failed to ready up'
              );
              return;
            }

            // Automatically start the race
            socket.emit(
              'startRace',
              (startResponse) => {
                if (!startResponse?.success) {
                  setError(
                    startResponse?.error ||
                    'Failed to start race'
                  );
                }
              }
            );
          }
        );
      }
    );
  }

  // ---------------------------------
  // READY UP
  // ---------------------------------

  function toggleReady() {
    const player = room?.players.find(
      (p) => p.id === socketRef.current?.id
    );

    socketRef.current.emit(
      'setReady',
      { ready: !player?.ready },
      (response) => {
        if (!response?.success) {
          setError(response?.error);
        }
      }
    );
  }

  // ---------------------------------
  // START RACE
  // ---------------------------------

  function startRace() {
    setError('');

    socketRef.current.emit(
      'startRace',
      (response) => {
        if (!response?.success) {
          setError(
            response?.error ||
            'Failed to start race'
          );
        }
      }
    );
  }

  // ---------------------------------
  // LEAVE GAME
  // ---------------------------------

  function leaveGame() {
    singlePlayerRef.current = false;
    raceGoRef.current = false;
    raceFinishedRef.current = false;
    raceStartRef.current = null;

    roomRef.current = null;

    socketRef.current?.emit('leaveGame');

    setRoom(null);
    setError('');
    setRacePhase('');
    setFinishTime(null);
    setScreen('menu');
  }

  // ---------------------------------
  // THREE.JS GAME
  // ---------------------------------

  useEffect(() => {
    if (screen !== 'race') return;

    const container = containerRef.current;
    const socket = socketRef.current;
    const currentRoom = roomRef.current;

    if (!container || !socket || !currentRoom) {
      return;
    }

    const map = MAPS[currentRoom.mapId ?? DEFAULT_MAP];

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
    let heightmap = null;

    function isTrackSurface(position) {
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
        for (const offset of origins) {
          const origin = from.clone().add(offset);
          obstacleRaycaster.set(origin, movement);
          obstacleRaycaster.near = 0;
          obstacleRaycaster.far = sweepLength;
          if (obstacleRaycaster.intersectObject(mesh, false).length > 0) {
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
        setRacePhase(
          `Failed to load ${name}`
        );
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

    Promise.all([loader.loadAsync(map.model), heightmapRequest]).then(
      ([gltf, heights]) => {
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

      playRemoteAnimation(
        remote,
        data.animation
      );
    }

    function handlePlayerLeft(data) {
      const remote = remotePlayers.get(
        data.playerId
      );

      if (!remote) return;

      scene.remove(remote.group);
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

    // ---------------------------------
    // MOVEMENT SETTINGS
    // ---------------------------------

    // Real dog speeds at the dogs' scale of 3: an easy canter and a gallop
    const runSpeed = 11;
    const sprintSpeed = 17;
    const reverseSpeed = 2.5;

    const acceleration = 14;
    const braking = 22;
    const friction = 9;

    let currentSpeed = 0;

    const forwardDirection =
      new THREE.Vector3(0, 0, 1);

    const jumpForce = 7;
    const gravity = 16;

    // ---------------------------------
    // KEYBOARD AND MOUSE CONTROLS
    // ---------------------------------

    const keys = {};
    const controlKeys = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space'
    ]);

    function tryJump() {
      if (
        !raceGoRef.current ||
        raceFinishedRef.current ||
        isJumping ||
        !dogMixer
      ) {
        return;
      }

      isJumping = true;
      isLanding = false;
      verticalVelocity = jumpForce;
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
      if (!raceGoRef.current || raceFinishedRef.current) return;

      keys[event.code] = true;
      if (event.code === 'Space' && !event.repeat) tryJump();
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

      const canMove =
        raceGoRef.current &&
        !raceFinishedRef.current;

      // ---------------------------------
      // RACE TIMER
      // ---------------------------------

      if (
        raceStartRef.current !== null &&
        timerDisplayRef.current &&
        !raceFinishedRef.current
      ) {
        const elapsed =
          (performance.now() -
            raceStartRef.current) /
          1000;

        timerDisplayRef.current.textContent =
          formatTime(elapsed);

        if (
          elapsed >= 1 &&
          !goBannerCleared
        ) {
          goBannerCleared = true;
          setRacePhase('');
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

      // ---------------------------------
      // ACCELERATION AND BRAKING
      // ---------------------------------

      // In the air the dog is off nothing: that is how the stream is cleared
      offTrack = !isJumping && !isTrackSurface(player.position);
      const terrainMultiplier = offTrack ? OFF_TRACK_SPEED_MULTIPLIER : 1;
      // A climb takes a little off the top speed, a descent gives a little back
      const hillMultiplier = THREE.MathUtils.clamp(
        1 - HANDLING.hillEffect * slope,
        0.8,
        1.08
      );
      const maxSpeed =
        sprintSpeed *
        terrainMultiplier *
        hillMultiplier;
      const effectiveAcceleration = acceleration *
        (offTrack ? OFF_TRACK_ACCELERATION_MULTIPLIER : 1);
      if (surfaceDisplayRef.current) {
        surfaceDisplayRef.current.textContent = offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK';
        surfaceDisplayRef.current.style.color = offTrack ? '#ffbc75' : '#9fe49b';
      }

      if (keys.KeyW || keys.ArrowUp) {
        currentSpeed +=
          effectiveAcceleration * delta;

        currentSpeed = Math.min(
          currentSpeed,
          maxSpeed
        );
      } else if (keys.KeyS || keys.ArrowDown) {
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

      const turnInput =
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
        HANDLING.turnRateSlow,
        HANDLING.turnRateSprint,
        effort
      );

      player.rotation.y +=
        turnRate *
        steer *
        steeringFactor *
        delta;

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
        HANDLING.gripSprint,
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

      // Recheck at the new location, so the slowdown begins immediately.
      offTrack = !isJumping && !isTrackSurface(player.position);
      if (offTrack) {
        const offTrackLimit = sprintSpeed *
          OFF_TRACK_SPEED_MULTIPLIER;
        currentSpeed = Math.min(currentSpeed, offTrackLimit);
      }
      if (surfaceDisplayRef.current) {
        const wading = offTrack && isOverWater(player.position);
        surfaceDisplayRef.current.textContent = wading
          ? 'IN THE WATER — JUMP IT NEXT TIME'
          : offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK';
        surfaceDisplayRef.current.style.color = wading
          ? '#8fd0ff'
          : offTrack ? '#ffbc75' : '#9fe49b';
      }

      // ---------------------------------
      // JUMPING
      // ---------------------------------

      if (isJumping) {
        verticalVelocity -=
          gravity * delta;

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
      const groundNow = isJumping
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
        (THREE.MathUtils.clamp(slopeNow, -0.4, 0.4) - slope) *
        (1 - Math.exp(-8 * delta));

      // ---------------------------------
      // DOG ANIMATIONS
      // ---------------------------------

      const isMoving =
        Math.abs(currentSpeed) >
        0.1;

      if (
        !isJumping &&
        !isLanding
      ) {
        // A little overlap between strides stops them flickering
        // The stride follows the speed, as a dog's does.  A little overlap
        // between strides stops them flickering at the changeover.
        // A short-legged dog changes stride at lower speeds
        const bands = dogConfig.strideBands ?? 1;
        const pace = Math.abs(currentSpeed) / bands;
        const holding = (name, margin) =>
          currentAnimation === name ? margin : 0;

        if (!isMoving) {
          playAnimation('Idle');
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

      if (currentAction) {
        currentAction.timeScale =
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
          dogModel.rotation.x = isJumping
            ? 0
            : -Math.atan(slope);
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
              currentAnimation
          }
        );
      }

      // ---------------------------------
      // REMOTE PLAYER UPDATES
      // ---------------------------------

      remotePlayers.forEach(
        (remote) => {
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
            remote.currentAction
          ) {
            remote.currentAction.timeScale =
              gaitTimeScale(
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

      camera.position.lerp(
        targetPosition,
        cameraLerp
      );

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
  }, [screen]);

  // ---------------------------------
  // STYLES
  // ---------------------------------

  const pageStyle = {
    minHeight: '100vh',
    background: '#15251b',
    color: 'white',
    fontFamily:
      'Arial, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const panelStyle = {
    background: '#243b2c',
    padding: 32,
    borderRadius: 16,
    width: 420,
    maxWidth: '90vw',
    textAlign: 'center'
  };

  const buttonStyle = {
    background: '#70b76d',
    color: '#102016',
    border: 'none',
    padding: '14px 20px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 'bold',
    cursor: 'pointer',
    margin: 6
  };

  const hudStyle = {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    color: 'white',
    background:
      'rgba(10, 25, 15, 0.82)',
    border:
      '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: '16px 22px',
    minWidth: 170,
    fontFamily:
      'Arial, sans-serif',
    pointerEvents: 'none'
  };

  // ---------------------------------
  // MAIN MENU
  // ---------------------------------

  if (screen === 'menu') {
    return (
      <div style={pageStyle}>
        <div style={panelStyle}>
          <h1>Dog Racing</h1>
          <label htmlFor="menu-map">Choose map</label>
          <select
            id="menu-map"
            value={selectedMap}
            onChange={event => setSelectedMap(event.target.value)}
            style={{ display: 'block', width: '100%', padding: 12, marginTop: 8, fontSize: 16 }}
          >
            {Object.entries(MAPS).map(([id, map]) => <option key={id} value={id}>{map.name}</option>)}
          </select>
          <p>{MAPS[selectedMap].description}</p>

          <p>
            Server:{' '}
            {connected
              ? 'Connected'
              : 'Disconnected'}
          </p>

          <button
            style={buttonStyle}
            disabled={!connected}
            onClick={singlePlayer}
          >
            Single Player
          </button>

          <button
            style={buttonStyle}
            disabled={!connected}
            onClick={hostGame}
          >
            Host Game
          </button>

          <button
            style={buttonStyle}
            disabled={!connected}
            onClick={() =>
              setScreen('join')
            }
          >
            Join Game
          </button>

          {error && (
            <p style={{ color: 'salmon' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------
  // JOIN GAME
  // ---------------------------------

  if (screen === 'join') {
    return (
      <div style={pageStyle}>
        <div style={panelStyle}>
          <h2>Join Game</h2>

          <input
            placeholder="Enter room code"
            value={roomCodeInput}
            onChange={(e) =>
              setRoomCodeInput(
                e.target.value.toUpperCase()
              )
            }
            style={{
              padding: 12,
              fontSize: 18,
              width: '80%'
            }}
          />

          <div>
            <button
              style={buttonStyle}
              onClick={joinGame}
            >
              Join
            </button>

            <button
              style={buttonStyle}
              onClick={() =>
                setScreen('menu')
              }
            >
              Back
            </button>
          </div>

          {error && (
            <p style={{ color: 'salmon' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------
  // DOG SELECTION
  // ---------------------------------

  if (screen === 'selection') {
    return (
      <div style={pageStyle}>
        <div style={panelStyle}>
          <h2>Choose Your Dog</h2>
          <p>{MAPS[room?.mapId ?? DEFAULT_MAP].name}</p>

          {Object.entries(DOGS).map(
            ([id, dog]) => (
              <button
                key={id}
                style={{
                  ...buttonStyle,
                  display: 'block',
                  width: '100%'
                }}
                onClick={() =>
                  selectDog(id)
                }
              >
                {dog.name}
              </button>
            )
          )}

          <button
            style={buttonStyle}
            onClick={leaveGame}
          >
            Leave Game
          </button>

          {error && (
            <p style={{ color: 'salmon' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------
  // MULTIPLAYER LOBBY
  // ---------------------------------

  if (screen === 'lobby') {
    const myId = socketId;

    const myPlayer =
      room?.players.find(
        (p) => p.id === myId
      );

    const isHost =
      room?.hostId === myId;

    return (
      <div style={pageStyle}>
        <div style={panelStyle}>
          <h2>Game Lobby</h2>

          <h1>
            Room: {room?.code}
          </h1>

          <label htmlFor="lobby-map">Map {isHost ? '' : '(chosen by host)'}</label>
          <select
            id="lobby-map"
            value={room?.mapId ?? DEFAULT_MAP}
            disabled={!isHost}
            onChange={event => selectMap(event.target.value)}
            style={{ display: 'block', width: '100%', padding: 12, marginTop: 8, fontSize: 16 }}
          >
            {Object.entries(MAPS).map(([id, map]) => <option key={id} value={id}>{map.name}</option>)}
          </select>
          <p>{MAPS[room?.mapId ?? DEFAULT_MAP].description}</p>
          <h3>Players</h3>

          {room?.players.map(
            (player) => (
              <div
                key={player.id}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  background: '#34523b',
                  borderRadius: 8
                }}
              >
                <strong>
                  {player.name}
                  {player.id ===
                  room.hostId
                    ? ' (Host)'
                    : ''}
                </strong>

                <div>
                  {DOGS[
                    player.dog
                  ]?.name ||
                    'No dog selected'}
                </div>

                <div>
                  {player.ready
                    ? 'Ready'
                    : 'Not Ready'}
                </div>
              </div>
            )
          )}

          <button
            style={buttonStyle}
            onClick={toggleReady}
          >
            {myPlayer?.ready
              ? 'Cancel Ready'
              : 'Ready Up'}
          </button>

          {isHost && (
            <button
              style={buttonStyle}
              onClick={startRace}
            >
              Start Race
            </button>
          )}

          <button
            style={buttonStyle}
            onClick={leaveGame}
          >
            Leave Game
          </button>

          {error && (
            <p style={{ color: 'salmon' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------
  // RACE SCREEN
  // ---------------------------------

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

      {/* Race HUD */}
      <div style={hudStyle}>
        <div
          style={{
            fontSize: 12,
            color: '#b4c9b5',
            marginBottom: 6,
            letterSpacing: 1
          }}
        >
          {MAPS[room?.mapId ?? DEFAULT_MAP].name.toUpperCase()}
        </div>

        <div
          style={{
            fontSize: 26,
            fontWeight: 'bold',
            marginBottom: 12
          }}
        >
          LAP {lap}/{TOTAL_LAPS}
        </div>

        <div
          style={{
            fontSize: 12,
            color: '#b4c9b5',
            marginBottom: 3
          }}
        >
          SPEED
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            marginBottom: 12
          }}
        >
          <span
            ref={speedDisplayRef}
            style={{
              fontSize: 32,
              fontWeight: 'bold'
            }}
          >
            0.0
          </span>

          <span
            style={{
              fontSize: 14,
              color: '#b4c9b5'
            }}
          >
            km/h
          </span>
        </div>

        <div
          style={{
            fontSize: 12,
            color: '#b4c9b5',
            marginBottom: 3
          }}
        >
          RACE TIME
        </div>

        <div
          ref={timerDisplayRef}
          style={{
            fontSize: 25,
            fontFamily: 'monospace',
            fontWeight: 'bold',
            marginBottom: 12
          }}
        >
          0:00.0
        </div>

        <div
          style={{
            fontSize: 13,
            color: '#b4c9b5'
          }}
        >
          Checkpoints: {checkpoint}/{totalCheckpoints}
        </div>
        <div
          ref={surfaceDisplayRef}
          style={{ fontSize: 12, marginTop: 12, color: '#9fe49b', fontWeight: 'bold' }}
        >
          ON TRACK
        </div>
        <div style={{ fontSize: 11, marginTop: 14, color: '#b4c9b5', lineHeight: 1.6 }}>
          <div>W / ↑ accelerate · S / ↓ brake / reverse</div>
          <div>A / D or ← / → steer</div>
          <div>Space or scroll down to jump</div>
        </div>
      </div>

      {/* Countdown overlay */}
      {racePhase && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              fontSize:
                racePhase === 'Loading...'
                  ? 42
                  : 100,
              fontWeight: 900,
              fontFamily:
                'Arial, sans-serif',
              color:
                racePhase === 'GO!'
                  ? '#70e76d'
                  : racePhase === 'FINISHED!'
                    ? '#ffd966'
                    : 'white',
              textShadow:
                '0 4px 25px rgba(0,0,0,0.95)',
              textAlign: 'center'
            }}
          >
            {racePhase}
          </div>
        </div>
      )}

      {/* Finish result */}
      {finishTime !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: 35,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            background:
              'rgba(10,25,15,0.92)',
            color: 'white',
            borderRadius: 14,
            padding: '20px 35px',
            textAlign: 'center',
            minWidth: 250
          }}
        >
          <h2>
            Race Complete!
          </h2>

          <p>
            3 laps completed
          </p>

          <h1>
            {formatTime(finishTime)}
          </h1>

          <button
            style={buttonStyle}
            onClick={leaveGame}
          >
            Main Menu
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
