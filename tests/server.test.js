import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { MAPS } from '../shared/maps.js';
import { TREAT_ROAD } from '../shared/treatRoadData.js';
import { MODBURY_HEIGHTS as COAST } from '../shared/modburyData.js';

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
    code: room.code, hostName: 'Tom Smith', mapId: 'frostpeak', playerCount: 1, maxPlayers: 5
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
  const host = client(), guests = Array.from({ length: 5 }, client);
  const room = host.call('hostGame', { name: 'Host' }).room;
  for (const guest of guests.slice(0, 4)) {
    assert.equal(guest.call('joinGame', { roomCode: room.code }).success, true);
  }
  assert.equal(lobbies()[0].playerCount, 5);
  assert.equal(guests[4].call('joinGame', { roomCode: room.code }).error, 'Room is full');
  // Retrying an acknowledged join must not fail just because the room filled up.
  assert.equal(guests[0].call('joinGame', { roomCode: room.code }).success, true);
  guests[0].call('leaveGame');
  assert.equal(lobbies()[0].playerCount, 4);
  assert.equal(guests[4].call('joinGame', { roomCode: room.code }).success, true);
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
  guest.call('selectDog', { dog: 'ralph' });
  host.call('setReady', { ready: true });
  guest.call('setReady', { ready: true });
  assert.equal(guest.call('selectMap', { mapId: 'wendover' }).success, false);
  assert.equal(host.call('selectMap', { mapId: 'missing' }).success, false);
  assert.equal(host.call('selectMap', { mapId: 'wendover' }).success, true);
  const update = latest(room.code, 'lobbyUpdated');
  assert.equal(update.mapId, 'wendover');
  assert.deepEqual(update.players.map(player => player.dog), ['gsp', 'ralph']);
  assert.ok(update.players.every(player => player.ready));
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
  test(`${mapId}: grid, loading gate, ordered checkpoints and three-lap finish`, context => {
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
    for (let lap = 1; lap <= 3; lap++) {
      // Skipping ahead cannot advance the required checkpoint.
      const last = map.checkpoints.at(-1);
      move([last.x, last.y ?? 0, last.z]);
      for (const checkpoint of map.checkpoints) {
        if (checkpoint.launchLanding) {
          const T = TREAT_ROAD;
          for (const s of [T.launch.padStart + 1, T.launch.takeoffS + 0.1]) {
            const p=T.pointAt(s); move([p.x,p.y,p.z]);
          }
          assert.equal(latest(room.code,'playerLaunched').playerId,host.id);
          context.mock.timers.tick(T.launch.duration*1000+1);
          move([checkpoint.x,checkpoint.y,checkpoint.z]);
          revision=latest(room.code,'playerLanded').respawnRevision;
          assert.equal(revision,lap);
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
      assert.equal(progress.finished, lap === 3);
      assert.equal(progress.totalCheckpoints, map.checkpoints.length);
      if (lap < 3) assert.equal(progress.lap, lap + 1);
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
