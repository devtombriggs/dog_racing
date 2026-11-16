import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { MAPS } from '../shared/maps.js';

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

test('map choice is validated, synchronized, host-only, and resets readiness', () => {
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
  assert.ok(update.players.every(player => !player.ready));
  assert.equal(host.call('startRace').success, false);
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
    const move = position => host.call('playerMove', { position, rotation: 0, animation: 'Run' });
    const finishPoint = distance => map.startFinish.position.map((value, axis) => value + distance * map.startFinish.forward[axis]);
    // Crossing the finish before visiting the route cannot count a lap.
    move(finishPoint(-2)); move(finishPoint(2));
    assert.equal(latest(room.code, 'raceProgress'), undefined);
    for (let lap = 1; lap <= 3; lap++) {
      // Skipping ahead cannot advance the required checkpoint.
      const last = map.checkpoints.at(-1);
      move([last.x, 0, last.z]);
      for (const checkpoint of map.checkpoints) move([checkpoint.x, 0, checkpoint.z]);
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
