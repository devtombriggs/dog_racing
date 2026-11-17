import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemChoices, itemOdds, rollItem, ballPositionAt, forwardOf, stepFrisbee, frisbeeHits, BALL, FRISBEE } from '../shared/items.js';

test('item odds follow the race order: no bones or frisbees for the leader, no chew toys for last', () => {
  assert.deepEqual(itemChoices(1, 4), ['ball', 'toy']);
  assert.deepEqual(itemChoices(4, 4), ['ball', 'bone', 'frisbee']);
  assert.deepEqual(itemChoices(2, 4), ['ball', 'toy', 'bone', 'frisbee']);
  assert.deepEqual(itemChoices(1, 2), ['ball', 'toy']);
  assert.deepEqual(itemChoices(2, 2), ['ball', 'bone', 'frisbee']);
  assert.deepEqual(itemChoices(1, 1), ['ball', 'toy'], 'racing solo you are first: no speed boosts, nobody to chase');
  for (const r of [0, 0.3, 0.6, 0.9999]) {
    assert.ok(!['bone', 'frisbee'].includes(rollItem(1, 3, () => r)));
    assert.ok(!['bone', 'frisbee'].includes(rollItem(1, 1, () => r)));
    assert.notEqual(rollItem(3, 3, () => r), 'toy');
  }
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
  assert.ok(Math.abs(shares[0] - 0.4) < 0.01 && Math.abs(shares[3] - 0.7) < 0.01, '2nd 40 %, last 70 %');
  assert.ok(Math.abs(boneShare(2, 2) - 0.7) < 0.01, '2nd of two is last: 70 %');
  assert.ok(Math.abs(boneShare(2, 3) - 0.4) < 0.01);
  for (const [p, n] of [[1, 1], [1, 4], [2, 4], [4, 4], [3, 5]]) {
    const odds = itemOdds(p, n);
    assert.ok(Math.abs(odds.ball + odds.toy + odds.bone + odds.frisbee - 1) < 1e-9);
  }
});
