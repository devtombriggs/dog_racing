
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { io } from 'socket.io-client';
import { MAPS, DEFAULT_MAP, sampleGroundHeight, PROCEDURAL_TRACKS } from '../shared/maps.js';
import { prepareHeadLook, applyHeadLook } from './headLook.js';
import { createTreatBoxes } from './pickups/treatBoxes.js';
import { createGoldenBones } from './pickups/goldenBones.js';
import { GOLDEN_BONE_SPOTS, racingLineAt } from '../shared/pickupSpots.js';
import { createItems } from './pickups/items.js';
import { ITEM_NAMES } from '../shared/items.js';
import { WENDOVER, woodlandWaterAt, woodlandSwimMultiplier, woodlandDogY } from '../shared/wendoverData.js';

// ---------------------------------
// DOG CONFIGURATION
// ---------------------------------

function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return n + (teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'));
}

// Played once when the player's pick is confirmed on character select.
// Add a dog here when its sound is ready, e.g. greyhound: '/audio/meela_selection.wav'
const SELECTION_SOUNDS = {
  gsp: '/audio/pippa_selection.wav',
};
const selectionAudio = {};

function playSelectionSound(dogId) {
  const src = SELECTION_SOUNDS[dogId];
  if (!src) return;
  try {
    selectionAudio[dogId] ??= new Audio(src);
    const audio = selectionAudio[dogId];
    audio.currentTime = 0;
    audio.play().catch(() => { /* autoplay blocked or file missing: stay silent */ });
  } catch { /* no audio support */ }
}

// Race audio per map. The countdown clip starts when "3" shows, from COUNTDOWN_OFFSET seconds
// into the file, so its spoken "3" lands on the 3 on screen (2, 1 and GO follow a second apart).
// Nudge COUNTDOWN_OFFSET up if the voice is late, down if it is early.
// Music starts on GO and loops until the player leaves the race.
const COUNTDOWN_OFFSET = 1.0;
const RACE_AUDIO = {
  treat_road: { countdown: '/audio/countdown.mp3', music: '/audio/treat_road.mp3', musicVolume: 0.5 },
};
const raceAudio = { countdown: null, music: null };

function stopRaceAudio() {
  for (const key of ['countdown', 'music']) {
    try { raceAudio[key]?.pause(); } catch { /* no audio support */ }
    raceAudio[key] = null;
  }
}

// Called while the race loads, so the countdown is ready the moment "3" shows
function loadRaceAudio(mapId) {
  stopRaceAudio();
  const config = RACE_AUDIO[mapId];
  if (!config) return;
  try {
    for (const key of ['countdown', 'music']) {
      if (!config[key]) continue;
      const audio = new Audio(config[key]);
      audio.preload = 'auto';
      if (key === 'music') {
        audio.loop = true;
        audio.volume = config.musicVolume ?? 0.5;
      }
      raceAudio[key] = audio;
    }
  } catch { /* no audio support */ }
}

function playRaceAudio(kind) {
  const audio = raceAudio[kind];
  if (!audio) return;
  try {
    audio.currentTime = kind === 'countdown' ? COUNTDOWN_OFFSET : 0;
    audio.play().catch(() => { /* autoplay blocked or file missing: stay silent */ });
  } catch { /* no audio support */ }
}

const DOGS = {
  gsp: {
    name: 'Pippa (German Shorthaired Pointer)',
    displayName: 'Pippa',
    breed: 'German Shorthaired Pointer',
    portrait: '/portraits/pippa.png?v=2',
    accent: '#ff72dd',
    model: '/models/gsp_female.glb',
    stats: { speed: 8, acceleration: 8, agility: 7, swimming: 6 },
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
    displayName: 'Meela',
    breed: 'Greyhound',
    portrait: '/portraits/meela.png?v=2',
    accent: '#cf88ff',
    model: '/models/meela_greyhound.glb',
    stats: { speed: 10, acceleration: 9, agility: 5, swimming: 4 },
    scale: 3,
    // meela_greyhound/clip_info.json
    gaitSpeed: {
      Walk: 1.52,
      Trot: 2.587,
      Run: 3.9,
      Sprint: 5.5
    }
  },
  black_lab: {
    name: 'Poppy (Black Labrador)',
    displayName: 'Poppy',
    breed: 'Black Labrador',
    portrait: '/portraits/poppy.png?v=2',
    accent: '#55aaff',
    model: '/models/black_lab.glb',
    stats: { speed: 7, acceleration: 7, agility: 8, swimming: 10 },
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
    displayName: 'Pablo',
    breed: 'Alaskan Klee Kai',
    portrait: '/portraits/pablo.png?v=2',
    accent: '#63efff',
    model: '/models/pablo.glb',
    stats: { speed: 7, acceleration: 9, agility: 10, swimming: 5 },
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
    displayName: 'Ralph',
    breed: 'Dachshund',
    portrait: '/portraits/ralph.png?v=2',
    accent: '#ffad57',
    model: '/models/ralph.glb',
    stats: { speed: 6, acceleration: 10, agility: 9, swimming: 4 },
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
// ---------------------------------
// DOG STATS
// ---------------------------------
// Each dog is rated 1 to 10 (see `stats` in DOGS).  A 7 is the handling the
// game was tuned around; every point above or below changes it by the share
// given here.  Raise a share to make the dogs feel more different.

const STAT_EFFECT = {
  speed: 0.06,         // top speed per point
  acceleration: 0.1,   // how quickly speed builds per point
  agilityTurn: 0.14,   // turning speed flat out per point
  agilityTurnSlow: 0.06, // ...and at a walk or trot
  agilityGrip: 0.2     // how tightly travel follows the nose per point: lower drifts wide
};

// Water slows a dog to this share of its top speed: a 4 or below is slowed
// more than by off-track ground, a 10 swims at close to full speed
const WATER_SPEED = [0.4, 0.95];
const WATER_ACCELERATION = [0.5, 1];

// One colour per seat in a game (the server gives each player a `slot`)
const PLAYER_COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#b197fc', '#63e6be'];

function playerColor(player) {
  return PLAYER_COLORS[(player?.slot ?? 0) % PLAYER_COLORS.length];
}

const STAT_LABELS = [
  ['speed', 'Speed'],
  ['acceleration', 'Accel'],
  ['agility', 'Agility'],
  ['swimming', 'Swim']
];

function statScale(value, perPoint) {
  return Math.max(0.4, 1 + ((value ?? 7) - 7) * perPoint);
}

function swimShare(swimming, [poor, strong]) {
  return THREE.MathUtils.lerp(
    poor,
    strong,
    THREE.MathUtils.clamp(((swimming ?? 4) - 4) / 6, 0, 1)
  );
}

// ---------------------------------
// DOGS BUMPING INTO EACH OTHER
// ---------------------------------
// Each player's game moves only its own dog, so each game works out the
// knocks its own dog takes from where it last saw the others.

const CONTACT = {
  radius: 0.7,        // a dog is two circles this size, one over the shoulders, one over the hips
  spacing: 0.75,      // how far ahead of and behind its middle those circles sit
  bounce: 0.4,        // how much harder than a dead stop a hit throws a dog
  fade: 4,            // how quickly a knock dies away: higher = shorter shove
  maxKnock: 14,       // fastest a knock can throw a dog
  clearHeight: 1.7,   // jump this far above a dog (times its size) and you pass over it
  staleAfter: 0.3     // seconds without news before another dog counts as standing still
};

// Heavier dogs shove lighter ones further: a dog's weight follows its size
function dogMass(config) {
  return Math.pow(config?.size ?? 1, 1.5);
}

// The deepest overlap between two dogs seen from above, as the direction
// to push dog A (x, z) and how far, or null if they are not touching
function dogOverlap(positionA, yawA, sizeA, positionB, yawB, sizeB) {
  const reach = CONTACT.radius * (sizeA + sizeB);
  let best = null;

  for (const a of [-1, 1]) {
    const ax = positionA.x + Math.sin(yawA) * CONTACT.spacing * sizeA * a;
    const az = positionA.z + Math.cos(yawA) * CONTACT.spacing * sizeA * a;

    for (const b of [-1, 1]) {
      const x = ax - (positionB.x + Math.sin(yawB) * CONTACT.spacing * sizeB * b);
      const z = az - (positionB.z + Math.cos(yawB) * CONTACT.spacing * sizeB * b);
      const distance = Math.hypot(x, z);
      const depth = reach - distance;

      if (depth > 0 && (!best || depth > best.depth)) {
        best = distance > 1e-4
          ? { x: x / distance, z: z / distance, depth }
          : { x: Math.cos(yawA), z: -Math.sin(yawA), depth };
      }
    }
  }

  return best;
}

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
// mixer has updated.
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
      // The mixer only rewrites a bone whose animated value changed since the
      // last frame.  A bone the stride holds still would keep last frame's
      // bend and have this one added on top, twisting further every frame of
      // a turn, so put such a bone back to its animated pose first.
      const turn = (bone.userData.turnPose ??= {
        animated: new THREE.Quaternion(),
        posed: new THREE.Quaternion(NaN, NaN, NaN, NaN)
      });

      if (bone.quaternion.equals(turn.posed)) {
        bone.quaternion.copy(turn.animated);
      }

      turn.animated.copy(bone.quaternion);
      bone.rotateZ(BEND_SIGN * bend * weight);
    }
  }
  applyHeadLook(model, steer);

  for (const [name] of BEND_BONES) {
    const bone = bones[name];

    if (bone) {
      bone.userData.turnPose.posed.copy(bone.quaternion);
    }
  }
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
  const rescueDisplayRef = useRef(null);

  const [screen, setScreen] = useState('menu');
  const [room, setRoom] = useState(null);

  const [playerName, setPlayerName] = useState('');
  const [availableLobbies, setAvailableLobbies] = useState(null);
  const [lobbyListError, setLobbyListError] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(null);
  const joinRequestRef = useRef(0);

  const [socketId, setSocketId] = useState(null);

  const [error, setError] = useState('');
  const [hoveredDog, setHoveredDog] = useState(null);
  const [connected, setConnected] = useState(false);

  const [racePhase, setRacePhase] =
    useState('');

  const [lap, setLap] = useState(1);
  const [checkpoint, setCheckpoint] = useState(0);
  const [totalCheckpoints, setTotalCheckpoints] =
    useState(5);

  const [finishTime, setFinishTime] =
    useState(null);

  // Race order for the board at the top left: [{ playerId, name, dog, place, finished }]
  const [standings, setStandings] = useState([]);
  // The item this player is holding from a Treat Box ('ball' | 'toy' | 'bone' | null)
  const [heldItem, setHeldItem] = useState(null);
  // Map vote countdown: when it ends (performance clock), and a tick to redraw the seconds
  // Accessibility mode: the dog runs by itself, Up jumps and Down uses the item
  const [accessibilityMode, setAccessibilityMode] = useState(() => {
    try { return localStorage.getItem('dogRacing.accessibilityMode') === '1'; } catch { return false; }
  });
  const accessibilityRef = useRef(accessibilityMode);
  useEffect(() => {
    accessibilityRef.current = accessibilityMode;
    try { localStorage.setItem('dogRacing.accessibilityMode', accessibilityMode ? '1' : '0'); } catch { /* storage blocked */ }
  }, [accessibilityMode]);
  // Countdown and music stop as soon as the player leaves the race screen
  useEffect(() => {
    if (screen !== 'race') stopRaceAudio();
  }, [screen]);
  useEffect(() => stopRaceAudio, []);
  const voteDeadlineRef = useRef(0);
  const [voteSecondsLeft, setVoteSecondsLeft] = useState(15);
  useEffect(() => {
    if (screen !== 'mapVote') return undefined;
    const tick = () => setVoteSecondsLeft(Math.max(0, Math.ceil((voteDeadlineRef.current - performance.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [screen]);

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
      setAvailableLobbies(null);
      setLobbyListError('');
      joinRequestRef.current += 1;
      setJoiningRoom(null);
    }

    function handleLobbyUpdated(updatedRoom) {
      roomRef.current = updatedRoom;
      setRoom(updatedRoom);
      // Everyone has a dog (or the host pressed Next): on to the map vote
      if (updatedRoom.status === 'voting') {
        if (updatedRoom.voteMsLeft != null) voteDeadlineRef.current = performance.now() + updatedRoom.voteMsLeft;
        setScreen(current => (current === 'selection' ? 'mapVote' : current));
      }
    }

    function handleRaceStarted(data) {
      console.log('Race loading:', data);
      loadRaceAudio(data.mapId ?? DEFAULT_MAP);

      raceGoRef.current = false;
      raceFinishedRef.current = false;
      raceStartRef.current = null;

      setRacePhase('Loading...');
      setTotalCheckpoints(data.totalCheckpoints ?? MAPS[data.mapId ?? DEFAULT_MAP].checkpoints.length);
      setLap(1);
      setCheckpoint(0);
      setFinishTime(null);
      setStandings([]);
      setHeldItem(null);

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
      if (data.number === 3) playRaceAudio('countdown');
      setRacePhase(String(data.number));
    }

    function handleRaceGo() {
      console.log('GO!');

      raceStartRef.current = performance.now();
      raceGoRef.current = true;
      playRaceAudio('music');

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

    function handleRaceStandings(data) {
      if (Array.isArray(data?.standings)) setStandings(data.standings);
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

    socket.on('raceStandings', handleRaceStandings);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('lobbyUpdated', handleLobbyUpdated);
      socket.off('raceStarted', handleRaceStarted);
      socket.off('raceCountdown', handleRaceCountdown);
      socket.off('raceGo', handleRaceGo);
      socket.off('raceProgress', handleRaceProgress);
      socket.off('playerFinished', handlePlayerFinished);
      socket.off('raceStandings', handleRaceStandings);

      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (screen !== 'join' || !connected) return;
    const socket = socketRef.current;
    const timer = setTimeout(() => {
      setLobbyListError('Could not load games. Go back and try again.');
    }, 8000);
    function handleLobbiesUpdated(lobbies) {
      clearTimeout(timer);
      setAvailableLobbies(lobbies);
      setLobbyListError('');
    }
    socket.on('lobbiesUpdated', handleLobbiesUpdated);
    socket.emit('watchLobbies');
    return () => {
      clearTimeout(timer);
      socket.off('lobbiesUpdated', handleLobbiesUpdated);
      if (socket.connected) socket.emit('unwatchLobbies');
    };
  }, [screen, connected]);

  // ---------------------------------
  // HOST GAME
  // ---------------------------------

  function hostGame() {
    singlePlayerRef.current = false;
    setError('');

    socketRef.current.emit(
      'hostGame',
      { name: playerName },
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
      { name: playerName, singlePlayer: true },
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

  function joinGame(roomCode) {
    if (!socketRef.current?.connected || joiningRoom) return;
    singlePlayerRef.current = false;
    setError('');
    setJoiningRoom(roomCode);
    const requestId = ++joinRequestRef.current;

    socketRef.current.timeout(8000).emit(
      'joinGame',
      { roomCode, name: playerName },
      (timeoutError, response) => {
        if (requestId !== joinRequestRef.current) return;
        setJoiningRoom(null);
        if (timeoutError) {
          setError('Joining timed out. Please try again.');
          return;
        }
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

  function selectDog(dogId) {
    setError('');
    setHoveredDog(null);

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

        playSelectionSound(dogId);

        // Multiplayer: stay on character select (the dog can still be changed) until
        // everyone has picked or the host presses Next; then the map vote takes over
        if (!singlePlayerRef.current) return;

        // Single player: ready up, then choose the map
        socket.emit(
          'setReady',
          { ready: true },
          (readyResponse) => {
            if (!readyResponse?.success) {
              setError(readyResponse?.error || 'Failed to ready up');
              return;
            }
            setScreen('mapSelect');
          }
        );
      }
    );
  }

  // ---------------------------------
  // CHANGE DOG
  // ---------------------------------

  // Tell the other players which dog this one is looking at
  function hoverDog(dogId) {
    setHoveredDog(dogId);

    if (!singlePlayerRef.current) {
      socketRef.current?.emit('hoverDog', { dog: dogId });
    }
  }

  // ---------------------------------
  // MAP SELECT / VOTE
  // ---------------------------------

  // Host only: go to the map vote now (anyone without a dog is given one)
  function skipToMapVote() {
    setError('');
    socketRef.current?.emit('skipToMapVote', (response) => {
      if (!response?.success) setError(response?.error || 'Could not move on to the map vote');
    });
  }

  function voteMap(mapId) {
    setError('');
    socketRef.current?.emit('voteMap', { mapId }, (response) => {
      if (!response?.success) setError(response?.error || 'Vote not counted');
    });
  }

  // Single player: clicking a map starts the race on it
  function startSoloRace(mapId) {
    setError('');
    const socket = socketRef.current;
    socket?.emit('selectMap', { mapId }, (response) => {
      if (!response?.success) { setError(response?.error || 'Failed to select map'); return; }
      socket.emit('startRace', (startResponse) => {
        if (!startResponse?.success) setError(startResponse?.error || 'Failed to start race');
      });
    });
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
    setStandings([]);
    setHeldItem(null);
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
    const proceduralTrack = PROCEDURAL_TRACKS[currentRoom.mapId] ?? null;
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
    let heightmap = null;

    function isTrackSurface(position) {
      if (woodland && woodlandWaterAt(position.x, position.z)) return true;
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
      const pool = woodland && woodlandWaterAt(position.x, position.z);
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

    if (proceduralTrack) {
      const worldRequest = currentRoom.mapId === 'modbury_heights'
        ? import('./tracks/modburyHeights/ModburyHeightsTrack.js').then(module => module.createModburyHeights)
        : import('./tracks/treatRoad/TreatRoadTrack.js').then(module => module.createTreatRoad);
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
      woodland ? import('./tracks/wendover/WendoverWorld.js') : Promise.resolve(null)]).then(
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

        if (woodland || currentRoom.mapId === 'modbury_heights') {
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

          if (woodland || currentRoom.mapId === 'modbury_heights') {
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
      if (!proceduralTrack?.launch || data.playerId !== socket.id) return;
      launchFlight = { startedAt: performance.now(), lateral: data.lateral };
      fall = null;
      knock.set(0,0,0);
      isJumping = isLanding = false;
      jumpHeight = verticalVelocity = 0;
      playAnimation('Jump');
      currentAction?.reset();
    }
    function handlePlayerLanded(data) {
      if (!proceduralTrack?.launch) return;
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

    // ---------------------------------
    // ITEMS
    // ---------------------------------
    function handleItemChanged({ playerId, item }) {
      items.setHeld(playerId, item);
      if (playerId === socket.id) { myItem = item; setHeldItem(item); }
    }
    function handleItemUsed({ playerId, item }) {
      if (playerId !== socket.id || item !== 'bone') return;
      goldenBones.startBoost();
      if (currentSpeed > 0) currentSpeed += goldenBones.instantKick(sprintSpeed);
    }
    function handleHazardPlaced(data) { items.placeHazard(data); }
    function handleHazardRemoved(data) { items.removeHazard(data.id, !!data.hitBy); }
    function handleBallThrown(data) { items.throwBall(data); }
    function handleBallHit(data) { items.removeBall(data.id, data.position); }
    function handlePlayerHit({ playerId, stunMs }) {
      if (playerId !== socket.id) return;
      stunLength = stunMs;
      stunUntil = performance.now() + stunMs;
      currentSpeed *= 0.15;
      goldenBones.cancelBoost();
    }
    const itemEvents = {
      itemChanged: handleItemChanged, itemUsed: handleItemUsed, hazardPlaced: handleHazardPlaced,
      hazardRemoved: handleHazardRemoved, ballThrown: handleBallThrown, ballHit: handleBallHit, playerHit: handlePlayerHit,
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
        !raceGoRef.current ||
        raceFinishedRef.current ||
        isJumping ||
        tunnelRide ||
        (woodland && woodlandWaterAt(player.position.x, player.position.z)?.swimming) ||
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
      const accessible = accessibilityRef.current;
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
      proceduralWorld?.update(performance.now() / 1000, player.position);
      woodlandWorld?.update(performance.now() / 1000, player.position,
        [player.position, ...[...remotePlayers.values()].filter(r => r.group.visible).map(r => r.group.position)]);
      treatBoxes.update(performance.now() / 1000);
      const itemAnchors = new Map([[socket.id, dogBones.head ?? player]]);
      remotePlayers.forEach((remote, id) => itemAnchors.set(id, remote.bones.head ?? remote.group));
      items.update(delta, itemAnchors);
      // knocked over by a ball or a chew toy: a couple of spins on the spot
      if (dogModel) {
        const stunLeft = stunUntil - performance.now();
        dogModel.rotation.y = stunLeft > 0 ? (1 - stunLeft / stunLength) * Math.PI * 4 : 0;
      }

      const canMove =
        raceGoRef.current &&
        !raceFinishedRef.current;

      // Golden Bones: running through one is the whole pickup, no button needed
      if (goldenBones.update(delta, player.position, canMove && !fall && !launchFlight && !tunnelRide) && currentSpeed > 0) {
        currentSpeed += goldenBones.instantKick(sprintSpeed);
      }

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

      const desiredFov = launchFlight ? 94
        : performance.now() < launchBoostUntil || goldenBones.isBoosting() ? 84 : 75;
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
        const point = proceduralTrack.launchPoint(elapsed, launchFlight.lateral);
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

        // In the air the dog is off nothing: that is how the stream is cleared
        offTrack = !isJumping && !isTrackSurface(player.position);
        const woodlandSurface = woodland && woodlandWaterAt(player.position.x, player.position.z);
        const inWater = !isJumping && (woodlandSurface?.inWater || (offTrack && isOverWater(player.position)));
        const coastalGround = coastalTrack?.query(player.position.x, player.position.z);
        const terrainMultiplier = inWater && woodlandSurface
          ? woodlandSwimMultiplier(stats.swimming)
          : coastalGround
          ? coastalTrack.speedFactor(coastalGround, coastalStats)
          : inWater
          ? waterSpeed
          : offTrack ? OFF_TRACK_SPEED_MULTIPLIER : 1;
        // A climb takes a little off the top speed, a descent gives a little back
        const hillMultiplier = coastalTrack || (inWater && woodlandSurface) ? 1 : THREE.MathUtils.clamp(
          1 - HANDLING.hillEffect * slope,
          0.8,
          1.08
        );
        const maxSpeed =
          sprintSpeed *
          terrainMultiplier *
          hillMultiplier *
          (performance.now() < burrowBoostUntil ? 1.3 : 1) *
          (performance.now() < launchBoostUntil ? proceduralTrack.launch.exitSpeedMultiplier : 1) *
          (proceduralTrack && performance.now() < recoveryUntil ? proceduralTrack.rules.respawnSpeedMultiplier : 1) *
          goldenBones.speedMultiplier() *
          (performance.now() < stunUntil ? 0.15 : 1);
        const effectiveAcceleration = acceleration *
          goldenBones.accelerationMultiplier() *
          (inWater
            ? waterAcceleration
            : offTrack ? OFF_TRACK_ACCELERATION_MULTIPLIER : 1);
        if (surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK';
          surfaceDisplayRef.current.style.color = offTrack ? '#ffbc75' : '#9fe49b';
        }

        // Accessibility mode runs the dog for the player; Up and Down are jump and item there
        const autoRun = accessibilityRef.current;
        const running = autoRun
          ? raceGoRef.current && !raceFinishedRef.current
          : keys.KeyW || keys.ArrowUp;
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
          turnRateSlow,
          turnRateSprint,
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
        offTrack = !isJumping && !isTrackSurface(player.position);
        const poolNow = woodland && woodlandWaterAt(player.position.x, player.position.z);
        const swimming = Boolean(poolNow?.swimming) && !isJumping;
        const wading = !isJumping && (poolNow?.inWater || (offTrack && isOverWater(player.position)));
        if (poolNow?.inWater && !isJumping) {
          currentSpeed = Math.min(currentSpeed, sprintSpeed * woodlandSwimMultiplier(stats.swimming)
            * goldenBones.speedMultiplier() * (performance.now() < stunUntil ? 0.15 : 1));
        }
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
        offTrackFor = offTrack && !isJumping ? offTrackFor + delta : 0;
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

          if (swimming) {
            playAnimation('Trot');
          } else if (!isMoving) {
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
          surfaceDisplayRef.current.textContent = swimming
            ? localPlayer.dog === 'black_lab' ? 'POPPY’S WATER DASH' : 'SWIMMING'
            : wading ? 'WADING'
            : performance.now() < burrowBoostUntil ? 'BURROW EXIT BOOST!'
            : goldenBones.isBoosting() ? 'GOLDEN BONE BOOST!'
            : offTrack ? 'OFF TRACK — SLOWDOWN' : 'ON TRACK';
          surfaceDisplayRef.current.style.color = wading ? '#9de5df' : '#cbe4ae';
        }
        if (proceduralTrack && surfaceDisplayRef.current) {
          surfaceDisplayRef.current.textContent = performance.now() < recoveryUntil
            ? 'RECOVERING — REDUCED SPEED'
            : performance.now() < launchBoostUntil ? 'LANDING BOOST!'
            : goldenBones.isBoosting() ? 'GOLDEN BONE BOOST!'
            : offTrack ? 'OFF THE EDGE'
            : coastalSurface?.movement === 'swim' ? 'SWIMMING'
            : coastalSurface?.movement === 'wade' ? 'WADING'
            : coastalSurface?.surface === 'shoulder' ? 'SOFT GROUND — SLOWDOWN' : 'ON TRACK';
          surfaceDisplayRef.current.style.color = coastalSurface?.inWater ? '#8fd0ff'
            : offTrack || coastalSurface?.surface === 'shoulder' ? '#ffbc75' : '#9fe49b';
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
            remote.currentAction.timeScale = woodland && woodlandWaterAt(remote.group.position.x, remote.group.position.z)?.swimming
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
          <label htmlFor="player-name">Your name</label>
          <input
            id="player-name"
            value={playerName}
            onChange={event => setPlayerName(event.target.value)}
            maxLength={24}
            placeholder="Enter your name"
            autoComplete="nickname"
            style={{ display: 'block', width: '100%', padding: 12, marginTop: 8, marginBottom: 20, fontSize: 16 }}
          />

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
            onClick={() => {
              setError('');
              setAvailableLobbies(null);
              setLobbyListError('');
              setScreen('join');
            }}
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
        <div style={{ ...panelStyle, width: 620, maxHeight: '90dvh', overflowY: 'auto' }}>
          <h2>Join Game</h2>
          <p>Choose a host to join their lobby. Games update automatically.</p>
          <div role="status">
            {!connected ? <p>Disconnected. Reconnecting to the server…</p>
              : lobbyListError ? <p style={{ color: 'salmon' }}>{lobbyListError}</p>
                : availableLobbies === null ? <p>Looking for games…</p>
                  : availableLobbies.length === 0 ? <p>No games waiting for players. Ask a friend to host a game!</p>
                    : <p>{availableLobbies.length} {availableLobbies.length === 1 ? 'lobby' : 'lobbies'} found</p>}
          </div>
          {connected && availableLobbies?.map(lobby => {
            const full = lobby.playerCount >= lobby.maxPlayers;
            const disabled = full || joiningRoom !== null;
            return (
              <div key={lobby.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: 16, marginBottom: 12, background: '#34523b', borderRadius: 8, textAlign: 'left' }}>
                <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <strong>{lobby.hostName}’s lobby</strong>
                  <div style={{ marginTop: 6 }}>Picking dogs · map vote next</div>
                  <div style={{ marginTop: 6 }}>{lobby.playerCount}/{lobby.maxPlayers} players{full ? ' · Full' : ''}</div>
                </div>
                <button
                  style={{ ...buttonStyle, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer' }}
                  disabled={disabled}
                  aria-label={`Join ${lobby.hostName}’s lobby`}
                  onClick={() => joinGame(lobby.code)}
                >
                  {joiningRoom === lobby.code ? 'Joining…' : full ? 'Full' : 'Join'}
                </button>
              </div>
            );
          })}
          <div>
            <button
              style={buttonStyle}
              disabled={joiningRoom !== null}
              onClick={() => {
                setError('');
                setScreen('menu');
              }}
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
    const myDog = room?.players.find(player => player.id === socketId)?.dog ?? null;
    const multiplayer = !room?.singlePlayer;
    const waitingFor = room?.players.filter(player => !player.dog).length ?? 0;
    return (
      <main className="character-select">
        <section className="character-select__panel" aria-labelledby="character-select-title">
          <header className="character-select__header">
            <div>
              <p className="character-select__eyebrow">Dog Racing / Character Select</p>
              <h1 id="character-select-title">Choose Your Dog</h1>
              <p className="character-select__hint">
                {!room || room.players.length < 2
                  ? 'Pick your partner. Own the track.'
                  : `One of each dog per race. ${room.players.filter(player => player.dog).length} of ${room.players.length} players have picked.`}
              </p>
            </div>
            <div className="character-select__course">
              <span>Next</span>
              <strong>Map {room?.singlePlayer ? 'select' : 'vote'}</strong>
            </div>
          </header>

          <div className="character-select__grid" role="group" aria-label="Choose your racing dog">
            {Object.entries(DOGS).map(([id, dog]) => {
              // Another player in this game already has this dog
              const takenBy = room?.players.find(player => player.dog === id && player.id !== socketId);
              // Everyone looking at this dog right now, this player first
              const looking = (room?.players ?? []).filter(player =>
                player.id === socketId ? hoveredDog === id : player.hover === id && !player.dog
              ).sort((a, b) => (b.id === socketId) - (a.id === socketId));
              const rings = looking.map((player, index) =>
                `0 0 0 ${3 * (index + 1)}px ${playerColor(player)}`
              );
              return (
              <button
                key={id}
                className={`character-card${takenBy ? ' character-card--taken' : ''}`}
                style={{
                  '--portrait-accent': dog.accent,
                  ...(rings.length ? { boxShadow: rings.join(', '), borderColor: 'transparent' } : {})
                }}
                onPointerEnter={() => hoverDog(id)}
                onPointerLeave={() => hoverDog(null)}
                onFocus={() => hoverDog(id)}
                onBlur={() => hoverDog(null)}
                aria-label={`${dog.name}. ${takenBy ? `Taken by ${takenBy.name}. ` : ''}${STAT_LABELS.map(([key, label]) => `${label} ${dog.stats[key]} out of 10`).join(', ')}`}
                disabled={!connected || Boolean(takenBy)}
                onClick={() => selectDog(id)}
              >
                <img src={dog.portrait} alt="" width="1280" height="1280" draggable="false" />
                {takenBy
                  ? <span className="character-card__taken" style={{ borderColor: playerColor(takenBy), color: playerColor(takenBy) }} aria-hidden="true">Taken · {takenBy.name}</span>
                  : myDog === id
                    ? <span className="character-card__action character-card__action--mine" aria-hidden="true">Your pick ✓</span>
                    : <span className="character-card__action" aria-hidden="true">Select ↗</span>}
                {looking.length > 0 && (
                  <span className="character-card__cursors" aria-hidden="true">
                    {looking.map(player => (
                      <span key={player.id} style={{ background: playerColor(player) }}>
                        {player.id === socketId ? 'You' : player.name}
                      </span>
                    ))}
                  </span>
                )}
                <span className="character-card__caption">
                  <strong>{dog.displayName}</strong>
                  <span>{dog.breed}</span>
                  <span className="character-card__stats" aria-hidden="true">
                    {STAT_LABELS.map(([key, label]) => (
                      <span key={key} className="character-card__stat">
                        <span className="character-card__stat-name">{label}</span>
                        <span className="character-card__stat-bar">
                          <span style={{ width: `${dog.stats[key] * 10}%` }} />
                        </span>
                        <span className="character-card__stat-value">{dog.stats[key]}</span>
                      </span>
                    ))}
                  </span>
                </span>
              </button>
              );
            })}
          </div>

          <footer className="character-select__footer">
            <button className="character-select__back" onClick={leaveGame}>Leave Game</button>
            <label className="character-select__accessibility">
              <input
                type="checkbox"
                checked={accessibilityMode}
                onChange={(event) => setAccessibilityMode(event.target.checked)}
              />
              <span>
                Accessibility mode
                <small>Runs for you · ↑ jump · ↓ use item</small>
              </span>
            </label>
            <p>
              {!connected ? 'Disconnected. Reconnecting to the server…'
                : !multiplayer || !myDog ? 'Select a portrait to continue'
                  : room?.hostId === socketId
                    ? `Press Next when everyone is in${waitingFor ? ` (${waitingFor} still picking: they will get a free dog)` : ''}`
                    : 'Waiting for the host to start the map vote'}
            </p>
            {multiplayer && room?.hostId === socketId && (
              <button className="character-select__next" onClick={skipToMapVote} disabled={!connected}>Next: Map Vote →</button>
            )}
          </footer>
          {error && <p className="character-select__error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  // ---------------------------------
  // MAP SELECT (single player) / MAP VOTE (multiplayer)
  // ---------------------------------

  if (screen === 'mapSelect' || screen === 'mapVote') {
    const voting = screen === 'mapVote';
    const votes = room?.votes ?? {};
    const myVote = votes[socketId];
    const voteCount = Object.keys(votes).length;
    const secondsLeft = voteSecondsLeft;
    return (
      <main className="character-select map-select">
        <section className="character-select__panel" aria-labelledby="map-select-title">
          <header className="character-select__header">
            <div>
              <p className="character-select__eyebrow">Dog Racing / {voting ? 'Map Vote' : 'Map Select'}</p>
              <h1 id="map-select-title">{voting ? 'Vote for a Map' : 'Choose a Map'}</h1>
              <p className="character-select__hint">
                {voting
                  ? `${voteCount} of ${room?.players.length ?? 0} voted. Most votes wins; a tie is picked at random.`
                  : 'Click a map to start the race.'}
              </p>
            </div>
            {voting && (
              <div className="map-select__timer" role="timer" aria-live="polite">
                <span>Starting in</span>
                <strong>{secondsLeft}s</strong>
              </div>
            )}
          </header>

          <div className="map-select__grid" role="group" aria-label={voting ? 'Vote for a map' : 'Choose a map'}>
            {Object.entries(MAPS).map(([id, map]) => {
              const voters = (room?.players ?? []).filter(player => votes[player.id] === id);
              return (
                <button
                  key={id}
                  className={`map-card${myVote === id ? ' map-card--mine' : ''}`}
                  disabled={!connected}
                  onClick={() => (voting ? voteMap(id) : startSoloRace(id))}
                  aria-label={`${map.name}. ${map.description}.${voting ? ` ${voters.length} ${voters.length === 1 ? 'vote' : 'votes'}.` : ''}`}
                >
                  <img src={`/maps/${id}.jpg`} alt="" width="640" height="360" draggable="false" />
                  {voting && voters.length > 0 && (
                    <span className="map-card__voters" aria-hidden="true">
                      {voters.map(player => (
                        <span key={player.id} style={{ background: playerColor(player) }}>
                          {player.id === socketId ? 'You' : player.name}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="map-card__caption">
                    <strong>{map.name}</strong>
                    <span>{map.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <footer className="character-select__footer">
            <button className="character-select__back" onClick={leaveGame}>Leave Game</button>
            <p>
              {!connected ? 'Disconnected. Reconnecting to the server…'
                : !voting ? 'Pick where to race'
                  : myVote ? `You voted for ${MAPS[myVote].name}. Click another map to change your vote.` : 'Click a map to vote'}
            </p>
          </footer>
          {error && <p className="character-select__error" role="alert">{error}</p>}
        </section>
      </main>
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

      {/* Race order, top left: slides rows into place when someone overtakes */}
      {standings.length > 0 && (
        <ol className="race-standings" aria-label="Race positions" style={{ height: standings.length * 38 - 4 }}>
          {standings.map(entry => (
            <li
              key={entry.playerId}
              className={`race-standings__row${entry.playerId === socketId ? ' race-standings__row--you' : ''}`}
              style={{ transform: `translateY(${(entry.place - 1) * 38}px)` }}
            >
              <span className="race-standings__place">{ordinal(entry.place)}</span>
              <span className="race-standings__name">
                {entry.name} — {DOGS[entry.dog]?.displayName ?? 'Dog'}
              </span>
              {entry.finished && <span className="race-standings__flag" aria-label="finished">🏁</span>}
            </li>
          ))}
        </ol>
      )}

      {/* Lost: off the track or the wrong way, counting down to the rescue */}
      <div ref={rescueDisplayRef} className="race-rescue" role="status" hidden />

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

        <div style={{ fontSize: 12, color: '#b4c9b5', marginBottom: 3 }}>ITEM</div>
        <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: heldItem ? '#ffd257' : '#6f8573' }}>
          {heldItem ? `${ITEM_NAMES[heldItem]} · press Shift` : 'None: run through a box'}
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
          {accessibilityMode ? (
            <>
              <div>Accessibility mode: your dog runs by itself</div>
              <div>A / D or ← / → steer</div>
              <div>↑ to jump · ↓ to use an item</div>
            </>
          ) : (
            <>
              <div>W / ↑ accelerate · S / ↓ brake / reverse</div>
              <div>A / D or ← / → steer</div>
              <div>Space or scroll down to jump · Shift to use an item</div>
            </>
          )}
          {room?.mapId === 'wendover' && <div>Amber burrows boost Ralph · Poppy swims fastest</div>}
          {room?.mapId === 'treat_road' && <div>Cyan pad launches automatically · falls return to checkpoints</div>}
          {room?.mapId === 'modbury_heights' && <div>Follow the trail · falls return you to a checkpoint</div>}
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
