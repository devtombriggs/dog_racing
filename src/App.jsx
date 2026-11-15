
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { io } from 'socket.io-client';

// Dog models available for selection
const DOGS = {
  gsp: {
    name: 'German Shorthaired Pointer',
    model: '/models/gsp_female.glb',
    scale: 3
  },
  second_dog: {
    name: 'Meela (Greyhound)',
    model: '/models/meela_greyhound.glb',
    scale: 3
  }
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;

function App() {
  const containerRef = useRef(null);
  const socketRef = useRef(null);
  const roomRef = useRef(null);

  const [screen, setScreen] = useState('menu');
  const [room, setRoom] = useState(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [selectedDog, setSelectedDog] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);

  // ---------------------------------
  // MULTIPLAYER CONNECTION
  // ---------------------------------

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected:', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('lobbyUpdated', (updatedRoom) => {
      roomRef.current = updatedRoom;
      setRoom(updatedRoom);
    });

    socket.on('raceStarted', (data) => {
      console.log('Race started:', data);
      setScreen('race');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ---------------------------------
  // HOST GAME
  // ---------------------------------

  function hostGame() {
    setError('');

    socketRef.current.emit('hostGame', (response) => {
      if (!response.success) {
        setError(response.error);
        return;
      }

      roomRef.current = response.room;
      setRoom(response.room);
      setSelectedDog(null);
      setScreen('selection');
    });
  }

  // ---------------------------------
  // JOIN GAME
  // ---------------------------------

  function joinGame() {
    setError('');

    socketRef.current.emit(
      'joinGame',
      { roomCode: roomCodeInput },
      (response) => {
        if (!response.success) {
          setError(response.error);
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

    socketRef.current.emit(
      'selectDog',
      { dog: dogId },
      (response) => {
        if (!response.success) {
          setError(response.error);
          return;
        }

        setSelectedDog(dogId);
        setScreen('lobby');
      }
    );
  }

  // ---------------------------------
  // READY UP
  // ---------------------------------

  function toggleReady() {
    const player = room?.players.find(
      (p) => p.id === socketRef.current.id
    );

    socketRef.current.emit(
      'setReady',
      { ready: !player?.ready },
      (response) => {
        if (!response.success) {
          setError(response.error);
        }
      }
    );
  }

  // ---------------------------------
  // START RACE
  // ---------------------------------

  function startRace() {
    setError('');

    socketRef.current.emit('startRace', (response) => {
      if (!response.success) {
        setError(response.error);
      }
    });
  }

  // ---------------------------------
  // LEAVE GAME
  // ---------------------------------

  function leaveGame() {
    socketRef.current.emit('leaveGame');

    setRoom(null);
    setSelectedDog(null);
    setError('');
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

    if (!container || !socket || !currentRoom) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
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

    // Load Wendover Woods
    loader.load('/models/wendover_woods.glb', (gltf) => {
      if (!isMounted) return;
      scene.add(gltf.scene);
    });

    // ---------------------------------
    // LOCAL PLAYER
    // ---------------------------------

    const player = new THREE.Group();
    scene.add(player);

    const localPlayer = currentRoom.players.find(
      (p) => p.id === socket.id
    );

    if (localPlayer) {
      player.position.fromArray(localPlayer.position);
      player.rotation.y = localPlayer.rotation;
    }

    let dogMixer = null;
    const actions = {};
    let currentAction = null;
    let currentAnimation = 'Idle';

    let verticalVelocity = 0;
    let isJumping = false;
    let isLanding = false;

    function playAnimation(name) {
      const nextAction = actions[name];

      if (!nextAction || nextAction === currentAction) {
        return;
      }

      if (currentAction) {
        currentAction.fadeOut(0.2);
      }

      nextAction.reset();
      nextAction.fadeIn(0.2);
      nextAction.play();

      currentAction = nextAction;
      currentAnimation = name;
    }

    const dogConfig = DOGS[localPlayer?.dog || 'gsp'];

    loader.load(dogConfig.model, (gltf) => {
      if (!isMounted) return;

      const dog = gltf.scene;

      dog.scale.setScalar(dogConfig.scale);
      player.add(dog);

      dogMixer = new THREE.AnimationMixer(dog);

      gltf.animations.forEach((clip) => {
        actions[clip.name] = dogMixer.clipAction(clip);
      });

      if (actions.Jump) {
        actions.Jump.setLoop(THREE.LoopOnce, 1);
        actions.Jump.clampWhenFinished = true;
      }

      if (actions.Land) {
        actions.Land.setLoop(THREE.LoopOnce, 1);
        actions.Land.clampWhenFinished = true;
      }

      dogMixer.addEventListener('finished', (event) => {
        if (event.action === actions.Land) {
          isLanding = false;
        }
      });

      if (actions.Idle) {
        currentAction = actions.Idle;
        currentAction.play();
      }
    });

    // ---------------------------------
    // REMOTE PLAYERS
    // ---------------------------------

    const remotePlayers = new Map();

    function spawnRemotePlayer(data) {
      if (
        data.id === socket.id ||
        remotePlayers.has(data.id)
      ) {
        return;
      }

      const config = DOGS[data.dog] || DOGS.gsp;
      const group = new THREE.Group();

      group.position.fromArray(data.position);
      group.rotation.y = data.rotation;

      scene.add(group);

      const remote = {
        group,
        targetPosition: new THREE.Vector3().fromArray(
          data.position
        ),
        targetRotation: data.rotation,
        mixer: null,
        actions: {},
        currentAction: null,
        animation: data.animation || 'Idle'
      };

      remotePlayers.set(data.id, remote);

      loader.load(config.model, (gltf) => {
        if (!isMounted || !remotePlayers.has(data.id)) {
          return;
        }

        const dog = gltf.scene;
        dog.scale.setScalar(config.scale);

        group.add(dog);

        remote.mixer = new THREE.AnimationMixer(dog);

        gltf.animations.forEach((clip) => {
          remote.actions[clip.name] =
            remote.mixer.clipAction(clip);
        });

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

        playRemoteAnimation(remote, remote.animation);
      });
    }

    function playRemoteAnimation(remote, name) {
      const nextAction = remote.actions[name];

      if (
        !nextAction ||
        nextAction === remote.currentAction
      ) {
        return;
      }

      if (remote.currentAction) {
        remote.currentAction.fadeOut(0.2);
      }

      nextAction.reset();
      nextAction.fadeIn(0.2);
      nextAction.play();

      remote.currentAction = nextAction;
    }

    // Spawn everyone already in the race
    currentRoom.players.forEach(spawnRemotePlayer);

    function handlePlayerMoved(data) {
      const remote = remotePlayers.get(data.playerId);

      if (!remote) return;

      remote.targetPosition.fromArray(data.position);
      remote.targetRotation = data.rotation;
      remote.animation = data.animation;

      playRemoteAnimation(remote, data.animation);
    }

    function handlePlayerLeft(data) {
      const remote = remotePlayers.get(data.playerId);

      if (!remote) return;

      scene.remove(remote.group);
      remotePlayers.delete(data.playerId);
    }

    socket.on('playerMoved', handlePlayerMoved);
    socket.on('playerLeft', handlePlayerLeft);

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

    const forwardDirection = new THREE.Vector3(
      0, 0, 1
    );

    const jumpForce = 7;
    const gravity = 16;

    // ---------------------------------
    // KEYBOARD CONTROLS
    // ---------------------------------

    const keys = {};

    function handleKeyDown(event) {
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
          verticalVelocity = jumpForce;
          playAnimation('Jump');
        }
      }
    }

    function handleKeyUp(event) {
      keys[event.code] = false;
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // ---------------------------------
    // CAMERA
    // ---------------------------------

    const cameraOffset = new THREE.Vector3(
      0, 4, -8
    );

    const cameraSmoothness = 6;
    const cameraLookHeight = 1.5;

    camera.position.copy(
      player.position.clone().add(cameraOffset)
    );

    camera.lookAt(
      player.position.x,
      player.position.y + cameraLookHeight,
      player.position.z
    );

    // ---------------------------------
    // GAME LOOP
    // ---------------------------------

    const timer = new THREE.Timer();
    timer.connect(document);

    let animationId;
    let networkTimer = 0;

    function animate() {
      animationId = requestAnimationFrame(animate);

      timer.update();

      const delta = Math.min(
        timer.getDelta(),
        0.05
      );

      const isSprinting =
        keys.ShiftLeft || keys.ShiftRight;

      const maxSpeed = isSprinting
        ? sprintSpeed
        : runSpeed;

      if (keys.KeyW) {
        currentSpeed += acceleration * delta;
        currentSpeed = Math.min(
          currentSpeed,
          maxSpeed
        );
      } else if (keys.KeyS) {
        currentSpeed -= braking * delta;
        currentSpeed = Math.max(
          currentSpeed,
          -reverseSpeed
        );
      } else {
        if (currentSpeed > 0) {
          currentSpeed = Math.max(
            0,
            currentSpeed - friction * delta
          );
        } else if (currentSpeed < 0) {
          currentSpeed = Math.min(
            0,
            currentSpeed + friction * delta
          );
        }
      }

      if (currentSpeed > maxSpeed) {
        currentSpeed = Math.max(
          maxSpeed,
          currentSpeed - braking * delta
        );
      }

      const steeringFactor = Math.min(
        Math.abs(currentSpeed) / runSpeed,
        1
      );

      if (keys.KeyA) {
        player.rotation.y +=
          turnSpeed * steeringFactor * delta;
      }

      if (keys.KeyD) {
        player.rotation.y -=
          turnSpeed * steeringFactor * delta;
      }

      const forward = forwardDirection.clone();
      forward.applyQuaternion(player.quaternion);

      player.position.addScaledVector(
        forward,
        currentSpeed * delta
      );

      if (isJumping) {
        verticalVelocity -= gravity * delta;

        player.position.y +=
          verticalVelocity * delta;

        if (player.position.y <= 0) {
          player.position.y = 0;
          verticalVelocity = 0;
          isJumping = false;
          isLanding = true;
          playAnimation('Land');
        }
      }

      if (dogMixer) {
        dogMixer.update(delta);
      }

      const isMoving = Math.abs(currentSpeed) > 0.1;

      if (!isJumping && !isLanding) {
        if (!isMoving) {
          playAnimation('Idle');
        } else if (
          isSprinting &&
          currentSpeed > runSpeed
        ) {
          playAnimation('Sprint');
        } else {
          playAnimation('Run');
        }
      }

      // ---------------------------------
      // NETWORK UPDATES (20 PER SECOND)
      // ---------------------------------

      networkTimer += delta;

      if (networkTimer >= 0.05) {
        networkTimer = 0;

        socket.emit('playerMove', {
          position: player.position.toArray(),
          rotation: player.rotation.y,
          animation: currentAnimation
        });
      }

      // ---------------------------------
      // UPDATE REMOTE PLAYERS
      // ---------------------------------

      remotePlayers.forEach((remote) => {
        const smoothing = 1 - Math.exp(-12 * delta);

        remote.group.position.lerp(
          remote.targetPosition,
          smoothing
        );

        // Smooth rotation, including wraparound
        const rotationDifference = Math.atan2(
          Math.sin(
            remote.targetRotation - remote.group.rotation.y
          ),
          Math.cos(
            remote.targetRotation - remote.group.rotation.y
          )
        );

        remote.group.rotation.y +=
          rotationDifference * smoothing;

        if (remote.mixer) {
          remote.mixer.update(delta);
        }
      });

      // ---------------------------------
      // THIRD-PERSON RACING CAMERA
      // ---------------------------------

      const rotatedOffset = cameraOffset.clone();
      rotatedOffset.applyQuaternion(
        player.quaternion
      );

      const targetPosition = player.position
        .clone()
        .add(rotatedOffset);

      const cameraLerp =
        1 - Math.exp(-cameraSmoothness * delta);

      camera.position.lerp(
        targetPosition,
        cameraLerp
      );

      const lookTarget = player.position.clone();
      lookTarget.y += cameraLookHeight;

      camera.lookAt(lookTarget);

      renderer.render(scene, camera);
    }

    animate();

    // ---------------------------------
    // CLEANUP
    // ---------------------------------

    return () => {
      isMounted = false;

      cancelAnimationFrame(animationId);

      socket.off('playerMoved', handlePlayerMoved);
      socket.off('playerLeft', handlePlayerLeft);

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );

      window.removeEventListener(
        'keyup',
        handleKeyUp
      );

      timer.disconnect();

      container.removeChild(renderer.domElement);
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
    fontFamily: 'Arial, sans-serif',
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
            Server: {connected ? 'Connected' : 'Disconnected'}
          </p>

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
            onClick={() => setScreen('join')}
          >
            Join Game
          </button>

          {error && <p style={{ color: 'salmon' }}>{error}</p>}
        </div>
      </div>
    );
  }

  // ---------------------------------
  // JOIN MENU
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
              setRoomCodeInput(e.target.value.toUpperCase())
            }
            style={{
              padding: 12,
              fontSize: 18,
              width: '80%'
            }}
          />

          <div>
            <button style={buttonStyle} onClick={joinGame}>
              Join
            </button>

            <button
              style={buttonStyle}
              onClick={() => setScreen('menu')}
            >
              Back
            </button>
          </div>

          {error && <p style={{ color: 'salmon' }}>{error}</p>}
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

          {Object.entries(DOGS).map(([id, dog]) => (
            <button
              key={id}
              style={{
                ...buttonStyle,
                display: 'block',
                width: '100%'
              }}
              onClick={() => selectDog(id)}
            >
              {dog.name}
            </button>
          ))}

          <button style={buttonStyle} onClick={leaveGame}>
            Leave Game
          </button>

          {error && <p style={{ color: 'salmon' }}>{error}</p>}
        </div>
      </div>
    );
  }

  // ---------------------------------
  // LOBBY
  // ---------------------------------

  if (screen === 'lobby') {
    const myId = socketRef.current?.id;
    const myPlayer = room?.players.find(
      (p) => p.id === myId
    );

    const isHost = room?.hostId === myId;

    return (
      <div style={pageStyle}>
        <div style={panelStyle}>
          <h2>Game Lobby</h2>

          <h1>Room: {room?.code}</h1>

          <h3>Players</h3>

          {room?.players.map((player) => (
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
                {player.id === room.hostId ? ' (Host)' : ''}
              </strong>

              <div>
                {DOGS[player.dog]?.name || 'No dog selected'}
              </div>

              <div>
                {player.ready ? 'Ready' : 'Not Ready'}
              </div>
            </div>
          ))}

          <button style={buttonStyle} onClick={toggleReady}>
            {myPlayer?.ready ? 'Cancel Ready' : 'Ready Up'}
          </button>

          {isHost && (
            <button style={buttonStyle} onClick={startRace}>
              Start Race
            </button>
          )}

          <button style={buttonStyle} onClick={leaveGame}>
            Leave Game
          </button>

          {error && <p style={{ color: 'salmon' }}>{error}</p>}
        </div>
      </div>
    );
  }

  // ---------------------------------
  // RACE SCREEN
  // ---------------------------------

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden'
      }}
    />
  );
}

export default App;
