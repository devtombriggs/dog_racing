
import { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { env } from 'node:process';
import { MAPS, DEFAULT_MAP, crossedFinishLine, PROCEDURAL_TRACKS, sampleGroundHeight } from '../shared/maps.js';
import { TREAT_BOXES_BY_MAP, TREAT_BOX_RESPAWN_MS, touchesTreatBox, touchesGoldenBone, GOLDEN_BONE_RESPAWN_MS } from '../shared/treatBoxes.js';
import { rollItem, forwardOf, ballPositionAt, distanceToSegment, stepFrisbee, frisbeeHits, BALL, TOY, HIT, FRISBEE } from '../shared/items.js';
import { racingLineAt, GOLDEN_BONE_SPOTS } from '../shared/pickupSpots.js';
import { WENDOVER, entersBurrow, woodlandDistanceAt, woodlandWaterAt, woodlandDogY } from '../shared/wendoverData.js';
import { FROSTPEAK_CANNON } from '../shared/frostpeakCannon.js';
import { readFileSync } from 'node:fs';

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
const woodlandRaceStates = new WeakMap();
const frostpeakRaceStates = new WeakMap();

// Ground heights, for balls that skim down a slope instead of flying level (Frostpeak's black run)
const BALL_GROUND = {};
for (const [mapId, map] of Object.entries(MAPS)) {
  if (!map.heightmap) continue;
  const buf = readFileSync(new URL(`../public${map.heightmap.file}`, import.meta.url));
  const heights = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  BALL_GROUND[mapId] = (x, z) => sampleGroundHeight(heights, map.heightmap, x, z);
}
const woodlandCheckpointDistances = MAPS.wendover.checkpoints.map(cp => woodlandDistanceAt(cp.x, cp.z));

function updateWoodlandRace(room, player, data) {
  const state = woodlandRaceStates.get(player);
  if ((data.respawnRevision ?? 0) !== state.revision) return false;
  if (state.tunnel) {
    const { tunnel, startedAt } = state.tunnel;
    if (Date.now() - startedAt < tunnel.duration * 1000) return false;
    player.position = [...tunnel.exit]; player.rotation = tunnel.exitYaw; player.animation = 'Sprint';
    // Only checkpoints along this authorised shortcut are credited. No lap or finish is skipped.
    while (player.checkpoint < woodlandCheckpointDistances.length
      && woodlandCheckpointDistances[player.checkpoint] < tunnel.exitS) player.checkpoint++;
    state.tunnel = null; state.revision++;
    broadcastProgress(room, player);
    io.to(room.code).emit('playerBurrowExited', {
      playerId: player.id, position: player.position, rotation: player.rotation,
      respawnRevision: state.revision, boostSeconds: tunnel.boostSeconds, speedMultiplier: tunnel.speedMultiplier
    });
    return false;
  }
  if (player.dog === 'ralph') {
    for (const tunnel of WENDOVER.tunnels) {
      const key = `${player.lap}:${tunnel.id}`;
      const required = woodlandCheckpointDistances.filter(s => s < tunnel.entryS).length;
      if (state.used.has(key) || player.checkpoint !== required || !entersBurrow(player.position,data.position,tunnel)) continue;
      state.used.add(key); state.tunnel = { tunnel, startedAt: Date.now() };
      player.position = [...tunnel.entry]; player.rotation = tunnel.entryYaw; player.animation = 'Run';
      io.to(room.code).emit('playerBurrowEntered', { playerId: player.id, tunnelId: tunnel.id, duration: tunnel.duration });
      return false;
    }
  }
  player.position = [...data.position]; player.rotation = data.rotation;
  return true;
}

// Frostpeak's cannon: run off the end of the launch pad and the server flies the dog up to the top of
// the ski slope (the same curve the game draws), then lands it with a short boost.  Moves sent from
// before the landing carry an old revision and are ignored, so the dog cannot be dragged back down.
function updateFrostpeakRace(room, player, data) {
  const state = frostpeakRaceStates.get(player);
  if ((data.respawnRevision ?? 0) !== state.revision) return false;
  const now = Date.now();
  if (state.launch) {
    const elapsed = (now - state.launch.startedAt) / 1000;
    const point = FROSTPEAK_CANNON.launchPoint(elapsed, state.launch.lateral);
    player.position = [point.x, point.y, point.z];
    player.rotation = point.rotationY;
    player.animation = 'Jump';
    if (elapsed < FROSTPEAK_CANNON.launch.duration) return false;
    state.launch = null;
    state.revision += 1;
    player.animation = 'Sprint';
    io.to(room.code).emit('playerLanded', {
      playerId: player.id, position: player.position, rotation: player.rotation,
      respawnRevision: state.revision, boostSeconds: FROSTPEAK_CANNON.launch.boostSeconds,
      speedMultiplier: FROSTPEAK_CANNON.launch.exitSpeedMultiplier
    });
    return true;
  }
  const lateral = FROSTPEAK_CANNON.cannonFired(player.position, data.position);
  if (lateral !== null) {
    state.launch = { startedAt: now, lateral };
    const point = FROSTPEAK_CANNON.launchPoint(0, lateral);
    player.position = [point.x, point.y, point.z];
    player.rotation = point.rotationY;
    player.animation = 'Jump';
    io.to(room.code).emit('playerLaunched', { playerId: player.id, lateral });
    return false;
  }
  player.position = [...data.position];
  player.rotation = data.rotation;
  return true;
}

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
      && y > ground.y - 1.2 && y < ground.y + 2.5) {   // a dog jumping across the pad still launches
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

function collectTreatBoxes(room, player, previousPosition) {
  for (const box of TREAT_BOXES_BY_MAP[room.mapId] ?? []) {
    if (room.treatBoxTimers.has(box.id) || !touchesTreatBox(previousPosition, player.position, box)) continue;
    io.to(room.code).emit('treatBoxChanged', { id: box.id, visible: false });
    grantItem(room, player);
    const timer = setTimeout(() => {
      if (rooms.get(room.code) !== room) return;
      room.treatBoxTimers.delete(box.id);
      io.to(room.code).emit('treatBoxChanged', { id: box.id, visible: true });
    }, TREAT_BOX_RESPAWN_MS);
    room.treatBoxTimers.set(box.id, timer);
  }
}

// Golden Bones on the road: first dog through gets the boost, and the bone is gone for everyone
// until it comes back.  (The dog's own game boosts it straight away; this keeps the others in step.)
function collectGoldenBones(room, player, previousPosition) {
  (GOLDEN_BONE_SPOTS[room.mapId] ?? []).forEach((spot, index) => {
    if (room.boneTimers.has(index) || !touchesGoldenBone(previousPosition, player.position, spot)) return;
    io.to(room.code).emit('goldenBoneTaken', { index, playerId: player.id });
    room.boneTimers.set(index, setTimeout(() => {
      if (rooms.get(room.code) !== room) return;
      room.boneTimers.delete(index);
      io.to(room.code).emit('goldenBoneRespawned', { index });
    }, GOLDEN_BONE_RESPAWN_MS));
  });
}

// ---------------------------------
// ITEMS (tennis ball, chew toy, golden bone)
// ---------------------------------

// One item at a time: a box taken while holding one gives nothing.
function grantItem(room, player) {
  if (player.item) return;
  const standings = raceStandings(room);
  const place = standings.find((entry) => entry.playerId === player.id)?.place ?? 1;
  player.item = rollItem(place, standings.length);
  io.to(room.code).emit('itemChanged', { playerId: player.id, item: player.item });
}

function resetItems(room) {
  stopFrisbees(room);
  for (const timer of room.boneTimers?.values() ?? []) clearTimeout(timer);
  room.boneTimers = new Map();
  room.hazards = new Map();
  room.balls = new Map();
  room.nextItemId = 1;
  for (const player of room.players.values()) {
    player.item = null;
    player.hitImmuneUntil = 0;
  }
}

function useItem(room, player) {
  const item = player.item;
  player.item = null;
  io.to(room.code).emit('itemChanged', { playerId: player.id, item: null });
  const forward = forwardOf(player.rotation);
  const [x, y, z] = player.position;
  if (item === 'bone') {
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
  } else if (item === 'toy') {
    if (room.hazards.size >= TOY.maxPerRoom) {
      const oldest = room.hazards.keys().next().value;
      room.hazards.delete(oldest);
      io.to(room.code).emit('hazardRemoved', { id: oldest });
    }
    const hazard = {
      id: `toy-${room.nextItemId++}`, owner: player.id, placedAt: Date.now(),
      position: [x - forward[0] * TOY.dropBehind, y, z - forward[2] * TOY.dropBehind], rotationY: player.rotation
    };
    room.hazards.set(hazard.id, hazard);
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
    io.to(room.code).emit('hazardPlaced', { id: hazard.id, owner: hazard.owner, position: hazard.position, rotationY: hazard.rotationY });
  } else if (item === 'ball') {
    const ball = {
      id: `ball-${room.nextItemId++}`, owner: player.id, firedAt: Date.now(),
      origin: [x + forward[0] * BALL.launchAhead, y + BALL.height, z + forward[2] * BALL.launchAhead], direction: forward,
      ground: room.mapId === 'frostpeak'          // skims down the black run rather than flying off level into the sky
    };
    room.balls.set(ball.id, ball);
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
    io.to(room.code).emit('ballThrown', { id: ball.id, owner: ball.owner, origin: ball.origin, direction: ball.direction, ground: ball.ground });
  } else if (item === 'frisbee') {
    throwFrisbee(room, player);
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
  }
}

// ---------------------------------
// RED FRISBEE: chases the dog directly ahead of the thrower (whoever that is right now: if someone
// overtakes the thrower, it goes after them instead), knocks that one dog over and is gone.  It
// flies straight through anyone else.  The server flies it (it has to see every dog), moving it every
// FRISBEE.tickMs and telling everyone where it is, and it gives up after FRISBEE.duration.
// ---------------------------------
function frisbeeTarget(room, player) {
  const standings = raceStandings(room);
  const place = standings.find(entry => entry.playerId === player.id)?.place ?? 1;
  const ahead = standings.find(entry => entry.place === place - 1 && !entry.finished);
  return ahead ? ahead.playerId : null;
}

function throwFrisbee(room, player) {
  const forward = forwardOf(player.rotation);
  const [x, y, z] = player.position;
  const frisbee = {
    id: `frisbee-${room.nextItemId++}`, owner: player.id, target: frisbeeTarget(room, player), firedAt: Date.now(),
    position: [x + forward[0] * FRISBEE.launchAhead, y + FRISBEE.height, z + forward[2] * FRISBEE.launchAhead], yaw: player.rotation
  };
  room.frisbees.set(frisbee.id, frisbee);
  io.to(room.code).emit('frisbeeThrown', { id: frisbee.id, owner: frisbee.owner, target: frisbee.target, position: frisbee.position, yaw: frisbee.yaw });
  room.frisbeeTimer ??= setInterval(() => tickFrisbees(room), FRISBEE.tickMs);
}

function tickFrisbees(room) {
  if (rooms.get(room.code) !== room || room.status !== 'racing') { stopFrisbees(room); return; }
  const now = Date.now(), dt = FRISBEE.tickMs / 1000, moved = [];
  for (const f of room.frisbees.values()) {
    if ((now - f.firedAt) / 1000 > FRISBEE.duration) {
      room.frisbees.delete(f.id);
      io.to(room.code).emit('frisbeeGone', { id: f.id, position: f.position });
      continue;
    }
    const thrower = room.players.get(f.owner);
    const target = room.players.get(thrower ? frisbeeTarget(room, thrower) : f.target);
    if (target && target.id !== f.target) {
      f.target = target.id;
      io.to(room.code).emit('frisbeeTarget', { id: f.id, target: f.target });
    }
    Object.assign(f, stepFrisbee(f, target && !target.finished ? target.position : null, dt));
    // only the dog it is chasing: it flies through anyone else
    const victim = target && !target.finished && now >= target.hitImmuneUntil && frisbeeHits(f.position, target.position) ? target : null;
    if (victim) {
      room.frisbees.delete(f.id);
      io.to(room.code).emit('frisbeeHit', { id: f.id, playerId: victim.id, position: f.position });
      hitPlayer(room, victim, f.owner, 'frisbee');
      continue;
    }
    moved.push({ id: f.id, position: f.position, yaw: f.yaw });
  }
  if (moved.length) io.to(room.code).emit('frisbeesMoved', { frisbees: moved });
  if (room.frisbees.size === 0) stopFrisbees(room);
}

function stopFrisbees(room) {
  if (room.frisbeeTimer) clearInterval(room.frisbeeTimer);
  room.frisbeeTimer = null;
  room.frisbees = new Map();
}

function hitPlayer(room, player, by, item) {
  player.hitImmuneUntil = Date.now() + HIT.immuneMs;
  io.to(room.code).emit('playerHit', {
    playerId: player.id, by, item, stunMs: item === 'toy' ? HIT.toyStunMs : HIT.ballStunMs
  });
}

// Checked on each of the dog's own moves: did a ball or a dropped toy get it?
function checkItemHits(room, player, previousPosition) {
  const now = Date.now();
  for (const ball of room.balls.values()) {
    const age = (now - ball.firedAt) / 1000;
    if (age > BALL.duration) { room.balls.delete(ball.id); continue; }
    if (ball.owner === player.id || now < player.hitImmuneUntil) continue;
    const groundAt = BALL_GROUND[room.mapId];
    const from = ballPositionAt(ball, Math.max(0, age - 0.12), groundAt), to = ballPositionAt(ball, age, groundAt);
    if (Math.abs(player.position[1] + 1 - to[1]) <= 3
      && distanceToSegment(player.position, from, to) <= BALL.radius) {
      room.balls.delete(ball.id);
      io.to(room.code).emit('ballHit', { id: ball.id, playerId: player.id, position: to });
      hitPlayer(room, player, ball.owner, 'ball');
    }
  }
  // A chew toy is gone once any dog runs into it; a dog still recovering from a hit is not
  // knocked over again, but the toy goes all the same.
  for (const hazard of room.hazards.values()) {
    if (hazard.owner === player.id && now - hazard.placedAt < TOY.ownerGraceMs) continue;
    const above = player.position[1] - hazard.position[1];
    if (above > TOY.jumpClear || above < -2) continue;              // jumped clean over it
    if (distanceToSegment(hazard.position, previousPosition, player.position) <= TOY.radius) {
      room.hazards.delete(hazard.id);
      io.to(room.code).emit('hazardRemoved', { id: hazard.id, hitBy: player.id });
      if (Date.now() >= player.hitImmuneUntil) hitPlayer(room, player, hazard.owner, 'toy');
    }
  }
}

// Puts everyone on the grid of room.mapId and tells the clients to load the race.
function startRaceIn(room) {
  const players = [...room.players.values()];

  // Single player and multiplayer are both supported.
  if (players.length < 1) {
    return { success: false, error: 'At least one player is required' };
  }

  if (!players.every((player) => player.dog && player.ready)) {
    return { success: false, error: 'Everyone needs to choose a dog first' };
  }

  clearMapVote(room);

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
    if (room.mapId === 'wendover') woodlandRaceStates.set(player, { revision: 0, tunnel: null, used: new Set() });
    if (room.mapId === 'frostpeak') frostpeakRaceStates.set(player, { revision: 0, launch: null });
    if (MAPS[room.mapId].procedural) {
      proceduralRaceStates.set(player, { slot: index, revision: 0, fall: null, passedStart: false });
    }
  });

  room.startedAt = null;
  room.status = 'loading';
  resetItems(room);

  io.to(room.code).emit('raceStarted', {
    roomCode: room.code,
    mapId: room.mapId,
    totalCheckpoints: MAPS[room.mapId].checkpoints.length,
    players,
    totalLaps: TOTAL_LAPS
  });

  updateLobby(room);

  console.log(`Loading race ${room.code}: ${players.length} player(s) on ${room.mapId}`);
  return { success: true };
}

// ---------------------------------
// RESCUE: back on the track after 5 s lost (off the track, or running the wrong way)
// ---------------------------------

const RESCUE_PENALTY_SECONDS = 1;

// The last checkpoint passed, on the racing line, facing forwards. Before the first checkpoint
// of the race that is the dog's own grid slot; on later laps, the finish line.
function rescuePoint(room, player) {
  const map = MAPS[room.mapId];
  let x, z;
  if (player.checkpoint > 0) {
    const cp = map.checkpoints[player.checkpoint - 1];
    x = cp.x; z = cp.z;
  } else if (player.lap > 1) {
    [x, , z] = map.startFinish.position;
  } else {
    const slot = Math.max(0, [...room.players.keys()].indexOf(player.id));
    const start = map.startPositions[slot] ?? map.startPositions[0];
    return { position: [...start.position], rotation: start.rotationY };
  }
  const line = racingLineAt(room.mapId, x, z);
  return line
    ? { position: [line.x, line.y, line.z], rotation: line.rotationY }
    : { position: [x, player.position[1], z], rotation: player.rotation };
}

function rescuePlayer(room, player) {
  const state = room.mapId === 'wendover' ? woodlandRaceStates.get(player)
    : room.mapId === 'frostpeak' ? frostpeakRaceStates.get(player)
    : MAPS[room.mapId].procedural ? proceduralRaceStates.get(player) : null;
  if (state && (state.launch || state.fall || state.tunnel)) return false;      // already being handled
  const { position, rotation } = rescuePoint(room, player);
  if (room.mapId === 'wendover') {
    const water = woodlandWaterAt(position[0], position[2]);
    if (water) position[1] = woodlandDogY(water, player.dog);
  }
  player.position = position;
  player.rotation = rotation;
  player.animation = 'Idle';
  if (state) state.revision += 1;                               // older packets from before the move are ignored
  io.to(room.code).emit('playerRespawned', {
    playerId: player.id, position, rotation,
    respawnRevision: state?.revision ?? 0,
    penaltySeconds: RESCUE_PENALTY_SECONDS,
    rescued: true
  });
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
    singlePlayer: room.singlePlayer === true,
    mapId: room.mapId,
    // map vote: playerId -> mapId, and how long is left (sent as a duration so clocks need not agree)
    votes: Object.fromEntries(room.votes ?? []),
    voteMsLeft: room.status === 'voting' ? Math.max(0, room.voteEndsAt - Date.now()) : null,
    players: [...room.players.values()]
  };
}

// ---------------------------------
// MAP VOTE (multiplayer)
// ---------------------------------
// When the host presses Next (or a full room has all five dogs picked), everyone votes for a map.
// The race always starts when the 15 s countdown ends: most votes wins, a tie (say 50/50) is a
// random pick between the tied maps, and no votes at all picks a random map.

const MAP_VOTE_MS = 15000;

// Automatic only for a full room (all five dogs picked); otherwise the host presses Next.
function maybeBeginMapVote(room) {
  if (room.singlePlayer || room.status !== 'lobby' || room.players.size < MAX_PLAYERS) return;
  if ([...room.players.values()].every((player) => player.dog)) beginMapVote(room);
}

function beginMapVote(room) {
  room.status = 'voting';
  room.votes = new Map();
  room.voteEndsAt = Date.now() + MAP_VOTE_MS;
  room.voteTimer = setTimeout(() => finishMapVote(room), MAP_VOTE_MS);
  room.voteTimer?.unref?.();
  updateLobby(room);
}

function clearMapVote(room) {
  if (room.voteTimer) clearTimeout(room.voteTimer);
  room.voteTimer = null;
}

function finishMapVote(room) {
  if (rooms.get(room.code) !== room || room.status !== 'voting') return;
  clearMapVote(room);
  const counts = new Map();
  for (const [playerId, mapId] of room.votes) {
    if (room.players.has(playerId)) counts.set(mapId, (counts.get(mapId) ?? 0) + 1);
  }
  const most = Math.max(0, ...counts.values());
  const candidates = most > 0
    ? [...counts].filter(([, n]) => n === most).map(([mapId]) => mapId)
    : Object.keys(MAPS);
  room.mapId = candidates[Math.min(candidates.length - 1, Math.floor(Math.random() * candidates.length))];
  room.votes = new Map();
  startRaceIn(room);
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
    finishTime: null,
    item: null,
    hitImmuneUntil: 0
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
  broadcastStandings(room);
}

// Race order for the on-screen board: finished dogs in finishing order, then
// most laps, most checkpoints, and finally whoever is nearest their next
// checkpoint (or the finish line on the last stretch), so an overtake shows
// straight away rather than at the next checkpoint.
const STANDINGS_INTERVAL_MS = 250;

function raceStandings(room) {
  const map = MAPS[room.mapId];
  const toGo = (player) => {
    const target = player.checkpoint < map.checkpoints.length
      ? map.checkpoints[player.checkpoint]
      : { x: map.startFinish.position[0], z: map.startFinish.position[2] };
    return Math.hypot(player.position[0] - target.x, player.position[2] - target.z);
  };
  return [...room.players.values()]
    .map((player) => ({ player, toGo: player.finished ? 0 : toGo(player) }))
    .sort((a, b) =>
      (Number(b.player.finished) - Number(a.player.finished))
      || (a.player.finished ? a.player.finishTime - b.player.finishTime : 0)
      || (b.player.lap - a.player.lap)
      || (b.player.checkpoint - a.player.checkpoint)
      || (a.toGo - b.toGo)
      || (a.player.slot - b.player.slot))
    .map(({ player }, index) => ({
      playerId: player.id,
      name: player.name,
      dog: player.dog,
      place: index + 1,
      finished: player.finished
    }));
}

function broadcastStandings(room) {
  room.standingsSentAt = Date.now();
  io.to(room.code).emit('raceStandings', { standings: raceStandings(room) });
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
      broadcastStandings(room);

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

  room.votes?.delete(socket.id);

  if (room.players.size === 0) {
    clearCountdown(room);
    clearMapVote(room);
    for (const timer of room.treatBoxTimers.values()) clearTimeout(timer);
    for (const timer of room.boneTimers?.values() ?? []) clearTimeout(timer);
    stopFrisbees(room);
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

  maybeBeginMapVote(room);

  if (
    room.status === 'racing' &&
    [...room.players.values()].every(
      (player) => player.finished
    )
  ) {
    room.status = 'finished';
  }

  if (room.status === 'racing' || room.status === 'finished') {
    broadcastStandings(room);
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
      treatBoxTimers: new Map(),
      boneTimers: new Map(),
      frisbees: new Map(),
      frisbeeTimer: null,
      votes: new Map(),
      voteEndsAt: 0,
      voteTimer: null,
      hazards: new Map(),
      balls: new Map(),
      nextItemId: 1,
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

    // Picking a dog is readying up: once everyone has, the map vote begins.
    player.dog = dog;
    player.hover = null;
    player.ready = true;
    player.loaded = false;

    callback?.({ success: true });
    updateLobby(room);
    maybeBeginMapVote(room);
  });

  // NEXT (host): go to the map vote now; anyone without a dog is given a free one at random

  socket.on('skipToMapVote', (callback) => {
    const room = rooms.get(playerRooms.get(socket.id));
    if (!room || room.status !== 'lobby' || room.singlePlayer) {
      return callback?.({ success: false, error: 'Not in a lobby' });
    }
    if (room.hostId !== socket.id) {
      return callback?.({ success: false, error: 'Only the host can move everyone on' });
    }
    for (const player of room.players.values()) {
      if (player.dog) continue;
      const free = DOGS.filter((dog) => ![...room.players.values()].some((other) => other.dog === dog));
      player.dog = free[Math.floor(Math.random() * free.length)];
      player.hover = null;
      player.ready = true;
    }
    callback?.({ success: true });
    beginMapVote(room);
  });

  // VOTE FOR A MAP

  socket.on('voteMap', (data, callback) => {
    const room = rooms.get(playerRooms.get(socket.id));
    if (!room || room.status !== 'voting' || !room.players.has(socket.id)) {
      return callback?.({ success: false, error: 'There is no map vote running' });
    }
    if (!Object.hasOwn(MAPS, data?.mapId)) {
      return callback?.({ success: false, error: 'Invalid map selection' });
    }
    room.votes.set(socket.id, data.mapId);
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
    const room = rooms.get(playerRooms.get(socket.id));

    if (!room || (room.status !== 'lobby' && room.status !== 'voting')) {
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

    callback?.(startRaceIn(room));
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
    } else if (room.mapId === 'wendover') {
      onRoad = updateWoodlandRace(room, player, data);
    } else if (room.mapId === 'frostpeak') {
      onRoad = updateFrostpeakRace(room, player, data);
    } else {
      player.position = [...position];
      player.rotation = rotation;
    }

    if (room.mapId !== 'wendover' || onRoad) checkItemHits(room, player, previousPosition);

    if (onRoad) {
      collectTreatBoxes(room, player, previousPosition);
      collectGoldenBones(room, player, previousPosition);
      if (validAnimations.includes(data.animation)) player.animation = data.animation;
      checkRaceProgress(room, player, previousPosition);
    }

    if (Date.now() - (room.standingsSentAt ?? 0) >= STANDINGS_INTERVAL_MS) {
      broadcastStandings(room);
    }

    socket.to(roomCode).emit('playerMoved', {
      playerId: socket.id,
      position: player.position,
      rotation: player.rotation,
      animation: player.animation
    });
  });

  // LEAVE GAME

  // Lost for 5 s (the game counts): put the dog back at its last checkpoint
  socket.on('requestRescue', (callback) => {
    const room = rooms.get(playerRooms.get(socket.id));
    const player = room?.players.get(socket.id);
    if (!room || room.status !== 'racing' || !player || player.finished) {
      return callback?.({ success: false });
    }
    callback?.({ success: rescuePlayer(room, player) });
  });

  // Fire / drop / eat whatever the dog is holding.
  socket.on('useItem', () => {
    const room = rooms.get(playerRooms.get(socket.id));
    if (!room || room.status !== 'racing') return;
    const player = room.players.get(socket.id);
    if (!player || player.finished || !player.item || woodlandRaceStates.get(player)?.tunnel) return;
    useItem(room, player);
  });

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
