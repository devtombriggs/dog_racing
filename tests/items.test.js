import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemChoices, itemOdds, rollItem, ballPositionAt, forwardOf, stepFrisbee, frisbeeHits, BALL, FRISBEE } from '../shared/items.js';

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
  assert.ok(Math.abs(fireworks[0] - 0.04) < 1e-9 && Math.abs(fireworks[3] - 0.12) < 1e-9, '4 % in 2nd, 12 % in last');
  assert.ok(Math.abs(itemOdds(2, 2).firework - 0.12) < 1e-9, '2nd of two is last');
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
  assert.deepEqual(Object.keys(SPECIALS).sort(), ['black_lab', 'gsp', 'kombu', 'pablo', 'ralph', 'second_dog'], 'every dog has one');
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
