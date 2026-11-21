import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { env } from 'node:process';
import { lapsFor, MAPS, PROCEDURAL_TRACKS } from '../shared/maps.js';
import { TREAT_ROAD } from '../shared/treatRoadData.js';
import { FROSTPEAK_CANNON } from '../shared/frostpeakCannon.js';
import { MODBURY_HEIGHTS as COAST } from '../shared/modburyData.js';
import { FARMYARD as FARM } from '../shared/farmData.js';
import { TREAT_BOXES, TREAT_BOXES_BY_MAP, TREAT_BOX_RESPAWN_MS } from '../shared/treatBoxes.js';
import { forwardOf } from '../shared/items.js';
import { racingLineAt, GOLDEN_BONE_SPOTS, PICKUP_PATHS } from '../shared/pickupSpots.js';
import { BURROWS, BURROW_CHECKPOINTS } from '../shared/burrows.js';

// Exercise the real socket handlers in memory, without binding a network port.
let server;
class TestServer {
  events = [];
  constructor() { server = this; }
  on(event, handler) { if (event === 'connection') this.connect = handler; }
  to(room) {
    return { emit: (event, data) => this.events.push({ room, event, data: structuredClone(data) }) };
  }
}
mock.module('socket.io', { exports: { Server: TestServer } });
// (a single-player game starts with four computer dogs: the tests of the rules race alone unless they ask for them)
env.SOLO_BOTS = '0';
env.ROOM_BOTS = '0';
// (the players in these tests stand still for minutes at a time: they are not to be taken for stalled)
env.STALLED_AFTER_MS = '86400000';
await import('../server/server.js');

let nextId = 0;
function client() {
  const handlers = new Map();
  const socket = {
    id: `test-${++nextId}`,
    on: (event, handler) => handlers.set(event, handler),
    join() {}, leave() {},
    to: room => server.to(room),
    call(event, data) {
      let response;
      const callback = value => { response = value; };
      if (data === undefined) handlers.get(event)(callback);
      else handlers.get(event)(data, callback);
      return response;
    }
  };
  server.connect(socket);
  return socket;
}
function latest(room, event) {
  return server.events.findLast(item => item.room === room && item.event === event)?.data;
}

function lobbies() {
  return latest('lobby-browser', 'lobbiesUpdated');
}

test('lobby browser lists existing games and updates names, maps, counts and host migration', () => {
  const host = client(), guest = client(), browser = client();
  const room = host.call('hostGame', { name: '  Tom   Smith  ', mapId: 'frostpeak' }).room;
  browser.call('watchLobbies');
  assert.deepEqual(latest(browser.id, 'lobbiesUpdated'), [{
    code: room.code, hostName: 'Tom Smith', mapId: 'frostpeak', playerCount: 1, maxPlayers: 6
  }]);
  const joined = guest.call('joinGame', { roomCode: room.code, name: 'Sarah' });
  assert.equal(joined.room.players[1].name, 'Sarah');
  assert.equal(lobbies()[0].playerCount, 2);
  host.call('selectMap', { mapId: 'wendover' });
  assert.equal(lobbies()[0].mapId, 'wendover');
  host.call('disconnect');
  assert.equal(lobbies()[0].hostName, 'Sarah');
  assert.equal(lobbies()[0].playerCount, 1);
  guest.call('disconnect');
  assert.deepEqual(lobbies(), []);
  browser.call('watchLobbies');
  assert.deepEqual(latest(browser.id, 'lobbiesUpdated'), []);
  browser.call('unwatchLobbies');
});

test('single-player games stay hidden and reject guests even with a known code', () => {
  const host = client(), guest = client();
  const room = host.call('hostGame', { singlePlayer: true, name: 'Solo' }).room;
  guest.call('watchLobbies');
  assert.deepEqual(latest(guest.id, 'lobbiesUpdated'), []);
  assert.deepEqual(lobbies(), []);
  assert.equal(guest.call('joinGame', { roomCode: room.code }).success, false);
  host.call('selectDog', { dog: 'gsp' });
  host.call('setReady', { ready: true });
  assert.equal(host.call('startRace').success, true);
  host.call('leaveGame');
});

test('full rooms remain listed, reject extra players and reopen when a player leaves', () => {
  const host = client(), guests = Array.from({ length: 6 }, client);
  const room = host.call('hostGame', { name: 'Host' }).room;
  for (const guest of guests.slice(0, 5)) {
    assert.equal(guest.call('joinGame', { roomCode: room.code }).success, true);
  }
  assert.equal(lobbies()[0].playerCount, 6);
  assert.equal(guests[5].call('joinGame', { roomCode: room.code }).error, 'Room is full');
  // Retrying an acknowledged join must not fail just because the room filled up.
  assert.equal(guests[0].call('joinGame', { roomCode: room.code }).success, true);
  guests[0].call('leaveGame');
  assert.equal(lobbies()[0].playerCount, 5);
  assert.equal(guests[5].call('joinGame', { roomCode: room.code }).success, true);
  host.call('leaveGame');
  for (const guest of guests) guest.call('leaveGame');
  assert.deepEqual(lobbies(), []);
});

test('starting a race removes the listing and stale join attempts fail cleanly', () => {
  const host = client(), guest = client();
  const room = host.call('hostGame', { name: 'Racer' }).room;
  host.call('selectDog', { dog: 'gsp' });
  host.call('setReady', { ready: true });
  assert.equal(host.call('startRace').success, true);
  assert.deepEqual(lobbies(), []);
  assert.equal(guest.call('joinGame', { roomCode: room.code }).error, 'Race has already started');
  host.call('leaveGame');
  assert.equal(guest.call('joinGame', { roomCode: room.code }).error, 'Room not found');
});

test('each dog can be picked once, picking readies, and the host starts when all have picked', () => {
  const host = client(), guest = client();
  const room = host.call('hostGame', { name: 'Tom' }).room;
  guest.call('joinGame', { roomCode: room.code, name: 'Sarah' });
  assert.equal(host.call('selectDog', { dog: 'second_dog' }).success, true);
  assert.equal(latest(room.code, 'lobbyUpdated').players[0].ready, true);
  // Taken dogs are refused, and the host cannot start while someone is still choosing.
  assert.deepEqual(guest.call('selectDog', { dog: 'second_dog' }), { success: false, error: 'Tom has already picked that dog' });
  assert.equal(host.call('startRace').error, 'Everyone needs to choose a dog first');
  // Re-picking your own dog is fine; handing it back frees it for someone else.
  assert.equal(host.call('selectDog', { dog: 'second_dog' }).success, true);
  assert.equal(host.call('changeDog').success, true);
  assert.deepEqual(latest(room.code, 'lobbyUpdated').players[0], { ...latest(room.code, 'lobbyUpdated').players[0], dog: null, ready: false });
  assert.equal(guest.call('selectDog', { dog: 'second_dog' }).success, true);
  assert.equal(host.call('selectDog', { dog: 'black_lab' }).success, true);
  assert.equal(host.call('startRace').success, true);
  host.call('leaveGame'); guest.call('leaveGame');
});

test('players keep their own seat colour and see which dog each other is looking at', () => {
  const host = client(), second = client(), third = client();
  const room = host.call('hostGame', { name: 'Tom' }).room;
  second.call('joinGame', { roomCode: room.code });
  third.call('joinGame', { roomCode: room.code });
  assert.deepEqual(latest(room.code, 'lobbyUpdated').players.map(player => player.slot), [0, 1, 2]);
  // A seat freed by someone leaving goes to the next player to join; nobody else's changes.
  second.call('leaveGame');
  const fourth = client();
  fourth.call('joinGame', { roomCode: room.code });
  assert.deepEqual(latest(room.code, 'lobbyUpdated').players.map(player => player.slot), [0, 2, 1]);
  third.call('hoverDog', { dog: 'ralph' });
  assert.equal(latest(room.code, 'lobbyUpdated').players[1].hover, 'ralph');
  third.call('hoverDog', { dog: 'not-a-dog' });
  assert.equal(latest(room.code, 'lobbyUpdated').players[1].hover, null);
  third.call('hoverDog', { dog: 'ralph' });
  third.call('selectDog', { dog: 'ralph' });
  assert.equal(latest(room.code, 'lobbyUpdated').players[1].hover, null);
  host.call('leaveGame'); third.call('leaveGame'); fourth.call('leaveGame');
});

test('display names are bounded and invalid or empty names use defaults', () => {
  const host = client(), guest = client();
  const room = host.call('hostGame', { name: 'A'.repeat(100) }).room;
  assert.equal(room.players[0].name, 'A'.repeat(24));
  assert.equal(guest.call('joinGame', { roomCode: room.code, name: {} }).room.players[1].name, 'Player 2');
  guest.call('leaveGame');
  host.call('leaveGame');
  assert.equal(host.call('hostGame', { name: '   ' }).room.players[0].name, 'Host');
  host.call('leaveGame');
});

test('map choice is validated, synchronized, host-only, and keeps chosen dogs', () => {
  const host = client(), guest = client();
  assert.equal(host.call('hostGame', { mapId: 'missing' }).success, false);
  assert.equal(host.call('hostGame', { mapId: 'toString' }).success, false);
  const room = host.call('hostGame', { mapId: 'frostpeak' }).room;
  assert.equal(room.mapId, 'frostpeak');
  assert.equal(guest.call('joinGame', { roomCode: room.code }).room.mapId, 'frostpeak');
  host.call('selectDog', { dog: 'gsp' });
  assert.equal(guest.call('selectMap', { mapId: 'wendover' }).success, false);
  assert.equal(host.call('selectMap', { mapId: 'missing' }).success, false);
  assert.equal(host.call('selectMap', { mapId: 'wendover' }).success, true);
  assert.equal(latest(room.code, 'lobbyUpdated').mapId, 'wendover');
  // two of five picked: still the host's call (Next); dogs are kept
  guest.call('selectDog', { dog: 'ralph' });
  assert.equal(latest(room.code, 'lobbyUpdated').status, 'lobby', 'no automatic vote until the room is full');
  host.call('skipToMapVote');
  const update = latest(room.code, 'lobbyUpdated');
  assert.equal(update.status, 'voting');
  assert.deepEqual(update.players.map(player => player.dog), ['gsp', 'ralph']);
  assert.ok(update.players.every(player => player.ready));
  assert.equal(host.call('selectMap', { mapId: 'frostpeak' }).success, false, 'no host map choice during the vote');
  host.call('leaveGame'); guest.call('leaveGame');
});

test('older clients default to Wendover and host migration retains map selection', () => {
  const host = client(), guest = client();
  const room = host.call('hostGame').room;
  assert.equal(room.mapId, 'wendover');
  guest.call('joinGame', { roomCode: room.code });
  host.call('selectMap', { mapId: 'frostpeak' });
  host.call('leaveGame');
  assert.equal(latest(room.code, 'lobbyUpdated').mapId, 'frostpeak');
  assert.equal(guest.call('selectMap', { mapId: 'wendover' }).success, true);
  guest.call('leaveGame');
});

for (const [mapId, map] of Object.entries(MAPS)) {
  test(`${mapId}: grid, loading gate, ordered checkpoints and a finish after the last lap`, context => {
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const host = client(), guest = client();
    const room = host.call('hostGame', { mapId }).room;
    guest.call('joinGame', { roomCode: room.code });
    host.call('selectDog', { dog: 'gsp' });
    assert.equal(guest.call('selectDog', { dog: 'pablo' }).success, true);
    host.call('setReady', { ready: true });
    guest.call('setReady', { ready: true });
    assert.equal(host.call('startRace').success, true);
    const start = latest(room.code, 'raceStarted');
    assert.equal(start.mapId, mapId);
    assert.equal(start.players[1].dog, 'pablo');
    assert.equal(start.totalCheckpoints, map.checkpoints.length);
    assert.deepEqual(start.players[0].position, map.startPositions[0].position);
    assert.deepEqual(start.players[1].position, map.startPositions[1].position);
    assert.equal(start.players[0].rotation, map.startPositions[0].rotationY);
    assert.equal(host.call('selectMap', { mapId: 'frostpeak' }).success, false);
    host.call('raceLoaded');
    assert.equal(latest(room.code, 'raceCountdown'), undefined);
    guest.call('raceLoaded');
    for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
    assert.ok(latest(room.code, 'raceGo'));
    let revision = 0;
    const move = position => host.call('playerMove', { position, rotation: 0, animation: 'Run', respawnRevision: revision });
    const finishPoint = distance => map.startFinish.position.map((value, axis) => value + distance * map.startFinish.forward[axis]);
    // Crossing the finish before visiting the route cannot count a lap.
    move(finishPoint(-2)); move(finishPoint(2));
    assert.equal(latest(room.code, 'raceProgress'), undefined);
    const laps = lapsFor(mapId);                       // (three, or the Speed Bowl's five)
    let landings = 0;
    for (let lap = 1; lap <= laps; lap++) {
      // Skipping ahead cannot advance the required checkpoint.
      const last = map.checkpoints.at(-1);
      move([last.x, last.y ?? 0, last.z]);
      for (const checkpoint of map.checkpoints) {
        if (checkpoint.launchLanding) {
          const T = PROCEDURAL_TRACKS[mapId];              // (Treat Road's catapult, the Water Park's slide)
          // (Neon Nexus has three: the one that lands on this checkpoint)
          const nearTo = l => { const p = T.pointAt(l.landingS); return Math.hypot(p.x - checkpoint.x, p.z - checkpoint.z); };
          const launch = [...(T.launches ?? [T.launch])].sort((a, b) => nearTo(a) - nearTo(b))[0];
          for (const s of [launch.padStart + 1, launch.takeoffS + 0.1]) {
            const p=T.pointAt(s); move([p.x,p.y,p.z]);
          }
          assert.equal(latest(room.code,'playerLaunched').playerId,host.id);
          context.mock.timers.tick(launch.duration*1000+1);
          move([checkpoint.x,checkpoint.y,checkpoint.z]);
          revision=latest(room.code,'playerLanded').respawnRevision;
          landings += 1;
          assert.equal(revision,landings);
        }
        move([checkpoint.x, checkpoint.y ?? 0, checkpoint.z]);
      }
      let progress = latest(room.code, 'raceProgress');
      assert.equal(progress.checkpoint, map.checkpoints.length);
      assert.equal(progress.lap, lap);
      // Arriving behind the line is insufficient; crossing forward completes the lap.
      move(finishPoint(-2));
      assert.equal(latest(room.code, 'raceProgress').lap, lap);
      context.mock.timers.tick(1000);
      move(finishPoint(2));
      progress = latest(room.code, 'raceProgress');
      assert.equal(progress.finished, lap === laps);
      assert.equal(progress.totalCheckpoints, map.checkpoints.length);
      if (lap < laps) assert.equal(progress.lap, lap + 1);
    }
    assert.ok(latest(room.code, 'playerFinished').finishTime > 0);
    host.call('leaveGame'); guest.call('leaveGame');
  });
}

test('Treat Road falls, respawns at the last checkpoint, and rejects pre-respawn movement', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host = client(), guest = client();
  const room = host.call('hostGame', { mapId: 'treat_road' }).room;
  guest.call('joinGame', { roomCode: room.code });
  host.call('selectDog', { dog: 'gsp' });
  guest.call('selectDog', { dog: 'ralph' });
  assert.equal(host.call('startRace').success, true);
  host.call('raceLoaded'); guest.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const move = (position, respawnRevision = 0) => host.call('playerMove', {
    position, rotation: 0, animation: 'Run', respawnRevision
  });
  const cp = TREAT_ROAD.checkpoints[1];
  move(cp.position);
  assert.equal(latest(room.code, 'raceProgress').checkpoint, 1);
  const edge = TREAT_ROAD.pointAt(cp.s + 20, cp.halfWidth + 3);
  move([edge.x, edge.y, edge.z]);
  assert.equal(latest(room.code, 'playerFell').playerId, host.id);
  context.mock.timers.tick(500);
  // Sending an on-road location during a fall cannot cancel it or skip ahead.
  move(TREAT_ROAD.checkpoints[2].position);
  assert.ok(latest(room.code, 'playerMoved').position[1] < edge.y);
  assert.equal(latest(room.code, 'raceProgress').checkpoint, 1);
  assert.equal(latest(room.code, 'playerRespawned'), undefined);
  context.mock.timers.tick(500);
  move([edge.x, edge.y - 20, edge.z]);
  const respawn = latest(room.code, 'playerRespawned');
  assert.equal(respawn.playerId, host.id);
  assert.equal(respawn.respawnRevision, 1);
  assert.equal(respawn.penaltySeconds, 1.5);
  assert.equal(respawn.speedMultiplier, 0.55);
  assert.ok(TREAT_ROAD.query(respawn.position[0], respawn.position[2]).onTrack);
  assert.ok(Math.hypot(respawn.position[0] - cp.position[0], respawn.position[2] - cp.position[2]) < 3);
  move([edge.x, edge.y - 20, edge.z]);
  assert.deepEqual(latest(room.code, 'playerMoved').position, respawn.position);
  move(TREAT_ROAD.checkpoints[2].position, 1);
  assert.equal(latest(room.code, 'raceProgress').checkpoint, 2);
  host.call('leaveGame'); guest.call('leaveGame');
});


test('Modbury water and banks remain supported; cliff falls recover and reject stale movement', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host = client();
  const room = host.call('hostGame', { mapId: 'modbury_heights', singlePlayer: true }).room;
  host.call('selectDog', { dog: 'black_lab' });
  assert.equal(host.call('startRace').success, true);
  host.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const move = (position, respawnRevision = 0) => host.call('playerMove', {
    position, rotation: 0, animation: 'Run', respawnRevision
  });
  const wet = COAST.pointAt((COAST.waterCrossing.sStart + COAST.waterCrossing.sEnd) / 2);
  move([wet.x, COAST.query(wet.x, wet.z).dogY, wet.z]);
  assert.equal(latest(room.code, 'playerFell'), undefined);
  const i = Math.floor((COAST.exposedEdge.firstIndex + COAST.exposedEdge.lastIndex) / 2);
  const sign = COAST.samples.exposed[0][i] ? 1 : -1;
  const inland = COAST.pointAt(COAST.samples.s[i], -sign * 30);
  const bank = COAST.query(inland.x, inland.z);
  move([inland.x, inland.y, inland.z]);
  assert.equal(latest(room.code, 'playerFell'), undefined);
  assert.deepEqual(latest(room.code, 'playerMoved').position, [bank.clampX, bank.dogY, bank.clampZ]);
  const checkpoints = COAST.checkpoints.filter(cp => cp.index > 0 && cp.s < COAST.samples.s[i]);
  for (const cp of checkpoints) move(cp.position);
  const cp = checkpoints.at(-1);
  assert.equal(latest(room.code, 'raceProgress').checkpoint, cp.index);
  const edge = COAST.pointAt(COAST.samples.s[i], sign * (COAST.samples.width[i] / 2 + 3));
  move([edge.x, edge.y, edge.z]);
  assert.equal(latest(room.code, 'playerFell').playerId, host.id);
  context.mock.timers.tick(500);
  move(COAST.checkpoints[cp.index + 1].position);
  assert.equal(latest(room.code, 'raceProgress').checkpoint, cp.index);
  assert.equal(latest(room.code, 'playerRespawned'), undefined);
  context.mock.timers.tick(500);
  move([edge.x, edge.y - 20, edge.z]);
  const respawn = latest(room.code, 'playerRespawned');
  assert.equal(respawn.respawnRevision, 1);
  assert.equal(respawn.penaltySeconds, 1.5);
  assert.equal(respawn.speedMultiplier, 0.55);
  assert.ok(Math.hypot(respawn.position[0] - cp.position[0], respawn.position[2] - cp.position[2]) < 3);
  assert.ok(COAST.query(respawn.position[0], respawn.position[2]).onTrack);
  move([edge.x, edge.y - 20, edge.z]);
  assert.deepEqual(latest(room.code, 'playerMoved').position, respawn.position);
  move(COAST.checkpoints[cp.index + 1].position, 1);
  assert.equal(latest(room.code, 'raceProgress').checkpoint, cp.index + 1);
  host.call('leaveGame');
});


test('Treat Road launch is forward-only, required, server-controlled and rejects stale landing packets', context => {
  context.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const host=client(), guest=client(), T=TREAT_ROAD, pad=T.launch;
  const room=host.call('hostGame',{mapId:'treat_road'}).room;
  guest.call('joinGame',{roomCode:room.code});
  host.call('selectDog',{dog:'gsp'}); guest.call('selectDog',{dog:'pablo'});
  host.call('startRace'); host.call('raceLoaded'); guest.call('raceLoaded');
  for(let i=0;i<3;i++) context.mock.timers.tick(1000);
  const move=(client,position,revision=0)=>client.call('playerMove',{position,rotation:0,animation:'Run',respawnRevision:revision});
  const at=(client,s,revision=0)=>{const p=T.pointAt(s);move(client,[p.x,p.y,p.z],revision);};
  const landing=T.checkpoints.find(cp=>cp.launchLanding);
  for(const cp of T.checkpoints.slice(1,landing.index)) move(host,cp.position);
  move(host,landing.position);
  assert.equal(latest(room.code,'raceProgress').checkpoint,landing.index-1,'teleporting to the landing cannot collect it');
  at(host,pad.takeoffS+1); at(host,pad.takeoffS-1);
  assert.equal(latest(room.code,'playerLaunched'),undefined,'backward entry does not launch');
  at(host,pad.padStart+1); at(host,pad.takeoffS+0.1);
  assert.equal(latest(room.code,'playerLaunched').playerId,host.id);
  // A second dog can enter independently without cancelling the first flight.
  at(guest,pad.padStart+1); at(guest,pad.takeoffS+0.1);
  assert.equal(latest(room.code,'playerLaunched').playerId,guest.id);
  context.mock.timers.tick(1100);
  move(host,[0,-999,0]);
  const middle=T.launchPoint(1.1);
  const air=latest(room.code,'playerMoved').position;
  assert.ok(Math.hypot(air[0]-middle.x,air[1]-middle.y,air[2]-middle.z)<0.01);
  assert.equal(latest(room.code,'playerFell'),undefined);
  assert.equal(latest(room.code,'raceProgress').checkpoint,landing.index-1);
  context.mock.timers.tick(1101);
  move(host,[0,-999,0]);
  const landed=latest(room.code,'playerLanded');
  assert.equal(landed.respawnRevision,1);
  assert.equal(landed.speedMultiplier,1.35);
  assert.equal(latest(room.code,'raceProgress').checkpoint,landing.index);
  move(host,[0,-999,0]);
  assert.deepEqual(latest(room.code,'playerMoved').position,landed.position);
  move(host,T.checkpoints[landing.index+1].position,1);
  assert.equal(latest(room.code,'raceProgress').checkpoint,landing.index+1);
  move(guest,[0,-999,0]);
  assert.equal(latest(room.code,'playerLanded').playerId,guest.id);
  // Falling off the gap without a launch still uses normal recovery.
  const gap=T.pointAt((pad.gapStart+pad.gapEnd)/2);
  move(host,[gap.x,gap.y,gap.z],1);
  assert.equal(latest(room.code,'playerFell').playerId,host.id);
  host.call('leaveGame');guest.call('leaveGame');
});


test('treat boxes hide for the whole room for exactly their respawn time (2.5 s) and can be collected again', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host = client(), guest = client();
  const room = host.call('hostGame', { mapId: 'treat_road' }).room;
  guest.call('joinGame', { roomCode: room.code });
  host.call('selectDog', { dog: 'gsp' }); guest.call('selectDog', { dog: 'pablo' });
  host.call('startRace'); host.call('raceLoaded'); guest.call('raceLoaded');
  const box = TREAT_BOXES[1], neighbour = TREAT_BOXES[0];
  const move = (who, position) => who.call('playerMove', { position, rotation: box.rotationY, animation: 'Run' });
  move(host, box.groundPosition);
  assert.equal(latest(room.code, 'treatBoxChanged'), undefined, 'no pickup before GO');
  for (let i=0;i<3;i++) context.mock.timers.tick(1000);
  const point = distance => box.groundPosition.map((v,axis) => v + distance * [Math.sin(box.rotationY),0,Math.cos(box.rotationY)][axis]);
  move(host, point(-4)); move(host, point(4));
  assert.deepEqual(latest(room.code, 'treatBoxChanged'), { id: box.id, visible: false });
  const changes = () => server.events.filter(e => e.room === room.code && e.event === 'treatBoxChanged' && e.data.id === box.id);
  move(guest,box.groundPosition);
  assert.equal(changes().length,1,'second player cannot collect or extend a hidden box');
  assert.equal(TREAT_BOX_RESPAWN_MS, 2500);
  context.mock.timers.tick(TREAT_BOX_RESPAWN_MS - 1);
  assert.equal(changes().length,1);
  context.mock.timers.tick(1);
  assert.deepEqual(changes().at(-1).data,{id:box.id,visible:true});
  move(guest,box.groundPosition);
  assert.deepEqual(changes().at(-1).data,{id:box.id,visible:false});
  assert.equal(changes().length,3);
  assert.equal(server.events.some(e => e.room === room.code && e.event === 'treatBoxChanged' && e.data.id === neighbour.id),false);
  host.call('leaveGame'); guest.call('leaveGame');
  context.mock.timers.tick(5000);
  assert.equal(changes().length,3,'leaving an empty room cancels its pending respawns');
});

test('golden bones: the first dog through gets it, it vanishes for everyone, and comes back after 6 s', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host = client(), guest = client();
  const room = host.call('hostGame', { mapId: 'treat_road' }).room;
  guest.call('joinGame', { roomCode: room.code });
  host.call('selectDog', { dog: 'gsp' }); guest.call('selectDog', { dog: 'pablo' });
  host.call('startRace'); host.call('raceLoaded'); guest.call('raceLoaded');
  const spot = GOLDEN_BONE_SPOTS.treat_road[0];
  const lane = 0.45 * TREAT_ROAD.pointAt(spot.s).halfWidth;          // bone 0 sits this far across the road
  const at = d => { const p = TREAT_ROAD.pointAt(spot.s + d, lane); return [p.x, p.y, p.z]; };
  const runThrough = who => { who.call('playerMove', { position: at(-4), rotation: 0, animation: 'Run' });
    who.call('playerMove', { position: at(4), rotation: 0, animation: 'Run' }); };
  const events = kind => server.events.filter(e => e.room === room.code && e.event === kind);
  runThrough(host);
  assert.equal(events('goldenBoneTaken').length, 0, 'nothing before GO');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  runThrough(host);
  assert.deepEqual(events('goldenBoneTaken').map(e => e.data), [{ index: 0, playerId: host.id }], 'whole room told who got it');
  runThrough(guest);
  assert.equal(events('goldenBoneTaken').length, 1, 'a taken bone cannot be eaten again');
  context.mock.timers.tick(5999);
  assert.equal(events('goldenBoneRespawned').length, 0);
  context.mock.timers.tick(1);
  assert.deepEqual(events('goldenBoneRespawned').map(e => e.data), [{ index: 0 }]);
  runThrough(guest);
  assert.deepEqual(events('goldenBoneTaken').at(-1).data, { index: 0, playerId: guest.id });
  host.call('leaveGame'); guest.call('leaveGame');
  context.mock.timers.tick(6000);
  assert.equal(events('goldenBoneRespawned').length, 1, 'leaving an empty room cancels pending respawns');
});

test('treat box cooldowns are independent between races, and each map only has its own crates', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const players = ['treat_road','treat_road','wendover'].map(mapId => {
    const host=client(), room=host.call('hostGame',{mapId,singlePlayer:true}).room;
    host.call('selectDog',{dog:'gsp'}); host.call('startRace'); host.call('raceLoaded');
    return {host,room};
  });
  for(let i=0;i<3;i++) context.mock.timers.tick(1000);
  for(const {host,room} of players) {
    host.call('playerMove',{position:TREAT_BOXES[1].groundPosition,rotation:0,animation:'Walk'});
    assert.equal(latest(room.code,'treatBoxChanged')?.visible,room.mapId==='treat_road'?false:undefined);
  }
  // Wendover's own crates are collectable there
  const wendover = players[2], ownBox = TREAT_BOXES_BY_MAP.wendover[4];
  wendover.host.call('playerMove',{position:ownBox.groundPosition,rotation:0,animation:'Walk'});
  assert.deepEqual(latest(wendover.room.code,'treatBoxChanged'),{id:ownBox.id,visible:false});
  for(const {host} of players) host.call('leaveGame');
});

test('race standings rank by lap, checkpoint and distance, follow overtakes, and keep finishers on top', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const map = MAPS.wendover;
  const tom = client(), berri = client(), sam = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' }); sam.call('selectDog', { dog: 'ralph' });
  for (const p of [tom, berri, sam]) p.call('setReady', { ready: true });
  tom.call('startRace');
  for (const p of [tom, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const atGo = latest(room.code, 'raceStandings').standings;
  assert.equal(atGo.length, 3, 'the board appears at GO');
  assert.deepEqual(Object.keys(atGo[0]).sort(), ['away', 'dog', 'finished', 'name', 'place', 'playerId']);

  const order = () => latest(room.code, 'raceStandings').standings.map(s => s.name);
  const cp0 = map.checkpoints[0], len = Math.hypot(cp0.x, cp0.z);
  const before = d => [cp0.x - cp0.x / len * d, 0, cp0.z - cp0.z / len * d];   // d metres short of checkpoint 1
  const move = (who, position) => who.call('playerMove', { position, rotation: 0, animation: 'Run' });
  const settle = () => { context.mock.timers.tick(250); move(tom, tom.lastPosition); };
  const go = (who, position) => { who.lastPosition = position; move(who, position); };

  go(tom, before(60)); go(berri, before(40)); go(sam, before(80)); settle();
  assert.deepEqual(order(), ['Berri', 'Tom', 'Sam'], 'nearest the next checkpoint leads');
  const sent = server.events.filter(e => e.room === room.code && e.event === 'raceStandings').length;
  go(tom, before(59));
  assert.equal(server.events.filter(e => e.room === room.code && e.event === 'raceStandings').length, sent, 'at most four updates a second');

  go(tom, before(30)); settle();
  assert.deepEqual(order(), ['Tom', 'Berri', 'Sam'], 'an overtake swaps the order');
  assert.deepEqual(latest(room.code, 'raceStandings').standings.map(s => s.place), [1, 2, 3]);

  go(sam, [cp0.x, 0, cp0.z]);
  assert.deepEqual(order(), ['Sam', 'Tom', 'Berri'], 'a checkpoint outranks distance, and is sent at once');

  // Sam runs the rest of the race; finishers stay on top
  const finishPoint = d => map.startFinish.position.map((v, axis) => v + d * map.startFinish.forward[axis]);
  for (let lap = 1; lap <= 3; lap++) {
    for (const cp of map.checkpoints) go(sam, [cp.x, 0, cp.z]);
    go(sam, finishPoint(-2)); go(sam, finishPoint(2));
  }
  assert.equal(latest(room.code, 'raceStandings').standings[0].name, 'Sam');
  assert.equal(latest(room.code, 'raceStandings').standings[0].finished, true);
  go(berri, before(5)); settle();
  assert.deepEqual(order(), ['Sam', 'Berri', 'Tom'], 'finishers stay first while the rest keep racing');

  berri.call('leaveGame');
  assert.deepEqual(order(), ['Sam', 'Tom'], 'a player who leaves drops off the board');
  tom.call('leaveGame'); sam.call('leaveGame');
});

test('treat boxes give one item by race place; balls, chew toys and bones do their jobs', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client(), sam = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' }); sam.call('selectDog', { dog: 'ralph' });
  for (const p of [tom, berri, sam]) p.call('setReady', { ready: true });
  tom.call('startRace');
  for (const p of [tom, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);

  let roll = 0;
  context.mock.method(Math, 'random', () => roll);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const cp = i => [map.checkpoints[i].x, 0, map.checkpoints[i].z];

  // Tom leads (two checkpoints), Sam is last (none): the leader gets no bone, last gets only bones
  move(tom, cp(0)); move(tom, cp(1)); move(tom, boxes[0].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: tom.id, item: 'ball' });
  move(tom, boxes[1].groundPosition);
  assert.equal(events('itemChanged').filter(e => e.playerId === tom.id).length, 1, 'a second box gives nothing while holding');
  assert.ok(events('treatBoxChanged').some(e => e.id === boxes[1].id && !e.visible), 'but the box is still taken');
  roll = 0.5;           // last place: ball below 8 %, then bone up to 62 %
  move(sam, boxes[2].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: sam.id, item: 'bone' });

  // Tom throws the ball straight ahead (+Z); Berri, 20 m in front, is hit
  const at = tom.lastPos = boxes[0].groundPosition;
  move(tom, boxes[0].groundPosition, 0);
  berri.call('useItem');
  assert.equal(events('ballThrown').length, 0, 'nothing to use without an item');
  tom.call('useItem');
  const ball = events('ballThrown').at(-1);
  assert.equal(ball.owner, tom.id);
  assert.deepEqual(ball.direction, forwardOf(0));
  assert.deepEqual(events('itemChanged').at(-1), { playerId: tom.id, item: null });
  const ahead = d => [at[0], at[1], at[2] + d];
  move(berri, ahead(20));
  context.mock.timers.tick(450);
  move(berri, ahead(20.5));
  assert.deepEqual(events('ballHit').at(-1).id, ball.id);
  assert.deepEqual({ ...events('playerHit').at(-1) }, { playerId: berri.id, by: tom.id, item: 'ball', stunMs: 1100 });

  // Tom (still leading) gets a chew toy and drops it behind him; he can run back over it straight away
  move(tom, boxes[3].groundPosition, 0);
  assert.equal(events('itemChanged').at(-1).item, 'toy');
  tom.call('useItem');
  const toy = events('hazardPlaced').at(-1);
  assert.ok(Math.abs(toy.position[2] - (boxes[3].groundPosition[2] - 3.5)) < 1e-9, 'lands behind the dog');
  move(tom, toy.position, 0);
  assert.equal(events('hazardRemoved').length, 0, 'the dropper gets a moment\'s grace');
  // Berri, no longer protected after her ball hit, runs into it
  context.mock.timers.tick(1600);
  move(berri, [toy.position[0], toy.position[1], toy.position[2] - 5]);
  move(berri, [toy.position[0], toy.position[1], toy.position[2] + 5]);
  assert.deepEqual(events('hazardRemoved').at(-1), { id: toy.id, hitBy: berri.id });
  assert.equal(events('playerHit').at(-1).item, 'toy');

  // Berri is still recovering, but a toy she runs into is gone all the same (no second knock-over)
  roll = 0.99;
  move(tom, boxes[4].groundPosition, 0);
  assert.equal(events('itemChanged').at(-1).item, 'toy');
  tom.call('useItem');
  const second = events('hazardPlaced').at(-1);
  const hits = events('playerHit').length;
  move(berri, [second.position[0], second.position[1], second.position[2] - 5]);
  move(berri, [second.position[0], second.position[1], second.position[2] + 5]);
  assert.deepEqual(events('hazardRemoved').at(-1), { id: second.id, hitBy: berri.id });
  assert.equal(events('playerHit').length, hits, 'no second knock-over while recovering');

  // Sam eats the bone: everyone is told so the game can boost that dog
  sam.call('useItem');
  assert.deepEqual(events('itemUsed').at(-1), { playerId: sam.id, item: 'bone' });
  for (const p of [tom, berri, sam]) p.call('leaveGame');
});

test('red frisbee: chases the dog directly ahead round a corner, flies through anyone else, hits once', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client(), sam = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' }); sam.call('selectDog', { dog: 'ralph' });
  tom.call('startRace');
  for (const p of [tom, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const cp = i => [map.checkpoints[i].x, 0, map.checkpoints[i].z];
  // Berri leads (two checkpoints), Tom 2nd (one), Sam last
  move(berri, cp(0)); move(berri, cp(1));
  move(tom, cp(0));
  context.mock.method(Math, 'random', () => 0.8);          // 2nd of 3: ball, toy and bone below 64 %, then frisbee up to 86 %
  move(tom, boxes[0].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'frisbee');
  // Tom stands still facing +Z; Berri is 30 m away to the side (+X): it must turn to get her.
  // Sam (last) stands right in its path, 6 m in front of Tom: it flies through him.
  const at = boxes[0].groundPosition;
  move(tom, at, 0);
  move(berri, [at[0] + 30, at[1], at[2] + 10]);
  move(sam, [at[0], at[1], at[2] + 6]);
  tom.call('useItem');
  const thrown = events('frisbeeThrown').at(-1);
  assert.equal(thrown.owner, tom.id);
  assert.equal(thrown.target, berri.id, 'after the dog directly ahead');
  for (let i = 0; i < 40 && !events('frisbeeHit').length; i++) context.mock.timers.tick(50);
  assert.ok(events('frisbeesMoved').length > 3, 'everyone is told where it is as it flies');
  assert.equal(events('playerHit').filter(e => e.playerId === sam.id).length, 0, 'it flew through Sam');
  assert.deepEqual({ ...events('frisbeeHit').at(-1), position: undefined }, { id: thrown.id, playerId: berri.id, position: undefined });
  assert.deepEqual({ ...events('playerHit').at(-1) }, { playerId: berri.id, by: tom.id, item: 'frisbee', stunMs: 1100 });
  assert.equal(events('frisbeeHit').length, 1, 'one hit and it is gone');
  // no frisbees left: the server stops moving them
  const moves = events('frisbeesMoved').length;
  context.mock.timers.tick(500);
  assert.equal(events('frisbeesMoved').length, moves);
  for (const p of [tom, berri, sam]) p.call('leaveGame');
});

test('chew toys: one stops a frisbee, a ball knocks one off the road, and a dog in its special sweeps one aside unharmed', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client(), sam = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  tom.call('selectDog', { dog: 'black_lab' }); berri.call('selectDog', { dog: 'gsp' }); sam.call('selectDog', { dog: 'ralph' });
  tom.call('startRace');
  for (const p of [tom, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const cp = i => [map.checkpoints[i].x, 0, map.checkpoints[i].z];
  const ahead = (from, d, side = 0) => [from[0] + side, from[1], from[2] + d];
  let roll = 0;
  context.mock.method(Math, 'random', () => roll);
  // Berri leads (two checkpoints), Tom is 2nd (one), Sam last.  The leader's box is a ball or a chew toy.
  move(berri, cp(0)); move(berri, cp(1));
  move(tom, cp(0));
  const giveBerriToy = (box) => { roll = 0.99; move(berri, box.groundPosition); assert.equal(events('itemChanged').at(-1).item, 'toy'); };
  const dropToy = (at) => { move(berri, at, 0); berri.call('useItem'); return events('hazardPlaced').at(-1); };

  // ----- a toy between the thrower and the dog the frisbee is after: the frisbee stops there, and both are gone
  giveBerriToy(boxes[0]);
  roll = 0.8;                                               // 2nd of 3: the frisbee
  move(tom, boxes[1].groundPosition, 0);
  assert.equal(events('itemChanged').at(-1).item, 'frisbee');
  const spot = boxes[1].groundPosition;
  let toy = dropToy(ahead(spot, 30));                      // (it lands 3.5 m behind her, on the frisbee's way to her)
  tom.call('useItem');
  const frisbee = events('frisbeeThrown').at(-1);
  assert.equal(frisbee.target, berri.id);
  for (let i = 0; i < 40 && !events('frisbeeGone').length && !events('frisbeeHit').length; i++) context.mock.timers.tick(50);
  assert.equal(events('frisbeeHit').length, 0, 'it never reached her');
  assert.equal(events('frisbeeGone').at(-1).id, frisbee.id);
  assert.deepEqual(events('hazardRemoved').at(-1), { id: toy.id, hitBy: 'frisbee' });
  assert.equal(events('playerHit').length, 0);

  // ----- a ball thrown at a toy knocks it off the road, and is spent
  giveBerriToy(boxes[3]);
  roll = 0.12;                                              // 2nd of 3: too high for the special (10 %), still a ball (15 %)
  move(tom, boxes[4].groundPosition, 0);
  assert.equal(events('itemChanged').at(-1).item, 'ball');
  toy = dropToy(ahead(boxes[4].groundPosition, 23.5));     // the toy: 20 m in front of Tom
  tom.call('useItem');
  const ball = events('ballThrown').at(-1);
  context.mock.timers.tick(400);
  move(sam, MAPS.wendover.startPositions[2].position);     // (anyone's move has the server look at what is flying)
  assert.deepEqual(events('ballHit').at(-1), { id: ball.id, position: events('ballHit').at(-1).position });
  assert.deepEqual(events('hazardRemoved').at(-1), { id: toy.id, hitBy: 'ball' });
  assert.equal(events('playerHit').length, 0);
  // ...so Berri, standing just beyond where the toy was, is not hit by it
  context.mock.timers.tick(100);
  move(berri, ahead(boxes[4].groundPosition, 23.5));
  assert.equal(events('playerHit').length, 0, 'the ball went with the toy');

  // ----- Tom on Poppy's wave passes a toy: within the wave's reach it is swept aside, and he surfs on
  giveBerriToy(boxes[6]);
  roll = 0;                                                 // anyone but the leader: the special
  move(tom, boxes[7].groundPosition, 0);
  assert.equal(events('itemChanged').at(-1).item, 'special');
  toy = dropToy(ahead(boxes[7].groundPosition, 40));
  tom.call('useItem');
  assert.equal(events('specialStarted').at(-1).kind, 'wave');
  move(tom, ahead(toy.position, -1, 2.2), 0);              // beside it, wider than a dog would trip on it
  assert.deepEqual(events('hazardRemoved').at(-1), { id: toy.id, hitBy: tom.id });
  assert.equal(events('playerHit').length, 0, 'not knocked over');
  assert.equal(events('specialEnded').length, 0, 'still on the wave');
  for (const p of [tom, berri, sam]) p.call('leaveGame');
});

test('red frisbee: if someone overtakes the thrower while it flies, it goes after them instead', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client(), sam = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' }); sam.call('selectDog', { dog: 'ralph' });
  tom.call('startRace');
  for (const p of [tom, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const cp = i => [map.checkpoints[i].x, 0, map.checkpoints[i].z];
  move(berri, cp(0)); move(berri, cp(1)); move(berri, cp(2));       // Berri well ahead
  move(tom, cp(0));                                                   // Tom 2nd, Sam 3rd
  context.mock.method(Math, 'random', () => 0.8);
  move(tom, boxes[0].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'frisbee');
  const at = boxes[0].groundPosition;
  move(tom, at, 0);
  move(berri, [at[0] + 300, at[1], at[2] + 300]);                   // far away up the course
  tom.call('useItem');
  assert.equal(events('frisbeeThrown').at(-1).target, berri.id);
  context.mock.timers.tick(100);
  // Sam overtakes Tom (two checkpoints to Tom's one) and stops 25 m away: now he is directly ahead
  move(sam, cp(0)); move(sam, cp(1)); move(sam, [at[0] - 25, at[1], at[2] + 5]);
  for (let i = 0; i < 60 && !events('frisbeeHit').length; i++) context.mock.timers.tick(50);
  assert.equal(events('frisbeeTarget').at(-1).target, sam.id, 'everyone is told it switched');
  assert.equal(events('frisbeeHit').at(-1).playerId, sam.id);
  for (const p of [tom, berri, sam]) p.call('leaveGame');
});

test('red frisbee: gives up after its time if it cannot reach its target', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' });
  tom.call('startRace'); tom.call('raceLoaded'); berri.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  context.mock.method(Math, 'random', () => 0.7);          // 2nd of 2 is last: frisbee from 62 % to 78 %
  berri.call('playerMove', { position: boxes[0].groundPosition, rotation: 0, animation: 'Run' });
  assert.equal(events('itemChanged').at(-1).item, 'frisbee');
  // Berri is 2nd, so it locks on to Tom; Tom is 400 m away, so it runs out of time before it gets there
  berri.call('useItem');
  const thrown = events('frisbeeThrown').at(-1);
  assert.equal(thrown.target, tom.id);
  tom.call('playerMove', { position: [boxes[0].groundPosition[0] + 400, 0, boxes[0].groundPosition[2] + 400], rotation: 0, animation: 'Run' });
  context.mock.timers.tick(6100);
  assert.deepEqual(events('frisbeeGone').map(e => e.id), [thrown.id], 'it gives up');
  assert.equal(events('frisbeeHit').length, 0);
  for (const p of [tom, berri]) p.call('leaveGame');
});

test('firework: flies up the road to the leader, knocks over a dog it passes, bursts on the leader, spares the dog that lit it', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client(), sam = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' }); sam.call('selectDog', { dog: 'pablo' });
  tom.call('startRace');
  for (const p of [tom, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const cp = i => [map.checkpoints[i].x, 0, map.checkpoints[i].z];
  const road = (s, lateral = 0) => { const p = PICKUP_PATHS.wendover.pointAt(s, lateral); return [p.x, p.y, p.z]; };
  // Berri leads (two checkpoints), Sam is 2nd (one), Tom last
  move(berri, cp(0)); move(berri, cp(1));
  move(sam, cp(0));
  let roll = 0;
  context.mock.method(Math, 'random', () => roll);
  move(berri, boxes[1].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'ball', 'the leader never gets a firework or a collar: the lowest roll is a ball...');
  berri.call('useItem');
  context.mock.timers.tick(3000);                          // (that ball flies off and is gone)
  roll = 0.999;
  move(berri, boxes[2].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'toy', '...and the highest a chew toy');
  roll = 0.85;                                             // last of 3: frisbee up to 78 %, firework up to 90 %, then the collar
  move(tom, boxes[0].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'firework');

  // All three on the road: Tom at 250 m, Sam in the middle of the road at 300 m, Berri out wide at 420 m
  move(tom, road(250)); move(sam, road(300)); move(berri, road(420, 4));
  tom.call('useItem');
  const lit = events('fireworkLaunched').at(-1);
  assert.equal(lit.owner, tom.id);
  assert.equal(lit.target, berri.id, 'after the dog in first place, not the one directly ahead');
  for (let i = 0; i < 100 && !events('fireworkExploded').length; i++) context.mock.timers.tick(50);
  assert.ok(events('fireworksMoved').length > 3, 'everyone is told where it is as it flies');
  assert.deepEqual(events('fireworkPassed').map(e => e.playerId), [sam.id], 'Sam was in its way');
  const burst = events('fireworkExploded').at(-1);
  assert.equal(burst.id, lit.id);
  assert.deepEqual(burst.playerIds, [berri.id], 'it reaches the leader even out at the side of the road');
  const hits = events('playerHit').filter(e => e.item === 'firework');
  assert.deepEqual(hits.map(e => ({ ...e })), [
    { playerId: sam.id, by: tom.id, item: 'firework', stunMs: 1800 },
    { playerId: berri.id, by: tom.id, item: 'firework', stunMs: 1800 },
  ]);
  assert.ok(!events('playerHit').some(e => e.playerId === tom.id), 'never the dog that lit it');
  const moves = events('fireworksMoved').length;
  context.mock.timers.tick(500);
  assert.equal(events('fireworksMoved').length, moves, 'no fireworks left: the server stops moving them');

  // A dog keeping to the side of the road is passed by; a dog right beside the leader is caught in the burst
  context.mock.timers.tick(6000);
  move(tom, boxes[0].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'firework');
  move(tom, road(250)); move(sam, road(300, 4.5)); move(berri, road(420));
  const pablo = sam;
  tom.call('useItem');
  context.mock.timers.tick(1000);
  move(pablo, road(418, 3));                               // Sam arrives beside Berri as it comes in
  for (let i = 0; i < 100 && events('fireworkExploded').length < 2; i++) context.mock.timers.tick(50);
  assert.equal(events('fireworkPassed').length, 1, 'it did not turn aside for Sam at the edge of the road');
  assert.deepEqual(new Set(events('fireworkExploded').at(-1).playerIds), new Set([berri.id, sam.id]), 'the burst catches the dog beside the leader');

  // If the dog that lit it is in front by then, there is nobody to chase: it burns out
  context.mock.timers.tick(6000);
  move(tom, boxes[0].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'firework');
  for (let i = 0; i < map.checkpoints.length; i++) move(tom, cp(i));     // Tom takes the lead
  tom.call('useItem');
  assert.equal(events('fireworkLaunched').at(-1).target, null);
  context.mock.timers.tick(2000);
  assert.equal(events('fireworkGone').length, 1);
  assert.equal(events('fireworkExploded').length, 2, 'and hurts nobody');
  for (const p of [tom, berri, sam]) p.call('leaveGame');
});

test('golden collar: five seconds in which nothing thrown knocks you over, but a special still does', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'second_dog' });
  tom.call('startRace'); tom.call('raceLoaded'); berri.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const at = boxes[0].groundPosition, ahead = d => [at[0], at[1], at[2] + d];
  // Berri leads; Tom, last of two, rolls a collar
  move(berri, [map.checkpoints[0].x, 0, map.checkpoints[0].z]);
  let roll = 0.95;
  context.mock.method(Math, 'random', () => roll);
  move(tom, boxes[1].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'collar');
  // Berri throws a ball at Tom, 20 m in front of her, just after he puts the collar on
  const throwBallAtTom = () => {
    roll = 0;
    move(berri, at, 0);
    assert.equal(events('itemChanged').at(-1).item, 'ball');
    move(tom, ahead(20));
    berri.call('useItem');
    context.mock.timers.tick(450);
    move(tom, ahead(20.5));
  };
  tom.call('useItem');
  assert.deepEqual(events('shieldStarted').at(-1), { playerId: tom.id, durationMs: 5000 });
  throwBallAtTom();
  assert.equal(events('ballHit').length, 1, 'the ball is used up on the shield');
  assert.deepEqual(events('hitBlocked').at(-1), { playerId: tom.id, by: berri.id, item: 'ball' });
  assert.equal(events('playerHit').length, 0, 'and Tom stays on his feet');

  // Meela's Zoomies is a special: it goes straight through the shield
  roll = 0;                                                // every box now gives the special to a dog that is behind
  move(tom, [map.checkpoints[0].x, 0, map.checkpoints[0].z]); move(tom, [map.checkpoints[1].x, 0, map.checkpoints[1].z]);   // Tom leads now
  move(berri, boxes[2].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'special');
  move(tom, ahead(60)); move(berri, ahead(59));
  berri.call('useItem');
  move(berri, ahead(59.5));
  assert.deepEqual({ ...events('playerHit').at(-1) }, { playerId: tom.id, by: berri.id, item: 'special', stunMs: 1300 });

  // Once the five seconds are up a ball knocks him over again
  context.mock.timers.tick(6000);
  for (let i = 0; i < map.checkpoints.length; i++) move(berri, [map.checkpoints[i].x, 0, map.checkpoints[i].z]);   // Berri back in front
  const before = events('playerHit').length;
  throwBallAtTom();
  assert.equal(events('playerHit').length, before + 1);
  assert.equal(events('playerHit').at(-1).item, 'ball');
  assert.equal(events('hitBlocked').length, 1);
  for (const p of [tom, berri]) p.call('leaveGame');
});

test('jumping: a dog in the air still launches off Treat Road\'s pad and can clear a chew toy', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const T = TREAT_ROAD, pad = T.launch;
  const host = client();
  const room = host.call('hostGame', { mapId: 'treat_road', singlePlayer: true }).room;
  host.call('selectDog', { dog: 'gsp' }); host.call('startRace'); host.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const airborne = (s, lift) => { const p = T.pointAt(s); host.call('playerMove', { position: [p.x, p.y + lift, p.z], rotation: p.rotationY, animation: 'Jump', respawnRevision: 0 }); };
  airborne(pad.padStart + 1, 1.4);
  airborne(pad.takeoffS + 0.1, 1.5);
  assert.equal(latest(room.code, 'playerLaunched')?.playerId, host.id, 'mid-jump over the pad still launches');
  host.call('leaveGame');

  // a chew toy: jumped over at 1.4 m it stays; run through at road level it trips
  const tom = client(), berri = client(), boxes = TREAT_BOXES_BY_MAP.wendover;
  const room2 = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room2.code, name: 'Berri' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' });
  for (const p of [tom, berri]) p.call('setReady', { ready: true });
  tom.call('startRace'); tom.call('raceLoaded'); berri.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  context.mock.method(Math, 'random', () => 0.99);
  const move = (who, position) => who.call('playerMove', { position, rotation: 0, animation: 'Run' });
  const cp = MAPS.wendover.checkpoints[0];
  move(tom, [cp.x, 0, cp.z]); move(tom, boxes[0].groundPosition);       // Tom leads: 0.99 rolls a chew toy
  assert.equal(latest(room2.code, 'itemChanged').item, 'toy');
  tom.call('useItem');
  const toy = latest(room2.code, 'hazardPlaced');
  const [x, y, z] = toy.position;
  move(berri, [x, y + 1.4, z - 4]); move(berri, [x, y + 1.4, z + 4]);
  assert.equal(latest(room2.code, 'hazardRemoved'), undefined, 'jumped clean over');
  move(berri, [x, y, z + 6]); move(berri, [x, y, z - 6]);
  assert.deepEqual(latest(room2.code, 'hazardRemoved'), { id: toy.id, hitBy: berri.id });
  tom.call('leaveGame'); berri.call('leaveGame');
});

test('map vote: a full room starts it on its own, it always runs the full 15 s, most votes wins', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const players = ['A', 'B', 'C', 'D', 'E', 'F'].map(() => client());
  const [a, b, c] = players;
  const room = a.call('hostGame', { name: 'A' }).room;
  players.slice(1).forEach((p, i) => p.call('joinGame', { roomCode: room.code, name: 'BCDEF'[i] }));
  const dogs = ['gsp', 'ralph', 'pablo', 'black_lab', 'second_dog', 'kombu'];
  players.slice(0, 3).forEach((p, i) => p.call('selectDog', { dog: dogs[i] }));
  assert.equal(latest(room.code, 'lobbyUpdated').status, 'lobby', 'three of six: waiting for the host');
  assert.equal(a.call('voteMap', { mapId: 'frostpeak' }).success, false, 'no voting before the vote');
  players.slice(3).forEach((p, i) => p.call('selectDog', { dog: dogs[i + 3] }));
  const voting = latest(room.code, 'lobbyUpdated');
  assert.equal(voting.status, 'voting', 'all six dogs picked: the vote starts by itself');
  assert.equal(voting.voteMsLeft, 15000);
  assert.deepEqual(lobbies().filter(l => l.code === room.code), [], 'no joining once the vote is on');
  assert.equal(a.call('voteMap', { mapId: 'nowhere' }).success, false);
  a.call('voteMap', { mapId: 'frostpeak' }); b.call('voteMap', { mapId: 'treat_road' });
  assert.deepEqual(latest(room.code, 'lobbyUpdated').votes, { [a.id]: 'frostpeak', [b.id]: 'treat_road' });
  b.call('voteMap', { mapId: 'frostpeak' });                         // changing your vote is fine
  c.call('voteMap', { mapId: 'modbury_heights' });
  players[3].call('voteMap', { mapId: 'wendover' });
  assert.equal(latest(room.code, 'raceStarted'), undefined);
  players[4].call('voteMap', { mapId: 'frostpeak' });                // everyone has voted (3 Frostpeak)...
  assert.equal(latest(room.code, 'raceStarted'), undefined, '...but it waits for the countdown');
  context.mock.timers.tick(14999);
  assert.equal(latest(room.code, 'raceStarted'), undefined);
  context.mock.timers.tick(1);
  assert.equal(latest(room.code, 'raceStarted').mapId, 'frostpeak', 'most votes wins');
  context.mock.timers.tick(20000);
  assert.equal(server.events.filter(e => e.room === room.code && e.event === 'raceStarted').length, 1, 'only started once');
  for (const p of players) p.call('leaveGame');
});

test('map vote: the countdown starts the race; ties and no votes are settled at random', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  context.mock.method(Math, 'random', () => 0.99);
  const run = (votes) => {
    const a = client(), b = client();
    const room = a.call('hostGame', { name: 'A' }).room;
    b.call('joinGame', { roomCode: room.code, name: 'B' });
    a.call('selectDog', { dog: 'gsp' }); b.call('selectDog', { dog: 'ralph' });
    a.call('skipToMapVote');
    votes.forEach((mapId, i) => mapId && [a, b][i].call('voteMap', { mapId }));
    context.mock.timers.tick(14999);
    assert.equal(latest(room.code, 'raceStarted'), undefined, 'not before 15 s');
    context.mock.timers.tick(1);
    const mapId = latest(room.code, 'raceStarted')?.mapId;
    a.call('leaveGame'); b.call('leaveGame');
    return mapId;
  };
  assert.equal(run(['treat_road', null]), 'treat_road', 'one vote is enough when time runs out');
  assert.equal(run([null, null]), Object.keys(MAPS).at(-1), 'no votes: a random map');
  // 50/50: a random pick between the two tied maps, never a third
  let roll = 0;
  context.mock.method(Math, 'random', () => roll);
  const tie = () => run(['wendover', 'frostpeak']);
  roll = 0; const low = tie();
  roll = 0.99; const high = tie();
  assert.deepEqual([low, high].sort(), ['frostpeak', 'wendover'], 'either tied map can win');
});

test('Next: the host can move everyone to the map vote; dogless players get a free dog', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const alone = client();
  const soloRoom = alone.call('hostGame', { name: 'Alone' }).room;
  alone.call('selectDog', { dog: 'gsp' });
  assert.equal(latest(soloRoom.code, 'lobbyUpdated').status, 'lobby', 'a host picking a dog alone stays on character select');
  alone.call('leaveGame');
  const host = client(), guest = client(), late = client();
  const room = host.call('hostGame', { name: 'Host' }).room;
  guest.call('joinGame', { roomCode: room.code, name: 'Guest' }); late.call('joinGame', { roomCode: room.code, name: 'Late' });
  host.call('selectDog', { dog: 'gsp' });
  assert.equal(guest.call('skipToMapVote').success, false, 'host only');
  assert.equal(host.call('skipToMapVote').success, true);
  const update = latest(room.code, 'lobbyUpdated');
  assert.equal(update.status, 'voting');
  const dogs = update.players.map(p => p.dog);
  assert.ok(dogs.every(Boolean), 'everyone has a dog');
  assert.equal(new Set(dogs).size, 3, 'no doubles');
  assert.equal(dogs[0], 'gsp', 'picked dogs are kept');
  for (const p of [host, guest, late]) p.call('leaveGame');
});

test('rescue: a lost dog goes back to its last checkpoint on the racing line, facing forwards', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host = client();
  const room = host.call('hostGame', { mapId: 'wendover', singlePlayer: true }).room;
  host.call('selectDog', { dog: 'gsp' }); host.call('startRace'); host.call('raceLoaded');
  assert.equal(host.call('requestRescue').success, false, 'not before GO');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const map = MAPS.wendover, move = p => host.call('playerMove', { position: p, rotation: 0, animation: 'Run', respawnRevision: latest(room.code, 'playerRespawned')?.respawnRevision ?? 0 });

  // before the first checkpoint: back to the grid slot
  move([30, 0, 60]);
  assert.equal(host.call('requestRescue').success, true);
  let back = latest(room.code, 'playerRespawned');
  assert.deepEqual(back.position, map.startPositions[0].position);
  assert.equal(back.rotation, map.startPositions[0].rotationY);
  assert.equal(back.rescued, true);

  // after two checkpoints: back to the second, on the line, facing along the course
  move([map.checkpoints[0].x, 0, map.checkpoints[0].z]); move([map.checkpoints[1].x, 0, map.checkpoints[1].z]);
  move([map.checkpoints[1].x + 40, 0, map.checkpoints[1].z + 40]);   // wandered off into the woods
  host.call('requestRescue');
  back = latest(room.code, 'playerRespawned');
  const cp = map.checkpoints[1], line = racingLineAt('wendover', cp.x, cp.z);
  assert.ok(Math.hypot(back.position[0] - cp.x, back.position[2] - cp.z) < 6, 'at the checkpoint');
  assert.equal(back.rotation, line.rotationY, 'facing the way the race goes');
  const ahead = racingLineAt('wendover', back.position[0] + Math.sin(back.rotation) * 20, back.position[2] + Math.cos(back.rotation) * 20);
  assert.ok(ahead.s > line.s, '20 m in that direction is further round the lap');
  host.call('leaveGame');
});

test('rescue on a generated track bumps the move revision so stale packets are ignored', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host = client(), T = TREAT_ROAD;
  const room = host.call('hostGame', { mapId: 'treat_road', singlePlayer: true }).room;
  host.call('selectDog', { dog: 'gsp' }); host.call('startRace'); host.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const p = T.pointAt(60);
  host.call('playerMove', { position: [p.x, p.y, p.z], rotation: Math.PI, animation: 'Run', respawnRevision: 0 });
  host.call('requestRescue');
  const back = latest(room.code, 'playerRespawned');
  assert.equal(back.respawnRevision, 1);
  const q = T.pointAt(80);
  host.call('playerMove', { position: [q.x, q.y, q.z], rotation: 0, animation: 'Run', respawnRevision: 0 });
  assert.equal(room.code && latest(room.code, 'playerRespawned').respawnRevision, 1, 'old-revision move ignored');
  host.call('leaveGame');
});

// Wendover's shortcuts transport only Ralph, credit only the skipped part of the
// lap, and use revisions just like rescues to discard packets still in flight.
test('Wendover: Ralph can use two of the four burrows on each of the three laps without breaking checkpoints', async context => {
  const { woodlandDistanceAt } = await import('../shared/wendoverData.js');
  const entered=()=>server.events.filter(e=>e.room===room.code&&e.event==='playerBurrowEntered').length;
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host=client(), room=host.call('hostGame',{mapId:'wendover',singlePlayer:true}).room;
  host.call('selectDog',{dog:'ralph'});host.call('startRace');host.call('raceLoaded');
  for(let i=0;i<3;i++)context.mock.timers.tick(1000);
  const map=MAPS.wendover,cps=map.checkpoints.map(c=>({...c,s:woodlandDistanceAt(c.x,c.z)}));
  let revision=0;
  const move=(position,rev=revision)=>host.call('playerMove',{position,rotation:0,animation:'Run',respawnRevision:rev});
  const approach=(t,d)=>t.entry.map((v,i)=>v+d*(i===0?Math.sin(t.entryYaw):i===2?Math.cos(t.entryYaw):0));
  for(let lap=1;lap<=3;lap++) {
    let cp=0;
    for(const [n,t] of BURROWS.wendover.entries()) {
      while(cp<cps.length&&cps[cp].s<t.entryS){const c=cps[cp++];move([c.x,0,c.z]);}
      const before=entered();
      move(approach(t,-1));move(approach(t,.1));
      // two a lap: the third and fourth mouths he comes to are just holes in the bank
      if(n>=2){assert.equal(entered(),before,'two burrows a lap');continue;}
      assert.equal(latest(room.code,'playerBurrowEntered').tunnelId,t.id);
      assert.equal(host.call('requestRescue').success,false,'rescue cannot interrupt a burrow');
      context.mock.timers.tick(t.duration*1000-1);move(t.exit);
      assert.deepEqual(latest(room.code,'playerMoved').position,t.entry,'cannot escape before transit completes');
      context.mock.timers.tick(1);move(t.entry);
      const exit=latest(room.code,'playerBurrowExited');
      assert.deepEqual(exit.position,t.exit);assert.equal(exit.rotation,t.exitYaw);assert.equal(exit.respawnRevision,++revision);
      move(approach(t,-1),revision-1);
      assert.deepEqual(latest(room.code,'playerMoved').position,t.exit,'stale entrance packets cannot pull the dog back');
      while(cp<cps.length&&cps[cp].s<t.exitS)cp++;
      assert.equal(latest(room.code,'raceProgress').checkpoint,cp);
      assert.equal(latest(room.code,'raceProgress').lap,lap);
      const count=entered();
      move(approach(t,-1));move(approach(t,.1));
      assert.equal(entered(),count,'one use per lap');
      move(t.exit);
    }
    while(cp<cps.length){const c=cps[cp++];move([c.x,0,c.z]);}
    const finish=d=>map.startFinish.position.map((v,i)=>v+d*map.startFinish.forward[i]);
    move(finish(-2));move(finish(2));
    assert.equal(latest(room.code,'raceProgress').finished,lap===3);
  }
  assert.equal(server.events.filter(e=>e.room===room.code&&e.event==='playerBurrowExited').length,6);
  host.call('leaveGame');
});

test('Wendover burrows reject other dogs and Ralph with missing earlier checkpoints', async context => {
  const { WENDOVER: W }=await import('../shared/wendoverData.js');
  context.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  for(const dog of ['gsp','second_dog','black_lab','pablo','ralph']) {
    const host=client(),room=host.call('hostGame',{mapId:'wendover',singlePlayer:true}).room;
    host.call('selectDog',{dog});host.call('startRace');host.call('raceLoaded');
    for(let i=0;i<3;i++)context.mock.timers.tick(1000);
    const move=p=>host.call('playerMove',{position:p,rotation:0,animation:'Run',respawnRevision:0});
    if(dog!=='ralph'){const cp=MAPS.wendover.checkpoints[0];move([cp.x,0,cp.z]);}
    const t=W.tunnels[0];
    for(const d of [-1,.1])move(t.entry.map((v,i)=>v+d*(i===0?Math.sin(t.entryYaw):i===2?Math.cos(t.entryYaw):0)));
    assert.equal(latest(room.code,'playerBurrowEntered'),undefined);
    host.call('leaveGame');
  }
});

test('specials: not for the leader; pheasants land on every other dog, Ralph flies clear, a wave knocks over who it meets', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client(), sam = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' }); sam.call('selectDog', { dog: 'ralph' });
  for (const p of [tom, berri, sam]) p.call('setReady', { ready: true });
  tom.call('startRace');
  for (const p of [tom, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);

  context.mock.method(Math, 'random', () => 0);          // every roll that can give a special does
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const cp = i => [map.checkpoints[i].x, 0, map.checkpoints[i].z];

  // Berri leads: no special for her, however the dice fall.  Tom, behind, gets his.
  move(berri, cp(0)); move(berri, cp(1)); move(berri, boxes[0].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: berri.id, item: 'ball' });
  move(tom, boxes[1].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: tom.id, item: 'special' });

  // Pippa's flush: one pheasant for each other dog, each landing after its own flight
  tom.call('useItem');
  const flush = events('specialStarted').at(-1);
  assert.equal(flush.playerId, tom.id); assert.equal(flush.kind, 'flush');
  assert.deepEqual(flush.targets.map(t => t.id).sort(), [berri.id, sam.id].sort());
  assert.ok(flush.targets.every(t => t.flightMs >= 900 && t.flightMs <= 4000));
  assert.equal(events('pheasantLanded').length, 0, 'not yet');
  context.mock.timers.tick(4000);
  assert.deepEqual(events('pheasantLanded').map(e => [e.playerId, e.hit]).sort(), [[berri.id, true], [sam.id, true]].sort());
  assert.deepEqual(events('playerHit').filter(e => e.item === 'special').map(e => e.stunMs), [1300, 1300]);
  assert.equal(events('specialEnded').at(-1).playerId, tom.id);

  // Ralph's rocket paws: fifteen seconds in the air from last place, a second and a half less from one place up
  // (he is 2nd of the three here), and a second flush cannot touch him
  context.mock.timers.tick(2000);
  move(sam, boxes[2].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: sam.id, item: 'special' });
  sam.call('useItem');
  assert.deepEqual(events('specialStarted').at(-1), { playerId: sam.id, kind: 'jet', durationMs: 13500 });
  move(tom, boxes[3].groundPosition);
  tom.call('useItem');
  const landedBefore = events('pheasantLanded').length;
  context.mock.timers.tick(4000);
  const second = events('pheasantLanded').slice(landedBefore);
  assert.equal(second.find(e => e.playerId === sam.id).hit, false, 'the bird cannot catch a flying Ralph');
  assert.equal(second.find(e => e.playerId === berri.id).hit, true);
  assert.ok(!events('specialEnded').some(e => e.playerId === sam.id), 'still flying after four seconds');
  context.mock.timers.tick(11100);
  assert.deepEqual(events('specialEnded').at(-1), { playerId: sam.id, reason: 'done' });

  // Poppy's wave, once she is no longer leading: whoever it meets is knocked over; a hit ends a special
  move(tom, cp(0)); move(tom, cp(1)); move(tom, cp(2));
  context.mock.timers.tick(5000);                           // the boxes are back
  berri.call('useItem');                                    // (she throws the ball she was still holding)
  move(berri, boxes[0].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: berri.id, item: 'special' });
  berri.call('useItem');
  assert.equal(events('specialStarted').at(-1).kind, 'wave');
  const [x, y, z] = boxes[0].groundPosition;
  move(sam, [x + 40, y, z]);
  assert.equal(events('specialHit').length, 0, 'out of reach');
  move(sam, [x + 1, y, z + 1]);
  assert.deepEqual(events('specialHit').at(-1), { playerId: berri.id, victim: sam.id });
  assert.deepEqual({ ...events('playerHit').at(-1) }, { playerId: sam.id, by: berri.id, item: 'special', stunMs: 1300 });
  const hits = events('playerHit').length;
  move(sam, [x + 1, y, z + 1.5]);
  assert.equal(events('playerHit').length, hits, 'not hit again while recovering');
  context.mock.timers.tick(5000);
  assert.deepEqual(events('specialEnded').at(-1), { playerId: berri.id, reason: 'done' });
  for (const p of [tom, berri, sam]) p.call('leaveGame');
});

test('voice chat: on unless the server is started with VOICE_CHAT=0; messages only pass between players in the same room', context => {
  const tom = client(), berri = client(), stranger = client();
  const room = tom.call('hostGame', { name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  stranger.call('hostGame', { name: 'Elsewhere' });
  assert.equal(room.players[0].voice, false, 'off until asked for');
  // switched off (VOICE_CHAT=0): the server says nothing and passes nothing on
  env.VOICE_CHAT = '0';
  context.after(() => { delete env.VOICE_CHAT; });
  const quiet = server.events.length;
  tom.call('setVoice', { enabled: true });
  tom.call('voiceSignal', { to: berri.id, signal: { description: { type: 'offer', sdp: 'x' } } });
  assert.equal(server.events.length, quiet, 'ignored while voice chat is off');
  delete env.VOICE_CHAT;                                   // the default: on
  tom.call('setVoice', { enabled: true });
  assert.deepEqual(latest(room.code, 'voiceChanged'), { playerId: tom.id, enabled: true });
  const joined = client().call('joinGame', { roomCode: room.code, name: 'Late' });
  assert.equal(joined.room.players.find(p => p.id === tom.id).voice, true, 'someone joining later is told too');
  tom.call('voiceSignal', { to: berri.id, signal: { description: { type: 'offer', sdp: 'x' } } });
  assert.deepEqual(latest(berri.id, 'voiceSignal'), { from: tom.id, signal: { description: { type: 'offer', sdp: 'x' } } });
  const before = server.events.length;
  tom.call('voiceSignal', { to: stranger.id, signal: { candidate: {} } });
  tom.call('voiceSignal', { to: tom.id, signal: { candidate: {} } });
  tom.call('voiceSignal', { to: berri.id, signal: 'not an object' });
  assert.equal(server.events.length, before, 'nothing goes to another room, to yourself, or malformed');
  tom.call('setVoice', { enabled: false });
  assert.deepEqual(latest(room.code, 'voiceChanged'), { playerId: tom.id, enabled: false });
  for (const p of [tom, berri, stranger]) p.call('leaveGame');
});

test('Modbury broken bridges: running into the break is a fall, a jump carries over, a special carries over', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host = client(), guest = client();
  const room = host.call('hostGame', { mapId: 'modbury_heights' }).room;
  guest.call('joinGame', { roomCode: room.code });
  host.call('selectDog', { dog: 'black_lab' });
  guest.call('selectDog', { dog: 'ralph' });
  assert.equal(host.call('startRace').success, true);
  host.call('raceLoaded'); guest.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  let revision = 0;
  const move = (s, lift = 0) => {
    const p = COAST.pointAt(s);
    host.call('playerMove', { position: [p.x, p.y + lift, p.z], rotation: p.rotationY, animation: 'Sprint', respawnRevision: revision });
  };
  const fell = () => server.events.filter(e => e.room === room.code && e.event === 'playerFell').length;
  const c = COAST.chasms[0];
  // across the planks, a jump over the break, and down the far planks: no fall
  move(c.ravineStart - 5); move(c.ravineStart + 2); move(c.gapStart - 0.5);
  move(c.s - 1, 1.2); move(c.s + 1, 1.4); move(c.gapEnd + 0.5, 0.3); move(c.ravineEnd + 4);
  assert.equal(fell(), 0, 'a jump carries over');
  // back round to the bridge and straight into the break at deck height
  move(c.ravineStart - 5); move(c.gapStart - 0.5);
  assert.equal(fell(), 0, 'still on the planks at the broken end');
  move(c.s);
  assert.equal(fell(), 1, 'no planks: down into the ravine');
  context.mock.timers.tick(1000);
  move(c.s);
  const respawn = latest(room.code, 'playerRespawned');
  assert.equal(respawn.playerId, host.id);
  assert.ok(COAST.query(respawn.position[0], respawn.position[2]).onTrack);
  revision = respawn.respawnRevision;
  // on her wave she cannot jump: the special carries her over the break
  context.mock.method(Math, 'random', () => 0);
  const box = TREAT_BOXES_BY_MAP.modbury_heights[0];
  guest.call('playerMove', { position: COAST.checkpoints[1].position, rotation: 0, animation: 'Run', respawnRevision: 0 });   // Ralph leads
  host.call('playerMove', { position: box.groundPosition, rotation: 0, animation: 'Run', respawnRevision: revision });
  assert.deepEqual(latest(room.code, 'itemChanged'), { playerId: host.id, item: 'special' });
  host.call('useItem');
  move(c.gapStart - 0.5); move(c.s); move(c.gapEnd + 0.5);
  assert.equal(fell(), 1, 'carried over on the wave');
  context.mock.timers.tick(5000);
  move(c.gapStart - 0.5); move(c.s);
  assert.equal(fell(), 2, 'once it is over, the break is a fall again');
  host.call('leaveGame'); guest.call('leaveGame');
});

test('after the race: the rest get a minute once the first dog is home, then everyone returns to the lobby together and can race again', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const map = MAPS.wendover;
  const tom = client(), berri = client(), watcher = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  watcher.call('watchLobbies');
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'black_lab' });
  for (const p of [tom, berri]) p.call('setReady', { ready: true });
  const count = name => server.events.filter(e => e.room === room.code && e.event === name).length;
  const state = () => latest(room.code, 'lobbyUpdated');
  const race = () => {
    assert.equal(tom.call('startRace').success, true);
    for (const p of [tom, berri]) p.call('raceLoaded');
    for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  };
  const finishPoint = d => map.startFinish.position.map((v, axis) => v + d * map.startFinish.forward[axis]);
  const runRace = who => {
    const go = position => who.call('playerMove', { position, rotation: 0, animation: 'Run' });
    for (let lap = 1; lap <= 3; lap++) {
      for (const cp of map.checkpoints) go([cp.x, 0, cp.z]);
      go(finishPoint(-2)); go(finishPoint(2));
    }
  };

  // race one: both finish; the lobby follows 15 s later by itself
  race();
  assert.equal(tom.call('returnToLobby').success, false, 'not while the race is on');
  runRace(tom);
  assert.equal(count('finishGrace'), 1, 'the first dog home starts the clock for the rest');
  assert.equal(count('raceEnded'), 0);
  runRace(berri);
  assert.deepEqual(latest(room.code, 'raceEnded'), { returnMs: 15000 });
  assert.equal(state().status, 'finished');
  context.mock.timers.tick(14999);
  assert.equal(count('returnedToLobby'), 0);
  context.mock.timers.tick(1);
  assert.equal(count('returnedToLobby'), 1);
  assert.equal(state().status, 'lobby');
  assert.deepEqual(state().players.map(p => [p.dog, p.ready, p.finished, p.lap, p.checkpoint, p.item]),
    [['gsp', true, false, 1, 0, null], ['black_lab', true, false, 1, 0, null]], 'same dogs, ready to go again');
  assert.ok(latest(watcher.id, 'lobbiesUpdated').some(l => l.code === room.code), 'the room is listed again for others to join');
  assert.equal(berri.call('selectDog', { dog: 'ralph' }).success, true, 'a dog can be changed for the next race');

  // race two: Berri never finishes; a minute after Tom is home the race ends anyway, and anyone can skip the wait
  berri.call('setReady', { ready: true });
  race();
  assert.equal(latest(room.code, 'raceStarted').players.length, 2);
  runRace(tom);
  context.mock.timers.tick(59999);
  assert.equal(count('raceEnded'), 1, 'still waiting for Berri');
  context.mock.timers.tick(1);
  assert.equal(count('raceEnded'), 2, 'time is up');
  assert.equal(berri.call('returnToLobby').success, true);
  assert.equal(count('returnedToLobby'), 2);
  assert.equal(state().status, 'lobby');
  context.mock.timers.tick(20000);
  assert.equal(count('returnedToLobby'), 2, 'the timer does not fire a second time');

  // race three starts cleanly from there
  race();
  assert.equal(state().status, 'racing');
  for (const p of [tom, berri, watcher]) p.call('leaveGame');
});

test('Muddy Paws Farm: the tractor knocks over a dog in its way, a dog is not hit twice running, and the pond break is a fall', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const host = client();
  const room = host.call('hostGame', { mapId: 'farmyard', singlePlayer: true }).room;
  host.call('selectDog', { dog: 'gsp' });
  host.call('setReady', { ready: true });
  assert.equal(host.call('startRace').success, true);
  host.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  let revision = 0;
  const move = (position, lift = 0) => host.call('playerMove', { position: [position[0], position[1] + lift, position[2]], rotation: 0, animation: 'Sprint', respawnRevision: revision });
  // the race clock starts at GO: find when the tractor is on the middle of the road, and be standing there
  const tractorAt = t => FARM.hazardsAt(t).find(h => h.kind === 'tractor');
  let when = 0; while (Math.abs(FARM.query(tractorAt(when).x, tractorAt(when).z).lateral) > 0.5) when += 0.05;
  const spot = tractorAt(when), road = FARM.pointAt(FARM.query(spot.x, spot.z).s);
  move([road.x, road.y, road.z]);
  assert.equal(events('playerHit').length, 0, 'the tractor is not there yet');
  context.mock.timers.tick(Math.round(when * 1000));
  move([road.x, road.y, road.z]);
  assert.deepEqual(events('hazardHit').at(-1), { playerId: host.id, hazard: 'tractor', kind: 'tractor' });
  assert.deepEqual({ ...events('playerHit').at(-1) }, { playerId: host.id, by: null, item: 'tractor', stunMs: 1100 });
  context.mock.timers.tick(200);
  move([road.x, road.y, road.z]);
  assert.equal(events('playerHit').length, 1, 'not hit again while recovering');
  // the pond: across the planks, into the break at deck height: a fall, and back to the checkpoint
  const c = FARM.chasms[0], p = s => { const q = FARM.pointAt(s); return [q.x, q.y, q.z]; };
  context.mock.timers.tick(3000);
  move(p(c.gapStart - 0.5));
  assert.equal(events('playerFell').length, 0);
  move(p(c.s), 1.3);
  assert.equal(events('playerFell').length, 0, 'a jump carries over');
  move(p(c.s));
  assert.equal(events('playerFell').length, 1);
  context.mock.timers.tick(1000);
  move(p(c.s));
  assert.ok(FARM.query(...[events('playerRespawned').at(-1).position[0], events('playerRespawned').at(-1).position[2]]).onTrack);
  host.call('leaveGame');
});

test('computer dogs: the host sets how many and how good, they take the free dogs and seats, race, and leave at the lobby', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const host = client(), guest = client();
  const room = host.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  assert.deepEqual(room.bots, { count: 0, level: 'medium' }, 'none until the host asks');
  guest.call('joinGame', { roomCode: room.code, name: 'Sarah' });
  assert.equal(guest.call('setBots', { count: 2 }).success, false, 'only the host');
  assert.equal(host.call('setBots', { count: 9, level: 'hard' }).success, true);
  assert.deepEqual(latest(room.code, 'lobbyUpdated').bots, { count: 5, level: 'hard' }, 'five at most');
  host.call('setBots', { level: 'impossible' });
  assert.equal(latest(room.code, 'lobbyUpdated').bots.level, 'hard', 'a level that does not exist is ignored');
  assert.equal(latest(room.code, 'lobbyUpdated').players.length, 2, 'in the lobby there are only players');
  host.call('selectDog', { dog: 'gsp' });
  guest.call('selectDog', { dog: 'ralph' });
  assert.equal(host.call('startRace').success, true);

  // two players and five asked for: four join, on four of the dogs left and the four grid places left
  const start = latest(room.code, 'raceStarted');
  const bots = start.players.filter(player => player.bot);
  assert.equal(start.players.length, 6);
  assert.equal(bots.length, 4);
  assert.equal(new Set(start.players.map(player => player.dog)).size, 6, 'six different dogs (of the eight)');
  assert.deepEqual(start.players.map(player => player.slot).sort(), [0, 1, 2, 3, 4, 5]);
  start.players.forEach((player, index) => assert.deepEqual(player.position, MAPS.wendover.startPositions[index].position));
  assert.ok(bots.every(bot => bot.loaded && bot.level === 'hard' && bot.name === 'CPU'));
  // the countdown waits for the players only
  host.call('raceLoaded'); guest.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  assert.ok(latest(room.code, 'raceGo'));

  // they run: ten seconds on, each is well up the road, and the board has all six dogs on it
  for (let i = 0; i < 200; i++) context.mock.timers.tick(50);
  const moved = id => server.events.findLast(e => e.room === room.code && e.event === 'playerMoved' && e.data.playerId === id)?.data;
  for (const bot of bots) {
    const at = moved(bot.id), line = racingLineAt('wendover', at.position[0], at.position[2]);
    assert.ok(line.s > 60 && line.s < 250, `${bot.dog} is ${line.s} m up the road`);
    assert.ok(line.distance < line.halfWidth, `${bot.dog} is on the road`);
  }
  assert.equal(latest(room.code, 'raceStandings').standings.length, 6);
  assert.ok(latest(room.code, 'raceStandings').standings.slice(0, 4).every(entry => entry.playerId.startsWith('bot-')), 'ahead of two players standing on the grid');

  // the race is over when the players are home: the computer dogs keep nobody waiting
  const map = MAPS.wendover;
  const finishPoint = distance => map.startFinish.position.map((value, axis) => value + distance * map.startFinish.forward[axis]);
  const lapOf = socket => {
    const move = position => socket.call('playerMove', { position, rotation: 0, animation: 'Run', respawnRevision: 0 });
    for (let lap = 1; lap <= 3; lap++) {
      for (const checkpoint of map.checkpoints) move([checkpoint.x, 0, checkpoint.z]);
      move(finishPoint(-2)); move(finishPoint(2));
    }
  };
  lapOf(host);
  assert.equal(server.events.filter(e => e.room === room.code && e.event === 'raceEnded').length, 0, 'Sarah is still racing');
  lapOf(guest);
  assert.equal(server.events.filter(e => e.room === room.code && e.event === 'raceEnded').length, 1);
  const board = latest(room.code, 'raceStandings').standings;
  assert.deepEqual(board.slice(0, 2).map(entry => entry.name), ['Tom', 'Sarah']);
  assert.ok(board.slice(2).every(entry => !entry.finished));

  // back in the lobby they are gone, and the room is the two players again
  host.call('returnToLobby');
  assert.deepEqual(latest(room.code, 'lobbyUpdated').players.map(player => player.name), ['Tom', 'Sarah']);
  assert.deepEqual(latest(room.code, 'lobbyUpdated').bots, { count: 5, level: 'hard' }, 'the choice is kept for the next race');
  // a room with only computer dogs left in it is an empty room
  assert.equal(host.call('startRace').success, true);
  host.call('leaveGame'); guest.call('leaveGame');
  assert.ok(!lobbies().some(lobby => lobby.code === room.code));
  const before = server.events.length;
  context.mock.timers.tick(5000);
  assert.equal(server.events.slice(before).filter(e => e.room === room.code).length, 0, 'nothing runs on in a room everyone has left');
});

test('nothing knocks a dog out of its special: a ball thrown at Pablo on his sled bounces off and he rides on', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const tom = client(), berri = client();
  const room = tom.call('hostGame', { mapId: 'wendover', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'pablo' });
  tom.call('startRace');
  for (const p of [tom, berri]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  let roll = 0;
  context.mock.method(Math, 'random', () => roll);
  // Tom leads and gets a ball; Berri, behind, gets her special and starts it
  move(tom, [map.checkpoints[0].x, 0, map.checkpoints[0].z]);
  move(tom, boxes[0].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'ball');
  move(berri, boxes[3].groundPosition);
  assert.equal(events('itemChanged').at(-1).item, 'special');
  berri.call('useItem');
  assert.equal(events('specialStarted').at(-1).kind, 'sled');
  // she is 20 m in front of him, in line: the ball reaches her and is gone, and she is not knocked over
  const at = boxes[0].groundPosition;
  move(tom, at, 0);
  move(berri, [at[0], at[1], at[2] + 20]);
  tom.call('useItem');
  const ball = events('ballThrown').at(-1);
  context.mock.timers.tick(450);
  move(berri, [at[0], at[1], at[2] + 20.5]);
  assert.equal(events('ballHit').at(-1).id, ball.id, 'the ball is used up');
  assert.equal(events('playerHit').length, 0);
  assert.equal(events('specialEnded').length, 0, 'still on the sled');
  // once it is over she can be knocked over like anyone
  context.mock.timers.tick(10000);
  assert.equal(events('specialEnded').at(-1).reason, 'done');
  for (const p of [tom, berri]) p.call('leaveGame');
});

test('Ralph has two short burrows on every map but Treat Road: in at the side of the road, out 45 m on, once a lap, nobody else', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const map = MAPS.farmyard, tunnel = BURROWS.farmyard[0], marks = BURROW_CHECKPOINTS.farmyard;
  const ralph = client(), pippa = client();
  const room = ralph.call('hostGame', { mapId: 'farmyard', name: 'Ralph' }).room;
  pippa.call('joinGame', { roomCode: room.code, name: 'Pippa' });
  ralph.call('selectDog', { dog: 'ralph' }); pippa.call('selectDog', { dog: 'gsp' });
  ralph.call('startRace');
  for (const p of [ralph, pippa]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const revision = { [ralph.id]: 0, [pippa.id]: 0 };
  const move = (who, position) => who.call('playerMove', { position, rotation: tunnel.entryYaw, animation: 'Run', respawnRevision: revision[who.id] });
  // both run the road as far as the burrow, then through its mouth
  const before = marks.filter(s => s < tunnel.entryS).length;
  const approach = d => [tunnel.entry[0] + Math.sin(tunnel.entryYaw) * d, tunnel.entry[1], tunnel.entry[2] + Math.cos(tunnel.entryYaw) * d];
  for (const who of [pippa, ralph]) {
    for (const checkpoint of map.checkpoints.slice(0, before)) move(who, [checkpoint.x, checkpoint.y, checkpoint.z]);
    move(who, approach(-3)); move(who, approach(1));
  }
  assert.deepEqual(events('playerBurrowEntered'), [{ playerId: ralph.id, tunnelId: tunnel.id, duration: tunnel.duration }], 'Ralph only');
  // underground his moves are not used; when the time is up he is at the far end, with the checkpoints he went under
  move(ralph, approach(6));
  assert.equal(events('playerBurrowExited').length, 0);
  context.mock.timers.tick(tunnel.duration * 1000 + 1);
  move(ralph, approach(6));
  const out = events('playerBurrowExited').at(-1);
  assert.deepEqual(out.position, tunnel.exit);
  assert.equal(out.respawnRevision, 1);
  assert.equal(out.speedMultiplier, tunnel.speedMultiplier);
  assert.equal(server.events.findLast(e => e.event === 'raceProgress' && e.data.playerId === ralph.id).data.checkpoint, marks.filter(s => s < tunnel.exitS).length);
  // not twice in one lap
  revision[ralph.id] = 1;
  move(ralph, approach(-3)); move(ralph, approach(1));
  assert.equal(events('playerBurrowEntered').length, 1);
  for (const p of [ralph, pippa]) p.call('leaveGame');

  // where they are: two on each of the four maps, none on Treat Road, each on the road and clear of what is on it
  assert.equal(BURROWS.treat_road, undefined);
  assert.equal(BURROWS.wendover.length, 4);
  for (const mapId of ['frostpeak', 'modbury_heights', 'farmyard', 'water_park']) {
    const path = PICKUP_PATHS[mapId], track = PROCEDURAL_TRACKS[mapId];
    assert.equal(BURROWS[mapId].length, 2, mapId);
    for (const burrow of BURROWS[mapId]) {
      assert.ok(Math.abs(burrow.exitS - burrow.entryS - 45) < 1e-6);
      for (const [end, s] of [[burrow.entry, burrow.entryS], [burrow.exit, burrow.exitS]]) {
        const line = racingLineAt(mapId, end[0], end[2], s);
        assert.ok(line.distance < line.halfWidth && path.pointAt(s).halfWidth >= 5, `${burrow.id} is on the road, where it is wide`);
        assert.ok(path.hazards.every(([a, b]) => s < a || s > b), `${burrow.id} is clear of the hazards`);
        if (track) { const q = track.query(end[0], end[2]); assert.ok(q.onTrack && !q.blocked && (q.movement ?? 'run') === 'run', `${burrow.id} can be run to`); }
        for (const box of TREAT_BOXES_BY_MAP[mapId]) assert.ok(Math.hypot(box.groundPosition[0] - end[0], box.groundPosition[2] - end[2]) > 6);
      }
      if (track?.launch) assert.ok(burrow.exitS < track.launch.padStart || burrow.entryS > track.launch.landingS, `${burrow.id} does not go under the jump`);
    }
  }
});

test('Grand Prix: four races in order with the same dogs, 10-8-6-4-2 points a race, a minute for the rest once the first is home, the winner at the end', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const tom = client(), berri = client();
  const room = tom.call('hostGame', { mapId: 'frostpeak', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  tom.call('setBots', { count: 1, level: 'easy' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'pablo' });
  assert.equal(berri.call('startGrandPrix', { id: 'gp1' }).success, false, 'only the host');
  assert.equal(tom.call('startGrandPrix', { id: 'gp9' }).success, false, 'there are two');
  assert.equal(tom.call('startGrandPrix', { id: 'gp1' }).success, true);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const revision = { [tom.id]: 0, [berri.id]: 0 };
  // one dog round its three laps (through Treat Road's catapult, the Water Park's slide and the mall's leap)
  const race = (who, mapId) => {
    const map = MAPS[mapId], track = PROCEDURAL_TRACKS[mapId];
    const move = position => who.call('playerMove', { position, rotation: 0, animation: 'Run', respawnRevision: revision[who.id] });
    const finish = d => map.startFinish.position.map((v, axis) => v + d * map.startFinish.forward[axis]);
    for (let lap = 1; lap <= 3; lap++) {
      for (const checkpoint of map.checkpoints) {
        if (checkpoint.launchLanding) {
          for (const s of [track.launch.padStart + 1, track.launch.takeoffS + 0.1]) { const p = track.pointAt(s); move([p.x, p.y, p.z]); }
          context.mock.timers.tick(track.launch.duration * 1000 + 1);
          move([checkpoint.x, checkpoint.y, checkpoint.z]);
          revision[who.id] += 1;
        }
        move([checkpoint.x, checkpoint.y ?? 0, checkpoint.z]);
      }
      move(finish(-2)); move(finish(2));
    }
  };
  const order = ['wendover', 'water_park', 'pet_mall', 'treat_road'];
  let botId = null;
  order.forEach((mapId, round) => {
    const start = events('raceStarted').at(-1);
    assert.equal(start.mapId, mapId, `race ${round + 1}`);
    assert.deepEqual(start.grandPrix, { id: 'gp1', name: 'Grand Prix 1', round: round + 1, of: 4 });
    assert.equal(start.players.length, 3);
    const bot = start.players.find(player => player.bot);
    botId ??= bot.id;
    assert.equal(bot.id, botId, 'the same computer dog every race');
    revision[tom.id] = revision[berri.id] = 0;
    tom.call('raceLoaded'); berri.call('raceLoaded');
    for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
    // Tom wins the odd races, Berri the even ones; the other is still out there when the minute is up
    const winner = round % 2 ? berri : tom;
    race(winner, mapId);
    assert.equal(events('raceEnded').length, round, 'the others have a minute');
    assert.deepEqual(events('finishGrace').at(-1), { ms: 60000 });
    context.mock.timers.tick(60000);
    assert.equal(events('raceEnded').length, round + 1);
    const result = events('grandPrixStandings').at(-1);
    assert.equal(result.round, round + 1);
    assert.equal(result.final, round === 3);
    assert.equal(result.nextMapId, order[round + 1] ?? null);
    assert.equal(result.table.find(row => row.playerId === winner.id).gained, 10);
    assert.deepEqual(result.table.map(row => row.gained).sort((a, b) => b - a), [10, 8, 6]);
    if (round < 3) {
      assert.equal(tom.call('returnToLobby').success, false, 'no leaving for the lobby in the middle of it');
      context.mock.timers.tick(15000);
    }
  });
  // two wins each: 10 + 10 and two other places apiece; the table is in points order and the winner is on top
  const final = events('grandPrixStandings').at(-1).table;
  assert.equal(final.reduce((sum, row) => sum + row.points, 0), 4 * (10 + 8 + 6));
  for (let i = 1; i < final.length; i++) assert.ok(final[i - 1].points >= final[i].points);
  assert.ok([tom.id, berri.id].includes(final[0].playerId) && final[0].points >= 32);
  assert.deepEqual(events('raceEnded').at(-1), { returnMs: 30000, grandPrix: { id: 'gp1', name: 'Grand Prix 1', round: 4, of: 4 }, final: true });
  // then the lobby, the computer dog gone, and a single race is a single race again
  context.mock.timers.tick(30000);
  const lobby = latest(room.code, 'lobbyUpdated');
  assert.equal(lobby.status, 'lobby');
  assert.equal(lobby.grandPrix, null);
  assert.deepEqual(lobby.players.map(player => player.name), ['Tom', 'Berri']);
  assert.equal(tom.call('startRace').success, true);
  assert.equal(events('raceStarted').at(-1).grandPrix, null);
  for (const p of [tom, berri]) p.call('leaveGame');
});

test('Grand Prix: it can win the map vote like any map', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const tom = client(), berri = client();
  const room = tom.call('hostGame', { name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'pablo' });
  tom.call('skipToMapVote');
  assert.equal(tom.call('voteMap', { mapId: 'gp2' }).success, true);
  assert.equal(berri.call('voteMap', { mapId: 'gp2' }).success, true);
  assert.equal(berri.call('voteMap', { mapId: 'gp7' }).success, false);
  context.mock.timers.tick(15000);
  const start = latest(room.code, 'raceStarted');
  assert.equal(start.mapId, 'farmyard');
  assert.deepEqual(start.grandPrix, { id: 'gp2', name: 'Grand Prix 2', round: 1, of: 4 });
  for (const p of [tom, berri]) p.call('leaveGame');
});

test('a refresh: the seat is held for a minute, the dog jogs on by itself, and the same browser comes back to the same dog', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const tom = client(), berri = client();
  const token = 'a-secret-only-this-browser-has';
  assert.equal(berri.call('resume', { token }).success, false, 'nothing to come back to yet');
  assert.equal(client().call('resume', { token: 'short' }).success, false);
  const room = tom.call('hostGame', { mapId: 'farmyard', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'pablo' });
  tom.call('startRace');
  for (const p of [tom, berri]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const berriAt = () => server.events.findLast(e => e.room === room.code && e.event === 'playerMoved' && e.data.playerId === berri.id)?.data.position;
  const along = position => FARM.query(position[0], position[2]).s;

  // Berri's page reloads: she is not gone, and her dog carries on up the road at a jog
  berri.call('setVoice', { enabled: true });
  berri.call('disconnect');
  assert.equal(events('playerLeft').length, 0);
  assert.deepEqual(events('playerAway').at(-1), { playerId: berri.id, away: true });
  assert.equal(latest(room.code, 'lobbyUpdated').players.find(p => p.id === berri.id).away, true);
  // her voice line is dead: the others are told to drop it, and her microphone counts as off
  assert.deepEqual(events('voiceReset'), [{ playerId: berri.id }]);
  assert.deepEqual(events('voiceChanged').at(-1), { playerId: berri.id, enabled: false });
  for (let i = 0; i < 200; i++) context.mock.timers.tick(50);
  const jogged = along(berriAt());
  assert.ok(jogged > 40 && jogged < 130, `ten seconds on she is ${jogged} m up the road: a jog, not a sprint`);
  assert.ok(FARM.query(berriAt()[0], berriAt()[2]).onTrack);

  // the page is back: a new connection with the same token is Berri again, on Pablo, told how the race stands
  const back = client();
  const resumed = back.call('resume', { token });
  assert.equal(resumed.success, true);
  assert.equal(resumed.playerId, berri.id, 'the same player, whatever the new connection is called');
  assert.equal(events('voiceReset').length, 2, 'and a new voice line is started to her new connection');
  tom.call('voiceSignal', { to: berri.id, signal: { candidate: {} } });
  assert.equal(server.events.findLast(e => e.event === 'voiceSignal').room, berri.id, 'which reaches her by her player id');
  assert.equal(resumed.race.mapId, 'farmyard');
  assert.equal(resumed.race.status, 'racing');
  assert.equal(resumed.room.players.find(p => p.id === berri.id).dog, 'pablo');
  // ...the dog runs on while her game loads the map, and is hers again when it says so
  context.mock.timers.tick(1000);
  assert.ok(along(berriAt()) > jogged);
  const taken = back.call('backInRace');
  assert.equal(taken.success, true);
  assert.deepEqual(taken.race.you.position, berriAt());
  assert.deepEqual(events('playerAway').at(-1), { playerId: berri.id, away: false });
  const stoodAt = berriAt();
  context.mock.timers.tick(1000);
  assert.deepEqual(berriAt(), stoodAt, 'the server has let go of the dog');
  const ahead = FARM.pointAt(along(stoodAt) + 3);
  back.call('playerMove', { position: [ahead.x, ahead.y, ahead.z], rotation: 0, animation: 'Run', respawnRevision: taken.race.you.respawnRevision });
  assert.equal(latest(room.code, 'playerMoved').playerId, berri.id, 'her moves count again, under her own id');

  // gone for more than a minute: then she has left, as before
  back.call('disconnect');
  assert.equal(events('playerLeft').length, 0);
  context.mock.timers.tick(59999);
  assert.equal(events('playerLeft').length, 0);
  context.mock.timers.tick(1);
  assert.deepEqual(events('playerLeft').at(-1), { playerId: berri.id });
  assert.equal(client().call('resume', { token }).success, false, 'too late');
  // a browser that never said who it was leaves at once (and Tom leaving the usual way empties the room)
  tom.call('leaveGame');
  assert.ok(!lobbies().some(lobby => lobby.code === room.code));
});

test('a refresh in the lobby: same seat and same dog, and everyone is told', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const tom = client(), berri = client();
  const token = 'another-secret-for-the-lobby';
  berri.call('resume', { token });
  const room = tom.call('hostGame', { name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  berri.call('selectDog', { dog: 'ralph' });
  berri.call('disconnect');
  assert.equal(latest(room.code, 'lobbyUpdated').players.length, 2);
  assert.equal(tom.call('selectDog', { dog: 'ralph' }).success, false, 'her dog is still hers');
  const back = client(), resumed = back.call('resume', { token });
  assert.deepEqual([resumed.success, resumed.playerId, resumed.race], [true, berri.id, null]);
  assert.equal(resumed.room.players.find(p => p.id === berri.id).dog, 'ralph');
  assert.equal(latest(room.code, 'lobbyUpdated').players.find(p => p.id === berri.id).away, false);
  assert.equal(back.call('changeDog').success, true, 'and she can carry on as herself');
  for (const p of [tom, back]) p.call('leaveGame');
});

test('a frozen dog: a player who goes quiet in a race has their dog driven, everyone is told, and their next move takes it back', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const tom = client(), berri = client();
  const room = tom.call('hostGame', { mapId: 'farmyard', name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  tom.call('selectDog', { dog: 'gsp' }); berri.call('selectDog', { dog: 'pablo' });
  tom.call('startRace');
  for (const p of [tom, berri]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const grid = id => latest(room.code, 'raceStarted').players.find(p => p.id === id).position;
  const move = (who, position, revision = 0) => who.call('playerMove', { position, rotation: 0, animation: 'Run', respawnRevision: revision });
  env.STALLED_AFTER_MS = '3000';
  context.after(() => { env.STALLED_AFTER_MS = '86400000'; });
  // Tom keeps reporting in; Berri's game goes quiet (a hidden tab, a stalled connection) but is still connected
  const second = () => { move(tom, grid(tom.id)); for (let i = 0; i < 20; i++) context.mock.timers.tick(50); };
  for (let t = 0; t < 5; t++) second();
  assert.deepEqual(events('playerAway'), [{ playerId: berri.id, away: true }], 'Berri, and only Berri');
  assert.equal(latest(room.code, 'raceStandings').standings.find(e => e.playerId === berri.id).away, true);
  assert.equal(latest(room.code, 'raceStandings').standings.find(e => e.playerId === tom.id).away, false);
  const before = FARM.query(...[grid(berri.id)[0], grid(berri.id)[2]]).s;
  for (let t = 0; t < 4; t++) second();
  const driven = server.events.findLast(e => e.room === room.code && e.event === 'playerMoved' && e.data.playerId === berri.id).data.position;
  const progress = ((FARM.query(driven[0], driven[2]).s - before) % FARM.length + FARM.length) % FARM.length;
  assert.ok(progress > 15, `her dog has run on ${progress} m by itself`);
  // her game wakes up and sends a move from where it thought she was: she is put where her dog now is, and carries on from there
  move(berri, grid(berri.id));
  assert.deepEqual(events('playerAway').at(-1), { playerId: berri.id, away: false });
  const back = events('playerRespawned').at(-1);
  assert.deepEqual([back.playerId, back.rescued, back.penaltySeconds, back.respawnRevision], [berri.id, true, 0, 1]);
  assert.deepEqual(back.position, driven);
  const ahead = FARM.pointAt(FARM.query(driven[0], driven[2]).s + 3);
  move(berri, [ahead.x, ahead.y, ahead.z], 1);
  assert.deepEqual(server.events.findLast(e => e.event === 'playerMoved' && e.data.playerId === berri.id).data.position, [ahead.x, ahead.y, ahead.z]);
  for (const p of [tom, berri]) p.call('leaveGame');
});

test('reconnecting before the server has noticed the old connection is dead: the new connection takes the seat over', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const tom = client(), berri = client(), token = 'a-token-for-the-take-over-case';
  berri.call('resume', { token });
  const room = tom.call('hostGame', { name: 'Tom' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  berri.call('selectDog', { dog: 'ralph' });
  // her network dropped and came back: a new connection, while the old one still looks alive to the server
  const again = client(), resumed = again.call('resume', { token });
  assert.deepEqual([resumed.success, resumed.playerId], [true, berri.id]);
  assert.equal(resumed.room.players.find(p => p.id === berri.id).dog, 'ralph');
  // the old connection finally drops: nothing happens, she is not removed and no seat is put on hold
  const before = server.events.length;
  berri.call('disconnect');
  assert.equal(server.events.length, before);
  assert.equal(again.call('changeDog').success, true, 'the new connection is her');
  context.mock.timers.tick(61000);
  assert.equal(latest(room.code, 'lobbyUpdated').players.length, 2, 'still there a minute on');
  for (const p of [tom, again]) p.call('leaveGame');
});

test('Kombu\'s Kelp Dive: further up the road the further back he is (as far as Poppy\'s wave carries her, from last), past whoever is in between', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { KELP, SPECIALS, kelpDistance } = await import('../shared/specials.js');
  // Poppy's wave: 5 s at 1.9 times her 17 m/s
  assert.equal(KELP.distance, 17 * SPECIALS.black_lab.speed * SPECIALS.black_lab.durationMs / 1000);
  assert.ok(KELP.distance > 150 && KELP.distance < 175, `${KELP.distance} m`);
  // all of it from 6th, less for every place nearer the front, under a third of it from 2nd
  assert.equal(kelpDistance(6), KELP.distance);
  assert.equal(kelpDistance(8), KELP.distance);
  for (let place = 2; place < 6; place++) assert.ok(kelpDistance(place) < kelpDistance(place + 1), `${place} goes less far than ${place + 1}`);
  assert.ok(kelpDistance(2) > 40 && kelpDistance(2) < KELP.distance / 3, `${kelpDistance(2)} m from 2nd`);
  assert.equal(kelpDistance(1), kelpDistance(2));
  const at = s => { const p = FARM.pointAt(s); return [p.x, p.y, p.z]; };
  const along = position => FARM.query(position[0], position[2]).s;
  const box = TREAT_BOXES_BY_MAP.farmyard[0].groundPosition;        // (the first row of boxes, about 117 m round)
  const race = (others) => {
    const sockets = [...others.map(() => client()), client()], kombu = sockets.at(-1);
    const room = sockets[0].call('hostGame', { mapId: 'farmyard', name: 'One' }).room;
    sockets.slice(1).forEach((socket, i) => socket.call('joinGame', { roomCode: room.code, name: `P${i + 2}` }));
    ['gsp', 'pablo', 'ralph'].slice(0, others.length).forEach((dog, i) => sockets[i].call('selectDog', { dog }));
    kombu.call('selectDog', { dog: 'kombu' });
    sockets[0].call('startRace');
    for (const socket of sockets) socket.call('raceLoaded');
    for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
    const move = (socket, position, revision = 0) => socket.call('playerMove', { position, rotation: 0, animation: 'Run', respawnRevision: revision });
    // each of the others runs the road to where it is (through the checkpoints on the way)
    others.forEach((s, i) => { for (const cp of MAPS.farmyard.checkpoints) { if (FARM.query(cp.x, cp.z).s < s) move(sockets[i], [cp.x, cp.y, cp.z]); } move(sockets[i], at(s)); });
    context.mock.method(Math, 'random', () => 0);              // (anyone but the leader: the special)
    move(kombu, box);
    const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
    assert.deepEqual(events('itemChanged').at(-1), { playerId: kombu.id, item: 'special' });
    const from = along(box);
    kombu.call('useItem');
    const down = events('playerBurrowEntered').at(-1);
    assert.deepEqual([down.playerId, down.kelp, down.tunnelId], [kombu.id, true, 'kelp']);
    move(kombu, at(from + 5));
    assert.equal(events('playerBurrowExited').length, 0, 'he is under: his own moves do nothing');
    context.mock.timers.tick(KELP.seconds * 1000 + 1);
    move(kombu, at(from + 5));
    const up = events('playerBurrowExited').at(-1);
    assert.deepEqual([up.playerId, up.kelp, up.respawnRevision], [kombu.id, true, 1]);
    assert.ok(FARM.query(up.position[0], up.position[2]).onTrack);
    const result = { room, sockets, kombu, from, landed: along(up.position), progress: server.events.findLast(e => e.event === 'raceProgress' && e.data.playerId === kombu.id).data,
      places: latest(room.code, 'raceStandings').standings.map(e => e.playerId) };
    context.mock.restoreAll();
    for (const socket of sockets) socket.call('leaveGame');
    return result;
  };
  // (he is never put down in the barn or among the bales: a little short of them instead)
  const plain = s => !PICKUP_PATHS.farmyard.hazards.some(([a, b]) => s >= a - 2 && s <= b + 2);
  const check = (r, place) => {
    let want = r.from + kelpDistance(place); while (!plain(want)) want -= 4;
    assert.ok(Math.abs(r.landed - want) < 6, `up at ${r.landed} m, from ${r.from} m: wanted ${want}`);
    assert.ok(plain(r.landed));
    assert.equal(r.progress.lap, 1);
    assert.equal(r.progress.checkpoint, MAPS.farmyard.checkpoints.filter(cp => FARM.query(cp.x, cp.z).s < r.landed).length, 'with the checkpoints of the place he came up at');
    return r.landed;
  };
  // 4th of four, the others 330, 250 and 190 m round: he goes a 4th-placed dog's distance, and is placed by where he comes up
  let r = race([330, 250, 190]), landed = check(r, 4);
  assert.ok(landed > 190, 'past the dog in front of him');
  assert.equal(r.places.indexOf(r.kombu.id), [330, 250, 190].filter(s => s > landed).length);
  // 2nd of two, the leader 200 m round: a short hop, and he is still behind the leader
  r = race([200]); landed = check(r, 2);
  assert.ok(landed < 200);
  assert.deepEqual(r.places, [r.sockets[0].id, r.kombu.id], 'still 2nd');
  // ...but a leader only just in front of him is passed
  r = race([140]); landed = check(r, 2);
  assert.ok(landed > 140);
  assert.deepEqual(r.places, [r.kombu.id, r.sockets[0].id], 'that makes him 1st');
});

test('Baz and Naz\'s Trip Wire: the rope trips a dog right across the road from them, not one that jumps it, and they run through what stands on the road while it lasts', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { SPECIALS } = await import('../shared/specials.js');
  const T = PROCEDURAL_TRACKS.kombu_house, spec = SPECIALS.baz_naz;
  const at = (s, lateral = 0, up = 0) => { const p = T.pointAt(s, lateral); return [p.x, p.y + up, p.z]; };
  const pippa = client(), twins = client();
  const room = pippa.call('hostGame', { mapId: 'kombu_house', name: 'One' }).room;
  twins.call('joinGame', { roomCode: room.code, name: 'Two' });
  pippa.call('selectDog', { dog: 'gsp' });
  assert.equal(twins.call('selectDog', { dog: 'baz_naz' }).success, true);
  pippa.call('startRace');
  for (const socket of [pippa, twins]) socket.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const move = (socket, position) => socket.call('playerMove', { position, rotation: T.pointAt(T.query(position[0], position[2]).s).rotationY, animation: 'Sprint', respawnRevision: 0 });
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  // Pippa leads up the drive; the twins, behind her, get their special from the first row of boxes
  const box = TREAT_BOXES_BY_MAP.kombu_house[0], from = box.s;
  move(pippa, at(from + 20, 4));
  context.mock.method(Math, 'random', () => 0);
  move(twins, box.groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: twins.id, item: 'special' });
  twins.call('useItem');
  assert.deepEqual(events('specialStarted').at(-1), { playerId: twins.id, kind: 'rope', durationMs: 6000 });
  // they come up to her on the far side of the road: nowhere near her, but the rope is
  move(twins, at(from + 14, -4));
  assert.equal(events('specialHit').length, 0, 'not yet');
  move(twins, at(from + 19.5, -4));
  assert.deepEqual(events('specialHit'), [{ playerId: twins.id, victim: pippa.id }]);
  // once she is up again she jumps it...
  context.mock.timers.tick(2500);
  move(pippa, at(from + 40, 4, spec.rope.clear + 0.4));
  move(twins, at(from + 40, -4));
  assert.equal(events('specialHit').length, 1, 'over the rope');
  // ...and comes down on it
  move(pippa, at(from + 40.5, 4));
  assert.equal(events('specialHit').length, 2);
  // through the sofa in the living room while it lasts; round it afterwards
  const sofa = T.obstacles.find(o => o.kind === 'sofa'), where = () => events('playerMoved').findLast(e => e.playerId === twins.id).position;
  move(twins, [sofa.x, sofa.y, sofa.z]);
  assert.ok(Math.hypot(where()[0] - sofa.x, where()[2] - sofa.z) < 0.01, 'straight through it');
  context.mock.timers.tick(spec.durationMs);
  assert.equal(events('specialEnded').at(-1).playerId, twins.id);
  move(twins, [sofa.x, sofa.y, sofa.z]);
  assert.ok(Math.hypot(where()[0] - sofa.x, where()[2] - sofa.z) > 1, 'not once it is over');
  for (const p of [pippa, twins]) p.call('leaveGame');
});

test('Casper\'s Try Time: six seconds knocking over dogs he runs into, then the ball flies at the leader, knocking over a dog it passes', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const { SPECIALS } = await import('../shared/specials.js');
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const casper = client(), berri = client(), sam = client();
  const room = casper.call('hostGame', { mapId: 'wendover', name: 'Casper' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  assert.equal(casper.call('selectDog', { dog: 'casper' }).success, true); berri.call('selectDog', { dog: 'black_lab' }); sam.call('selectDog', { dog: 'pablo' });
  casper.call('startRace');
  for (const p of [casper, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const cp = i => [map.checkpoints[i].x, 0, map.checkpoints[i].z];
  const road = (s, lateral = 0) => { const p = PICKUP_PATHS.wendover.pointAt(s, lateral); return [p.x, p.y, p.z]; };
  // Berri leads (two checkpoints), Sam is 2nd (one), Casper last
  move(berri, cp(0)); move(berri, cp(1)); move(sam, cp(0));
  context.mock.method(Math, 'random', () => 0);
  move(casper, boxes[0].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: casper.id, item: 'special' });
  move(casper, road(200)); move(sam, road(300)); move(berri, road(420, 4));
  casper.call('useItem');
  assert.deepEqual(events('specialStarted').at(-1), { playerId: casper.id, kind: 'rugby', durationMs: SPECIALS.casper.durationMs });
  assert.equal(events('playerHit').length, 0, 'nobody near him yet');
  assert.equal(events('fireworkLaunched').length, 0, 'he has the ball');
  // he runs into Sam: over Sam goes, and Casper carries on
  const facing = PICKUP_PATHS.wendover.pointAt(299).rotationY;
  move(casper, road(299), facing);
  assert.deepEqual(events('playerHit').map(e => [e.playerId, e.by, e.item]), [[sam.id, casper.id, 'special']]);
  assert.equal(events('specialHit').at(-1).playerId, casper.id);
  // the six seconds are up: the special ends, and the ball is away after the leader
  move(casper, road(330), facing);
  context.mock.timers.tick(SPECIALS.casper.durationMs);
  assert.deepEqual(events('specialEnded').at(-1), { playerId: casper.id, reason: 'done' });
  const ball = events('fireworkLaunched').at(-1);
  assert.deepEqual([ball.owner, ball.target, ball.look], [casper.id, berri.id, 'rugby']);
  // Sam is back on his feet in its way; it takes him and then Berri
  move(sam, road(380));
  for (let i = 0; i < 100 && !events('fireworkExploded').length; i++) context.mock.timers.tick(50);
  assert.deepEqual(events('fireworkPassed').map(e => e.playerId), [sam.id], 'smashing a dog on the way');
  assert.deepEqual(events('fireworkExploded').at(-1).playerIds, [berri.id], 'and it reaches the dog in first place');
  for (const p of [casper, berri, sam]) p.call('leaveGame');

  // knocked out of nothing: but a fall ends the charge with no pass; and leading, the ball has nobody to go for
  const c2 = client(), other = client();
  const room2 = c2.call('hostGame', { mapId: 'wendover', name: 'Casper' }).room;
  other.call('joinGame', { roomCode: room2.code, name: 'Other' });
  c2.call('selectDog', { dog: 'casper' }); other.call('selectDog', { dog: 'gsp' });
  c2.call('startRace');
  for (const p of [c2, other]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events2 = name => server.events.filter(e => e.room === room2.code && e.event === name).map(e => e.data);
  move(other, cp(0));
  move(c2, boxes[0].groundPosition);
  move(c2, cp(0)); move(c2, cp(1));
  move(c2, road(400)); move(other, road(300));
  c2.call('useItem');
  context.mock.timers.tick(SPECIALS.casper.durationMs);
  assert.equal(events2('fireworkLaunched').at(-1).target, null, 'in front himself: nobody to pass at');
  context.mock.timers.tick(3000);
  assert.equal(events2('fireworkGone').length, 1, 'it is gone a moment later');
  assert.equal(events2('playerHit').length, 0);
  for (const p of [c2, other]) p.call('leaveGame');
});

test('Jimmy\'s Dragon Dance: from last place seven seconds and five fireworks at the leader two seconds apart; leading, they go for the dog behind', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const map = MAPS.wendover, boxes = TREAT_BOXES_BY_MAP.wendover;
  const jimmy = client(), berri = client(), sam = client();
  const room = jimmy.call('hostGame', { mapId: 'wendover', name: 'Jimmy' }).room;
  berri.call('joinGame', { roomCode: room.code, name: 'Berri' });
  sam.call('joinGame', { roomCode: room.code, name: 'Sam' });
  assert.equal(jimmy.call('selectDog', { dog: 'jimmy' }).success, true); berri.call('selectDog', { dog: 'black_lab' }); sam.call('selectDog', { dog: 'pablo' });
  jimmy.call('startRace');
  for (const p of [jimmy, berri, sam]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const move = (who, position, rotation = 0) => who.call('playerMove', { position, rotation, animation: 'Run' });
  const cp = i => [map.checkpoints[i].x, 0, map.checkpoints[i].z];
  const road = (s, lateral = 0) => { const p = PICKUP_PATHS.wendover.pointAt(s, lateral); return [p.x, p.y, p.z]; };
  // Berri leads, Sam is 2nd, Jimmy last
  move(berri, cp(0)); move(berri, cp(1)); move(sam, cp(0));
  context.mock.method(Math, 'random', () => 0);
  move(jimmy, boxes[0].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: jimmy.id, item: 'special' });
  move(jimmy, road(150)); move(sam, road(300, 5)); move(berri, road(420, 4));
  jimmy.call('useItem');
  assert.deepEqual(events('specialStarted').at(-1), { playerId: jimmy.id, kind: 'dragon', durationMs: 7000, fireworks: 5 });
  context.mock.timers.tick(1);
  const lit = () => events('fireworkLaunched').filter(e => e.owner === jimmy.id);
  assert.equal(lit().length, 1, 'the first at once');
  assert.equal(lit()[0].target, berri.id, 'at the leader');
  for (let n = 2; n <= 5; n++) {
    context.mock.timers.tick(1998);
    assert.equal(lit().length, n - 1, `not before ${2 * (n - 1)} s`);
    context.mock.timers.tick(2);
    assert.equal(lit().length, n, `number ${n} at ${2 * (n - 1)} s`);
  }
  assert.ok(lit().every(e => e.target === berri.id));
  assert.equal(events('specialEnded').filter(e => e.playerId === jimmy.id).at(-1)?.reason, 'done', 'the dragon went at seven seconds; the fifth firework a second later');
  context.mock.timers.tick(20000);
  assert.equal(lit().length, 5, 'and no more');
  assert.ok(events('playerHit').some(e => e.playerId === berri.id && e.item === 'firework' && e.by === jimmy.id), 'they are fireworks like any other');
  for (const p of [jimmy, berri, sam]) p.call('leaveGame');

  // Two dogs: Jimmy takes it from behind (last of two), goes past and uses it in front: 4 fireworks, 6 seconds, at the dog behind
  const j2 = client(), other = client();
  const room2 = j2.call('hostGame', { mapId: 'wendover', name: 'Jimmy' }).room;
  other.call('joinGame', { roomCode: room2.code, name: 'Other' });
  j2.call('selectDog', { dog: 'jimmy' }); other.call('selectDog', { dog: 'gsp' });
  j2.call('startRace');
  for (const p of [j2, other]) p.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const events2 = name => server.events.filter(e => e.room === room2.code && e.event === name).map(e => e.data);
  move(other, cp(0));
  move(j2, boxes[0].groundPosition);
  assert.deepEqual(events2('itemChanged').at(-1), { playerId: j2.id, item: 'special' });
  move(j2, cp(0)); move(j2, cp(1));
  move(j2, road(400)); move(other, road(380));
  j2.call('useItem');
  assert.deepEqual(events2('specialStarted').at(-1), { playerId: j2.id, kind: 'dragon', durationMs: 6000, fireworks: 4 });
  context.mock.timers.tick(1);
  assert.equal(events2('fireworkLaunched').at(-1).target, other.id, 'the dog behind him');
  for (let i = 0; i < 40 && !events2('fireworkExploded').length; i++) context.mock.timers.tick(50);
  assert.deepEqual(events2('fireworkExploded').at(-1)?.playerIds, [other.id], 'it turns round and finds them');
  for (const p of [j2, other]) p.call('leaveGame');
});

test('Jazz\'s Earthquake: every other dog still racing is slowed for five seconds wherever it is, its own special or not, but not Ralph flying, and not Jazz', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { QUAKE, SPECIALS } = await import('../shared/specials.js');
  assert.equal(SPECIALS.jazz.kind, 'quake');
  assert.equal(QUAKE.seconds, 5);
  assert.ok(QUAKE.speed > 0.1 && QUAKE.speed <= 0.3, 'extremely slow, but not stopped');
  const T = PROCEDURAL_TRACKS.kombu_house;
  const at = (s, lateral = 0) => { const p = T.pointAt(s, lateral); return [p.x, p.y, p.z]; };
  const sockets = [client(), client(), client(), client(), client()], [pippa, twins, poppy, jazz, ralph] = sockets;
  const room = pippa.call('hostGame', { mapId: 'kombu_house', name: 'One' }).room;
  sockets.slice(1).forEach((socket, i) => socket.call('joinGame', { roomCode: room.code, name: `P${i + 2}` }));
  ['gsp', 'baz_naz', 'black_lab', 'jazz', 'ralph'].forEach((dog, i) => assert.equal(sockets[i].call('selectDog', { dog }).success, true));
  pippa.call('startRace');
  for (const socket of sockets) socket.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const move = (socket, position) => socket.call('playerMove', { position, rotation: 0, animation: 'Sprint', respawnRevision: 0 });
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const box = TREAT_BOXES_BY_MAP.kombu_house[0], from = box.s;
  // Pippa leads, a long way up the road; the twins take a box and set off on their Trip Wire; then Jazz takes one
  move(pippa, at(from + 30, 4));
  move(poppy, at(from + 12, -4));
  context.mock.method(Math, 'random', () => 0);
  move(twins, box.groundPosition);
  twins.call('useItem');
  assert.equal(events('specialStarted').at(-1).kind, 'rope');
  // ...and Ralph takes one and is up on his rocket paws
  move(ralph, TREAT_BOXES_BY_MAP.kombu_house[2].groundPosition);
  ralph.call('useItem');
  assert.equal(events('specialStarted').at(-1).kind, 'jet');
  move(jazz, TREAT_BOXES_BY_MAP.kombu_house[1].groundPosition);
  assert.deepEqual(events('itemChanged').at(-1), { playerId: jazz.id, item: 'special' });
  jazz.call('useItem');
  const quake = events('earthquake').at(-1);
  assert.equal(quake.playerId, jazz.id);
  assert.deepEqual([quake.seconds, quake.speed], [QUAKE.seconds, QUAKE.speed]);
  assert.deepEqual([...quake.slowed].sort(), [pippa.id, poppy.id, twins.id].sort(), 'Pippa, Poppy and the twins (Trip Wire or not, their paws are on the ground); not Ralph in the air, not Jazz');
  assert.equal(events('specialStarted').filter(e => e.playerId === jazz.id).length, 0, 'nothing of her own to keep track of');
  assert.equal(events('itemUsed').at(-1)?.playerId ?? jazz.id, jazz.id);
  for (const p of sockets) p.call('leaveGame');
});

test('Ralph on his rocket paws is still fired by the cannon and thrown by the catapult, and keeps flying when he lands', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  for (const mapId of ['frostpeak', 'treat_road']) {
    const lead = client(), ralph = client(), sockets = [lead, ralph];
    const room = lead.call('hostGame', { mapId }).room;
    ralph.call('joinGame', { roomCode: room.code });
    lead.call('selectDog', { dog: 'gsp' }); ralph.call('selectDog', { dog: 'ralph' });
    lead.call('startRace'); for (const s of sockets) s.call('raceLoaded');
    for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
    const move = (socket, position, rotation = 0) => socket.call('playerMove', { position, rotation, animation: 'Run', respawnRevision: 0 });
    const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
    for (const cp of MAPS[mapId].checkpoints.slice(0, 8)) move(lead, [cp.x, cp.y ?? 0, cp.z]);      // (someone in front: the leader gets no special)
    context.mock.method(Math, 'random', () => 0);
    move(ralph, TREAT_BOXES_BY_MAP[mapId][0].groundPosition);
    ralph.call('useItem');
    assert.equal(events('specialStarted').at(-1)?.kind, 'jet', mapId);
    context.mock.restoreAll();
    // over the pad at flying height (3.2 m up)
    if (mapId === 'frostpeak') {
      const C = FROSTPEAK_CANNON, yaw = C.takeoffRotationY;
      const at = along => [C.takeoff[0] + Math.sin(yaw) * along, C.takeoff[1] + 3.2, C.takeoff[2] + Math.cos(yaw) * along];
      move(ralph, at(-2), yaw); move(ralph, at(1), yaw);
    } else {
      const T = TREAT_ROAD, up = s => { const p = T.pointAt(s); return [p.x, p.y + 3.2, p.z]; };
      move(ralph, up(T.launch.padStart + 1)); move(ralph, up(T.launch.takeoffS + 0.1));
    }
    assert.equal(events('playerLaunched').at(-1)?.playerId, ralph.id, mapId);
    assert.ok(!events('specialEnded').some(e => e.playerId === ralph.id), 'the rocket paws stay lit');
    for (const s of sockets) s.call('leaveGame');
  }
});

test('split screen: a single-player room with up to three more seats that only the page which made it can take; computer dogs fill the rest', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const one = client(), two = client(), stranger = client(), key = 'the-key-only-this-page-has';
  const room = one.call('hostGame', { name: 'Player 1', local: true, localKey: key }).room;
  assert.deepEqual([room.singlePlayer, room.local], [true, true]);
  assert.equal(room.localKey, undefined, 'the key is not sent back');
  assert.equal(stranger.call('joinGame', { roomCode: room.code }).success, false, 'not without the key');
  assert.equal(stranger.call('joinGame', { roomCode: room.code, localKey: 'another-key-altogether' }).success, false);
  assert.equal(two.call('joinGame', { roomCode: room.code, name: 'Player 2', localKey: key }).success, true);
  // (two players: the same as ever.  Three and four are further down)
  one.call('selectDog', { dog: 'kombu' }); one.call('setReady', { ready: true });
  assert.equal(two.call('selectDog', { dog: 'kombu' }).success, false, 'one of each dog');
  two.call('selectDog', { dog: 'ralph' }); two.call('setReady', { ready: true });
  one.call('setBots', { count: 5 });                       // (more than there is room for)
  one.call('selectMap', { mapId: 'farmyard' });
  assert.equal(two.call('startRace').success, false, 'player 1 starts it');
  assert.equal(one.call('startRace').success, true);
  const start = latest(room.code, 'raceStarted');
  assert.deepEqual(start.players.map(p => Boolean(p.bot)), [false, false, true, true, true, true], 'two players and four computer dogs');
  for (const p of [one, two]) p.call('leaveGame');
  // four at one screen: four seats and no more, and two computer dogs to make six
  const four = [client(), client(), client(), client()], fifth = client();
  const big = four[0].call('hostGame', { name: 'Player 1', local: true, localKey: key }).room;
  four.slice(1).forEach((socket, i) => assert.equal(socket.call('joinGame', { roomCode: big.code, name: `Player ${i + 2}`, localKey: key }).success, true, `player ${i + 2}`));
  assert.equal(fifth.call('joinGame', { roomCode: big.code, localKey: key }).success, false, 'four seats, no more');
  ['gsp', 'ralph', 'enzo', 'jazz'].forEach((dog, i) => { assert.equal(four[i].call('selectDog', { dog }).success, true); four[i].call('setReady', { ready: true }); });
  four[0].call('setBots', { count: 5 });                   // (more than there is room for)
  four[0].call('selectMap', { mapId: 'speed_bowl' });
  assert.equal(four[0].call('startRace').success, true);
  assert.deepEqual(latest(big.code, 'raceStarted').players.map(p => Boolean(p.bot)), [false, false, false, false, true, true], 'four players and two computer dogs');
  for (const p of four) p.call('leaveGame');
  // three: three computer dogs
  const three = [client(), client(), client()];
  const mid = three[0].call('hostGame', { name: 'Player 1', local: true, localKey: key }).room;
  three.slice(1).forEach(socket => socket.call('joinGame', { roomCode: mid.code, localKey: key }));
  ['gsp', 'ralph', 'enzo'].forEach((dog, i) => { three[i].call('selectDog', { dog }); three[i].call('setReady', { ready: true }); });
  three[0].call('setBots', { count: 5 });
  three[0].call('selectMap', { mapId: 'speed_bowl' });
  assert.equal(three[0].call('startRace').success, true);
  assert.deepEqual(latest(mid.code, 'raceStarted').players.map(p => Boolean(p.bot)), [false, false, false, true, true, true]);
  for (const p of three) p.call('leaveGame');
  // an ordinary single-player room still has one seat
  const solo = client().call('hostGame', { singlePlayer: true }).room;
  assert.equal(two.call('joinGame', { roomCode: solo.code, localKey: key }).success, false);
});

test('Rocky\'s Sheep Stampede: five sheep up the road, each gone on the first dog it reaches or after ten seconds; Rocky is untouched', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const at = (s, lateral = 0) => { const p = FARM.pointAt(s, lateral); return [p.x, p.y, p.z]; };
  const lead = client(), near = client(), rocky = client(), sockets = [lead, near, rocky];
  const room = lead.call('hostGame', { mapId: 'farmyard', name: 'Lead' }).room;
  near.call('joinGame', { roomCode: room.code, name: 'Near' }); rocky.call('joinGame', { roomCode: room.code, name: 'Rocky' });
  lead.call('selectDog', { dog: 'gsp' }); near.call('selectDog', { dog: 'pablo' }); rocky.call('selectDog', { dog: 'rocky' });
  lead.call('startRace'); for (const s of sockets) s.call('raceLoaded');
  for (let i = 0; i < 3; i++) context.mock.timers.tick(1000);
  const move = (socket, position) => socket.call('playerMove', { position, rotation: 0, animation: 'Run', respawnRevision: 0 });
  const events = name => server.events.filter(e => e.room === room.code && e.event === name).map(e => e.data);
  const box = TREAT_BOXES_BY_MAP.farmyard[0].groundPosition, from = FARM.query(box[0], box[2]).s;
  // one dog 30 m up the road, another a long way round the lap
  for (const cp of MAPS.farmyard.checkpoints) { if (FARM.query(cp.x, cp.z).s < 400) move(lead, [cp.x, cp.y, cp.z]); }
  // (in line with Rocky across the road: the flock sets off around where he is)
  move(lead, at(400)); move(near, at(from + 30, FARM.query(box[0], box[2]).lateral));
  context.mock.method(Math, 'random', () => 0);
  move(rocky, box);
  context.mock.restoreAll();
  assert.deepEqual(events('itemChanged').at(-1), { playerId: rocky.id, item: 'special' });
  rocky.call('useItem');
  const released = events('sheepReleased').at(-1);
  assert.equal(released.owner, rocky.id);
  assert.equal(events('sheepReleased').length, 1, 'one flock');
  assert.equal(released.sheep.length, 5);
  assert.equal(events('specialStarted').length, 0, 'nothing happens to Rocky himself');
  for (const sheep of released.sheep) assert.ok(FARM.query(sheep.position[0], sheep.position[2]).onTrack);
  // two seconds on: the one in the middle has reached the near dog and is gone; the rest run on
  for (let i = 0; i < 40; i++) context.mock.timers.tick(50);
  const hits = events('playerHit').filter(e => e.item === 'special');
  assert.deepEqual(hits.map(e => [e.playerId, e.by]), [[near.id, rocky.id]], 'one dog, knocked over once');
  assert.equal(events('sheepGone').filter(e => e.hit === near.id).length, 1, 'by one sheep, which is gone');
  assert.ok(events('sheepMoved').length > 20);
  assert.ok(!events('playerHit').some(e => e.playerId === rocky.id));
  // ten seconds after they set off the rest are gone (one or more on the leader, 280 m up the road at most)
  for (let i = 0; i < 170; i++) context.mock.timers.tick(50);
  assert.equal(events('sheepGone').length, 5);
  const moves = events('sheepMoved').length;
  for (let i = 0; i < 20; i++) context.mock.timers.tick(50);
  assert.equal(events('sheepMoved').length, moves, 'and nothing more is heard of them');
  for (const s of sockets) s.call('leaveGame');
});
