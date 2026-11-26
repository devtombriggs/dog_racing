
import { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { env } from 'node:process';
import { lapsFor, MAPS, MAP_IDS, DEFAULT_MAP, crossedFinishLine, PROCEDURAL_TRACKS, sampleGroundHeight } from '../shared/maps.js';
import { SLALOM, slalomHits } from '../shared/slalom.js';
import { TREAT_BOXES_BY_MAP, TREAT_BOX_RESPAWN_MS, touchesTreatBox, touchesGoldenBone, GOLDEN_BONE_RESPAWN_MS } from '../shared/treatBoxes.js';
import { rollItem, forwardOf, ballPositionAt, ballRoute, ballSeconds, ballHeadingAt, distanceToSegment, frisbeeHits, BALL, TOY, HIT, FRISBEE, FIREWORK, FIREWORK_LIMIT, COLLAR, ITEM_IDS } from '../shared/items.js';
import { fireworkRoute, stepFirework, fireworkPasses, inFireworkBlast } from '../shared/firework.js';
import { launchFrisbee, stepFrisbee, roadAhead } from '../shared/frisbee.js';
import { SPECIAL_ITEM, SPECIAL_HIT, KELP, SHEEP, QUAKE, quakeSeconds, kelpDistance, specialDurationMs, specialChance, comebackGain, specialFor, specialTouches, ropeTrips, ghostsThrough, pheasantFlightMs, dragonFireworks } from '../shared/specials.js';
import { racingLineAt, GOLDEN_BONE_SPOTS, PICKUP_PATHS } from '../shared/pickupSpots.js';
import { entersBurrow, woodlandWaterAt, woodlandDogY } from '../shared/wendoverData.js';
import { BURROWS, BURROW_CHECKPOINTS, BURROWS_PER_LAP } from '../shared/burrows.js';
import { GRAND_PRIX, pointsForPlace } from '../shared/grandPrix.js';
import { FROSTPEAK_CANNON } from '../shared/frostpeakCannon.js';
import { createBot, AWAY_DRIVER } from './bots.js';
import { LOCAL_PLAYERS, RACE_DOGS, BOT_LEVEL_IDS } from '../shared/botLevels.js';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { openDb } from './db.js';
import { createAccounts, sessionTokenOf } from './accounts.js';
import { coinsForRace, coinsForGrandPrix, dogUnlocked, cosmeticsFor, LOCKED_DOGS, SHOP_ITEM } from '../shared/shop.js';

const PORT = Number(env.PORT || 3001);

// Player accounts and the leaderboards (server/db.js): in memory unless DB_PATH names a file
// (ADMIN_EMAILS: the accounts with these email addresses, commas between, own everything in the Shop: server/db.js)
const db = openDb(env.DB_PATH || ':memory:', { admins: (env.ADMIN_EMAILS ?? '').split(',') });
const accounts = createAccounts(db, env);
setInterval(() => db.clearOldSessions(), 3600e3).unref?.();
// Signing in and the leaderboards are plain web requests (server/accounts.js); the races share the port
const httpServer = createServer((req, res) => {
  if (accounts.handle(req, res)) return;
  if (req.url.startsWith('/socket.io')) return;                  // (socket.io answers these itself)
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const io = new Server(httpServer, {
  // (ask each game every 5 s whether it is still there, and give up on one that has not answered in 20.
  // It was 5, and players were dropped two or three times a race (Tom, 2026-11-22): a browser busy loading a
  // map, a tab in the background or a Wi-Fi blip goes quiet for longer than that.  A connection that has
  // really died is now noticed in about 25 s; socket.io's own settings take up to 45)
  pingInterval: 5000,
  pingTimeout: 20000,
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

const DOGS = ['gsp', 'second_dog', 'black_lab', 'ralph', 'pablo', 'kombu', 'rocky', 'enzo', 'baz_naz', 'jazz', 'casper', 'jimmy'];
const MAX_PLAYERS = RACE_DOGS;
const LOCAL_SEATS = LOCAL_PLAYERS;       // the most players at one split screen
const LOBBY_BROWSER = 'lobby-browser';
// For trying the specials out: ALWAYS_SPECIAL=1 makes every Treat Box give the special, even to the leader,
// and hands every dog its special at GO and again three seconds after each use.
const ALWAYS_SPECIAL = env.ALWAYS_SPECIAL === '1';
// For trying things out (and for the tests): UNLOCK_ALL=1 lets anyone race as the dogs that are bought in the Shop (shared/shop.js)
const unlockAll = () => env.UNLOCK_ALL === '1';
// For trying one item out: FORCE_ITEM=firework (or collar, frisbee, ball, toy, bone) makes every Treat
// Box give that item, even to the leader, and hands it to every dog at GO and three seconds after each use.
const FORCE_ITEM = ITEM_IDS.includes(env.FORCE_ITEM) ? env.FORCE_ITEM : null;
// After a race: once the first dog is home the rest have FINISH_GRACE_MS to finish (a dog left standing
// cannot hold everyone up), and when the race is over everyone goes back to the lobby together after
// LOBBY_RETURN_MS, or as soon as anyone asks.
const FINISH_GRACE_MS = Number(env.FINISH_GRACE_MS) || 60000;      // (both can be shortened for testing)
// A Grand Prix (shared/grandPrix.js) goes on to its next race LOBBY_RETURN_MS after each one ends, and
// shows its final scores for GRAND_PRIX_FINAL_MS before the room goes back to the lobby.
const GRAND_PRIX_FINAL_MS = Number(env.GRAND_PRIX_FINAL_MS) || 30000;
const LOBBY_RETURN_MS = Number(env.LOBBY_RETURN_MS) || 15000;

// Computer-controlled dogs a single-player game starts with (the player can change it): a full field
// unless SOLO_BOTS says otherwise.
const SOLO_BOTS = env.SOLO_BOTS === undefined ? MAX_PLAYERS - 1 : Math.max(0, Math.min(MAX_PLAYERS - 1, Number(env.SOLO_BOTS) || 0));
// ...and a room of players: enough to fill the grid, always (two players race three computer dogs),
// unless ROOM_BOTS says otherwise.  The game does not offer players the number, only how good they are.
const ROOM_BOTS = env.ROOM_BOTS === undefined ? MAX_PLAYERS - 1 : Math.max(0, Math.min(MAX_PLAYERS - 1, Number(env.ROOM_BOTS) || 0));

const rooms = new Map();
const playerRooms = new Map();
const proceduralRaceStates = new WeakMap();
const woodlandRaceStates = new WeakMap();
// (the old Wendover Woods model's own race rules: retired, since it was remade as a generated track: Tom, 2026-11-21)
const oldWendover = mapId => mapId === 'wendover' && !MAPS.wendover.procedural;
// The special a dog is using right now: { spec, until, timer }.  Kept off the player object, which is
// sent to the clients as it is (a timer cannot be sent).
const activeSpecials = new WeakMap();
const frostpeakRaceStates = new WeakMap();
// Ralph's burrows: the dogs underground right now ({ tunnel, startedAt }), and which burrows each dog
// has been down this lap ("lap:id")
const burrowRides = new WeakMap();
const burrowsUsed = new WeakMap();
// The computer-controlled dogs (server/bots.js): the driver of each, and how fast every dog in a race
// is going (worked out from its moves: the computer dogs look at it)
const botDrivers = new WeakMap();
const dogSpeeds = new WeakMap();
const BOT_TICK_MS = 50;            // a computer dog moves as often as a player's game reports in
// How long a player whose connection has dropped keeps their seat and their dog (see HELD SEATS)
const SEAT_HOLD_MS = Number(env.SEAT_HOLD_MS) || 60000;

// Ground heights, for balls that skim down a slope instead of flying level (Frostpeak's black run)
const BALL_GROUND = {};
for (const [mapId, map] of Object.entries(MAPS)) {
  if (!map.heightmap) continue;
  const buf = readFileSync(new URL(`../public${map.heightmap.file}`, import.meta.url));
  const heights = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  BALL_GROUND[mapId] = (x, z) => sampleGroundHeight(heights, map.heightmap, x, z);
}

// Ralph's burrows (shared/burrows.js): he runs into the mouth of one, is underground for a moment, and
// comes out further up the road.  Returns true while a burrow has him (going in, under, or coming out):
// the move he sent is not used.
function rideBurrow(room, player, data) {
  const tunnels = BURROWS[room.mapId] ?? [];
  const marks = BURROW_CHECKPOINTS[room.mapId], ride = burrowRides.get(player);
  if (ride) {
    const { tunnel, startedAt } = ride;
    if (Date.now() - startedAt < tunnel.duration * 1000) return true;
    player.position = [...tunnel.exit]; player.rotation = tunnel.exitYaw; player.animation = 'Sprint';
    if (tunnel.kelp) {
      // the kelp puts him down at a place in the race: its lap and its checkpoints are his
      player.lap = tunnel.lap; player.checkpoint = tunnel.checkpoint;
      const procedural = proceduralRaceStates.get(player);
      if (procedural && tunnel.landed) procedural.launchLap = tunnel.lap;
    } else {
      // Only checkpoints along this authorised shortcut are credited. No lap or finish is skipped.
      while (player.checkpoint < marks.length && marks[player.checkpoint] < tunnel.exitS) player.checkpoint++;
    }
    burrowRides.delete(player);
    const state = raceStateOf(room, player);
    if (state) state.revision++;                  // (moves sent from before he came out are ignored)
    broadcastProgress(room, player);
    io.to(room.code).emit('playerBurrowExited', {
      playerId: player.id, position: player.position, rotation: player.rotation,
      respawnRevision: state?.revision ?? 0, boostSeconds: tunnel.boostSeconds, speedMultiplier: tunnel.speedMultiplier, kelp: Boolean(tunnel.kelp)
    });
    return true;
  }
  if (player.dog !== 'ralph' || !burrowOpen(room, player)) return false;
  const used = burrowsUsed.get(player);
  for (const tunnel of tunnels) {
    const key = `${player.lap}:${tunnel.id}`;
    const required = marks.filter(s => s < tunnel.entryS).length;
    if (!used || used.has(key) || player.checkpoint !== required || !entersBurrow(player.position, data.position, tunnel)) continue;
    used.add(key);
    burrowRides.set(player, { tunnel, startedAt: Date.now() });
    player.position = [...tunnel.entry]; player.rotation = tunnel.entryYaw; player.animation = 'Run';
    endSpecial(room, player, 'cancelled');
    io.to(room.code).emit('playerBurrowEntered', { playerId: player.id, tunnelId: tunnel.id, duration: tunnel.duration });
    return true;
  }
  return false;
}

// May this dog still go down a burrow this lap?  (Wendover allows two of its four.)
function burrowOpen(room, player) {
  const used = burrowsUsed.get(player), limit = BURROWS_PER_LAP[room.mapId] ?? Infinity;
  return Boolean(used) && [...used].filter(key => key.startsWith(`${player.lap}:`)).length < limit;
}

function updateWoodlandRace(room, player, data) {
  const state = woodlandRaceStates.get(player);
  if ((data.respawnRevision ?? 0) !== state.revision) return false;
  if (rideBurrow(room, player, data)) return false;
  player.position = [...data.position]; player.rotation = data.rotation;
  return true;
}

// Is this dog up in the air on its special (Ralph's rocket paws)?
const flying = player => Boolean(activeSpecials.get(player)?.spec.flyHeight);

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
  if (rideBurrow(room, player, data)) return false;
  // (Ralph on his rocket paws flies above the height the cannon takes a dog at: it takes him all the same)
  const level = position => (flying(player) ? [position[0], FROSTPEAK_CANNON.takeoff[1], position[2]] : position);
  const lateral = FROSTPEAK_CANNON.cannonFired(level(player.position), level(data.position));
  if (lateral !== null) {
    state.launch = { startedAt: now, lateral };
    const point = FROSTPEAK_CANNON.launchPoint(0, lateral);
    player.position = [point.x, point.y, point.z];
    player.rotation = point.rotationY;
    player.animation = 'Jump';
    if (!flying(player)) endSpecial(room, player, 'cancelled');      // (Ralph keeps his rocket paws for the landing)
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
    const flight = track.launches?.[state.launch.index] ?? track.launch;
    const point = track.launchPoint(elapsed, state.launch.lateral, state.launch.index);
    player.position = [point.x, point.y, point.z];
    player.rotation = point.rotationY;
    player.animation = 'Jump';
    if (elapsed < flight.duration) return false;
    state.launch = null;
    state.landing = flight;
    state.launchLap = player.lap;
    state.revision += 1;
    player.animation = 'Sprint';
    io.to(room.code).emit('playerLanded', {
      playerId: player.id, position: player.position, rotation: player.rotation,
      respawnRevision: state.revision, boostSeconds: flight.boostSeconds,
      speedMultiplier: flight.exitSpeedMultiplier
    });
    return true;
  }
  if (state.fall) {
    const elapsed = (now - state.fall.startedAt) / 1000;
    if (elapsed >= track.rules.respawnDelaySeconds) {
      const cp = track.checkpoints[player.checkpoint];
      const spread = Math.min(1.6, (cp.halfWidth - 1.2) / 2);
      let point = track.pointAt(cp.s, (2 - state.slot) * spread * 0.5);
      // Treat Road (Tom, 2026-11-21): back on the road where it fell, a little short of the edge it went over, not at the last
      // checkpoint, so that a dog that keeps falling still gets on (but not anywhere in the air on the catapult's flight)
      if (track.rules.respawnWhereFell) {
        const [fx, , fz] = state.fall.position, q = track.query(fx, fz);
        const flight = track.launch && q.s > track.launch.padStart - 5 && q.s < track.launch.landingS + 5;
        if (!flight && !track.isGap(q.s) && q.distance < q.halfWidth + 12) {
          const s = q.s - 3, hw = track.pointAt(s).halfWidth;
          point = track.pointAt(s, Math.max(-hw * 0.35, Math.min(hw * 0.35, q.lateral * 0.4)));
        }
      }
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
  if (rideBurrow(room, player, data)) return false;
  const [x, y, z] = data.position;
  track.setClock?.((now - room.startedAt) / 1000);       // (moving platforms: where they are is a matter of the race clock)
  const ground = track.query(x, z, -1, y);         // (how high it is says which level it is on, where there is a level below)
  const previous = track.launch ? track.query(player.position[0], player.position[2], -1, player.position[1]) : null;
  for (const pad of track.launches ?? (track.launch ? [track.launch] : [])) {
    // (a lift up from the level below takes only a dog that is down there; a catapult only one up on the road)
    if ((pad.under ? ground.level !== pad.under : Boolean(ground.level))) continue;
    if (previous.onTrack && previous.s >= pad.padStart && previous.s < pad.takeoffS
      && ground.s >= pad.takeoffS && ground.s <= pad.gapStart + 8
      && Math.abs(ground.lateral) <= ground.halfWidth
      && y > ground.y - 1.2 && (y < ground.y + 2.5 || flying(player))) {   // a dog jumping across the pad still launches, and so does Ralph flying over it
      const halfWidth = Math.min(ground.halfWidth, track.pointAt(pad.landingS).halfWidth) - 1;
      state.launch = { startedAt: now, lateral: Math.max(-halfWidth, Math.min(halfWidth, ground.lateral)), index: pad.index ?? 0 };
      const point = track.launchPoint(0, state.launch.lateral, state.launch.index);
      player.position = [point.x,point.y,point.z]; player.rotation = point.rotationY; player.animation = 'Jump';
      if (!flying(player)) endSpecial(room, player, 'cancelled');      // (Ralph keeps his rocket paws for the landing)
      io.to(room.code).emit('playerLaunched', { playerId: player.id, lateral: state.launch.lateral, launch: state.launch.index });
      return false;
    }
  }
  const position = ground.blocked && !ghostsThrough(activeSpecials.get(player)?.spec, ground)
    ? [ground.clampX, ground.dogY ?? ground.y, ground.clampZ]
    : [...data.position];
  if (ground.onTrack && crossedFinishLine(player.position, position, MAPS[room.mapId].startFinish)) {
    state.passedStart = true;
  }
  player.position = position;
  player.rotation = data.rotation;
  // things that move about the track and knock a dog over (the farm's tractor, sheep, pigs, sails and
  // rolling bales): where they are is a function of the time since GO, so the server can tell who is hit
  if (track.hazardHit && now >= player.hitImmuneUntil) {
    const hazard = track.hazardHit(data.position, (now - room.startedAt) / 1000);
    if (hazard) {
      io.to(room.code).emit('hazardHit', { playerId: player.id, hazard: hazard.id, kind: hazard.kind });
      hitPlayer(room, player, null, hazard.kind);
    }
  }
  // a broken bridge (Modbury Heights, the farm's pond): over the missing planks a dog has to be in the air.  A dog in the
  // middle of its special cannot jump, so its special carries it over.
  const inGap = ground.gap && y < ground.y + track.rules.gapClearance && !activeSpecials.has(player);
  if (!ground.onTrack || inGap || (!ground.blocked && y < ground.y - track.rules.fallStartsBelow)) {
    state.fall = { startedAt: now, position: [...player.position] };
    player.animation = 'Jump';
    endSpecial(room, player, 'cancelled');
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
  if (flying(player)) return;            // (Ralph in his Rocket Paws flies through them: Tom, 2026-11-21)
  (GOLDEN_BONE_SPOTS[room.mapId] ?? []).forEach((spot, index) => {
    if (room.boneTimers.has(index) || !touchesGoldenBone(previousPosition, player.position, spot)) return;
    io.to(room.code).emit('goldenBoneTaken', { index, playerId: player.id });
    botDrivers.get(player)?.boost();
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
  // the dog's own special: never for the leader, more likely the further back and the longer it has spent there
  // (player.comeback: chargeComebacks; shared/specials.js)
  const special = specialFor(player.dog) && (ALWAYS_SPECIAL || Math.random() < specialChance(place, standings.length, player.comeback ?? 0));
  if (special) player.comeback = 0;
  player.item = FORCE_ITEM ?? (special ? SPECIAL_ITEM : rollItem(place, standings.length, Math.random, { noFirework: !fireworkAllowed(room) }));
  if (player.item === 'firework' && !FORCE_ITEM) room.fireworksGiven = (room.fireworksGiven ?? 0) + 1, room.fireworkGivenAt = Date.now();
  io.to(room.code).emit('itemChanged', { playerId: player.id, item: player.item });
}

// May a Treat Box give a firework just now?  (shared/items.js FIREWORK_LIMIT: once or twice a race, like Mario Kart's blue shell)
function fireworkAllowed(room) {
  const now = Date.now();
  if (!room.startedAt || now - room.startedAt < FIREWORK_LIMIT.notBeforeMs) return false;
  if ((room.fireworksGiven ?? 0) >= FIREWORK_LIMIT.perRace) return false;
  if (room.fireworkGivenAt && now - room.fireworkGivenAt < FIREWORK_LIMIT.cooldownMs) return false;
  for (const p of room.players.values()) if (p.item === 'firework') return false;
  if (room.fireworks?.size) return false;                       // (none while any firework is flying, Jimmy's and Casper's too)
  return true;
}

function resetItems(room) {
  room.fireworksGiven = 0;
  room.fireworkGivenAt = null;
  stopFrisbees(room);
  stopFireworks(room);
  stopSheep(room);
  for (const timer of room.boneTimers?.values() ?? []) clearTimeout(timer);
  room.boneTimers = new Map();
  room.hazards = new Map();
  room.balls = new Map();
  room.nextItemId = 1;
  for (const timer of room.specialTimers ?? []) clearTimeout(timer);
  room.specialTimers = new Set();
  for (const player of room.players.values()) {
    player.item = null;
    player.hitImmuneUntil = 0;
    player.shieldUntil = 0;
    player.slowUntil = 0;
    clearTimeout(activeSpecials.get(player)?.timer);
    activeSpecials.delete(player);
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
    botDrivers.get(player)?.boost();
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
    // dropped on a moving platform (Neon Nexus) it rides along on it; dropped over nothing there it falls to the level below
    const track = PROCEDURAL_TRACKS[room.mapId];
    if (track?.platforms?.length) {
      track.setClock((Date.now() - room.startedAt) / 1000);
      const ground = track.query(hazard.position[0], hazard.position[2], -1, hazard.position[1]);
      const ride = !ground.level && track.isHole(ground.s) ? track.rideAt(hazard.position[0], hazard.position[2]) : null;
      if (ride) hazard.ride = ride;
      else hazard.position[1] = ground.y;
    }
    room.hazards.set(hazard.id, hazard);
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
    io.to(room.code).emit('hazardPlaced', { id: hazard.id, owner: hazard.owner, position: hazard.position, rotationY: hazard.rotationY, ride: hazard.ride ?? null });
  } else if (item === 'ball') {
    const origin = [x + forward[0] * BALL.launchAhead, y + BALL.height, z + forward[2] * BALL.launchAhead];
    // its whole route, bouncing off the walls, worked out now (a generated map knows where its walls are)
    const track = PROCEDURAL_TRACKS[room.mapId];
    track?.setClock?.((Date.now() - room.startedAt) / 1000);        // (where the bridges and platforms have swung to)
    const route = ballRoute(origin, forward, track ? (qx, qz, hint, qy) => track.query(qx, qz, hint, qy) : null);
    const ball = {
      id: `ball-${room.nextItemId++}`, owner: player.id, firedAt: Date.now(), origin, direction: forward, ...route,
      ground: room.mapId === 'frostpeak'          // skims down the black run rather than flying off level into the sky
    };
    room.balls.set(ball.id, ball);
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
    io.to(room.code).emit('ballThrown', { id: ball.id, owner: ball.owner, origin: ball.origin, direction: ball.direction, ground: ball.ground,
      legs: ball.legs, length: ball.length, popped: ball.popped, heights: ball.heights });
  } else if (item === 'frisbee') {
    throwFrisbee(room, player);
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
  } else if (item === 'firework') {
    launchFirework(room, player, { fromBox: true });
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
  } else if (item === 'collar') {
    // the golden shield: see hitPlayer for what it stops
    player.shieldUntil = Date.now() + COLLAR.durationMs;
    io.to(room.code).emit('itemUsed', { playerId: player.id, item });
    io.to(room.code).emit('shieldStarted', { playerId: player.id, durationMs: COLLAR.durationMs });
  } else if (item === SPECIAL_ITEM) {
    startSpecial(room, player);
  }
  // trying things out: the same again in three seconds
  if (item === SPECIAL_ITEM ? ALWAYS_SPECIAL : FORCE_ITEM) {
    const timer = setTimeout(() => {
      room.specialTimers.delete(timer);
      if (rooms.get(room.code) === room && room.status === 'racing' && room.players.get(player.id) === player) grantItem(room, player);
    }, 3000);
    room.specialTimers.add(timer);
  }
}

// ---------------------------------
// SPECIAL ABILITIES (shared/specials.js): each dog's own move.  The dog's own game moves it (faster,
// flying, or steering itself); the server says when it starts and ends, and decides who it hits.
// ---------------------------------
function startSpecial(room, player) {
  const spec = specialFor(player.dog);
  if (!spec) return;
  if (spec.kind === 'kelp') { kelpDive(room, player); return; }       // (over in a moment: nothing to keep track of)
  if (spec.kind === 'sheep') { releaseSheep(room, player); return; }  // (the flock is on its own from here: he just runs on)
  if (spec.kind === 'quake') { earthquake(room, player); return; }    // (one stomp, and it is everyone else's problem)
  clearTimeout(activeSpecials.get(player)?.timer);
  // (Ralph's rocket paws last longer the further back he is)
  const standings = raceStandings(room), place = standings.find(entry => entry.playerId === player.id)?.place ?? 1;
  const now = Date.now(), durationMs = spec.lessPerPlaceMs ? specialDurationMs(spec, place, standings.length) : spec.durationMs;
  activeSpecials.set(player, {
    spec, until: now + durationMs,
    timer: setTimeout(() => {
      if (rooms.get(room.code) === room && room.players.get(player.id) === player) endSpecial(room, player, 'done');
    }, durationMs)
  });
  const started = { playerId: player.id, kind: spec.kind, durationMs };
  if (spec.kind === 'flush') started.targets = sendPheasants(room, player);
  if (spec.fireworks) started.fireworks = dragonFireworks(spec, place, standings.length), dragonFire(room, player, spec, started.fireworks);
  io.to(room.code).emit('specialStarted', started);
  botDrivers.get(player)?.specialStarted();
}

function endSpecial(room, player, reason) {
  const active = activeSpecials.get(player);
  if (!active) return;
  clearTimeout(active.timer);
  activeSpecials.delete(player);
  if (reason !== 'done' && active.spec.fireworks) player.dragonBroken = true;      // (a fall ends the dragon, and no more fireworks come)
  io.to(room.code).emit('specialEnded', { playerId: player.id, reason });
  // Casper's Try Time, run to its end: the ball goes up the road after the leader
  if (reason === 'done' && active.spec.pass && room.status === 'racing' && !player.finished) launchFirework(room, player, { look: 'rugby' });
}

// Jimmy's Dragon Dance: a firework after the leader now, and another every `everyMs` until he has sent `count`.
// Each is the Treat Box firework in every way, but if Jimmy himself is leading it goes for the dog behind him.
// They keep coming after the dragon has gone (the last of five goes a second later), unless he falls, finishes or leaves.
function dragonFire(room, player, spec, count) {
  for (let i = 0; i < count; i++) {
    const timer = setTimeout(() => {
      room.specialTimers.delete(timer);
      if (rooms.get(room.code) !== room || room.status !== 'racing' || room.players.get(player.id) !== player || player.finished) return;
      if (i > 0 && player.dragonBroken) return;
      launchFirework(room, player, { orBehind: true });
    }, i * spec.fireworks.everyMs);
    room.specialTimers.add(timer);
  }
  player.dragonBroken = false;
}

// Jazz's Earthquake (shared/specials.js QUAKE): every other dog still racing and on the ground is slowed, for longer
// the nearer the front it is (quakeSeconds),
// its own special or not (only Ralph, flying, is out of it).  Each dog's own game
// slows it (the server says who); the computer's dogs are slowed here (slowUntil, read in tickBots).
function earthquake(room, player) {
  const now = Date.now(), slowed = [], secondsFor = {};
  const places = new Map(raceStandings(room).map(entry => [entry.playerId, entry.place]));
  for (const victim of room.players.values()) {
    if (victim === player || victim.finished || activeSpecials.get(victim)?.spec.flyHeight || now < victim.shieldUntil || burrowRides.has(victim)) continue;
    const seconds = secondsFor[victim.id] = quakeSeconds(places.get(victim.id));      // (by its own place: the leader longest)
    victim.slowUntil = now + seconds * 1000;
    slowed.push(victim.id);
  }
  io.to(room.code).emit('earthquake', { playerId: player.id, position: player.position, slowed, secondsFor, seconds: QUAKE.seconds, speed: QUAKE.speed });
}

// Rocky's Sheep Stampede (shared/specials.js SHEEP): the server runs five sheep up the road, telling
// everyone where they are, and each knocks over the first dog it reaches.
function releaseSheep(room, player) {
  // how far round the lap and across the road Rocky is: the flock is centred on him
  const { s, across } = roadPlace(room, player.position);
  const now = Date.now(), flock = [];
  room.sheep ??= new Map();
  for (let i = 0; i < SHEEP.count; i++) {
    const offset = i - (SHEEP.count - 1) / 2;
    const sheep = {
      id: `sheep-${room.nextItemId++}`, owner: player.id, bornAt: now,
      s: s + SHEEP.ahead - Math.abs(offset) * SHEEP.stagger, lateral: across + offset * SHEEP.spacing,
    };
    placeSheep(room, sheep);
    room.sheep.set(sheep.id, sheep);
    flock.push({ id: sheep.id, position: sheep.position, yaw: sheep.yaw });
  }
  io.to(room.code).emit('sheepReleased', { owner: player.id, sheep: flock });
  room.sheepTimer ??= setInterval(() => tickSheep(room), SHEEP.tickMs);
}

// Where on the road a position is: how far round the lap, and how far across from the middle
function roadPlace(room, position) {
  const path = PICKUP_PATHS[room.mapId], s = fireworkRoute(room.mapId).sAt(position), centre = path.pointAt(s), side = path.pointAt(s, 1);
  return { s, across: (position[0] - centre.x) * (side.x - centre.x) + (position[2] - centre.z) * (side.z - centre.z) };
}

// Where a sheep is: on the road at its distance round the lap, kept inside the edges
function placeSheep(room, sheep) {
  const path = PICKUP_PATHS[room.mapId], L = path.length, s = ((sheep.s % L) + L) % L;
  const reach = Math.max(0, path.pointAt(s).halfWidth - SHEEP.edge);
  const point = path.pointAt(s, path.hold ? path.hold(s, sheep.lateral, SHEEP.edge) : Math.max(-reach, Math.min(reach, sheep.lateral)));
  const y = BALL_GROUND[room.mapId] ? BALL_GROUND[room.mapId](point.x, point.z) : point.y;
  sheep.position = [point.x, y, point.z];
  sheep.yaw = point.rotationY;
}

function tickSheep(room) {
  if (rooms.get(room.code) !== room || room.status !== 'racing') { stopSheep(room); return; }
  const now = Date.now(), dt = SHEEP.tickMs / 1000, moved = [], L = PICKUP_PATHS[room.mapId].length;
  // the dogs a sheep could go for, and where each is on the road
  const dogs = [...room.players.values()].filter(dog => !dog.finished && !burrowRides.has(dog)).map(dog => ({ dog, ...roadPlace(room, dog.position) }));
  for (const sheep of room.sheep.values()) {
    if (now - sheep.bornAt > SHEEP.seconds * 1000) {
      room.sheep.delete(sheep.id);
      io.to(room.code).emit('sheepGone', { id: sheep.id, position: sheep.position });
      continue;
    }
    sheep.s += SHEEP.speed * dt;
    // it veers towards the nearest dog up the road in front of it
    const aheadBy = place => (((place.s - sheep.s) % L) + L) % L;
    const quarry = dogs.filter(place => place.dog.id !== sheep.owner && now >= place.dog.hitImmuneUntil && aheadBy(place) <= SHEEP.sees)
      .sort((a, b) => aheadBy(a) - aheadBy(b))[0];
    if (quarry) sheep.lateral += Math.max(-SHEEP.steer * dt, Math.min(SHEEP.steer * dt, quarry.across - sheep.lateral));
    placeSheep(room, sheep);
    const near = (position, radius) => Math.hypot(position[0] - sheep.position[0], position[2] - sheep.position[2]) <= radius;
    // chew toys in the way go flying
    for (const toy of [...room.hazards.values()]) {
      if (!near(toy.position, SHEEP.hitRadius)) continue;
      room.hazards.delete(toy.id);
      io.to(room.code).emit('hazardRemoved', { id: toy.id, hitBy: 'special' });
    }
    // the first dog it reaches (a dog down a burrow, or jumping clean over, is missed)
    const victim = [...room.players.values()].find(dog => dog.id !== sheep.owner && !dog.finished && now >= dog.hitImmuneUntil
      && !burrowRides.has(dog) && near(dog.position, SHEEP.hitRadius) && Math.abs(dog.position[1] - sheep.position[1]) <= SHEEP.hitHeight);
    if (victim) {
      room.sheep.delete(sheep.id);
      io.to(room.code).emit('sheepGone', { id: sheep.id, position: sheep.position, hit: victim.id });
      hitPlayer(room, victim, sheep.owner, SPECIAL_ITEM);            // (a dog in its own special, or flying, shrugs it off)
      continue;
    }
    moved.push({ id: sheep.id, position: sheep.position, yaw: sheep.yaw });
  }
  if (moved.length) io.to(room.code).emit('sheepMoved', { sheep: moved });
  if (room.sheep.size === 0) stopSheep(room);
}

function stopSheep(room) {
  if (room.sheepTimer) clearInterval(room.sheepTimer);
  room.sheepTimer = null;
  room.sheep = new Map();
}

// Kombu's Kelp Dive (shared/specials.js KELP): where he comes up, worked out along the road.  He is
// taken under like Ralph down a burrow (the same ride), with the lap and checkpoints of the place he
// comes up at.
function kelpDive(room, player) {
  const route = fireworkRoute(room.mapId), path = PICKUP_PATHS[room.mapId], L = route.length;
  const here = (player.lap - 1) * L + route.sAt(player.position);
  // further the further back he is (as far as Poppy's wave takes her, from last); on the last lap, not over the finish line
  const place = raceStandings(room).find(entry => entry.playerId === player.id)?.place ?? 1;
  let landing = Math.min(here + kelpDistance(place), lapsFor(room.mapId) * L - KELP.beforeFinish);
  // (on to plain road: not into a jump, a pool, a hazard or the start of a catapult)
  const clear = s => !path.hazards.some(([a, b]) => { const mid = (a + b) / 2, d = Math.abs(s - mid) % L; return Math.min(d, L - d) <= (b - a) / 2 + 2; });
  for (let tries = 0; tries < 60 && landing > here && !clear(((landing % L) + L) % L); tries++) landing -= 4;
  if (!(landing - here >= KELP.worthIt) || raceStateOf(room, player)?.launch || raceStateOf(room, player)?.fall || burrowRides.has(player)) {
    // nowhere worth going: the kelp gives him a shove instead (a golden bone's dash)
    io.to(room.code).emit('itemUsed', { playerId: player.id, item: 'bone' });
    botDrivers.get(player)?.boost();
    return;
  }
  const s = ((landing % L) + L) % L, lap = Math.floor(landing / L) + 1, point = path.pointAt(s);
  const y = BALL_GROUND[room.mapId] ? BALL_GROUND[room.mapId](point.x, point.z) : point.y;
  const checkpoint = BURROW_CHECKPOINTS[room.mapId].filter(mark => mark < s).length;
  const tunnel = {
    id: 'kelp', kelp: true, name: 'Kelp Dive', entry: [...player.position], entryYaw: player.rotation,
    exit: [point.x, y, point.z], exitYaw: point.rotationY, exitS: s, lap, checkpoint,
    // (if he comes up beyond a catapult's landing, he has "landed" this lap)
    landed: MAPS[room.mapId].checkpoints.slice(0, checkpoint).some(cp => cp.launchLanding),
    duration: KELP.seconds, boostSeconds: KELP.boostSeconds, speedMultiplier: KELP.speedMultiplier,
  };
  burrowRides.set(player, { tunnel, startedAt: Date.now() });
  player.animation = 'Jump';
  io.to(room.code).emit('playerBurrowEntered', { playerId: player.id, tunnelId: tunnel.id, duration: tunnel.duration, kelp: true,
    tunnel: { id: tunnel.id, name: tunnel.name, entry: tunnel.entry, entryYaw: tunnel.entryYaw, exit: tunnel.exit } });
}

// Pippa's pheasants: one for every other dog still racing.  Each lands after its flight time and
// knocks its dog over, unless that dog cannot be hit just then (it flies off in a puff all the same).
function sendPheasants(room, owner) {
  const targets = [];
  for (const victim of room.players.values()) {
    if (victim === owner || victim.finished) continue;
    const flightMs = pheasantFlightMs(Math.hypot(victim.position[0] - owner.position[0], victim.position[2] - owner.position[2]));
    targets.push({ id: victim.id, flightMs });
    const timer = setTimeout(() => {
      room.specialTimers.delete(timer);
      if (rooms.get(room.code) !== room || room.status !== 'racing' || room.players.get(victim.id) !== victim) return;
      const hit = !victim.finished && Date.now() >= victim.hitImmuneUntil && !burrowRides.has(victim) && !activeSpecials.has(victim);
      io.to(room.code).emit('pheasantLanded', { owner: owner.id, playerId: victim.id, hit });
      if (hit) hitPlayer(room, victim, owner.id, SPECIAL_ITEM);
    }, flightMs);
    room.specialTimers.add(timer);
  }
  return targets;
}

// Checked on every dog's move: is a dog on a sled, in a spin or on a wave touching another dog?
function checkSpecialContacts(room, mover) {
  const now = Date.now();
  for (const owner of room.players.values()) {
    const spec = activeSpecials.get(owner)?.spec;
    if (!(spec?.hitRadius || spec?.rope) || owner.finished) continue;
    // (the twins' rope is right across the road wherever they are on it)
    const ropeAt = spec.rope ? { s: roadPlace(room, owner.position).s, y: owner.position[1] } : null;
    for (const victim of owner === mover ? room.players.values() : [mover]) {
      if (victim === owner || victim.finished || now < victim.hitImmuneUntil || burrowRides.has(victim) || activeSpecials.has(victim)) continue;
      if (ropeAt ? !ropeTrips(spec, ropeAt, { s: roadPlace(room, victim.position).s, y: victim.position[1] }, PICKUP_PATHS[room.mapId].length)
        : !specialTouches(spec, owner.position, owner.rotation, victim.position)) continue;
      io.to(room.code).emit('specialHit', { playerId: owner.id, victim: victim.id });
      hitPlayer(room, victim, owner.id, SPECIAL_ITEM);
    }
  }
}

// ---------------------------------
// RED FRISBEE: chases the dog that was directly ahead of the thrower when it was thrown (that one dog,
// even if someone overtakes the thrower meanwhile: Tom, 2026-11-24, it must "never come back on itself"),
// up the road (shared/frisbee.js), knocks that dog over and is gone.  It flies straight through anyone
// else.  Only if its dog finishes or leaves does it look for another, the nearest up the road ahead of it.
// The server flies it (it has to see every dog), moving it every FRISBEE.tickMs and telling everyone
// where it is, and it gives up after FRISBEE.duration.
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
  const position = [x + forward[0] * FRISBEE.launchAhead, y + FRISBEE.height, z + forward[2] * FRISBEE.launchAhead];
  const frisbee = {
    id: `frisbee-${room.nextItemId++}`, owner: player.id, target: frisbeeTarget(room, player), firedAt: Date.now(),
    ...launchFrisbee(fireworkRoute(room.mapId), position, player.rotation)
  };
  room.frisbees.set(frisbee.id, frisbee);
  io.to(room.code).emit('frisbeeThrown', { id: frisbee.id, owner: frisbee.owner, target: frisbee.target, position: frisbee.position, yaw: frisbee.yaw });
  room.frisbeeTimer ??= setInterval(() => tickFrisbees(room), FRISBEE.tickMs);
}

function tickFrisbees(room) {
  if (rooms.get(room.code) !== room || room.status !== 'racing') { stopFrisbees(room); return; }
  const now = Date.now(), dt = FRISBEE.tickMs / 1000, moved = [], route = fireworkRoute(room.mapId);
  for (const f of room.frisbees.values()) {
    if ((now - f.firedAt) / 1000 > FRISBEE.duration) {
      room.frisbees.delete(f.id);
      io.to(room.code).emit('frisbeeGone', { id: f.id, position: f.position });
      continue;
    }
    let target = room.players.get(f.target);
    if ((!target || target.finished) && !f.lost) {
      target = nextUpTheRoad(room, f, route);
      if (target) io.to(room.code).emit('frisbeeTarget', { id: f.id, target: (f.target = target.id) });
    }
    const from = f.position;
    Object.assign(f, stepFrisbee(f, route, target && !target.finished && !f.lost ? target.position : null, dt));
    // a chew toy in its way stops it: both are gone (drop one behind you to block the frisbee chasing you)
    const toy = [...room.hazards.values()].find(hazard => thrownItemMeetsToy(from, f.position, hazard));
    if (toy) {
      room.frisbees.delete(f.id);
      room.hazards.delete(toy.id);
      io.to(room.code).emit('frisbeeGone', { id: f.id, position: f.position });
      io.to(room.code).emit('hazardRemoved', { id: toy.id, hitBy: 'frisbee' });
      continue;
    }
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

// A frisbee whose dog has finished or left: the nearest dog still racing up the road in front of it (not the thrower)
function nextUpTheRoad(room, f, route) {
  let best = null, bestGap = route.length / 2;
  for (const dog of room.players.values()) {
    if (dog.id === f.owner || dog.finished || !dog.position) continue;
    const gap = roadAhead(route, f.s, dog.position);
    if (gap < bestGap) { best = dog; bestGap = gap; }
  }
  return best;
}

function stopFrisbees(room) {
  if (room.frisbeeTimer) clearInterval(room.frisbeeTimer);
  room.frisbeeTimer = null;
  room.frisbees = new Map();
}

// ---------------------------------
// FIREWORK: goes after the dog in first place, wherever it is.  It flies up the middle of the road
// (shared/firework.js) faster than any dog, knocks over any dog it passes close to on the way (once
// each, and never the dog that lit it), and when it reaches the leader it bursts, knocking over every
// dog within FIREWORK.blastRadius.  If the lead changes while it flies it goes after the new leader;
// if the dog that lit it takes the lead there is nobody to chase and it burns out.  The server flies
// it, moving it every FIREWORK.tickMs and telling everyone where it is.
// ---------------------------------
// orBehind (Jimmy's): if the dog that lit it is the one in front, it goes for the next dog behind instead
function fireworkTarget(room, ownerId, orBehind = false) {
  const racing = raceStandings(room).filter(entry => !entry.finished), leader = racing[0];
  if (leader && leader.playerId !== ownerId) return leader.playerId;
  return orBehind && leader && racing[1] ? racing[1].playerId : null;
}
// (a firework for a dog behind the one that lit it does not go round by the road: it turns and goes straight there)
const fireworkTurnsBack = (room, f) => Boolean(f.orBehind && raceStandings(room).find(entry => !entry.finished)?.playerId === f.owner);

// look: what it is drawn as, where that is not a rocket ('rugby': the ball Casper passes at the end of his Try Time)
// fromBox: lit from a Treat Box (not Jimmy's or Casper's), so it counts towards FIREWORK_LIMIT's one at a time
function launchFirework(room, player, { orBehind = false, look = null, fromBox = false } = {}) {
  const route = fireworkRoute(room.mapId);
  if (!route) return;
  const forward = forwardOf(player.rotation);
  const [x, y, z] = player.position;
  const firework = {
    id: `firework-${room.nextItemId++}`, owner: player.id, target: fireworkTarget(room, player.id, orBehind), firedAt: Date.now(), orBehind,
    s: route.sAt(player.position) + FIREWORK.launchAhead, homing: false, passed: new Set(), look, fromBox,
    position: [x + forward[0] * FIREWORK.launchAhead, y + FIREWORK.height, z + forward[2] * FIREWORK.launchAhead], yaw: player.rotation
  };
  firework.homing = fireworkTurnsBack(room, firework);
  room.fireworks.set(firework.id, firework);
  // any firework (a Treat Box's, Jimmy's or Casper's ball) starts the wait before a Treat Box gives another (Tom, 2026-11-24)
  room.fireworkGivenAt = Date.now();
  io.to(room.code).emit('fireworkLaunched', { id: firework.id, owner: firework.owner, target: firework.target, position: firework.position, yaw: firework.yaw, ...(look ? { look } : {}) });
  room.fireworkTimer ??= setInterval(() => tickFireworks(room), FIREWORK.tickMs);
}

function tickFireworks(room) {
  if (rooms.get(room.code) !== room || room.status !== 'racing') { stopFireworks(room); return; }
  const route = fireworkRoute(room.mapId);
  const now = Date.now(), dt = FIREWORK.tickMs / 1000, moved = [];
  const canBeHit = dog => !dog.finished && now >= dog.hitImmuneUntil && !burrowRides.has(dog) && !activeSpecials.has(dog);
  for (const f of room.fireworks.values()) {
    const targetId = fireworkTarget(room, f.owner, f.orBehind);
    const target = targetId ? room.players.get(targetId) : null;
    const age = (now - f.firedAt) / 1000;
    if (age > FIREWORK.duration || (!target && age > FIREWORK.noTargetSeconds)) {
      room.fireworks.delete(f.id);
      io.to(room.code).emit('fireworkGone', { id: f.id, position: f.position });
      continue;
    }
    if (targetId !== f.target) {
      f.target = targetId;
      f.homing = fireworkTurnsBack(room, f);                     // back to the road to find the new leader
      io.to(room.code).emit('fireworkTarget', { id: f.id, target: f.target });
    }
    const from = f.position;
    const step = stepFirework(f, route, target ? target.position : null, dt);
    f.s = step.s; f.position = step.position; f.yaw = step.yaw; f.homing = step.homing;
    if (step.arrived) {
      // (only the dog it was after: Tom, 2026-11-21, "only hit the first person and no one else")
      // (Casper's rugby ball still bowls over everyone round the leader, and anyone it passes)
      const caught = f.look === 'rugby'
        ? [...room.players.values()].filter(dog => dog.id !== f.owner && canBeHit(dog) && inFireworkBlast(f.position, dog.position))
        : target && target.id !== f.owner && canBeHit(target) && inFireworkBlast(f.position, target.position) ? [target] : [];
      room.fireworks.delete(f.id);
      io.to(room.code).emit('fireworkExploded', { id: f.id, position: f.position, target: targetId, playerIds: caught.map(dog => dog.id) });
      for (const dog of caught) hitPlayer(room, dog, f.owner, 'firework');
      continue;
    }
    // a firework flies straight past every other dog on the way: it hits only the one it is after.  Casper's rugby ball
    // knocks over any dog it passes
    for (const dog of f.look === 'rugby' ? room.players.values() : []) {
      if (dog.id === f.owner || dog.id === targetId || f.passed.has(dog.id) || !fireworkPasses(from, f.position, dog.position)) continue;   // (the leader gets the burst)
      f.passed.add(dog.id);
      if (!canBeHit(dog)) continue;
      io.to(room.code).emit('fireworkPassed', { id: f.id, playerId: dog.id, position: f.position });
      hitPlayer(room, dog, f.owner, 'firework');
    }
    moved.push({ id: f.id, position: f.position, yaw: f.yaw });
  }
  if (moved.length) io.to(room.code).emit('fireworksMoved', { fireworks: moved });
  if (room.fireworks.size === 0) stopFireworks(room);
}

function stopFireworks(room) {
  if (room.fireworkTimer) clearInterval(room.fireworkTimer);
  room.fireworkTimer = null;
  room.fireworks = new Map();
}

// Knock a dog over.  A dog wearing the golden collar is not knocked over by anything except another
// dog's special: the hit is turned away (and whatever was thrown is still used up).  Returns whether
// the dog went down.
function hitPlayer(room, player, by, item) {
  const now = Date.now();
  // nothing knocks a dog out of its special, and the golden collar turns away everything but a special
  if (activeSpecials.has(player) || (item !== SPECIAL_ITEM && now < player.shieldUntil)) {
    if (now - (player.blockedAt ?? 0) > 300) {                   // a tractor pushing at the shield says so once, not every step
      player.blockedAt = now;
      io.to(room.code).emit('hitBlocked', { playerId: player.id, by, item });
    }
    return false;
  }
  player.hitImmuneUntil = now + HIT.immuneMs;
  endSpecial(room, player, 'hit');                               // knocked over: whatever special it was using is lost
  const stunMs = item === SPECIAL_ITEM ? SPECIAL_HIT.stunMs : item === 'toy' ? HIT.toyStunMs : item === 'firework' ? HIT.fireworkStunMs : HIT.ballStunMs;
  io.to(room.code).emit('playerHit', { playerId: player.id, by, item, stunMs });
  botDrivers.get(player)?.hit(stunMs);
  return true;
}

// Checked on each of the dog's own moves: did a ball or a dropped toy get it?
function checkItemHits(room, player, previousPosition) {
  const now = Date.now();
  for (const ball of room.balls.values()) {
    const age = (now - ball.firedAt) / 1000;
    if (age > ballSeconds(ball)) { room.balls.delete(ball.id); continue; }
    const groundAt = BALL_GROUND[room.mapId];
    const from = ballPositionAt(ball, Math.max(0, age - 0.12), groundAt), to = ballPositionAt(ball, age, groundAt);
    // a ball that meets a chew toy knocks it off the road, and that is the end of the ball too
    const toy = [...room.hazards.values()].find(hazard => thrownItemMeetsToy(from, to, hazard));
    if (toy) {
      room.balls.delete(ball.id);
      room.hazards.delete(toy.id);
      io.to(room.code).emit('ballHit', { id: ball.id, position: to });
      io.to(room.code).emit('hazardRemoved', { id: toy.id, hitBy: 'ball' });
      continue;
    }
    if (ball.owner === player.id || now < player.hitImmuneUntil) continue;
    if (Math.abs(player.position[1] + 1 - to[1]) <= 3
      && distanceToSegment(player.position, from, to) <= BALL.radius) {
      room.balls.delete(ball.id);
      io.to(room.code).emit('ballHit', { id: ball.id, playerId: player.id, position: to });
      hitPlayer(room, player, ball.owner, 'ball');
    }
  }
  // A chew toy is gone once any dog runs into it; a dog still recovering from a hit is not
  // knocked over again, but the toy goes all the same.  A dog in the middle of its special sends the
  // toy flying and carries on: the sled, the spin and the wave sweep up any toy they touch.
  const special = activeSpecials.get(player)?.spec;
  const track = PROCEDURAL_TRACKS[room.mapId];
  for (const hazard of room.hazards.values()) {
    if (hazard.ride && track) hazard.position = track.ridePosition(hazard.ride, (now - room.startedAt) / 1000) ?? hazard.position;      // (on a platform: where it has been carried to)
    if (hazard.owner === player.id && now - hazard.placedAt < TOY.ownerGraceMs) continue;
    const above = player.position[1] - hazard.position[1];
    if (above > TOY.jumpClear || above < -2) continue;              // jumped clean over it
    const swept = special && specialTouches(special, player.position, player.rotation, hazard.position);
    if (swept || distanceToSegment(hazard.position, previousPosition, player.position) <= TOY.radius) {
      room.hazards.delete(hazard.id);
      io.to(room.code).emit('hazardRemoved', { id: hazard.id, hitBy: player.id });
      if (!special && Date.now() >= player.hitImmuneUntil) hitPlayer(room, player, hazard.owner, 'toy');
    }
  }
}

// Frostpeak's slalom gates and snowmen (shared/slalom.js): a dog that runs into one is slowed, and knocks it down (a gate
// springs back up a moment later, a snowman is built again in a while).  Everyone is told, so that every game draws it.
function checkSlalom(room, player, previousPosition) {
  const now = Date.now();
  const moved = Math.hypot(player.position[0] - previousPosition[0], player.position[2] - previousPosition[2]);
  if (moved > 12) return;                                   // (a respawn or a landing: not a run through the gates)
  room.slalomDown ??= new Map();
  for (const o of slalomHits(previousPosition, player.position, index => !(room.slalomDown.get(index) > now))) {
    const downMs = o.kind === 'gate' ? SLALOM.gate.flatMs : SLALOM.snowman.respawnMs;
    room.slalomDown.set(o.index, now + downMs);
    io.to(room.code).emit('slalomHit', { index: o.index, kind: o.kind, playerId: player.id, downMs });
    // (a computer dog is slowed here; a player's own game slows its dog when it hears)
    if (botDrivers.has(player)) player.slowUntil = Math.max(player.slowUntil ?? 0, now + (o.kind === 'gate' ? 500 : 1100));
  }
}

// Does something thrown, flying from one point to the next, run into a chew toy lying on the road?
function thrownItemMeetsToy(from, to, toy) {
  return Math.abs(to[1] - toy.position[1]) <= 3 && distanceToSegment(toy.position, from, to) <= TOY.radius;
}

// ---------------------------------
// AFTER THE RACE: back to the lobby, same room, same players
// ---------------------------------
function clearRaceEndTimers(room) {
  clearTimeout(room.finishTimer); clearTimeout(room.returnTimer);
  room.finishTimer = room.returnTimer = null;
}

// The first dog is home: the others have a limited time to finish.
function startFinishGrace(room) {
  if (room.finishTimer || room.status !== 'racing') return;
  room.finishTimer = setTimeout(() => { if (rooms.get(room.code) === room) endRace(room); }, FINISH_GRACE_MS);
  room.finishTimer.unref?.();
  io.to(room.code).emit('finishGrace', { ms: FINISH_GRACE_MS });
}

// Everyone is home (or time is up): the race is over, and the lobby follows shortly.
function endRace(room) {
  if (room.status !== 'racing') return;
  clearRaceEndTimers(room);
  room.status = 'finished';
  for (const player of room.players.values()) endSpecial(room, player, 'done');
  broadcastStandings(room);
  recordRace(room);
  if (room.grandPrix) { endGrandPrixRace(room); updateLobby(room); return; }
  room.returnTimer = setTimeout(() => returnToLobby(room), LOBBY_RETURN_MS);
  room.returnTimer.unref?.();
  io.to(room.code).emit('raceEnded', { returnMs: LOBBY_RETURN_MS });
  updateLobby(room);
}

// The race for the leaderboards: a row for each signed-in player still in it (guests and computer dogs are not kept)
function recordRace(room) {
  const places = new Map(raceStandings(room).map(entry => [entry.playerId, entry.place]));
  const results = [...room.players.values()].filter(player => player.userId && !player.bot).map(player => ({
    userId: player.userId, mapId: room.mapId, dog: player.dog, place: places.get(player.id), racers: room.players.size,
    finished: player.finished, raceSeconds: player.finishTime, bestLap: player.bestLap,
    grandPrix: room.grandPrix?.id ?? null, singlePlayer: room.singlePlayer, humans: room.raceHumans ?? 1,
  }));
  if (!results.length) return;
  try { db.recordRace(results); } catch (error) { console.error('Could not record the race:', error); }
  // ...and the coins it pays each of them (shared/shop.js): by place, less against easier computer dogs
  payCoins(room, results.map(result => ({ userId: result.userId, why: 'race', place: result.place,
    // (racers: as many as it started with, if someone has left since: the winner of a race between two is still a winner)
    coins: coinsForRace({ place: result.place, finished: result.finished, racers: Math.max(result.racers, result.humans), humans: result.humans, botLevel: room.bots?.level ?? 'hard' }) })));
}

// Pays signed-in players and tells the room: { playerId: { coins (just won), total (now held), why, place } }
function payCoins(room, payments) {
  const paid = {};
  for (const payment of payments) {
    const player = [...room.players.values()].find(each => each.userId === payment.userId && !each.bot);
    if (!player) continue;
    try { paid[player.id] = { coins: payment.coins, total: db.addCoins(payment.userId, payment.coins), why: payment.why, place: payment.place }; }
    catch (error) { console.error('Could not pay the coins:', error); }
  }
  if (Object.keys(paid).length) io.to(room.code).emit('coinsEarned', paid);
}

// What a player owns, for the dogs they may race as and what their dog wears (guests own nothing)
function walletOf(player) {
  if (!player?.userId) return { coins: 0, owned: [], equipped: {} };
  try { return db.wallet(player.userId) ?? { coins: 0, owned: [], equipped: {} }; } catch { return { coins: 0, owned: [], equipped: {} }; }
}

function recordGrandPrix(room, table) {
  const results = table.map((entry, index) => ({ entry, place: index + 1 }))
    .filter(({ entry }) => room.players.get(entry.playerId)?.userId && !entry.bot)
    .map(({ entry, place }) => ({ userId: room.players.get(entry.playerId).userId, grandPrix: room.grandPrix.id, place, points: entry.points, humans: room.raceHumans ?? 1 }));
  if (!results.length) return;
  try { db.recordGrandPrix(results); } catch (error) { console.error('Could not record the Grand Prix:', error); }
  // (a place on the podium of a Grand Prix pays on top of its four races)
  payCoins(room, results.filter(result => coinsForGrandPrix(result.place) > 0).map(result => ({ userId: result.userId, why: 'grandPrix', place: result.place, coins: coinsForGrandPrix(result.place) })));
}

// ---------------------------------
// GRAND PRIX (shared/grandPrix.js): four races with the same dogs (the computer dogs stay on between
// races), points for each place, and the scores shown after every race and at the end
// ---------------------------------
const grandPrixInfo = room => (room.grandPrix
  ? { id: room.grandPrix.id, name: GRAND_PRIX[room.grandPrix.id].name, round: room.grandPrix.round + 1, of: GRAND_PRIX[room.grandPrix.id].maps.length }
  : null);

function beginGrandPrix(room, id) {
  room.grandPrix = { id, round: 0, points: new Map() };
  room.mapId = GRAND_PRIX[id].maps[0];
}

// A race of the Grand Prix is over: points for the places, the table to everyone, and then the next
// race (or, after the last, back to the lobby once the winner has had their moment).
function endGrandPrixRace(room) {
  const gp = room.grandPrix, maps = GRAND_PRIX[gp.id].maps, final = gp.round >= maps.length - 1;
  const gained = new Map(raceStandings(room).map(entry => [entry.playerId, { place: entry.place, points: pointsForPlace(entry.place) }]));
  for (const [playerId, result] of gained) gp.points.set(playerId, (gp.points.get(playerId) ?? 0) + result.points);
  const table = [...room.players.values()]
    .map(player => ({ playerId: player.id, name: player.name, dog: player.dog, bot: Boolean(player.bot), points: gp.points.get(player.id) ?? 0,
      gained: gained.get(player.id)?.points ?? 0, place: gained.get(player.id)?.place ?? room.players.size }))
    .sort((a, b) => b.points - a.points || a.place - b.place);
  if (final) recordGrandPrix(room, table);
  const returnMs = final ? GRAND_PRIX_FINAL_MS : LOBBY_RETURN_MS;
  room.returnTimer = setTimeout(() => (final ? returnToLobby(room) : nextGrandPrixRace(room)), returnMs);
  room.returnTimer.unref?.();
  io.to(room.code).emit('grandPrixStandings', { ...grandPrixInfo(room), final, table, nextMapId: final ? null : maps[gp.round + 1] });
  io.to(room.code).emit('raceEnded', { returnMs, grandPrix: grandPrixInfo(room), final });
}

function nextGrandPrixRace(room) {
  if (rooms.get(room.code) !== room || room.status !== 'finished' || !room.grandPrix) return;
  room.grandPrix.round += 1;
  room.mapId = GRAND_PRIX[room.grandPrix.id].maps[room.grandPrix.round];
  for (const timer of room.treatBoxTimers.values()) clearTimeout(timer);
  room.treatBoxTimers = new Map();
  startRaceIn(room);
}

// Back to character select: everyone keeps their dog (and can change it), the room is listed again
// for others to join, and the host starts the next race as before.
function returnToLobby(room) {
  if (rooms.get(room.code) !== room || room.status !== 'finished') return;
  clearRaceEndTimers(room);
  resetItems(room);
  for (const timer of room.treatBoxTimers.values()) clearTimeout(timer);
  room.treatBoxTimers = new Map();
  room.votes = new Map();
  room.startedAt = null;
  room.status = 'lobby';
  room.grandPrix = null;
  removeBots(room);
  for (const player of room.players.values()) {
    player.loaded = false;
    player.hover = null;
    player.lap = 1;
    player.checkpoint = 0;
    player.finished = false;
    player.finishTime = null;
    player.animation = 'Idle';
    player.ready = Boolean(player.dog);
  }
  io.to(room.code).emit('returnedToLobby', { roomCode: room.code });
  updateLobby(room);
  console.log(`Room ${room.code} back in the lobby`);
}

// Puts everyone on the grid of room.mapId and tells the clients to load the race.
function startRaceIn(room) {
  // Single player and multiplayer are both supported.
  if (humans(room).length < 1) {
    return { success: false, error: 'At least one player is required' };
  }

  if (!humans(room).every((player) => player.dog && player.ready)) {
    return { success: false, error: 'Everyone needs to choose a dog first' };
  }

  clearMapVote(room);
  clearRaceEndTimers(room);

  // the computer dogs take the dogs and the grid places the players have left (and stay on, the same
  // dogs, for every race of a Grand Prix)
  if (!room.grandPrix || room.grandPrix.round === 0) addBots(room);
  else stopBots(room);
  const players = [...room.players.values()];

  // how many people this race is between (Tom, 2026-11-23): two or more and it goes on the Multiplayer leaderboards, otherwise
  // Single Player, a multiplayer room nobody else joined included.  Split screen is one game, so Single Player
  room.raceHumans = room.singlePlayer ? 1 : players.filter(player => !player.bot).length;
  players.forEach((player, index) => {
    const start = MAPS[room.mapId].startPositions[index];
    player.position = [...start.position];
    player.rotation = start.rotationY;
    player.animation = 'Idle';

    player.loaded = Boolean(player.bot);       // (nothing to load)
    player.lap = 1;
    player.checkpoint = 0;
    player.finished = false;
    player.finishTime = null;
    player.lapStartedAt = null;     // (null: the lap began at GO)
    player.bestLap = null;          // the quickest whole lap this race, in seconds
    burrowRides.delete(player);
    burrowsUsed.set(player, new Set());
    if (oldWendover(room.mapId)) woodlandRaceStates.set(player, { revision: 0 });
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
    grandPrix: grandPrixInfo(room),
    totalCheckpoints: MAPS[room.mapId].checkpoints.length,
    players,
    totalLaps: lapsFor(room.mapId)
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
  const state = oldWendover(room.mapId) ? woodlandRaceStates.get(player)
    : room.mapId === 'frostpeak' ? frostpeakRaceStates.get(player)
    : MAPS[room.mapId].procedural ? proceduralRaceStates.get(player) : null;
  if ((state && (state.launch || state.fall)) || burrowRides.has(player)) return false;      // already being handled
  const { position, rotation } = rescuePoint(room, player);
  if (oldWendover(room.mapId)) {
    const water = woodlandWaterAt(position[0], position[2]);
    if (water) position[1] = woodlandDogY(water, player.dog);
  }
  player.position = position;
  player.rotation = rotation;
  player.animation = 'Idle';
  if (state) state.revision += 1;                               // older packets from before the move are ignored
  endSpecial(room, player, 'cancelled');
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
    // split screen: two players at one computer (a single-player room with a second seat)
    local: room.local === true,
    // computer-controlled dogs: how many the host has asked for, and how good
    bots: room.bots,
    grandPrix: grandPrixInfo(room),
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
// The race starts when the two-minute countdown ends, or sooner when the host presses Start (Tom,
// 2026-11-26): most votes wins, a tie (say 50/50) is a random pick between the tied maps, and no
// votes at all picks a random map.

const MAP_VOTE_MS = 120000;

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
    : MAP_IDS;
  const choice = candidates[Math.min(candidates.length - 1, Math.floor(Math.random() * candidates.length))];
  room.grandPrix = null;
  if (Object.hasOwn(GRAND_PRIX, choice)) beginGrandPrix(room, choice);      // (a vote can be for a Grand Prix as well as a map)
  else room.mapId = choice;
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
    voice: false,            // microphone on for voice chat (the players talk to each other directly)
    hitImmuneUntil: 0,
    slowUntil: 0,            // shaken by Jazz's Earthquake until then
    shieldUntil: 0,          // wearing the golden collar: shielded from everything but specials until then
    away: false              // their connection has dropped and their seat is being held (see HELD SEATS)
  };
}

function getRaceProgress(room, player) {
  return {
    playerId: player.id,
    lap: player.lap,
    checkpoint: player.checkpoint,
    totalCheckpoints: MAPS[room.mapId].checkpoints.length,
    totalLaps: lapsFor(room.mapId),
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
      finished: player.finished,
      away: Boolean(player.away)         // their connection has dropped or gone quiet: the dog is running itself
    }));
}

function broadcastStandings(room) {
  room.standingsSentAt = Date.now();
  io.to(room.code).emit('raceStandings', { standings: raceStandings(room) });
}

function beginCountdown(room) {
  if (room.status !== 'loading') return;

  const everyoneLoaded = [...room.players.values()]
    .every((player) => player.loaded || player.away);

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
      room.slalomDown = new Map();          // (every gate up and every snowman built, for the new race)
      room.countdownTimer = null;

      io.to(room.code).emit('raceGo', {
        startedAt: room.startedAt
      });
      broadcastStandings(room);
      startBots(room);
      clearInterval(room.stallTimer);
      for (const player of room.players.values()) player.comeback = 0;
      room.stallTimer = setInterval(() => { chargeComebacks(room, 1); watchForStalls(room); }, 1000);
      room.stallTimer.unref?.();
      if (ALWAYS_SPECIAL || FORCE_ITEM) for (const player of room.players.values()) grantItem(room, player);

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

  const lapEnded = Date.now(), lapSeconds = (lapEnded - (player.lapStartedAt ?? room.startedAt)) / 1000;
  player.bestLap = Math.min(player.bestLap ?? Infinity, lapSeconds);
  player.lapStartedAt = lapEnded;

  if (player.lap >= lapsFor(room.mapId)) {
    player.finished = true;
    player.finishTime =
      (Date.now() - room.startedAt) / 1000;
    endSpecial(room, player, 'done');

    broadcastProgress(room, player);

    io.to(room.code).emit('playerFinished', {
      playerId: player.id,
      name: player.name,
      finishTime: player.finishTime
    });

    console.log(
      `${player.name} finished in ${player.finishTime}s`
    );

    botDrivers.get(player)?.finish();
    if (everyoneHome(room)) {
      endRace(room);
    } else {
      startFinishGrace(room);
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

// ---------------------------------
// HELD SEATS: a player whose connection drops (a refresh, a wobble in the wifi) keeps their place and
// their dog for SEAT_HOLD_MS.  In a race the dog jogs on along the road by itself meanwhile, driven as
// a computer dog is (server/bots.js, AWAY_DRIVER).  If the same browser comes back in time it gets the
// seat again ('resume'); if not, the player leaves as they would have.
// ---------------------------------
const heldSeats = new Map();       // the browser's token -> { roomCode, playerId, timer }
// The connections that have said who they are: token -> { playerId(), supersede() }.  A browser that
// reconnects before the server has noticed its old connection is dead takes the seat over from it.
const liveSeats = new Map();
// A player still connected but silent in a race (a hidden tab, a stalled connection) for this long has
// their dog driven for them until they are heard from again
const stalledAfterMs = () => Number(env.STALLED_AFTER_MS) || 3000;
const IN_A_RACE = ['loading', 'countdown', 'racing', 'finished'];

// A player's connection has gone, or is a new one: whatever voice line the others had to them is dead.
// Their microphone counts as off until their game says otherwise, and the others are told to drop the
// old line ('voiceReset') so that a fresh one is made when the player is back.
function hangUp(room, player) {
  if (room.singlePlayer) return;
  player.voice = false;
  io.to(room.code).emit('voiceChanged', { playerId: player.id, enabled: false });
  io.to(room.code).emit('voiceReset', { playerId: player.id });
}

function holdSeat(room, player, token) {
  const already = player.away;
  player.away = true;
  if (room.status === 'racing' && !player.finished && !(already && botDrivers.has(player))) driveAway(room, player);
  const timer = setTimeout(() => {
    heldSeats.delete(token);
    if (rooms.get(room.code) !== room || room.players.get(player.id) !== player || !player.away) return;
    player.away = false;
    botDrivers.delete(player);
    leaveRoom(null, player.id);
  }, SEAT_HOLD_MS);
  timer.unref?.();
  heldSeats.set(token, { roomCode: room.code, playerId: player.id, timer });
  hangUp(room, player);
  io.to(room.code).emit('playerAway', { playerId: player.id, away: true });
  if (room.status === 'loading') beginCountdown(room);          // (nobody waits for a game that is not there)
  if (room.status === 'racing' || room.status === 'finished') broadcastStandings(room);
  updateLobby(room);
}

// Once a second through a race: every dog behind the leader builds up its comeback charge, a better chance of its
// special from the next Treat Box (comebackGain in shared/specials.js).  Computer dogs too.
function chargeComebacks(room, seconds) {
  if (rooms.get(room.code) !== room || room.status !== 'racing') return;
  const standings = raceStandings(room);
  for (const entry of standings) {
    const player = room.players.get(entry.playerId);
    if (!player || player.finished || player.item === SPECIAL_ITEM) continue;      // (holding it already: nothing to build towards)
    player.comeback = (player.comeback ?? 0) + comebackGain(entry.place, standings.length, seconds);
  }
}

// Once a second through a race: any player who is connected but has gone quiet has their dog driven
// for them.  Their own next move takes it back (see the playerMove handler).
function watchForStalls(room) {
  if (rooms.get(room.code) !== room || room.status !== 'racing') { clearInterval(room.stallTimer); room.stallTimer = null; return; }
  const now = Date.now();
  for (const player of room.players.values()) {
    if (player.bot || player.away || player.finished || carriedBy(room, player)) continue;
    if (now - Math.max(dogSpeeds.get(player)?.at ?? 0, room.startedAt) < stalledAfterMs()) continue;
    player.away = 'stalled';
    driveAway(room, player);
    io.to(room.code).emit('playerAway', { playerId: player.id, away: true });
    broadcastStandings(room);
    updateLobby(room);
  }
}

// A stalled player's game is sending moves again: the dog is theirs from where it now is
function backFromStall(room, player) {
  player.away = false;
  botDrivers.delete(player);
  const state = raceStateOf(room, player);
  if (state) state.revision += 1;                               // (their game takes the server's position, as after a rescue)
  dogSpeeds.set(player, { at: Date.now(), speed: 0 });
  io.to(room.code).emit('playerAway', { playerId: player.id, away: false });
  io.to(room.code).emit('playerRespawned', { playerId: player.id, position: player.position, rotation: player.rotation,
    respawnRevision: state?.revision ?? 0, penaltySeconds: 0, rescued: true });
  broadcastStandings(room);
  updateLobby(room);
}

// The dog of a player who is away runs itself
function driveAway(room, player) {
  const driver = createBot({ mapId: room.mapId, dog: player.dog, level: AWAY_DRIVER, seed: Date.now() >>> 0, heightAt: BALL_GROUND[room.mapId] ?? null });
  driver.place(player.position, player.rotation);
  botDrivers.set(player, driver);
  if (!room.botTimer) { room.botTickedAt = Date.now(); room.botTimer = setInterval(() => tickBots(room), BOT_TICK_MS); room.botTimer.unref?.(); }
}

// Everything a game needs to put a player back into a race that is already going (null in the lobby)
function raceSnapshot(room, player) {
  if (!IN_A_RACE.includes(room.status)) return null;
  return {
    status: room.status, mapId: room.mapId, totalCheckpoints: MAPS[room.mapId].checkpoints.length, totalLaps: lapsFor(room.mapId),
    grandPrix: grandPrixInfo(room), players: [...room.players.values()],
    raceMs: room.startedAt ? Date.now() - room.startedAt : null,
    you: { position: player.position, rotation: player.rotation, lap: player.lap, checkpoint: player.checkpoint, item: player.item,
      finished: player.finished, finishTime: player.finishTime, respawnRevision: raceStateOf(room, player)?.revision ?? 0 },
    boxesTaken: [...room.treatBoxTimers.keys()], bonesTaken: [...(room.boneTimers?.keys() ?? [])],
    toys: [...room.hazards.values()].map(toy => ({ id: toy.id, owner: toy.owner, position: toy.position, rotationY: toy.rotationY })),
  };
}

// A dog says where it now is (a player's game, or the driver of a computer dog): the server checks the
// move against the map's rules and sees what the dog ran into, picked up and passed on the way.
// Returns false for a move that makes no sense.
const VALID_ANIMATIONS = ['Idle', 'Walk', 'Trot', 'Run', 'Sprint', 'Jump', 'Land'];

function applyMove(room, player, data) {
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
    return false;
  }

  const previousPosition = [...player.position];
  // (skidding round a corner, and which sparks it has: passed on for the other games to draw; shared/drift.js)
  const side = data.drift?.side, tier = data.drift?.tier;
  player.drift = side === 1 || side === -1 ? { side, tier: tier === 1 || tier === 2 || tier === 3 ? tier : 0 } : null;

  let onRoad = true;
  if (MAPS[room.mapId].procedural) {
    onRoad = updateProceduralRace(room, player, data);
  } else if (oldWendover(room.mapId)) {
    onRoad = updateWoodlandRace(room, player, data);
  } else if (room.mapId === 'frostpeak') {
    onRoad = updateFrostpeakRace(room, player, data);
  } else {
    player.position = [...position];
    player.rotation = rotation;
  }

  // how fast it is going, for the computer dogs to judge it by (a jump from one place to another is not speed)
  const now = Date.now(), last = dogSpeeds.get(player);
  const moved = Math.hypot(player.position[0] - previousPosition[0], player.position[2] - previousPosition[2]);
  const seconds = last ? (now - last.at) / 1000 : 0;
  dogSpeeds.set(player, { at: now, speed: seconds > 0.01 && seconds < 0.5 && moved < 12 ? moved / seconds : last?.speed ?? 0 });

  if (room.mapId !== 'wendover' || onRoad) { checkItemHits(room, player, previousPosition); checkSpecialContacts(room, player); }
  if (room.mapId === 'frostpeak' && onRoad) checkSlalom(room, player, previousPosition);

  if (onRoad) {
    collectTreatBoxes(room, player, previousPosition);
    collectGoldenBones(room, player, previousPosition);
    if (VALID_ANIMATIONS.includes(data.animation)) player.animation = data.animation;
    checkRaceProgress(room, player, previousPosition);
  }

  if (Date.now() - (room.standingsSentAt ?? 0) >= STANDINGS_INTERVAL_MS) {
    broadcastStandings(room);
  }
  return true;
}

// ---------------------------------
// COMPUTER-CONTROLLED DOGS (server/bots.js)
// ---------------------------------
// The host says how many (room.bots.count) and how good (room.bots.level).  They join when the race
// starts, taking the dogs and the seats nobody has, and leave when the room goes back to the lobby: in
// the lobby there are only players.  In the race each is a player like any other, except that the
// server makes its moves.

const humans = room => [...room.players.values()].filter(player => !player.bot);

// The race is over when every player is home; the computer dogs do not keep anyone waiting.
const everyoneHome = room => humans(room).every(player => player.finished);

function addBots(room) {
  removeBots(room);
  const wanted = Math.min(room.bots?.count ?? 0, MAX_PLAYERS - room.players.size);
  for (let n = 0; n < wanted; n++) {
    const taken = [...room.players.values()];
    const free = DOGS.filter(dog => !taken.some(other => other.dog === dog));
    if (!free.length) break;
    const dog = free[Math.min(free.length - 1, Math.floor(Math.random() * free.length))];
    let slot = 0;
    while (taken.some(other => other.slot === slot)) slot += 1;
    const bot = createPlayer(`bot-${room.code}-${slot}`, 'CPU', slot);       // (the board reads "CPU — Meela")
    Object.assign(bot, { bot: true, level: room.bots.level, dog, ready: true });
    room.players.set(bot.id, bot);
  }
}

function removeBots(room) {
  stopBots(room);
  for (const player of [...room.players.values()]) {
    if (!player.bot) continue;
    clearTimeout(activeSpecials.get(player)?.timer);
    activeSpecials.delete(player);
    room.players.delete(player.id);
  }
}

function startBots(room) {
  stopBots(room);
  const bots = [...room.players.values()].filter(player => player.bot || player.away);
  if (!bots.length) return;
  bots.forEach((player, index) => {
    const driver = createBot({
      mapId: room.mapId, dog: player.dog, level: player.bot ? player.level : AWAY_DRIVER,
      seed: (Date.now() + index * 7919) >>> 0, heightAt: BALL_GROUND[room.mapId] ?? null
    });
    driver.place(player.position, player.rotation);
    botDrivers.set(player, driver);
  });
  room.botTickedAt = Date.now();
  room.botTimer = setInterval(() => tickBots(room), BOT_TICK_MS);
  room.botTimer.unref?.();
}

function stopBots(room) {
  if (room.botTimer) clearInterval(room.botTimer);
  room.botTimer = null;
}

// Out of the dog's own paws: flying from the catapult or the cannon, falling, or down a burrow
function carriedBy(room, player) {
  const state = raceStateOf(room, player);
  return state?.launch ? 'launch' : state?.fall ? 'fall' : burrowRides.has(player) ? 'tunnel' : null;
}

function raceStateOf(room, player) {
  return oldWendover(room.mapId) ? woodlandRaceStates.get(player)
    : room.mapId === 'frostpeak' ? frostpeakRaceStates.get(player)
    : MAPS[room.mapId].procedural ? proceduralRaceStates.get(player) : null;
}

// What being put down does to a dog, as the players' games have it: { speed, seconds, running }
function landingEffect(room, carried, tunnel = null, player = null) {
  const track = PROCEDURAL_TRACKS[room.mapId];
  if (carried === 'launch') {
    const launch = (player && raceStateOf(room, player)?.landing) || (track ?? FROSTPEAK_CANNON).launch;
    return { speed: launch.exitSpeedMultiplier, seconds: launch.boostSeconds, running: true };
  }
  if (carried === 'tunnel') return { speed: tunnel?.speedMultiplier ?? 1, seconds: tunnel?.boostSeconds ?? 0, running: true };
  return { speed: track?.rules.respawnSpeedMultiplier ?? 1, seconds: track?.rules.respawnPenaltySeconds ?? RESCUE_PENALTY_SECONDS, running: false };
}

// How near the nearest thing coming for this dog is (a firework, a frisbee, a ball), in metres
function threatTo(room, player) {
  let nearest = Infinity;
  const distance = position => Math.hypot(position[0] - player.position[0], position[2] - player.position[2]);
  for (const f of room.fireworks.values()) if (f.owner !== player.id) nearest = Math.min(nearest, distance(f.position));
  for (const f of room.frisbees.values()) if (f.target === player.id) nearest = Math.min(nearest, distance(f.position));
  const now = Date.now();
  for (const ball of room.balls.values()) {
    if (ball.owner === player.id) continue;
    const age = (now - ball.firedAt) / 1000, at = ballPositionAt(ball, age, BALL_GROUND[room.mapId]), [hx, , hz] = ballHeadingAt(ball, age);
    const ahead = (player.position[0] - at[0]) * hx + (player.position[2] - at[2]) * hz;
    if (ahead > 0 && distanceToSegment(player.position, at, [at[0] + hx * 40, at[1], at[2] + hz * 40]) < 3) nearest = Math.min(nearest, ahead);
  }
  return nearest;
}

function tickBots(room) {
  if (rooms.get(room.code) !== room || (room.status !== 'racing' && room.status !== 'finished')) { stopBots(room); return; }
  const now = Date.now();
  const dt = Math.min(0.2, Math.max(0.001, (now - room.botTickedAt) / 1000));
  room.botTickedAt = now;
  const standings = room.status === 'racing' ? raceStandings(room) : [];
  let running = room.status === 'racing';
  for (const player of [...room.players.values()]) {
    const driver = (player.bot || player.away) && botDrivers.get(player);       // (a computer dog, or the dog of a player who is away)
    if (!driver) continue;
    // home (or the race is over): it runs on a little way, slowing, and stops
    if (player.finished || room.status !== 'racing') {
      if (driver.stopped) continue;
      running = true;
      driver.finish();
      const out = driver.step(dt, {});
      Object.assign(player, { position: out.position, rotation: out.rotation, animation: out.animation });
      io.to(room.code).emit('playerMoved', { playerId: player.id, position: player.position, rotation: player.rotation, animation: player.animation, drift: player.drift ?? null });
      continue;
    }
    const carried = carriedBy(room, player), burrow = burrowRides.get(player)?.tunnel;
    let out = null;
    PROCEDURAL_TRACKS[room.mapId]?.setClock?.((now - room.startedAt) / 1000);       // (this room's time: where its moving platforms are)
    if (!carried) {
      out = driver.step(dt, {
        item: player.item,
        place: standings.find(entry => entry.playerId === player.id)?.place ?? 1,
        dogs: [...room.players.values()].filter(other => other !== player).map(other => ({
          position: other.position, rotation: other.rotation, finished: other.finished || burrowRides.has(other),
          speed: dogSpeeds.get(other)?.speed ?? 0
        })),
        toys: [...room.hazards.values()].filter(toy => toy.owner !== player.id || now - toy.placedAt >= TOY.ownerGraceMs),
        boxTaken: id => room.treatBoxTimers.has(id),
        boneTaken: index => room.boneTimers.has(index),
        special: activeSpecials.get(player)?.spec ?? null,
        burrowOpen: burrowOpen(room, player),
        shielded: now < player.shieldUntil,
        slowed: now < (player.slowUntil ?? 0) ? QUAKE.speed : 1,
        threat: threatTo(room, player),
        raceSeconds: (now - room.startedAt) / 1000
      });
    }
    const sent = out?.position ?? player.position;
    applyMove(room, player, {
      position: sent, rotation: out?.rotation ?? player.rotation, animation: out?.animation ?? player.animation, drift: out?.drift ?? null,
      respawnRevision: raceStateOf(room, player)?.revision ?? 0
    });
    io.to(room.code).emit('playerMoved', { playerId: player.id, position: player.position, rotation: player.rotation, animation: player.animation, drift: player.drift ?? null });
    if (rooms.get(room.code) !== room || room.status !== 'racing') continue;      // that move ended the race
    const nowCarried = carriedBy(room, player);
    if (carried && !nowCarried) {
      driver.place(player.position, player.rotation, landingEffect(room, carried, burrow, player));      // put down: it runs on from there
    } else if (!carried && !nowCarried && Math.hypot(player.position[0] - sent[0], player.position[2] - sent[2]) > 0.3) {
      driver.place(player.position, player.rotation);                                    // held back by a bank, a wall or a bale
    }
    if (carried || nowCarried || player.finished) continue;
    if (out.stuck && rescuePlayer(room, player)) {
      driver.place(player.position, player.rotation, landingEffect(room, 'fall'));
    } else if (out.useItem && player.item && !burrowRides.has(player)) {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- the server's useItem, not a React hook
      useItem(room, player);
    }
  }
  if (!running) stopBots(room);          // the race is over and they have all pulled up
}

function leaveRoom(socket, id = id) {
  const roomCode = playerRooms.get(id);
  if (!roomCode) return;

  const room = rooms.get(roomCode);

  playerRooms.delete(id);
  socket?.leave(roomCode);

  if (!room) return;

  const leaving = room.players.get(id);
  if (leaving) { clearTimeout(activeSpecials.get(leaving)?.timer); activeSpecials.delete(leaving); }
  room.players.delete(id);

  io.to(roomCode).emit('playerLeft', {
    playerId: id
  });

  room.votes?.delete(id);

  if (humans(room).length === 0) {
    stopBots(room);
    clearCountdown(room);
    clearMapVote(room);
    for (const timer of room.treatBoxTimers.values()) clearTimeout(timer);
    for (const timer of room.boneTimers?.values() ?? []) clearTimeout(timer);
    for (const timer of room.specialTimers ?? []) clearTimeout(timer);
    clearRaceEndTimers(room);
    stopFrisbees(room);
    stopFireworks(room);
    stopSheep(room);
    rooms.delete(roomCode);
    updateLobbies();

    console.log(`Room ${roomCode} deleted`);
    return;
  }

  if (room.hostId === id) {
    room.hostId = humans(room)[0].id;
  }

  if (room.status === 'loading') {
    beginCountdown(room);
  }

  maybeBeginMapVote(room);

  if (room.status === 'racing' && everyoneHome(room)) {
    endRace(room);              // the only dogs still running have left
  }

  if (room.status === 'racing' || room.status === 'finished') {
    broadcastStandings(room);
  }

  updateLobby(room);
}

// One line in the server's log (docker logs dog-racing-backend) for each connection coming and going, with
// the time, so that a player dropped in a race can be looked up afterwards: who, where and why
const connectionLog = (what, details) => console.log(`[${new Date().toISOString()}] ${what} ${Object.entries(details)
  .filter(([, value]) => value != null && value !== '').map(([key, value]) => `${key}=${typeof value === 'string' && /\s/.test(value) ? JSON.stringify(value) : value}`).join(' ')}`);
// (where a player is: their name, room, map and what the room is doing)
function whereIs(playerId) {
  const room = rooms.get(playerRooms.get(playerId)), player = room?.players.get(playerId);
  return { name: player?.name, room: room?.code, map: room?.mapId, status: room?.status, lap: room?.status === 'racing' ? player?.lap : null };
}

io.on('connection', (socket) => {
  const connectedAt = Date.now();
  connectionLog('Player connected:', { id: socket.id, address: socket.handshake?.headers?.['x-forwarded-for'] ?? socket.handshake?.address, transport: socket.conn?.transport?.name });
  // Who this connection is.  Usually itself; a browser that has come back after a refresh takes up the
  // seat (and the id) it had before.  seatToken is the secret that browser proves it with.
  let playerId = socket.id, seatToken = null, superseded = false;
  // The player's account, if they are signed in (server/accounts.js): from the session cookie the connection
  // came with, and after that whatever the game says (it signs in and out while connected)
  let account = socket.request ? db.userForSession(sessionTokenOf(socket.request)) : null;
  socket.on('account', (data, callback) => {
    account = data?.ticket ? accounts.userForTicket(data.ticket) : null;
    callback?.({ user: account });
  });

  // COMING BACK AFTER A REFRESH: the browser says who it was; if its seat is being held, it has it again
  socket.on('resume', (data, callback) => {
    const token = typeof data?.token === 'string' && data.token.length >= 16 && data.token.length <= 64 ? data.token : null;
    if (!token) return callback?.({ success: false });
    seatToken = token;
    let seat = heldSeats.get(token);
    if (seat) { clearTimeout(seat.timer); heldSeats.delete(token); }
    // (the same browser on a new connection while the old one still looks alive: the old one is dropped,
    // and this is treated as the player having been away)
    const live = liveSeats.get(token);
    if (!seat && live && live.socket !== socket) {
      const id = live.playerId(), liveRoom = rooms.get(playerRooms.get(id)), livePlayer = liveRoom?.players.get(id);
      live.supersede();
      if (livePlayer && !livePlayer.bot) {
        if (!livePlayer.away && liveRoom.status === 'racing' && !livePlayer.finished) driveAway(liveRoom, livePlayer);
        livePlayer.away = true;
        seat = { roomCode: liveRoom.code, playerId: id };
      }
    }
    liveSeats.set(token, { socket, playerId: () => playerId, supersede: () => { superseded = true; socket.disconnect?.(true); } });
    const room = seat && rooms.get(seat.roomCode), player = room?.players.get(seat.playerId);
    if (!player?.away) return callback?.({ success: false });
    playerId = player.id;
    socket.join(room.code);
    socket.join(playerId);                        // (messages sent to the player by id still reach them)
    hangUp(room, player);                         // (a new connection: the others start a new voice line to it)
    // In the lobby they are simply back.  In a race their dog runs on by itself until their game has
    // loaded the map and says so (backInRace).
    const race = raceSnapshot(room, player);
    if (!race) player.away = false;
    console.log(`${player.name} is back in ${room.code}`);
    callback?.({ success: true, playerId, room: getRoomData(room), race });
    if (!race) { io.to(room.code).emit('playerAway', { playerId, away: false }); updateLobby(room); }
  });

  // ...their game has the race on screen again: the dog is theirs from here
  socket.on('backInRace', (callback) => {
    const room = rooms.get(playerRooms.get(playerId)), player = room?.players.get(playerId);
    if (!room || !player?.away) return callback?.({ success: false });
    player.away = false;
    botDrivers.delete(player);
    io.to(room.code).emit('playerAway', { playerId, away: false });
    callback?.({ success: true, race: raceSnapshot(room, player) });
    updateLobby(room);
  });


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

    leaveRoom(socket, playerId);

    const roomCode = generateRoomCode();
    const player = createPlayer(playerId, account?.username ?? playerName(data?.name, 'Host'));
    player.userId = account?.id ?? null;
    const localKey = data?.local === true && typeof data.localKey === 'string' && data.localKey.length >= 16 && data.localKey.length <= 64 ? data.localKey : null;

    const room = {
      code: roomCode,
      hostId: playerId,
      status: 'lobby',
      // (split screen is a single-player room with up to three more seats, for the other players at the same
      // screen: only the page that made the room has the key to them)
      singlePlayer: data?.singlePlayer === true || localKey !== null,
      local: localKey !== null,
      localKey,
      // computer-controlled dogs: enough to fill the grid
      bots: { count: data?.singlePlayer === true || localKey !== null ? SOLO_BOTS : ROOM_BOTS, level: 'medium' },       // (only as many as there are places left join: addBots)
      botTimer: null,
      grandPrix: null,         // the Grand Prix being run: { id, round, points }
      mapId,
      startedAt: null,
      countdownTimer: null,
      treatBoxTimers: new Map(),
      boneTimers: new Map(),
      frisbees: new Map(),
      frisbeeTimer: null,
      fireworks: new Map(),
      fireworkTimer: null,
      votes: new Map(),
      voteEndsAt: 0,
      voteTimer: null,
      hazards: new Map(),
      balls: new Map(),
      nextItemId: 1,
      players: new Map([[playerId, player]])
    };

    rooms.set(roomCode, room);
    playerRooms.set(playerId, roomCode);
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

    const secondSeat = room.local && room.players.size < LOCAL_SEATS && data?.localKey === room.localKey;      // another player on the same split screen
    if (room.singlePlayer && room.hostId !== playerId && !secondSeat) {
      return callback({ success: false, error: 'This is a single-player game' });
    }

    if (room.status !== 'lobby') {
      return callback({
        success: false,
        error: 'Race has already started'
      });
    }

    if (playerRooms.get(playerId) === roomCode) {
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

    leaveRoom(socket, playerId);

    const seats = new Set([...room.players.values()].map((other) => other.slot));
    let slot = 0;
    while (seats.has(slot)) slot += 1;

    const player = createPlayer(
      playerId,
      account?.username ?? playerName(data?.name, `Player ${room.players.size + 1}`),
      slot
    );
    player.userId = account?.id ?? null;

    room.players.set(playerId, player);
    playerRooms.set(playerId, roomCode);
    socket.join(roomCode);

    callback({
      success: true,
      room: getRoomData(room)
    });

    updateLobby(room);
  });

  // Only the host can change the course, and only before loading starts.
  socket.on('selectMap', (data, callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || room.status !== 'lobby') {
      return callback?.({ success: false, error: 'Not in a lobby' });
    }
    if (room.hostId !== playerId) {
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

  // COMPUTER-CONTROLLED DOGS: how many, and how good (the host's choice, in the lobby)

  socket.on('setBots', (data, callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || room.status !== 'lobby') {
      return callback?.({ success: false, error: 'Not in a lobby' });
    }
    if (room.hostId !== playerId) {
      return callback?.({ success: false, error: 'Only the host can change the computer dogs' });
    }
    const count = Number.isInteger(data?.count) ? Math.max(0, Math.min(MAX_PLAYERS - 1, data.count)) : room.bots.count;
    const level = BOT_LEVEL_IDS.includes(data?.level) ? data.level : room.bots.level;
    room.bots = { count, level };
    callback?.({ success: true });
    updateLobby(room);
  });

  // SELECT DOG

  socket.on('selectDog', (data, callback) => {
    const roomCode = playerRooms.get(playerId);
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

    const player = room.players.get(playerId);

    if (!player) {
      return callback?.({
        success: false,
        error: 'Player not found'
      });
    }

    // A dog from the shop (shared/shop.js) has to be bought first
    const wallet = walletOf(player);
    if (!unlockAll() && !dogUnlocked(dog, wallet.owned)) {
      return callback?.({ success: false, error: `${SHOP_ITEM[LOCKED_DOGS[dog]].name} is in the Shop: ${SHOP_ITEM[LOCKED_DOGS[dog]].price.toLocaleString('en-GB')} coins` });
    }

    // One of each dog per race: the first to pick it has it.
    const takenBy = [...room.players.values()].find(
      (other) => other.id !== playerId && other.dog === dog
    );

    if (takenBy) {
      return callback?.({
        success: false,
        error: `${takenBy.name} has already picked that dog`
      });
    }

    // Picking a dog is readying up: once everyone has, the map vote begins.
    player.dog = dog;
    player.cosmetics = cosmeticsFor(dog, wallet.owned, wallet.equipped);       // what it wears (the Garage): everyone's game draws it
    player.hover = null;
    player.ready = true;
    player.loaded = false;

    callback?.({ success: true });
    updateLobby(room);
    maybeBeginMapVote(room);
  });

  // NEXT (host): go to the map vote now; anyone without a dog is given a free one at random

  socket.on('skipToMapVote', (callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || room.status !== 'lobby' || room.singlePlayer) {
      return callback?.({ success: false, error: 'Not in a lobby' });
    }
    if (room.hostId !== playerId) {
      return callback?.({ success: false, error: 'Only the host can move everyone on' });
    }
    for (const player of room.players.values()) {
      if (player.dog) continue;
      const wallet = walletOf(player);
      const free = DOGS.filter((dog) => (unlockAll() || dogUnlocked(dog, wallet.owned)) && ![...room.players.values()].some((other) => other.dog === dog));
      player.dog = free[Math.floor(Math.random() * free.length)];
      player.cosmetics = cosmeticsFor(player.dog, wallet.owned, wallet.equipped);
      player.hover = null;
      player.ready = true;
    }
    callback?.({ success: true });
    beginMapVote(room);
  });

  // VOTE FOR A MAP

  socket.on('voteMap', (data, callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || room.status !== 'voting' || !room.players.has(playerId)) {
      return callback?.({ success: false, error: 'There is no map vote running' });
    }
    if (!Object.hasOwn(MAPS, data?.mapId) && !Object.hasOwn(GRAND_PRIX, data?.mapId)) {
      return callback?.({ success: false, error: 'Invalid map selection' });
    }
    room.votes.set(playerId, data.mapId);
    callback?.({ success: true });
    updateLobby(room);
  });

  // START (host): close the map vote now and race on whatever is winning

  socket.on('endMapVote', (callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || room.status !== 'voting' || !room.players.has(playerId)) {
      return callback?.({ success: false, error: 'There is no map vote running' });
    }
    if (room.hostId !== playerId) {
      return callback?.({ success: false, error: 'Only the host can start the race' });
    }
    callback?.({ success: true });
    finishMapVote(room);
  });

  // Which dog a player is looking at on the select screen, shown to the others

  socket.on('hoverDog', (data) => {
    const room = rooms.get(playerRooms.get(playerId));
    const player = room?.players.get(playerId);
    const dog = DOGS.includes(data?.dog) ? data.dog : null;

    if (!room || room.status !== 'lobby' || !player || player.hover === dog) {
      return;
    }

    player.hover = dog;
    io.to(room.code).emit('lobbyUpdated', getRoomData(room));
  });

  // CHANGE DOG: hand the dog back so someone else can take it

  socket.on('changeDog', (callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    const player = room?.players.get(playerId);

    if (!room || room.status !== 'lobby' || !player) {
      return callback?.({
        success: false,
        error: 'Not in a lobby'
      });
    }

    player.dog = null;
    player.cosmetics = {};
    player.ready = false;

    callback?.({ success: true });
    updateLobby(room);
  });

  // READY / NOT READY

  socket.on('setReady', (data, callback) => {
    const roomCode = playerRooms.get(playerId);
    const room = rooms.get(roomCode);

    if (!room || room.status !== 'lobby') {
      return callback?.({
        success: false,
        error: 'Not in a lobby'
      });
    }

    const player = room.players.get(playerId);

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
    const room = rooms.get(playerRooms.get(playerId));

    if (!room || (room.status !== 'lobby' && room.status !== 'voting')) {
      return callback?.({
        success: false,
        error: 'Room not available'
      });
    }

    if (room.hostId !== playerId) {
      return callback?.({
        success: false,
        error: 'Only the host can start the race'
      });
    }

    room.grandPrix = null;                       // (a single race on the room's map)
    callback?.(startRaceIn(room));
  });

  // START A GRAND PRIX (host): four races, starting now

  socket.on('startGrandPrix', (data, callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || (room.status !== 'lobby' && room.status !== 'voting')) {
      return callback?.({ success: false, error: 'Room not available' });
    }
    if (room.hostId !== playerId) {
      return callback?.({ success: false, error: 'Only the host can start the race' });
    }
    if (!Object.hasOwn(GRAND_PRIX, data?.id)) {
      return callback?.({ success: false, error: 'There is no such Grand Prix' });
    }
    beginGrandPrix(room, data.id);
    const started = startRaceIn(room);
    if (!started.success) room.grandPrix = null;
    callback?.(started);
  });

  // CLIENT FINISHED LOADING

  socket.on('raceLoaded', () => {
    const roomCode = playerRooms.get(playerId);
    const room = rooms.get(roomCode);

    if (!room || room.status !== 'loading') return;

    const player = room.players.get(playerId);

    if (!player || player.loaded) return;

    player.loaded = true;

    console.log(`Player loaded: ${playerId}`);

    updateLobby(room);
    beginCountdown(room);
  });

  // PLAYER MOVEMENT

  socket.on('playerMove', (data) => {
    const roomCode = playerRooms.get(playerId);
    const room = rooms.get(roomCode);

    // Movement is blocked until GO.
    if (!room || room.status !== 'racing') return;

    const player = room.players.get(playerId);

    if (!player || player.finished) return;
    if (player.away === 'stalled') { backFromStall(room, player); return; }       // heard from again: the dog is theirs
    if (player.away || !applyMove(room, player, data)) return;

    socket.to(roomCode).emit('playerMoved', {
      playerId: playerId,
      position: player.position,
      rotation: player.rotation,
      animation: player.animation,
      drift: player.drift ?? null
    });
  });

  // LEAVE GAME

  // Lost for 5 s (the game counts): put the dog back at its last checkpoint
  socket.on('requestRescue', (callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    const player = room?.players.get(playerId);
    if (!room || room.status !== 'racing' || !player || player.finished) {
      return callback?.({ success: false });
    }
    callback?.({ success: rescuePlayer(room, player) });
  });

  // Fire / drop / eat whatever the dog is holding.
  socket.on('useItem', () => {
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || room.status !== 'racing') return;
    const player = room.players.get(playerId);
    if (!player || player.finished || !player.item || burrowRides.has(player)) return;
    useItem(room, player);
  });

  // VOICE CHAT: the players' browsers talk to each other directly; the server only says who has a
  // microphone on and passes their connection set-up messages across, within one room.
  // On unless the server is started with VOICE_CHAT=0, when it ignores both messages (build the game
  // with VITE_VOICE_CHAT=0 as well, so that it does not offer the option).
  const voiceChatOn = () => env.VOICE_CHAT !== '0';
  socket.on('setVoice', (data) => {
    if (!voiceChatOn()) return;
    const room = rooms.get(playerRooms.get(playerId));
    const player = room?.players.get(playerId);
    if (!player || room.singlePlayer) return;
    player.voice = data?.enabled === true;
    io.to(room.code).emit('voiceChanged', { playerId: playerId, enabled: player.voice });
  });

  socket.on('voiceSignal', (data) => {
    if (!voiceChatOn()) return;
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || typeof data?.to !== 'string' || data.to === playerId || !room.players.has(data.to)) return;
    if (data.signal === null || typeof data.signal !== 'object') return;
    io.to(data.to).emit('voiceSignal', { from: playerId, signal: data.signal });
  });

  // The race is over: take the whole room back to the lobby now rather than waiting for the timer.
  socket.on('returnToLobby', (callback) => {
    const room = rooms.get(playerRooms.get(playerId));
    if (!room || !room.players.has(playerId) || room.status !== 'finished') {
      return callback?.({ success: false, error: 'The race is not over yet' });
    }
    const gp = room.grandPrix;
    if (gp && gp.round < GRAND_PRIX[gp.id].maps.length - 1) {
      return callback?.({ success: false, error: 'The Grand Prix is not over yet' });
    }
    returnToLobby(room);
    callback?.({ success: true });
  });

  socket.on('leaveGame', (callback) => {
    leaveRoom(socket, playerId);
    callback?.({ success: true });
  });

  // DISCONNECT

  // The game's own account of a connection it lost, sent once it is back: whether its tab was in the background,
  // or the page was stuck (loading a map), tells a dropped Wi-Fi from a busy browser
  socket.on('connectionReport', (data) => {
    const text = (value, max = 40) => typeof value === 'string' ? value.slice(0, max).replace(/[^\w .:-]/g, '') : null;
    const number = value => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
    connectionLog('Player reports a dropped connection:', { player: playerId, ...whereIs(playerId), reason: text(data?.reason), screen: text(data?.screen, 20),
      offlineSeconds: number(data?.offlineSeconds), tabHiddenSeconds: number(data?.hiddenSeconds), longestStallSeconds: number(data?.longestStallSeconds), online: data?.online === false ? 'no' : null });
  });

  socket.on('disconnect', (reason) => {
    // (reason, from socket.io: 'ping timeout' = the game stopped answering (a stuck or background tab, or a
    // connection gone quiet); 'transport close' / 'transport error' = the connection itself was cut;
    // 'client namespace disconnect' = the game left on purpose; 'server namespace disconnect' = we closed it)
    connectionLog('Player disconnected:', { player: playerId, ...whereIs(playerId), reason, superseded: superseded ? 'yes (same browser connected again)' : null,
      connectedFor: `${Math.round((Date.now() - connectedAt) / 1000)}s` });
    if (superseded) return;                      // (the same browser has already taken this seat over on a new connection)
    if (seatToken && liveSeats.get(seatToken)?.socket === socket) liveSeats.delete(seatToken);
    const room = rooms.get(playerRooms.get(playerId)), player = room?.players.get(playerId);
    // a browser that said who it is has its seat held for a while (a refresh is a disconnection too)
    if (seatToken && player) holdSeat(room, player, seatToken);
    else leaveRoom(socket, playerId);
  });
});

// (NO_LISTEN=1: the tests drive the handlers without a network port)
if (env.NO_LISTEN !== '1') httpServer.listen(PORT, () => console.log(`Multiplayer server running on port ${PORT}${env.DB_PATH ? ` (database: ${env.DB_PATH})` : ' (database in memory)'}${accounts.google ? ' · Google sign-in on' : ''}`));

// (for the tests: the database and sign-in the server is using)
export const forTests = { db, accounts, rooms };
