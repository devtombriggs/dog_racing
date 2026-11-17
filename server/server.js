
import { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { env } from 'node:process';
import { MAPS, DEFAULT_MAP, crossedFinishLine, PROCEDURAL_TRACKS } from '../shared/maps.js';

const PORT = Number(env.PORT || 3001);

const io = new Server(PORT, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

const DOGS = ['gsp', 'second_dog', 'black_lab', 'ralph', 'pablo'];
const TOTAL_LAPS = 3;
const MAX_PLAYERS = 5;
const LOBBY_BROWSER = 'lobby-browser';

const rooms = new Map();
const playerRooms = new Map();
const proceduralRaceStates = new WeakMap();

// Recovery is decided by the server; clients only animate the fall. A revision
// prevents movement packets sent before a respawn from moving the dog back off-road.
function updateProceduralRace(room, player, data) {
  const track = PROCEDURAL_TRACKS[room.mapId];
  const state = proceduralRaceStates.get(player);
  if ((data.respawnRevision ?? 0) !== state.revision) return false;
  const now = Date.now();
  if (state.launch) {
    const elapsed = (now - state.launch.startedAt) / 1000;
    const point = track.launchPoint(elapsed, state.launch.lateral);
    player.position = [point.x, point.y, point.z];
    player.rotation = point.rotationY;
    player.animation = 'Jump';
    if (elapsed < track.launch.duration) return false;
    state.launch = null;
    state.launchLap = player.lap;
    state.revision += 1;
    player.animation = 'Sprint';
    io.to(room.code).emit('playerLanded', {
      playerId: player.id, position: player.position, rotation: player.rotation,
      respawnRevision: state.revision, boostSeconds: track.launch.boostSeconds,
      speedMultiplier: track.launch.exitSpeedMultiplier
    });
    return true;
  }
  if (state.fall) {
    const elapsed = (now - state.fall.startedAt) / 1000;
    if (elapsed >= track.rules.respawnDelaySeconds) {
      const cp = track.checkpoints[player.checkpoint];
      const spread = Math.min(1.6, (cp.halfWidth - 1.2) / 2);
      const point = track.pointAt(cp.s, (2 - state.slot) * spread * 0.5);
      const grid = !state.passedStart && player.lap === 1 && player.checkpoint === 0
        ? track.startPositions[state.slot] : null;
      player.position = grid ? [...grid.position] : [point.x, point.y, point.z];
      player.rotation = grid ? grid.rotationY : point.rotationY;
      player.animation = 'Idle';
      state.fall = null;
      state.revision += 1;
      io.to(room.code).emit('playerRespawned', {
        playerId: player.id, position: player.position, rotation: player.rotation,
        respawnRevision: state.revision,
        penaltySeconds: track.rules.respawnPenaltySeconds,
        speedMultiplier: track.rules.respawnSpeedMultiplier
      });
    } else {
      player.position = [...state.fall.position];
      player.position[1] -= 0.5 * track.rules.gravity * elapsed * elapsed;
    }
    return false;
  }
  const [x, y, z] = data.position;
  const ground = track.query(x, z);
  if (track.launch) {
    const previous = track.query(player.position[0], player.position[2]);
    const pad = track.launch;
    if (previous.onTrack && previous.s >= pad.padStart && previous.s < pad.takeoffS
      && ground.s >= pad.takeoffS && ground.s <= pad.gapStart + 8
      && Math.abs(ground.lateral) <= ground.halfWidth
      && Math.abs(y - ground.y) < 1.2) {
      const halfWidth = Math.min(ground.halfWidth, track.pointAt(pad.landingS).halfWidth) - 1;
      state.launch = { startedAt: now, lateral: Math.max(-halfWidth, Math.min(halfWidth, ground.lateral)) };
      const point = track.launchPoint(0, state.launch.lateral);
      player.position = [point.x,point.y,point.z]; player.rotation = point.rotationY; player.animation = 'Jump';
      io.to(room.code).emit('playerLaunched', { playerId: player.id, lateral: state.launch.lateral });
      return false;
    }
  }
  const position = ground.blocked
    ? [ground.clampX, ground.dogY ?? ground.y, ground.clampZ]
    : [...data.position];
  if (ground.onTrack && crossedFinishLine(player.position, position, MAPS[room.mapId].startFinish)) {
    state.passedStart = true;
  }
  player.position = position;
  player.rotation = data.rotation;
  if (!ground.onTrack || (!ground.blocked && y < ground.y - track.rules.fallStartsBelow)) {
    state.fall = { startedAt: now, position: [...player.position] };
    player.animation = 'Jump';
    io.to(room.code).emit('playerFell', {
      playerId: player.id, position: player.position
    });
    return false;
  }
  return true;
}

function generateRoomCode() {
  let code;

  do {
    code = randomBytes(3).toString('hex').toUpperCase();
  } while (rooms.has(code));

  return code;
}

function getRoomData(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    mapId: room.mapId,
    players: [...room.players.values()]
  };
}

function getLobbies() {
  return [...rooms.values()]
    .filter(room => !room.singlePlayer && room.status === 'lobby')
    .map(room => ({
      code: room.code,
      hostName: room.players.get(room.hostId).name,
      mapId: room.mapId,
      playerCount: room.players.size,
      maxPlayers: MAX_PLAYERS
    }));
}

function updateLobbies() {
  io.to(LOBBY_BROWSER).emit('lobbiesUpdated', getLobbies());
}

function playerName(value, fallback) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, 24) || fallback
    : fallback;
}

function updateLobby(room) {
  io.to(room.code).emit('lobbyUpdated', getRoomData(room));
  updateLobbies();
}

function clearCountdown(room) {
  if (room.countdownTimer) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
  }
}

// `slot` is the player's seat in the room (0 to 4): it stays theirs until they
// leave, and the game colours each player by it.  `hover` is the dog they are
// looking at on the select screen.
function createPlayer(socketId, name, slot = 0) {
  return {
    id: socketId,
    name,
    slot,
    hover: null,
    dog: null,
    ready: false,
    loaded: false,
    position: [0, 0, 0],
    rotation: 0,
    animation: 'Idle',
    lap: 1,
    checkpoint: 0,
    finished: false,
    finishTime: null
  };
}

function getRaceProgress(room, player) {
  return {
    playerId: player.id,
    lap: player.lap,
    checkpoint: player.checkpoint,
    totalCheckpoints: MAPS[room.mapId].checkpoints.length,
    totalLaps: TOTAL_LAPS,
    finished: player.finished,
    finishTime: player.finishTime
  };
}

function broadcastProgress(room, player) {
  io.to(room.code).emit(
    'raceProgress',
    getRaceProgress(room, player)
  );
}

function beginCountdown(room) {
  if (room.status !== 'loading') return;

  const everyoneLoaded = [...room.players.values()]
    .every((player) => player.loaded);

  if (!everyoneLoaded) return;

  room.status = 'countdown';
  updateLobby(room);

  console.log(`Countdown started: ${room.code}`);

  function tick(number) {
    if (rooms.get(room.code) !== room) return;
    if (room.status !== 'countdown') return;

    if (number === 0) {
      room.status = 'racing';
      room.startedAt = Date.now();
      room.countdownTimer = null;

      io.to(room.code).emit('raceGo', {
        startedAt: room.startedAt
      });

      updateLobby(room);

      console.log(`GO! Room ${room.code}`);
      return;
    }

    io.to(room.code).emit('raceCountdown', {
      number
    });

    room.countdownTimer = setTimeout(() => {
      tick(number - 1);
    }, 1000);
  }

  tick(3);
}

function checkRaceProgress(room, player, previousPosition) {
  if (player.finished) return;

  const map = MAPS[room.mapId];
  const checkpoints = map.checkpoints;
  const [x, , z] = player.position;

  // Players must visit each checkpoint in order.
  if (player.checkpoint < checkpoints.length) {
    const target = checkpoints[player.checkpoint];
    if (target.launchLanding && proceduralRaceStates.get(player)?.launchLap !== player.lap) return;

    const distance = Math.hypot(
      x - target.x,
      z - target.z
    );

    const pastCheckpoint = !target.forward
      || (x - target.x) * target.forward[0] + (z - target.z) * target.forward[1] >= -1e-6;
    if (distance <= target.radius && pastCheckpoint) {
      player.checkpoint += 1;
      broadcastProgress(room, player);
    }

    return;
  }

  const crossedFinish = crossedFinishLine(previousPosition, player.position, map.startFinish);

  if (!crossedFinish) return;

  if (player.lap >= TOTAL_LAPS) {
    player.finished = true;
    player.finishTime =
      (Date.now() - room.startedAt) / 1000;

    broadcastProgress(room, player);

    io.to(room.code).emit('playerFinished', {
      playerId: player.id,
      name: player.name,
      finishTime: player.finishTime
    });

    console.log(
      `${player.name} finished in ${player.finishTime}s`
    );

    if (
      [...room.players.values()].every(
        (participant) => participant.finished
      )
    ) {
      room.status = 'finished';
      updateLobby(room);
    }

    return;
  }

  player.lap += 1;
  player.checkpoint = 0;

  broadcastProgress(room, player);

  io.to(room.code).emit('lapCompleted', {
    playerId: player.id,
    lap: player.lap
  });
}

function leaveRoom(socket) {
  const roomCode = playerRooms.get(socket.id);
  if (!roomCode) return;

  const room = rooms.get(roomCode);

  playerRooms.delete(socket.id);
  socket.leave(roomCode);

  if (!room) return;

  room.players.delete(socket.id);

  io.to(roomCode).emit('playerLeft', {
    playerId: socket.id
  });

  if (room.players.size === 0) {
    clearCountdown(room);
    rooms.delete(roomCode);
    updateLobbies();

    console.log(`Room ${roomCode} deleted`);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }

  if (room.status === 'loading') {
    beginCountdown(room);
  }

  if (
    room.status === 'racing' &&
    [...room.players.values()].every(
      (player) => player.finished
    )
  ) {
    room.status = 'finished';
  }

  updateLobby(room);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('watchLobbies', () => {
    socket.join(LOBBY_BROWSER);
    io.to(socket.id).emit('lobbiesUpdated', getLobbies());
  });

  socket.on('unwatchLobbies', () => {
    socket.leave(LOBBY_BROWSER);
  });

  // HOST GAME

  socket.on('hostGame', (data, callback) => {
    // Keep older clients compatible with the default map.
    if (typeof data === 'function') { callback = data; data = {}; }
    const mapId = data?.mapId ?? DEFAULT_MAP;
    if (!Object.hasOwn(MAPS, mapId)) {
      return callback?.({ success: false, error: 'Invalid map selection' });
    }
    if (typeof callback !== 'function') return;

    leaveRoom(socket);

    const roomCode = generateRoomCode();
    const player = createPlayer(socket.id, playerName(data?.name, 'Host'));

    const room = {
      code: roomCode,
      hostId: socket.id,
      status: 'lobby',
      singlePlayer: data?.singlePlayer === true,
      mapId,
      startedAt: null,
      countdownTimer: null,
      players: new Map([[socket.id, player]])
    };

    rooms.set(roomCode, room);
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    callback({
      success: true,
      room: getRoomData(room)
    });

    updateLobby(room);

    console.log(`Room created: ${roomCode}`);
  });

  // JOIN GAME

  socket.on('joinGame', (data, callback) => {
    if (typeof callback !== 'function') return;

    const roomCode = String(data?.roomCode ?? '')
      .trim()
      .toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      return callback({
        success: false,
        error: 'Room not found'
      });
    }

    if (room.singlePlayer && room.hostId !== socket.id) {
      return callback({ success: false, error: 'This is a single-player game' });
    }

    if (room.status !== 'lobby') {
      return callback({
        success: false,
        error: 'Race has already started'
      });
    }

    if (playerRooms.get(socket.id) === roomCode) {
      return callback({
        success: true,
        room: getRoomData(room)
      });
    }

    if (room.players.size >= MAX_PLAYERS) {
      return callback({
        success: false,
        error: 'Room is full'
      });
    }

    leaveRoom(socket);

    const seats = new Set([...room.players.values()].map((other) => other.slot));
    let slot = 0;
    while (seats.has(slot)) slot += 1;

    const player = createPlayer(
      socket.id,
      playerName(data?.name, `Player ${room.players.size + 1}`),
      slot
    );

    room.players.set(socket.id, player);
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    callback({
      success: true,
      room: getRoomData(room)
    });

    updateLobby(room);
  });

  // Only the host can change the course, and only before loading starts.
  socket.on('selectMap', (data, callback) => {
    const room = rooms.get(playerRooms.get(socket.id));
    if (!room || room.status !== 'lobby') {
      return callback?.({ success: false, error: 'Not in a lobby' });
    }
    if (room.hostId !== socket.id) {
      return callback?.({ success: false, error: 'Only the host can select the map' });
    }
    if (!Object.hasOwn(MAPS, data?.mapId)) {
      return callback?.({ success: false, error: 'Invalid map selection' });
    }
    // Players keep the dogs they have picked when the course changes.
    room.mapId = data.mapId;
    updateLobby(room);
    callback?.({ success: true });
  });

  // SELECT DOG

  socket.on('selectDog', (data, callback) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.status !== 'lobby') {
      return callback?.({
        success: false,
        error: 'Not in a lobby'
      });
    }

    const dog = data?.dog;

    if (!DOGS.includes(dog)) {
      return callback?.({
        success: false,
        error: 'Invalid dog selection'
      });
    }

    const player = room.players.get(socket.id);

    if (!player) {
      return callback?.({
        success: false,
        error: 'Player not found'
      });
    }

    // One of each dog per race: the first to pick it has it.
    const takenBy = [...room.players.values()].find(
      (other) => other.id !== socket.id && other.dog === dog
    );

    if (takenBy) {
      return callback?.({
        success: false,
        error: `${takenBy.name} has already picked that dog`
      });
    }

    // Picking a dog is readying up: the host can start once everyone has.
    player.dog = dog;
    player.hover = null;
    player.ready = true;
    player.loaded = false;

    callback?.({ success: true });
    updateLobby(room);
  });

  // Which dog a player is looking at on the select screen, shown to the others

  socket.on('hoverDog', (data) => {
    const room = rooms.get(playerRooms.get(socket.id));
    const player = room?.players.get(socket.id);
    const dog = DOGS.includes(data?.dog) ? data.dog : null;

    if (!room || room.status !== 'lobby' || !player || player.hover === dog) {
      return;
    }

    player.hover = dog;
    io.to(room.code).emit('lobbyUpdated', getRoomData(room));
  });

  // CHANGE DOG: hand the dog back so someone else can take it

  socket.on('changeDog', (callback) => {
    const room = rooms.get(playerRooms.get(socket.id));
    const player = room?.players.get(socket.id);

    if (!room || room.status !== 'lobby' || !player) {
      return callback?.({
        success: false,
        error: 'Not in a lobby'
      });
    }

    player.dog = null;
    player.ready = false;

    callback?.({ success: true });
    updateLobby(room);
  });

  // READY / NOT READY

  socket.on('setReady', (data, callback) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.status !== 'lobby') {
      return callback?.({
        success: false,
        error: 'Not in a lobby'
      });
    }

    const player = room.players.get(socket.id);

    if (!player?.dog) {
      return callback?.({
        success: false,
        error: 'Select a dog first'
      });
    }

    player.ready = data?.ready === true;

    callback?.({ success: true });
    updateLobby(room);
  });

  // START RACE

  socket.on('startRace', (callback) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.status !== 'lobby') {
      return callback?.({
        success: false,
        error: 'Room not available'
      });
    }

    if (room.hostId !== socket.id) {
      return callback?.({
        success: false,
        error: 'Only the host can start the race'
      });
    }

    const players = [...room.players.values()];

    // Single player and multiplayer are both supported.
    if (players.length < 1) {
      return callback?.({
        success: false,
        error: 'At least one player is required'
      });
    }

    if (
      !players.every(
        (player) => player.dog && player.ready
      )
    ) {
      return callback?.({
        success: false,
        error: 'Everyone needs to choose a dog first'
      });
    }

    players.forEach((player, index) => {
      const start = MAPS[room.mapId].startPositions[index];
      player.position = [...start.position];
      player.rotation = start.rotationY;
      player.animation = 'Idle';

      player.loaded = false;
      player.lap = 1;
      player.checkpoint = 0;
      player.finished = false;
      player.finishTime = null;
      if (MAPS[room.mapId].procedural) {
        proceduralRaceStates.set(player, { slot: index, revision: 0, fall: null, passedStart: false });
      }
    });

    room.startedAt = null;
    room.status = 'loading';

    callback?.({ success: true });

    io.to(roomCode).emit('raceStarted', {
      roomCode,
      mapId: room.mapId,
      totalCheckpoints: MAPS[room.mapId].checkpoints.length,
      players,
      totalLaps: TOTAL_LAPS
    });

    updateLobby(room);

    console.log(
      `Loading race ${roomCode}: ${players.length} player(s)`
    );
  });

  // CLIENT FINISHED LOADING

  socket.on('raceLoaded', () => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.status !== 'loading') return;

    const player = room.players.get(socket.id);

    if (!player || player.loaded) return;

    player.loaded = true;

    console.log(`Player loaded: ${socket.id}`);

    updateLobby(room);
    beginCountdown(room);
  });

  // PLAYER MOVEMENT

  socket.on('playerMove', (data) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    // Movement is blocked until GO.
    if (!room || room.status !== 'racing') return;

    const player = room.players.get(socket.id);

    if (!player || player.finished) return;

    const position = data?.position;
    const rotation = data?.rotation;

    if (
      !Array.isArray(position) ||
      position.length !== 3 ||
      !position.every(
        (value) =>
          typeof value === 'number' &&
          Number.isFinite(value)
      ) ||
      typeof rotation !== 'number' ||
      !Number.isFinite(rotation)
    ) {
      return;
    }

    const validAnimations = [
      'Idle',
      'Walk',
      'Trot',
      'Run',
      'Sprint',
      'Jump',
      'Land'
    ];

    const previousPosition = [...player.position];

    let onRoad = true;
    if (MAPS[room.mapId].procedural) {
      onRoad = updateProceduralRace(room, player, data);
    } else {
      player.position = [...position];
      player.rotation = rotation;
    }

    if (onRoad) {
      if (validAnimations.includes(data.animation)) player.animation = data.animation;
      checkRaceProgress(room, player, previousPosition);
    }

    socket.to(roomCode).emit('playerMoved', {
      playerId: socket.id,
      position: player.position,
      rotation: player.rotation,
      animation: player.animation
    });
  });

  // LEAVE GAME

  socket.on('leaveGame', (callback) => {
    leaveRoom(socket);
    callback?.({ success: true });
  });

  // DISCONNECT

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    leaveRoom(socket);
  });
});

console.log(`Multiplayer server running on port ${PORT}`);
