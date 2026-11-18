import assert from 'node:assert/strict';
import { test } from 'node:test';
import { botRoute, createBot } from '../server/bots.js';
import { BOT_LEVELS, BOT_LEVEL_IDS } from '../shared/botLevels.js';
import { PICKUP_PATHS } from '../shared/pickupSpots.js';
import { MODBURY_HEIGHTS as COAST } from '../shared/modburyData.js';
import { WENDOVER } from '../shared/wendoverData.js';

const TICK = 0.05;

// Run a computer dog by itself from s metres round the lap, for `seconds`, calling watch(move, state) each step
function run({ mapId, dog, level, from = 0, seconds, world = {}, watch = () => {} }) {
  const route = botRoute(mapId), start = route.pointAt(from), bot = createBot({ mapId, dog, level, seed: 7 });
  bot.place([start.x, start.y, start.z], start.heading);
  for (let t = 0; t < seconds; t += TICK) watch(bot.step(TICK, world), bot.state, route);
  return bot;
}

test('the road a computer dog follows is the road the pickups are placed on, on every map', () => {
  for (const [mapId, path] of Object.entries(PICKUP_PATHS)) {
    const route = botRoute(mapId);
    assert.equal(route.length, path.length);
    for (let s = 0; s < route.length; s += 7.3) {
      const mine = route.pointAt(s, 2), theirs = path.pointAt(s, 2);
      assert.ok(Math.hypot(mine.x - theirs.x, mine.z - theirs.z) < 0.8, `${mapId}: ${s} m`);
      // ...and a place found from a position is the place it was made from
      const found = route.locate([mine.x, mine.y, mine.z], s);
      assert.ok(Math.abs(route.ahead(found.s, s)) < 0.8 && Math.abs(found.lateral - 2) < 0.4, `${mapId}: found at ${s} m`);
      assert.ok(route.limitAt(s) < mine.halfWidth, `${mapId}: keeps off the edge at ${s} m`);
    }
    // every Treat Box and Golden Bone is somewhere a dog could run
    for (const pickup of [...route.boxes, ...route.bones]) assert.ok(Math.abs(pickup.lateral) < route.pointAt(pickup.s).halfWidth, mapId);
  }
});

test('the levels: easy is slower, sees less far ahead and fluffs more jumps than medium, and medium than hard', () => {
  assert.deepEqual(BOT_LEVEL_IDS, ['easy', 'medium', 'hard']);
  const { easy, medium, hard } = BOT_LEVELS;
  for (const [worse, better] of [[easy, medium], [medium, hard]]) {
    assert.ok(worse.pace < better.pace && worse.foresight < better.foresight && worse.jumpMiss > better.jumpMiss);
    assert.ok(worse.line < better.line && worse.wander > better.wander && worse.itemSense < better.itemSense);
  }
  assert.equal(hard.pace, 1, 'the best of them is its dog flat out: no more than a player could have');
  // out on the road: over the same thirty seconds the better dog is further on
  const distance = level => run({ mapId: 'farmyard', dog: 'gsp', level, seconds: 30 }).state.travelled;
  assert.ok(distance('easy') < distance('medium') && distance('medium') < distance('hard'));
});

test('a computer dog runs at its own dog\'s speed, never faster, and stays on the road', () => {
  for (const mapId of ['farmyard', 'modbury_heights', 'wendover']) {
    for (const dog of ['second_dog', 'pablo']) {       // (not Ralph: on Wendover he leaves the road for his burrows)
      const bot = run({
        mapId, dog, level: 'hard', seconds: 60,
        watch: (move, state, route) => {
          assert.ok(Math.abs(state.lateral) <= route.pointAt(state.s).halfWidth, `${mapId}: ${dog} is off the road at ${state.s}`);
          assert.ok(state.speed <= bot_top(dog) * 1.09, `${mapId}: ${dog} at ${state.speed} m/s`);       // (1.08: the most a downhill gives)
          assert.ok(move.position.every(Number.isFinite) && Number.isFinite(move.rotation));
        },
      });
      assert.ok(bot.state.travelled > 60 * 9, `${mapId}: ${dog} went ${bot.state.travelled} m in a minute`);
    }
  }
  // Meela (speed 10) covers more ground than Ralph (speed 6) on the same road
  const far = dog => run({ mapId: 'farmyard', dog, level: 'hard', seconds: 30 }).state.travelled;
  assert.ok(far('second_dog') > far('ralph') * 1.1);
});
function bot_top(dog) { return createBot({ mapId: 'farmyard', dog }).sprintSpeed; }

test('Modbury\'s broken bridges: a computer dog is in the air over every break', () => {
  for (const chasm of COAST.chasms) {
    let overBreak = 0;
    run({
      mapId: 'modbury_heights', dog: 'gsp', level: 'hard', from: chasm.ravineStart - 70, seconds: 9,
      watch: (move) => {
        const ground = COAST.query(move.position[0], move.position[2]);
        if (!ground.gap) return;
        overBreak += 1;
        assert.ok(move.position[1] >= ground.y + COAST.rules.gapClearance, `break ${chasm.index}: ${move.position[1] - ground.y} m up`);
        assert.equal(move.animation, 'Jump');
      },
    });
    assert.ok(overBreak > 0, `break ${chasm.index} was crossed`);
  }
});

test('Wendover\'s pools: Poppy swims through faster than Meela, and both keep to the water, off the bog', () => {
  const pool = WENDOVER.pools[0];
  const crossing = dog => {
    let ticks = 0;
    run({
      mapId: 'wendover', dog, level: 'hard', from: pool.sStart - 40, seconds: 25,
      watch: (move, state) => {
        if (state.s < pool.sStart + 12 || state.s > pool.sEnd - 12) return;
        ticks += 1;
        assert.ok(Math.abs(state.lateral) < pool.halfWidth, `${dog} is in the bog`);
        assert.equal(move.animation, 'Trot', 'the swimming stroke');
      },
    });
    return ticks;
  };
  const poppy = crossing('black_lab'), meela = crossing('second_dog');
  assert.ok(poppy > 0 && meela > poppy * 1.5, `Poppy ${poppy} ticks, Meela ${meela}`);
});

test('a knock, a golden bone and a held item', () => {
  const bot = run({ mapId: 'farmyard', dog: 'gsp', level: 'hard', seconds: 6 });
  const cruising = bot.speed;
  bot.boost();
  assert.ok(bot.speed > cruising, 'the bone kicks at once');
  bot.hit(1100);
  assert.ok(bot.speed < cruising * 0.3, 'knocked over');
  for (let i = 0; i < 10; i++) bot.step(TICK, {});
  assert.ok(bot.speed < cruising * 0.3, 'and slow until it is up again');
  for (let i = 0; i < 80; i++) bot.step(TICK, {});
  assert.ok(bot.speed > cruising * 0.8, 'then away');
  // an easy dog uses whatever it holds after a few seconds; a hard one keeps a ball until there is someone to throw it at
  const uses = (level, world) => {
    const dog = run({ mapId: 'farmyard', dog: 'gsp', level, seconds: 4 });
    for (let i = 0; i < 180; i++) if (dog.step(TICK, world).useItem) return true;
    return false;
  };
  assert.equal(uses('easy', { item: 'ball', place: 2 }), true);
  assert.equal(uses('hard', { item: 'ball', place: 2 }), false);
  assert.equal(uses('hard', { item: 'firework', place: 1 }), false, 'nobody to send it after while it leads');
  assert.equal(uses('hard', { item: 'firework', place: 3 }), true);
  assert.equal(uses('hard', { item: 'collar', place: 2, threat: 200 }), false);
  assert.equal(uses('hard', { item: 'collar', place: 2, threat: 12 }), true, 'something is coming for it');
});
