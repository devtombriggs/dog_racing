import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemChoices, rollItem, ballPositionAt, forwardOf, BALL } from '../shared/items.js';

test('item odds follow the race order: no bones for the leader, no chew toys for last', () => {
  assert.deepEqual(itemChoices(1, 4), ['ball', 'toy']);
  assert.deepEqual(itemChoices(4, 4), ['ball', 'bone']);
  assert.deepEqual(itemChoices(2, 4), ['ball', 'toy', 'bone']);
  assert.deepEqual(itemChoices(1, 2), ['ball', 'toy']);
  assert.deepEqual(itemChoices(2, 2), ['ball', 'bone']);
  assert.deepEqual(itemChoices(1, 1), ['ball', 'toy'], 'racing solo you are first: no speed boosts');
  for (const r of [0, 0.3, 0.6, 0.9999]) {
    assert.notEqual(rollItem(1, 3, () => r), 'bone');
    assert.notEqual(rollItem(1, 1, () => r), 'bone');
    assert.notEqual(rollItem(3, 3, () => r), 'toy');
  }
});

test('a thrown ball flies straight ahead and stops at the end of its range', () => {
  const ball = { origin: [0, 1, 0], direction: forwardOf(Math.PI / 2) };   // facing +X
  const p = ballPositionAt(ball, 1);
  assert.ok(Math.abs(p[0] - BALL.speed) < 1e-9 && Math.abs(p[2]) < 1e-9);
  assert.deepEqual(ballPositionAt(ball, 99), ballPositionAt(ball, BALL.duration));
});
