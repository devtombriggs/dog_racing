import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { MAPS } from '../shared/maps.js';
import { TREAT_ROAD } from '../shared/treatRoadData.js';
import { MODBURY_HEIGHTS as COAST } from '../shared/modburyData.js';
import { TREAT_BOXES, TREAT_BOXES_BY_MAP } from '../shared/treatBoxes.js';
import { forwardOf } from '../shared/items.js';
import { racingLineAt } from '../shared/pickupSpots.js';

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


test('treat boxes hide for the whole room for exactly five seconds and can be collected again', context => {
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
  context.mock.timers.tick(4999);
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
  assert.deepEqual(Object.keys(atGo[0]).sort(), ['dog', 'finished', 'name', 'place', 'playerId']);

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
  roll = 0.99;
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
  const players = ['A', 'B', 'C', 'D', 'E'].map(() => client());
  const [a, b, c] = players;
  const room = a.call('hostGame', { name: 'A' }).room;
  players.slice(1).forEach((p, i) => p.call('joinGame', { roomCode: room.code, name: 'BCDE'[i] }));
  const dogs = ['gsp', 'ralph', 'pablo', 'black_lab', 'second_dog'];
  players.slice(0, 3).forEach((p, i) => p.call('selectDog', { dog: dogs[i] }));
  assert.equal(latest(room.code, 'lobbyUpdated').status, 'lobby', 'three of five: waiting for the host');
  assert.equal(a.call('voteMap', { mapId: 'frostpeak' }).success, false, 'no voting before the vote');
  players.slice(3).forEach((p, i) => p.call('selectDog', { dog: dogs[i + 3] }));
  const voting = latest(room.code, 'lobbyUpdated');
  assert.equal(voting.status, 'voting', 'all five dogs picked: the vote starts by itself');
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
test('Wendover: Ralph can use all four burrows on all three laps without breaking checkpoints', async context => {
  const { WENDOVER: W, woodlandDistanceAt } = await import('../shared/wendoverData.js');
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
    for(const t of W.tunnels) {
      while(cp<cps.length&&cps[cp].s<t.entryS){const c=cps[cp++];move([c.x,0,c.z]);}
      move(approach(t,-1));move(approach(t,.1));
      assert.equal(latest(room.code,'playerBurrowEntered').tunnelId,t.id);
      assert.equal(host.call('requestRescue').success,false,'rescue cannot interrupt a burrow');
      context.mock.timers.tick(1099);move(t.exit);
      assert.deepEqual(latest(room.code,'playerMoved').position,t.entry,'cannot escape before transit completes');
      context.mock.timers.tick(1);move(t.entry);
      const exit=latest(room.code,'playerBurrowExited');
      assert.deepEqual(exit.position,t.exit);assert.equal(exit.rotation,t.exitYaw);assert.equal(exit.respawnRevision,++revision);
      move(approach(t,-1),revision-1);
      assert.deepEqual(latest(room.code,'playerMoved').position,t.exit,'stale entrance packets cannot pull the dog back');
      while(cp<cps.length&&cps[cp].s<t.exitS)cp++;
      assert.equal(latest(room.code,'raceProgress').checkpoint,cp);
      assert.equal(latest(room.code,'raceProgress').lap,lap);
      const count=server.events.filter(e=>e.room===room.code&&e.event==='playerBurrowEntered').length;
      move(approach(t,-1));move(approach(t,.1));
      assert.equal(server.events.filter(e=>e.room===room.code&&e.event==='playerBurrowEntered').length,count,'one use per lap');
      move(t.exit);
    }
    while(cp<cps.length){const c=cps[cp++];move([c.x,0,c.z]);}
    const finish=d=>map.startFinish.position.map((v,i)=>v+d*map.startFinish.forward[i]);
    move(finish(-2));move(finish(2));
    assert.equal(latest(room.code,'raceProgress').finished,lap===3);
  }
  assert.equal(server.events.filter(e=>e.room===room.code&&e.event==='playerBurrowExited').length,12);
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
