import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPad, PlayerInput } from '../src/game/PlayerInput.js';

// An Xbox 360 pad as a browser reports it ("standard" mapping): 17 buttons, 4 axes
const pad = ({ buttons = {}, axes = [0, 0, 0, 0] } = {}) => ({
  connected: true, mapping: 'standard', axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (buttons[i] ?? 0) > 0.5, value: buttons[i] ?? 0 })),
});
const RT = 7, LT = 6, A = 0, B = 1, X = 2, LB = 4, RB = 5, LEFT = 14, RIGHT = 15;

test('controller: right trigger goes, left trigger brakes, the stick and the D-pad steer, A jumps, X uses the item', () => {
  assert.deepEqual(readPad(null), { accelerate: false, brake: false, turn: 0, jump: false, item: false, drift: false });
  assert.deepEqual(readPad(pad()), { accelerate: false, brake: false, turn: 0, jump: false, item: false, drift: false });
  assert.equal(readPad(pad({ buttons: { [RT]: 0.4 } })).accelerate, true, 'a trigger part of the way in is enough');
  assert.equal(readPad(pad({ buttons: { [RT]: 0.05 } })).accelerate, false, 'a finger resting on it is not');
  assert.equal(readPad(pad({ buttons: { [LT]: 1 } })).brake, true);
  assert.equal(readPad(pad({ buttons: { [LT]: 0.4 } })).drift, true, 'the left trigger drifts too (going wins over braking)');
  assert.equal(readPad(pad({ buttons: { [A]: 1 } })).jump, true);
  for (const button of [X, B, LB]) assert.equal(readPad(pad({ buttons: { [button]: 1 } })).item, true);
  assert.deepEqual([readPad(pad({ buttons: { [RB]: 1 } })).drift, readPad(pad({ buttons: { [RB]: 1 } })).item], [true, false], 'the right bumper drifts');
  // steering: 1 is hard left; the stick has a dead zone and gives part turns
  assert.equal(readPad(pad({ axes: [-1, 0, 0, 0] })).turn, 1);
  assert.equal(readPad(pad({ axes: [1, 0, 0, 0] })).turn, -1);
  assert.equal(readPad(pad({ axes: [0.1, 0, 0, 0] })).turn, 0, 'a stick that does not quite centre');
  const half = readPad(pad({ axes: [-0.6, 0, 0, 0] })).turn;
  assert.ok(half > 0.3 && half < 0.7, `half way is about half a turn (${half})`);
  assert.equal(readPad(pad({ buttons: { [LEFT]: 1 } })).turn, 1);
  assert.equal(readPad(pad({ buttons: { [RIGHT]: 1 } })).turn, -1);
});

test('controller: jump and item fire once a press, only while racing, and the keyboard still works beside it', (context) => {
  let current = pad(), racing = true; const fired = [];
  const before = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [null, current] }, configurable: true });
  context.after(() => { if (before) Object.defineProperty(globalThis, 'navigator', before); else delete globalThis.navigator; });
  const listeners = { addEventListener() {}, removeEventListener() {} };
  globalThis.window ??= listeners; context.after(() => { if (globalThis.window === listeners) delete globalThis.window; });
  const input = new PlayerInput({ element: listeners, racing: () => racing, accessible: () => false, onJump: () => fired.push('jump'), onUseItem: () => fired.push('item') });
  input.update();
  assert.deepEqual([input.accelerate, input.brake, input.turn], [false, false, 0]);
  current = pad({ buttons: { [RT]: 1, [A]: 1 }, axes: [-1, 0, 0, 0] });
  input.update(); input.update(); input.update();
  assert.deepEqual([input.accelerate, input.turn], [true, 1]);
  assert.deepEqual(fired, ['jump'], 'held down is one jump');
  current = pad({ buttons: { [RT]: 1, [X]: 1 } });
  input.update();
  assert.deepEqual(fired, ['jump', 'item']);
  current = pad({ buttons: { [RT]: 1 } }); input.update();
  current = pad({ buttons: { [RT]: 1, [A]: 1 } }); input.update();
  assert.deepEqual(fired, ['jump', 'item', 'jump'], 'let go and pressed again');
  // before GO and after the finish the pad does nothing
  racing = false; current = pad({ buttons: { [RT]: 1, [X]: 1 } }); input.update();
  assert.equal(input.accelerate, false);
  assert.equal(fired.length, 3);
  racing = true; input.update();
  assert.equal(fired.length, 3, 'a button already held at GO does not fire');
  assert.equal(input.accelerate, true);
  // keys and pad together: either is enough
  current = pad(); input.update();
  input.keys.KeyW = true; input.keys.KeyD = true;
  assert.deepEqual([input.accelerate, input.turn], [true, -1]);
});
