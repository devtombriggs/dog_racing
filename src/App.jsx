
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { io } from 'socket.io-client';

// ---------------------------------
// DOG CONFIGURATION
// ---------------------------------

const DOGS = {
  gsp: {
    name: 'German Shorthaired Pointer',
    model: '/models/gsp_female.glb',
    scale: 3,
    gaitSpeed: {
      Trot: 1.16,
      Run: 1.67,
      Sprint: 3.0
    }
  },
  second_dog: {
    name: 'Meela (Greyhound)',
    model: '/models/meela_greyhound.glb',
    scale: 3
  }
};

const TOTAL_LAPS = 3;
const GAITS = new Set(['Trot', 'Run', 'Sprint']);

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  window.location.origin;

// ---------------------------------
// ANIMATION HELPERS
// ---------------------------------

function switchAction(actions, current, name) {
  const next =
    actions[name] ||
    (name === 'Trot' ? actions.Run : null);

  if (!next || next === current) {
    return current;
  }

  const inStride =
    current &&
    GAITS.has(current.getClip().name) &&
    GAITS.has(next.getClip().name);

  const phase = inStride
    ? (current.time / current.getClip().duration) % 1
    : 0;

  if (current) {
    current.fadeOut(0.2);
  }

  next.reset();

  if (inStride) {
    next.time = phase * next.getClip().duration;
  }

  next.fadeIn(0.2);
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
    0.6,
    1.5
  );

  return speed < 0 ? -rate : rate;
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

  const [screen, setScreen] = useState('menu');
  const [room, setRoom] = useState(null);

  const [roomCodeInput, setRoomCodeInput] =
    useState('');

  const [selectedDog, setSelectedDog] =
    useState(null);

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
    }

    function handleDisconnect() {
      setConnected(false);
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
      setLap(1);
      setCheckpoint(0);
      setFinishTime(null);

      const updatedRoom = {
        ...roomRef.current,
        status: 'loading',
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
      (response) => {
        if (!response?.success) {
          setError(
            response?.error || 'Failed to host game'
          );
          return;
        }

        roomRef.current = response.room;
        setRoom(response.room);
        setSelectedDog(null);
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
        setSelectedDog(null);
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
        setSelectedDog(null);
        setScreen('selection');
      }
    );
  }

  // ---------------------------------
  // SELECT DOG
  // ---------------------------------

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

        setSelectedDog(dogId);

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
    setSelectedDog(null);
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

    const loader = new GLTFLoader();
    let isMounted = true;

    // ---------------------------------
    // MODEL LOADING
    // ---------------------------------

    let trackLoaded = false;
    let dogLoaded = false;
    let remoteModelsPending = 0;
    let readySent = false;

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
    // LOAD WENDOVER WOODS
    // ---------------------------------

    loader.load(
      '/models/wendover_woods.glb',
      (gltf) => {
        if (!isMounted) return;

        scene.add(gltf.scene);

        trackLoaded = true;
        notifyRaceLoaded();
      },
      undefined,
      (error) => {
        handleLoadError(
          'Wendover Woods',
          error
        );
      }
    );

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
    let leanAngle = 0;

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

    const runSpeed = 5;
    const sprintSpeed = 9;
    const reverseSpeed = 2.5;

    const acceleration = 8;
    const braking = 12;
    const friction = 5;
    const turnSpeed = 2.2;

    let currentSpeed = 0;

    const forwardDirection =
      new THREE.Vector3(0, 0, 1);

    const jumpForce = 7;
    const gravity = 16;

    // ---------------------------------
    // KEYBOARD CONTROLS
    // ---------------------------------

    const keys = {};

    function handleKeyDown(event) {
      if (
        !raceGoRef.current ||
        raceFinishedRef.current
      ) {
        if (event.code === 'Space') {
          event.preventDefault();
        }

        return;
      }

      keys[event.code] = true;

      if (event.code === 'Space') {
        event.preventDefault();

        if (
          !event.repeat &&
          !isJumping &&
          !isLanding &&
          dogMixer
        ) {
          isJumping = true;
          verticalVelocity =
            jumpForce;

          playAnimation('Jump');
        }
      }
    }

    function handleKeyUp(event) {
      keys[event.code] = false;
    }

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

    const cameraOffset =
      new THREE.Vector3(0, 4, -8);

    const cameraSmoothness = 6;
    const cameraLookHeight = 1.5;

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

      const isSprinting =
        keys.ShiftLeft ||
        keys.ShiftRight;

      const maxSpeed = isSprinting
        ? sprintSpeed
        : runSpeed;

      if (keys.KeyW) {
        currentSpeed +=
          acceleration * delta;

        currentSpeed = Math.min(
          currentSpeed,
          maxSpeed
        );
      } else if (keys.KeyS) {
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
            runSpeed,
          1
        );

      const turnInput =
        (keys.KeyA ? 1 : 0) -
        (keys.KeyD ? 1 : 0);

      const targetLean =
        -turnInput *
        steeringFactor *
        (currentSpeed > runSpeed
          ? 0.16
          : 0.11);

      leanAngle +=
        (targetLean - leanAngle) *
        (1 -
          Math.exp(-8 * delta));

      if (dogModel) {
        dogModel.rotation.z =
          leanAngle;
      }

      if (keys.KeyA) {
        player.rotation.y +=
          turnSpeed *
          steeringFactor *
          delta;
      }

      if (keys.KeyD) {
        player.rotation.y -=
          turnSpeed *
          steeringFactor *
          delta;
      }

      // ---------------------------------
      // MOVEMENT
      // ---------------------------------

      const forward =
        forwardDirection.clone();

      forward.applyQuaternion(
        player.quaternion
      );

      player.position.addScaledVector(
        forward,
        currentSpeed * delta
      );

      // ---------------------------------
      // JUMPING
      // ---------------------------------

      if (isJumping) {
        verticalVelocity -=
          gravity * delta;

        player.position.y +=
          verticalVelocity * delta;

        if (
          player.position.y <= 0
        ) {
          player.position.y = 0;
          verticalVelocity = 0;
          isJumping = false;
          isLanding = true;

          playAnimation('Land');
        }
      }

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
        const trotLimit =
          currentAnimation ===
          'Trot'
            ? 3.0
            : 2.5;

        if (!isMoving) {
          playAnimation('Idle');
        } else if (
          isSprinting &&
          currentSpeed >
            runSpeed
        ) {
          playAnimation('Sprint');
        } else if (
          Math.abs(currentSpeed) <
          trotLimit
        ) {
          playAnimation('Trot');
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

          if (remote.mixer) {
            remote.mixer.update(
              delta
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
          <p>Wendover Woods</p>

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
    const myId =
      socketRef.current?.id;

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
          WENDOVER WOODS
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
