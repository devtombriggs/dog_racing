import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemChoices, itemOdds, rollItem, ballPositionAt, ballRoute, ballSeconds, ballBouncesAt, ballHeadingAt, forwardOf, stepFrisbee, frisbeeHits, BALL, FRISBEE } from '../shared/items.js';
import { PROCEDURAL_TRACKS } from '../shared/maps.js';

test('item odds follow the race order: only balls and chew toys for the leader, no chew toys for last', () => {
  assert.deepEqual(itemChoices(1, 4), ['ball', 'toy']);
  assert.deepEqual(itemChoices(4, 4), ['ball', 'bone', 'frisbee', 'firework', 'collar']);
  assert.deepEqual(itemChoices(2, 4), ['ball', 'toy', 'bone', 'frisbee', 'firework', 'collar']);
  assert.deepEqual(itemChoices(1, 2), ['ball', 'toy']);
  assert.deepEqual(itemChoices(2, 2), ['ball', 'bone', 'frisbee', 'firework', 'collar']);
  assert.deepEqual(itemChoices(1, 1), ['ball', 'toy'], 'racing solo you are first: no speed boosts, nobody to chase');
  for (const r of [0, 0.3, 0.6, 0.9999]) {
    assert.ok(['ball', 'toy'].includes(rollItem(1, 3, () => r)));
    assert.ok(['ball', 'toy'].includes(rollItem(1, 1, () => r)));
    assert.notEqual(rollItem(3, 3, () => r), 'toy');
  }
});

test('fireworks and golden collars: never for the leader; a firework is likelier the further back', () => {
  for (const racers of [1, 2, 3, 5]) {
    const odds = itemOdds(1, racers);
    assert.equal(odds.firework, 0); assert.equal(odds.collar, 0);
  }
  const fireworks = [2, 3, 4, 5].map(p => itemOdds(p, 5).firework);
  assert.ok(fireworks.every((f, i) => i === 0 || f > fireworks[i - 1]), `rising with place: ${fireworks}`);
  assert.ok(Math.abs(fireworks[0] - 0.02) < 1e-9 && Math.abs(fireworks[3] - 0.06) < 1e-9, '2 % in 2nd, 6 % in last');
  assert.ok(Math.abs(itemOdds(2, 2).firework - 0.06) < 1e-9, '2nd of two is last');
  // while a firework is not allowed (FIREWORK_LIMIT), a box never gives one and still gives something
  for (let i = 0; i < 200; i++) {
    const item = rollItem(5, 5, () => i / 200, { noFirework: true });
    assert.ok(item && item !== 'firework', item);
  }
  for (const p of [2, 3, 5]) assert.ok(Math.abs(itemOdds(p, 5).collar - 0.1) < 1e-9, 'a collar is 10 % for everyone behind the leader');
});

test('a firework follows the road, then goes straight for the leader and arrives', async () => {
  const { fireworkRoute, stepFirework, fireworkPasses, inFireworkBlast } = await import('../shared/firework.js');
  const { FIREWORK } = await import('../shared/items.js');
  for (const mapId of ['wendover', 'frostpeak', 'treat_road', 'modbury_heights', 'farmyard']) {
    const route = fireworkRoute(mapId);
    const at = (s, lateral = 0) => { const p = route.pointAt(s); return [p.x - Math.cos(p.rotationY) * lateral, p.y, p.z + Math.sin(p.rotationY) * lateral]; };
    assert.ok(Math.abs(route.sAt(at(300)) - 300) <= 2, `${mapId}: a dog on the road is found where it is`);
    // lit at 100 m, the leader 400 m further on and 4 m off the middle of the road
    const leader = at(500, 4), start = route.pointAt(100);
    let f = { s: 100, position: [start.x, start.y + FIREWORK.height, start.z], yaw: start.rotationY, homing: false }, steps = 0, offRoad = 0;
    while (!f.arrived && steps < 400) {
      f = stepFirework(f, route, leader, 0.05); steps++;
      if (!f.homing) { const p = route.pointAt(f.s); offRoad = Math.max(offRoad, Math.hypot(p.x - f.position[0], p.z - f.position[2])); }
    }
    assert.ok(f.arrived, `${mapId}: it reaches the leader`);
    assert.ok(offRoad < 1e-6, `${mapId}: until it homes it is on the middle of the road`);
    assert.ok(Math.abs(steps * 0.05 * FIREWORK.speed - 400) < 30, `${mapId}: about 400 m of flight (${steps} steps)`);
    assert.ok(inFireworkBlast(f.position, leader));
    // with nobody to chase it just flies on up the road
    const on = stepFirework({ s: 100, position: [start.x, start.y + FIREWORK.height, start.z], yaw: 0, homing: false }, route, null, 0.05);
    assert.ok(!on.arrived && Math.abs(on.s - (100 + FIREWORK.speed * 0.05)) < 1e-9);
  }
  // passing: within FIREWORK.radius of its path, at about its height
  assert.ok(fireworkPasses([0, 1.4, 0], [0, 1.4, 3], [1, 0, 1.5]));
  assert.ok(!fireworkPasses([0, 1.4, 0], [0, 1.4, 3], [4, 0, 1.5]), 'a dog at the side of the road is missed');
  assert.ok(!fireworkPasses([0, 1.4, 0], [0, 1.4, 3], [1, 8, 1.5]), 'a dog on a bridge overhead is missed');
  assert.ok(!inFireworkBlast([0, 1.4, 0], [FIREWORK.blastRadius + 1, 0, 0]));
});

test('a red frisbee turns towards its target (at most turnRate) and knocks over a dog it reaches', () => {
  const f = { position: [0, 1, 0], yaw: 0 };                 // flying +Z
  const target = [50, 0, 0];                                 // off to the +X side
  const next = stepFrisbee(f, target, 0.05);
  assert.ok(next.yaw > 0 && next.yaw <= FRISBEE.turnRate * 0.05 + 1e-9, 'turns towards it, no faster than turnRate');
  assert.ok(Math.abs(Math.hypot(next.position[0], next.position[2]) - FRISBEE.speed * 0.05) < 1e-9);
  let g = f, closest = Infinity;
  for (let i = 0; i < 80; i++) { g = stepFrisbee(g, target, 0.05); closest = Math.min(closest, Math.hypot(g.position[0] - 50, g.position[2])); }
  assert.ok(closest < FRISBEE.radius, `it reaches the target (closest ${closest.toFixed(2)} m)`);
  assert.equal(stepFrisbee(f, null, 0.1).yaw, 0, 'no target: straight on');
  assert.ok(frisbeeHits([10, 1, 10], [10.5, 0, 10]));
  assert.ok(!frisbeeHits([10, 1, 10], [13, 0, 10]));
});

test('a red frisbee thrown at a dog close alongside goes straight to it, not out wide and round again', () => {
  // the dog it is after is 6 m to the side and a little behind where it starts: inside the 10 m circle it turns in
  for (const target of [[6, 0, -1], [-7, 0, 3], [3, 0, -8], [9, 0, 0]]) {
    let f = { position: [0, 1, 2.5], yaw: 0 }, farthest = 0, reached = null;
    for (let i = 0; i < 40 && reached === null; i++) {
      f = stepFrisbee(f, target, 0.05);
      farthest = Math.max(farthest, Math.hypot(f.position[0], f.position[2]));
      if (frisbeeHits(f.position, target)) reached = (i + 1) * 0.05;
    }
    assert.ok(reached !== null && reached <= 0.8, `reaches a dog at ${target} in ${reached} s`);
    assert.ok(farthest < Math.hypot(target[0], target[2]) + 6, `stays close on the way to ${target} (${farthest.toFixed(1)} m out)`);
  }
});

test('a thrown ball flies straight ahead and stops at the end of its range', () => {
  const ball = { origin: [0, 1, 0], direction: forwardOf(Math.PI / 2) };   // facing +X
  const p = ballPositionAt(ball, 1);
  assert.ok(Math.abs(p[0] - BALL.speed) < 1e-9 && Math.abs(p[2]) < 1e-9);
  assert.deepEqual(ballPositionAt(ball, 99), ballPositionAt(ball, BALL.duration));
});

test('a ball on a slope skims the ground the way the dog faces; elsewhere it flies level', () => {
  const ball = { origin: [0, 101.3, 0], direction: [0, 0, 1] };
  const slope = (x, z) => 100 - 0.45 * z;            // a 45 % black run falling away ahead
  // level flight ignores the ground
  assert.deepEqual(ballPositionAt(ball, 1, slope), [0, 101.3, BALL.speed]);
  // a ground ball stays BALL.height above the slope, all the way down
  const skimming = { ...ball, ground: true };
  for (const t of [0, 0.5, 1, 2]) {
    const [x, y, z] = ballPositionAt(skimming, t, slope);
    assert.ok(Math.abs(y - (slope(x, z) + BALL.height)) < 1e-9);
    assert.ok(Math.abs(z - BALL.speed * t) < 1e-9 && x === 0, 'straight ahead');
  }
  // no ground available (or off the heightmap): falls back to level flight
  assert.equal(ballPositionAt(skimming, 1)[1], 101.3);
  assert.equal(ballPositionAt(skimming, 1, () => NaN)[1], 101.3);
});

test('the further back you are, the more likely a box gives a golden bone', () => {
  const boneShare = (place, racers) => {
    let bones = 0;
    for (let i = 0; i < 1000; i++) if (rollItem(place, racers, () => (i + 0.5) / 1000) === 'bone') bones++;
    return bones / 1000;
  };
  assert.equal(boneShare(1, 5), 0, 'leader: never');
  const shares = [2, 3, 4, 5].map(p => boneShare(p, 5));
  assert.ok(shares.every((s, i) => i === 0 || s > shares[i - 1]), `rising with place: ${shares}`);
  // of the boxes that do not give a firework or a collar: 40 % bones in 2nd, 70 % in last
  const ordinary = (place, racers) => 1 - itemOdds(place, racers).firework - itemOdds(place, racers).collar;
  assert.ok(Math.abs(shares[0] - 0.4 * ordinary(2, 5)) < 0.01 && Math.abs(shares[3] - 0.7 * ordinary(5, 5)) < 0.01, '2nd 40 %, last 70 %');
  assert.ok(Math.abs(boneShare(2, 2) - 0.7 * ordinary(2, 2)) < 0.01, '2nd of two is last: 70 %');
  assert.ok(Math.abs(boneShare(2, 3) - 0.4 * ordinary(2, 3)) < 0.01);
  for (const [p, n] of [[1, 1], [1, 4], [2, 4], [4, 4], [3, 5]]) {
    const odds = itemOdds(p, n);
    assert.ok(Math.abs(Object.values(odds).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
});

test('specials: never for the leader, more likely the further back, and a ramming special reaches ahead', async () => {
  const { specialChance, specialTouches, pheasantFlightMs, SPECIALS, PHEASANT } = await import('../shared/specials.js');
  assert.equal(specialChance(1, 5), 0, 'first place never gets it');
  assert.equal(specialChance(1, 1), 0, 'racing solo you are first');
  const chances = [2, 3, 4, 5].map(p => specialChance(p, 5));
  assert.ok(chances.every((c, i) => i === 0 || c > chances[i - 1]), `rising with place: ${chances}`);
  assert.ok(Math.abs(chances[0] - 0.1) < 1e-9 && Math.abs(chances[3] - 0.3) < 1e-9, '2nd 10 %, last 30 %');
  assert.ok(Math.abs(specialChance(2, 2) - 0.3) < 1e-9, '2nd of two is last');
  assert.deepEqual(Object.keys(SPECIALS).sort(), ['baz_naz', 'black_lab', 'casper', 'enzo', 'gsp', 'jazz', 'jimmy', 'kombu', 'pablo', 'ralph', 'rocky', 'second_dog'], 'every dog has one');
  // Pablo's team runs ahead of him: a dog 7 m in front is hit, one 7 m behind or beside is not
  const sled = SPECIALS.pablo;
  assert.ok(specialTouches(sled, [0, 0, 0], 0, [0, 0, 7]));
  assert.ok(!specialTouches(sled, [0, 0, 0], 0, [0, 0, -7]));
  assert.ok(!specialTouches(sled, [0, 0, 0], 0, [7, 0, 0]));
  assert.ok(specialTouches(sled, [0, 0, 0], Math.PI / 2, [7, 0, 0]), 'it reaches the way he faces');
  assert.ok(!specialTouches(sled, [0, 0, 0], 0, [0, 5, 3]), 'not a dog well above it');
  assert.ok(!specialTouches(SPECIALS.ralph, [0, 0, 0], 0, [0, 0, 0.5]), 'Ralph flies over: he hits nobody');
  assert.equal(pheasantFlightMs(0), PHEASANT.minFlightMs);
  assert.equal(pheasantFlightMs(1e6), PHEASANT.maxFlightMs);
  assert.ok(pheasantFlightMs(60) > pheasantFlightMs(20));
});

test('Baz and Naz\'s Trip Wire: six seconds, faster, a rope right across the road that trips any dog it reaches unless it is jumped, and through whatever stands in the way', async () => {
  const { SPECIALS, specialTouches, ropeTrips, ghostsThrough } = await import('../shared/specials.js');
  const { DOG_STATS } = await import('../shared/dogStats.js');
  const spec = SPECIALS.baz_naz;
  assert.equal(spec.kind, 'rope');
  assert.equal(spec.durationMs, 6000);
  assert.ok(spec.speed > 1.2 && spec.speed < SPECIALS.pablo.speed);
  // on the road: a dog at the same place round the lap is caught wherever it is across the road; one further on or back is not
  const L = 1500, twins = { s: 400, y: 2 };
  assert.ok(ropeTrips(spec, twins, { s: 400.8, y: 2 }, L));
  assert.ok(ropeTrips(spec, twins, { s: 399.2, y: 2 }, L));
  assert.ok(!ropeTrips(spec, twins, { s: 404, y: 2 }, L));
  assert.ok(!ropeTrips(spec, twins, { s: 400, y: 2 + spec.rope.clear + 0.2 }, L), 'a dog in the air has jumped it');
  assert.ok(!ropeTrips(spec, twins, { s: 400, y: -8 }, L), 'nor a dog on the floor below');
  assert.ok(ropeTrips(spec, { s: 0.5, y: 0 }, { s: L - 0.5, y: 0 }, L), 'across the start line');
  assert.ok(!ropeTrips(SPECIALS.pablo, twins, { s: 400, y: 2 }, L));
  // off the road's own terms (chew toys): straight out to both sides of them
  assert.ok(specialTouches(spec, [0, 0, 0], 0, [9, 0, 0.5]) && specialTouches(spec, [0, 0, 0], 0, [-9, 0, -0.5]));
  assert.ok(!specialTouches(spec, [0, 0, 0], 0, [9, 0, 4]) && !specialTouches(spec, [0, 0, 0], 0, [0, 1.5, 0]));
  assert.ok(specialTouches(spec, [0, 0, 0], Math.PI / 2, [0.5, 0, 9]), 'it turns with them');
  // through a thing standing on the road, but not through the road's edge; and only in this special
  assert.ok(ghostsThrough(spec, { blocked: true, lateral: 2, halfWidth: 8 }));
  assert.ok(!ghostsThrough(spec, { blocked: true, lateral: 7.6, halfWidth: 8 }));
  assert.ok(!ghostsThrough(spec, { blocked: false, lateral: 2, halfWidth: 8 }));
  assert.ok(!ghostsThrough(SPECIALS.pablo, { blocked: true, lateral: 2, halfWidth: 8 }) && !ghostsThrough(null, { blocked: true, lateral: 2, halfWidth: 8 }));
  // (and Jazz is Pablo and a shade better)
  for (const key of ['speed', 'acceleration', 'agility', 'swimming']) assert.ok(DOG_STATS.jazz[key] >= DOG_STATS.pablo[key] && DOG_STATS.jazz[key] <= DOG_STATS.pablo[key] + 0.5, key);
  assert.ok(DOG_STATS.jazz.speed > DOG_STATS.pablo.speed);
  // just under Pablo all round
  for (const key of ['speed', 'acceleration', 'agility', 'swimming']) assert.ok(DOG_STATS.baz_naz[key] <= DOG_STATS.pablo[key] && DOG_STATS.baz_naz[key] >= DOG_STATS.pablo[key] - 0.5, key);
  // (Tom's buff, 2026-11-19: Pablo's speed and swimming, still under him on acceleration and agility)
  assert.ok(DOG_STATS.baz_naz.acceleration < DOG_STATS.pablo.acceleration && DOG_STATS.baz_naz.agility < DOG_STATS.pablo.agility);
});

test('Enzo\'s Belly Bounce: up and down every bounce with a burst of speed at the start of each; he squashes a dog only when he is down on it', async () => {
  const { SPECIALS, bellyBounce, specialTouches } = await import('../shared/specials.js');
  const spec = SPECIALS.enzo, b = spec.bounce;
  assert.equal(spec.durationMs, 10000);
  assert.equal(bellyBounce(spec, 0).height, 0);
  assert.ok(Math.abs(bellyBounce(spec, b.seconds / 2).height - b.height) < 1e-9, 'top of the bounce');
  assert.ok(bellyBounce(spec, b.seconds * 3.5).height > b.height * 0.99, 'and of every one after');
  assert.ok(bellyBounce(spec, 0.01).speed > bellyBounce(spec, b.seconds * 0.9).speed, 'the burst fades through the bounce');
  assert.ok(bellyBounce(spec, b.seconds * 0.99).speed >= spec.speed, 'never slower than the special itself');
  // a dog under him: safe while he is up in the air, squashed when he comes down
  assert.equal(specialTouches(spec, [0, 2.2, 0], 0, [0.5, 0, 0.5]), false);
  assert.equal(specialTouches(spec, [0, 0.3, 0], 0, [0.5, 0, 0.5]), true);
  assert.equal(specialTouches(spec, [0, 0.3, 0], 0, [6, 0, 0]), false, 'not one well off to the side');
});

test('Ralph\'s Rocket Paws last fifteen seconds from last place and a second and a half less for every place nearer the front; no other special changes', async () => {
  const { SPECIALS, specialDurationMs } = await import('../shared/specials.js');
  const ralph = SPECIALS.ralph;
  assert.deepEqual([6, 5, 4, 3, 2].map(place => specialDurationMs(ralph, place, 6)), [15000, 13500, 12000, 10500, 9000]);
  assert.equal(specialDurationMs(ralph, 2, 2), 15000, 'last of two is last');
  assert.equal(specialDurationMs(ralph, 3, 4), 13500, 'one place off last, in any size of race');
  assert.ok(specialDurationMs(ralph, 1, 6) >= 3000);
  for (const [dog, spec] of Object.entries(SPECIALS)) if (dog !== 'ralph' && dog !== 'jimmy') assert.equal(specialDurationMs(spec, 2, 6), spec.durationMs, dog);
});

test('Casper: Pablo and a little less; his Try Time is a six-second charge that knocks dogs over, and ends in a pass', async () => {
  const { SPECIALS, specialTouches, ghostsThrough, specialDurationMs } = await import('../shared/specials.js');
  const { DOG_STATS } = await import('../shared/dogStats.js');
  for (const key of ['speed', 'acceleration', 'agility', 'swimming', 'drift']) assert.ok(DOG_STATS.casper[key] <= DOG_STATS.pablo[key] && DOG_STATS.casper[key] >= DOG_STATS.pablo[key] - 0.5, key);
  assert.ok(['acceleration', 'agility', 'swimming'].every(key => DOG_STATS.casper[key] < DOG_STATS.pablo[key]), 'not as strong');
  const charge = SPECIALS.casper;
  assert.deepEqual([charge.kind, charge.durationMs, charge.pass], ['rugby', 6000, true]);
  assert.equal(specialDurationMs(charge, 2, 6), 6000, 'the same from any place');
  assert.ok(charge.speed > 1.3 && charge.speed < SPECIALS.pablo.speed && charge.durationMs < SPECIALS.pablo.durationMs, 'flat out, but shorter and slower than Pablo on his sled');
  assert.ok(!charge.steerLocked && !charge.flyHeight && !charge.unseen, 'he steers it himself, on the ground, in plain sight');
  // he knocks over a dog in front of him or beside him, not one well ahead, behind or off to the side
  assert.ok(specialTouches(charge, [0, 0, 0], 0, [0.5, 0, 3]) && specialTouches(charge, [0, 0, 0], 0, [1.5, 0, 0]));
  assert.ok(!specialTouches(charge, [0, 0, 0], 0, [0, 0, 5]) && !specialTouches(charge, [0, 0, 0], 0, [0, 0, -3]) && !specialTouches(charge, [0, 0, 0], 0, [4, 0, 1]));
  assert.ok(!ghostsThrough(charge, { blocked: true, lateral: 2, halfWidth: 8 }), 'what stands on the road still stops him');
});

test('Jimmy: under Ralph all round, Meela\'s speed downhill; his Dragon Dance scales with his place like Ralph\'s rocket paws', async () => {
  const { SPECIALS, KELP, specialDurationMs, dragonFireworks } = await import('../shared/specials.js');
  const { DOG_STATS, downhillSpeed, DOWNHILL, statScale, STAT_EFFECT, BASE_SPEED } = await import('../shared/dogStats.js');
  const { jimmy, ralph, second_dog: meela } = DOG_STATS;
  for (const key of ['speed', 'acceleration', 'agility', 'swimming']) assert.ok(jimmy[key] <= ralph[key], key);
  assert.ok(jimmy.speed < ralph.speed && jimmy.acceleration < ralph.acceleration && jimmy.agility < ralph.agility, 'worse than Ralph');
  assert.ok(Object.values(DOG_STATS).every(dog => dog.speed >= jimmy.speed), 'the slowest dog');
  // downhill: nothing on the level or a climb, all of Meela's speed once the road drops enough, part of it in between
  assert.equal(jimmy.downhill, meela.speed);
  assert.equal(downhillSpeed(jimmy, 0), 1); assert.equal(downhillSpeed(jimmy, 0.2), 1); assert.equal(downhillSpeed(jimmy, -DOWNHILL.from), 1);
  const top = dog => BASE_SPEED.sprint * statScale(dog.speed, STAT_EFFECT.speed);
  assert.ok(Math.abs(top(jimmy) * downhillSpeed(jimmy, -DOWNHILL.full) - top(meela) * DOWNHILL.boost) < 1e-9 && Math.abs(top(jimmy) * downhillSpeed(jimmy, -0.4) - top(meela) * DOWNHILL.boost) < 1e-9, 'Meela\'s top speed with a boost on top, and no more however steep');
  assert.ok(DOWNHILL.boost > 1 && DOWNHILL.boost <= 1.2);
  const part = downhillSpeed(jimmy, -(DOWNHILL.from + DOWNHILL.full) / 2);
  assert.ok(part > 1 && part < downhillSpeed(jimmy, -DOWNHILL.full));
  for (const [id, dog] of Object.entries(DOG_STATS)) if (id !== 'jimmy') assert.equal(downhillSpeed(dog, -0.3), 1, `${id} has no such thing`);
  // the dragon: seven seconds from last and a second less for each place nearer the front; two fireworks from the back half, one from the front
  const dragon = SPECIALS.jimmy;
  assert.equal(dragon.kind, 'dragon');
  assert.deepEqual([6, 5, 4, 3, 2].map(place => specialDurationMs(dragon, place, 6)), [7000, 6000, 5000, 4000, 3000]);
  assert.deepEqual([6, 5, 4, 3, 2, 1].map(place => dragonFireworks(dragon, place, 6)), [2, 2, 2, 1, 1, 1]);
  assert.deepEqual([specialDurationMs(dragon, 2, 2), dragonFireworks(dragon, 2, 2)], [7000, 2], 'last of two is last');
  assert.equal(dragon.fireworks.everyMs, 2000);
  assert.equal(dragonFireworks(SPECIALS.ralph, 6, 6), 0);
  // ...and from last place it carries him a bit further than Poppy's wave carries her
  const metres = top(jimmy) * dragon.speed * dragon.durationMs / 1000;
  assert.ok(metres > KELP.distance && metres < KELP.distance * 1.25, `${metres} m against Poppy's ${KELP.distance}`);
});

test('a tennis ball bounces off walls three times and pops on the fourth (Tom, 2026-11-23)', () => {
  // a corridor 10 m wide (walls at x = -5 and 5), thrown across it at an angle
  const corridor = (x, z) => ({ blocked: Math.abs(x) > 5, clampX: Math.max(-5, Math.min(5, x)), clampZ: z, index: -1 });
  const dir = [Math.sin(0.5), 0, Math.cos(0.5)];
  const route = ballRoute([0, 1.3, 0], dir, corridor);
  assert.equal(route.legs.length, 1 + BALL.bounces, 'three bounces');
  assert.ok(route.popped && route.length < BALL.duration * BALL.speed, 'gone at the fourth wall, before its time is up');
  const ball = { origin: [0, 1.3, 0], direction: dir, ...route };
  for (let t = 0; t <= ballSeconds(ball); t += 0.01) {
    const [x, , z] = ballPositionAt(ball, t);
    assert.ok(Math.abs(x) <= 5.5, `inside the walls at ${t.toFixed(2)} s (x ${x.toFixed(2)})`);
    assert.ok(z >= -1e-9, 'always on up the corridor');
  }
  // off each wall like a mirror: across flips, along stays
  for (let i = 1; i < route.legs.length; i++) {
    const [, , dx, dz] = route.legs[i], [, , px, pz] = route.legs[i - 1];
    assert.ok(Math.abs(dx + px) < 0.02 && Math.abs(dz - pz) < 0.02, `bounce ${i}`);
  }
  assert.equal(ballBouncesAt(ball, 0), 0);
  assert.equal(ballBouncesAt(ball, ballSeconds(ball)), BALL.bounces);
  assert.ok(ballHeadingAt(ball, 0)[0] > 0 && ballHeadingAt(ball, route.legs[1][4] / BALL.speed + 0.01)[0] < 0, 'heading back the other way after the first');
  // no walls: straight on for its whole time, as before
  const open = ballRoute([0, 1.3, 0], dir, () => ({ blocked: false }));
  assert.deepEqual([open.legs.length, open.popped, open.length], [1, false, BALL.duration * BALL.speed]);
  assert.deepEqual(ballRoute([0, 1.3, 0], dir).legs.length, 1, 'a map with no wall data: straight');
});

test('a tennis ball thrown at the Speed Bowl\'s barrier bounces back on to the road', () => {
  const track = PROCEDURAL_TRACKS.speed_bowl, p = track.pointAt(40);
  const left = [Math.cos(p.rotationY), 0, -Math.sin(p.rotationY)], ahead = [Math.sin(p.rotationY), 0, Math.cos(p.rotationY)];
  const dir = [left[0] * 0.7 + ahead[0] * 0.7, 0, left[2] * 0.7 + ahead[2] * 0.7];     // across the road at 45 degrees
  const origin = [p.x, p.y + BALL.height, p.z];
  const route = ballRoute(origin, dir, (x, z, hint, y) => track.query(x, z, hint, y));
  assert.ok(route.legs.length >= 2, `it bounced (${route.legs.length - 1} times)`);
  const ball = { origin, direction: dir, ...route };
  for (let t = 0; t <= ballSeconds(ball); t += 0.02) {
    const [x, , z] = ballPositionAt(ball, t), q = track.query(x, z);
    assert.ok(Math.abs(q.lateral) <= q.halfWidth + 3, `still by the road at ${t.toFixed(2)} s`);
  }
});

test('a tennis ball skims the road, up and down with it, and on the level it was thrown on (Tom, 2026-11-23)', () => {
  const neon = PROCEDURAL_TRACKS.neon_nexus, query = (x, z, hint, y) => neon.query(x, z, hint, y);
  neon.setClock(3);
  const throwAt = (track, s, up = 0, below = 0) => {
    const p = track.pointAt(s), dir = [Math.sin(p.rotationY), 0, Math.cos(p.rotationY)];
    const origin = [p.x + dir[0] * BALL.launchAhead, p.y - below + up + BALL.height, p.z + dir[2] * BALL.launchAhead];
    return { origin, direction: dir, ...ballRoute(origin, dir, (x, z, hint, y) => track.query(x, z, hint, y)) };
  };
  // up the climb (the road rises 16 m): it stays BALL.height over the road all the way, not level with where it was thrown
  const climb = neon.platforms[0].sStart - 220, ball = throwAt(neon, climb);
  let rose = 0;
  for (let t = 0.05; t <= Math.min(2, ballSeconds(ball)); t += 0.05) {
    const p = ballPositionAt(ball, t), q = query(p[0], p[2], -1, p[1] - BALL.height);
    if (q.gap || q.level) continue;
    assert.ok(Math.abs(p[1] - BALL.height - q.y) < 0.6, `over the road at ${t.toFixed(2)} s (${(p[1] - q.y).toFixed(2)} m)`);
    rose = Math.max(rose, p[1] - ball.origin[1]);
  }
  assert.ok(rose > 1, `it climbed with the road (${rose.toFixed(1)} m)`);
  // thrown from the top of a jump, it comes down to the road in a moment
  const jumped = throwAt(neon, climb, 1.5);
  assert.ok(ballPositionAt(jumped, 0)[1] - ballPositionAt(ball, 0)[1] > 1.4, 'from the height it was thrown at');
  assert.ok(Math.abs(ballPositionAt(jumped, 0.4)[1] - ballPositionAt(ball, 0.4)[1]) < 0.01, 'down on the road by 0.4 s');
  // thrown down in the Undercity, it stays down there, under the platforms
  const u = neon.undercity[0], under = throwAt(neon, u.sStart + 10, 0, u.depth);
  for (let t = 0; t <= Math.min(2.5, ballSeconds(under)); t += 0.1) {
    const p = ballPositionAt(under, t), top = neon.pointAt(neon.query(p[0], p[2]).s).y;
    if (neon.underAt(neon.query(p[0], p[2]).s)?.id !== u.id) break;
    assert.ok(p[1] < top - u.depth + 3, `still in the Undercity at ${t.toFixed(1)} s`);
  }
  // off the end of a road that drops (the jungle's tree stair): it dives down to the road below, not on out into the sky
  const jungle = PROCEDURAL_TRACKS.monkey_jungle, drop = jungle.drops[0];
  const off = throwAt(jungle, drop.s - 6), far = ballPositionAt(off, Math.min(ballSeconds(off), (6 + drop.height / BALL.fallPerMetre + 10) / BALL.speed));
  assert.ok(off.origin[1] - far[1] > drop.height * 0.8, `came down off the end (${(off.origin[1] - far[1]).toFixed(1)} of ${drop.height.toFixed(1)} m)`);
});
