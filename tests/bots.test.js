import assert from 'node:assert/strict';
import { test } from 'node:test';
import { botRoute, createBot } from '../server/bots.js';
import { DRIFT } from '../shared/drift.js';
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
    // (on Neon Nexus some are on the second road, out to the side of the main one)
    for (const pickup of [...route.boxes, ...route.bones]) assert.ok(Math.abs(pickup.lateral) < route.pointAt(pickup.s).halfWidth || route.branchAt?.(pickup.s), mapId);
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

test('a computer dog runs at its own dog\'s speed, never faster but in a skid and the boost out of one, and stays on the road', () => {
  for (const mapId of ['farmyard', 'modbury_heights', 'wendover']) {
    for (const dog of ['second_dog', 'pablo']) {       // (not Ralph: on Wendover he leaves the road for his burrows)
      const bot = run({
        mapId, dog, level: 'hard', seconds: 60,
        watch: (move, state, route) => {
          assert.ok(Math.abs(state.lateral) <= route.pointAt(state.s).halfWidth, `${mapId}: ${dog} is off the road at ${state.s}`);
          // (1.08: the most a downhill gives; in a skid, the most a skid gives, and out of one, the skid's boost on top of it: shared/drift.js)
          const skid = state.skid ? DRIFT.speed + DRIFT.speedGain : 1;
          assert.ok(state.speed <= bot_top(dog) * 1.09 * (state.boosting ? DRIFT.boostSpeed : skid), `${mapId}: ${dog} at ${state.speed} m/s`);
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
  assert.ok(poppy > 0 && meela > poppy * 1.15, `Poppy ${poppy} ticks, Meela ${meela}`);      // (Poppy keeps 90 %, Meela 60 %: shared/dogStats.js swimSpeed)
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

test('a computer Enzo bounces in his Belly Bounce: up and down off the road, a burst of speed on each bounce, and down again when it ends', async () => {
  const { SPECIALS } = await import('../shared/specials.js');
  const spec = SPECIALS.enzo, route = botRoute('speed_bowl'), start = route.pointAt(40);
  const bot = createBot({ mapId: 'speed_bowl', dog: 'enzo', level: 'hard', seed: 7 });
  bot.place([start.x, start.y, start.z], start.heading);
  const height = move => move.position[1] - route.pointAt(bot.state.s).y;
  for (let t = 0; t < 6; t += TICK) assert.ok(Math.abs(height(bot.step(TICK, {}))) < 0.2, 'on the road before it');
  const plain = bot.speed;
  bot.specialStarted();
  const heights = [], speeds = [];
  for (let t = 0; t < spec.bounce.seconds * 3; t += TICK) { heights.push(height(bot.step(TICK, { special: spec }))); speeds.push(bot.speed); }
  assert.ok(Math.max(...heights) > spec.bounce.height * 0.9, `up to the top of the bounce (${Math.max(...heights).toFixed(2)} m)`);
  assert.ok(Math.min(...heights) < 0.35, 'and down on to the road again');
  assert.ok(heights.filter((h, i) => i > 0 && h < 0.5 && heights[i - 1] >= 0.5).length >= 2, 'more than once');
  assert.ok(Math.max(...speeds) > plain * spec.speed, `faster than the special's flat speed on the bursts (${Math.max(...speeds).toFixed(1)} against ${(plain * spec.speed).toFixed(1)})`);
  // it ends: he comes down and stays down
  const after = []; for (let t = 0; t < 2; t += TICK) after.push(height(bot.step(TICK, {})));
  assert.ok(Math.abs(after.at(-1)) < 0.2 && Math.max(...after.slice(-10)) < 0.2, 'back on the road');
});

test('computer dogs drift: at some bends, not for long, into the turn, with a boost when it comes off and none when it hits the wall', async () => {
  const { BOT_LEVELS } = await import('../shared/botLevels.js');
  const { DRIFT_PERKS } = await import('../shared/drift.js');
  const { WALL } = await import('../shared/handling.js');
  for (const id of ['easy', 'medium', 'hard']) {
    const d = BOT_LEVELS[id].drift;
    assert.ok(d.chance > 0 && d.chance < 1 && d.seconds > 0.5 && d.seconds < 2 && d.wall > 0 && d.wall < 0.3, id);
  }
  assert.ok(BOT_LEVELS.easy.drift.chance < BOT_LEVELS.medium.drift.chance && BOT_LEVELS.medium.drift.chance < BOT_LEVELS.hard.drift.chance, 'a better dog drifts more often');
  assert.ok(BOT_LEVELS.easy.drift.wall > BOT_LEVELS.medium.drift.wall && BOT_LEVELS.medium.drift.wall > BOT_LEVELS.hard.drift.wall, '...and gets it wrong less');

  // round the kart oval for two minutes: what each level does with its bends
  const watch = (dog, level, seed) => {
    const route = botRoute('speed_bowl'), start = route.pointAt(0), bot = createBot({ mapId: 'speed_bowl', dog, level, seed });
    bot.place([start.x, start.y, start.z], start.heading);
    const seen = { skids: 0, longest: 0, boosts: 0, walls: 0, tiers: new Set(), wrongWay: 0, rightWay: 0, fastest: 0, reported: 0 };
    let was = null, since = 0, yaw = null, wasBoosting = false, wasWide = false;
    for (let t = 0; t < 120; t += TICK) {
      const move = bot.step(TICK, {}), { skid, boosting, wide } = bot.state;
      if (skid && !was) { seen.skids += 1; since = t; }
      if (skid) {
        seen.longest = Math.max(seen.longest, t - since); seen.tiers.add(skid.tier);
        assert.deepEqual(move.drift, { side: skid.side, tier: skid.tier }, 'what it tells the players\' games');
        assert.equal(move.animation, 'Sprint');
        seen.reported += 1;
        // it turns the way it is skidding (rotation grows turning left)
        if (yaw != null && Math.abs(route.pointAt(bot.state.s).curvature) > 0.02) { const turn = Math.atan2(Math.sin(move.rotation - yaw), Math.cos(move.rotation - yaw)); if (turn * skid.side < -1e-4) seen.wrongWay += 1; else if (turn * skid.side > 1e-4) seen.rightWay += 1; }
      } else assert.equal(move.drift, null);
      if (boosting && !wasBoosting) seen.boosts += 1;
      if (wide && !wasWide) { seen.walls += 1; assert.ok(bot.speed <= bot.sprintSpeed * WALL.scrape + 1e-6, 'slowed by the wall'); assert.equal(boosting, false, 'and no boost for it'); }
      seen.fastest = Math.max(seen.fastest, bot.speed / bot.sprintSpeed);
      was = skid; wasBoosting = boosting; wasWide = wide; yaw = move.rotation;
    }
    return seen;
  };
  const total = level => [1, 2, 3, 4, 5, 6].map(seed => watch('gsp', level, seed)).reduce((a, b) => ({
    skids: a.skids + b.skids, longest: Math.max(a.longest, b.longest), boosts: a.boosts + b.boosts, walls: a.walls + b.walls, wrongWay: a.wrongWay + b.wrongWay, rightWay: a.rightWay + b.rightWay,
    tiers: new Set([...a.tiers, ...b.tiers]), fastest: Math.max(a.fastest, b.fastest),
  }));
  const easy = total('easy'), hard = total('hard');
  for (const [id, seen] of [['easy', easy], ['hard', hard]]) {
    assert.ok(seen.skids > 3, `${id}: it does drift (${seen.skids})`);
    assert.ok(seen.longest <= BOT_LEVELS[id].drift.seconds + 0.11, `${id}: never for long (${seen.longest.toFixed(2)} s)`);
    // (now and then it is moving across the road the other way for a step: the skid is still the bend's way)
    assert.ok(seen.rightWay > 3 * seen.wrongWay, `${id}: into the bend (${seen.rightWay} steps to ${seen.wrongWay})`);
    assert.ok(!seen.tiers.has(3), `${id}: never as far as purple sparks`);
    assert.ok(seen.boosts + seen.walls <= seen.skids, id);
  }
  assert.ok(hard.skids > easy.skids, `a hard dog drifts more (${hard.skids} to ${easy.skids})`);
  assert.ok(hard.boosts > 0, 'and gets boosts from it');
  assert.ok(easy.walls + hard.walls > 0, 'some of them hit the wall');
  // Ralph gets a bone's boost from his, as a player's Ralph does
  const ralph = [1, 2, 3].map(seed => watch('ralph', 'hard', seed));
  assert.ok(ralph.some(r => r.boosts > 0 && r.fastest > 1.2), `Ralph: ${ralph.map(r => r.fastest.toFixed(2))}`);
  assert.ok(ralph.every(r => r.fastest <= 1.31), `never more than a bone gives: ${ralph.map(r => r.fastest.toFixed(2))}`);
  assert.ok(DRIFT_PERKS.ralph);
});

test('in a special a dog can still jump (Tom, 2026-11-21: it could not get over anything), but for Ralph flying and Enzo bouncing', async () => {
  const { SPECIALS, jumpsInSpecial } = await import('../shared/specials.js');
  assert.ok(jumpsInSpecial(null));
  for (const [dog, spec] of Object.entries(SPECIALS)) assert.equal(jumpsInSpecial(spec), !['ralph', 'enzo'].includes(dog), dog);
  // a computer dog in one jumps what lies across the road, as it does out of one
  const route = botRoute('wendover'), log = route.jumps.find(jump => jump.must) ?? route.jumps[0];
  for (const dog of ['casper', 'pablo', 'black_lab', 'baz_naz', 'second_dog', 'jimmy']) {
    let jumped = false;
    run({ mapId: 'wendover', dog, level: 'hard', from: log.s0 - 40, seconds: 6, world: { special: SPECIALS[dog] },
      watch: (move, state) => { if (state.jumping && Math.abs(route.ahead(state.s, (log.s0 + log.s1) / 2)) < 6) jumped = true; } });
    assert.ok(jumped, `${dog} jumps it in its special`);
  }
});
