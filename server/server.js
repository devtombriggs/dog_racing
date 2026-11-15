
import { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';

const PORT = 3001;

const io = new Server(PORT, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

// Available dogs - update model names in the frontend later
const DOGS = ['gsp', 'second_dog'];

// Room code -> room data
const rooms = new Map();

// Socket ID -> room code
const playerRooms = new Map();

// Generate a unique six-character room code
function generateRoomCode() {
  let code;

  do {
    code = randomBytes(3).toString('hex').toUpperCase();
  } while (rooms.has(code));

  return code;
}

// Data sent to everyone in a lobby
function getRoomData(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: [...room.players.values()]
  };
}

// Send updated lobby information to all players
function updateLobby(room) {
  io.to(room.code).emit('lobbyUpdated', getRoomData(room));
}

// Remove a player from their room
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

  // Delete empty rooms
  if (room.players.size === 0) {
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} deleted`);
    return;
  }

  // Assign a new host if the host leaves
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }

  updateLobby(room);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // ---------------------------------
  // HOST GAME
  // ---------------------------------

  socket.on('hostGame', (callback) => {
    if (typeof callback !== 'function') return;

    leaveRoom(socket);

    const roomCode = generateRoomCode();

    const player = {
      id: socket.id,
      name: 'Host',
      dog: null,
      ready: false,
      position: [0, 0, 0],
      rotation: 0,
      animation: 'Idle'
    };

    const room = {
      code: roomCode,
      hostId: socket.id,
      status: 'lobby',
      players: new Map([[socket.id, player]])
    };

    rooms.set(roomCode, room);
    playerRooms.set(socket.id, roomCode);

    socket.join(roomCode);

    console.log(`Room created: ${roomCode}`);

    callback({
      success: true,
      room: getRoomData(room)
    });

    updateLobby(room);
  });

  // ---------------------------------
  // JOIN GAME
  // ---------------------------------

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

    if (room.status !== 'lobby') {
      return callback({
        success: false,
        error: 'Race has already started'
      });
    }

    if (room.players.size >= 5) {
      return callback({
        success: false,
        error: 'Room is full'
      });
    }

    if (playerRooms.get(socket.id) === roomCode) {
      return callback({
        success: true,
        room: getRoomData(room)
      });
    }

    leaveRoom(socket);

    const player = {
      id: socket.id,
      name: `Player ${room.players.size + 1}`,
      dog: null,
      ready: false,
      position: [0, 0, 0],
      rotation: 0,
      animation: 'Idle'
    };

    room.players.set(socket.id, player);
    playerRooms.set(socket.id, roomCode);

    socket.join(roomCode);

    console.log(`${socket.id} joined room ${roomCode}`);

    callback({
      success: true,
      room: getRoomData(room)
    });

    updateLobby(room);
  });

  // ---------------------------------
  // SELECT DOG
  // ---------------------------------

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

    player.dog = dog;
    player.ready = false;

    callback?.({ success: true });

    updateLobby(room);
  });

  // ---------------------------------
  // READY / NOT READY
  // ---------------------------------

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

    if (!player.dog) {
      return callback?.({
        success: false,
        error: 'Select a dog first'
      });
    }

    player.ready = data?.ready === true;

    callback?.({ success: true });

    updateLobby(room);
  });

  // ---------------------------------
  // START RACE
  // ---------------------------------

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

    if (room.players.size < 2) {
      return callback?.({
        success: false,
        error: 'At least two players are required'
      });
    }

    const players = [...room.players.values()];

    if (!players.every((player) => player.dog && player.ready)) {
      return callback?.({
        success: false,
        error: 'All players must select a dog and be ready'
      });
    }

    // Give each player a separate starting position
    players.forEach((player, index) => {
      player.position = [index * 2.5, 0, 0];
      player.rotation = 0;
      player.animation = 'Idle';
    });

    room.status = 'racing';

    console.log(`Race started in room ${roomCode}`);

    callback?.({ success: true });

    io.to(roomCode).emit('raceStarted', {
      roomCode,
      players
    });

    updateLobby(room);
  });

  // ---------------------------------
  // PLAYER MOVEMENT
  // ---------------------------------

  socket.on('playerMove', (data) => {
    const roomCode = playerRooms.get(socket.id);
    const room = rooms.get(roomCode);

    if (!room || room.status !== 'racing') return;

    const player = room.players.get(socket.id);

    if (!player) return;

    const position = data?.position;
    const rotation = data?.rotation;

    if (
      !Array.isArray(position) ||
      position.length !== 3 ||
      !position.every(
        (value) => typeof value === 'number' && Number.isFinite(value)
      ) ||
      typeof rotation !== 'number' ||
      !Number.isFinite(rotation)
    ) {
      return;
    }

    const validAnimations = [
      'Idle',
      'Run',
      'Sprint',
      'Jump',
      'Land'
    ];

    player.position = position;
    player.rotation = rotation;

    if (validAnimations.includes(data.animation)) {
      player.animation = data.animation;
    }

    // Only send movement to players in the same race
    socket.to(roomCode).emit('playerMoved', {
      playerId: socket.id,
      position: player.position,
      rotation: player.rotation,
      animation: player.animation
    });
  });

  // ---------------------------------
  // LEAVE GAME
  // ---------------------------------

  socket.on('leaveGame', (callback) => {
    leaveRoom(socket);

    callback?.({ success: true });
  });

  // ---------------------------------
  // DISCONNECT
  // ---------------------------------

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    leaveRoom(socket);
  });
});

console.log(`Multiplayer server running on port ${PORT}`);
