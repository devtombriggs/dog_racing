import test from 'node:test';
import assert from 'node:assert/strict';
import { pickInDirection, padDirection } from '../src/ui/padNav.js';

// a 4 x 3 box of tiles 100 wide with 10 between, and a wide button under them
const tile = (col, row) => ({ x: col * 110, y: row * 110, width: 100, height: 100 });
const grid = [];
for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) grid.push(tile(col, row));
const at = (col, row) => row * 4 + col;
const move = (from, direction) => { const others = grid.filter((_, index) => index !== from); const hit = pickInDirection(grid[from], others, direction); return hit < 0 ? -1 : grid.indexOf(others[hit]); };

test('controller in the menus: a direction goes to the tile beside, above or below', () => {
  assert.equal(move(at(1, 1), 'right'), at(2, 1));
  assert.equal(move(at(1, 1), 'left'), at(0, 1));
  assert.equal(move(at(1, 1), 'up'), at(1, 0));
  assert.equal(move(at(1, 1), 'down'), at(1, 2));
  assert.equal(move(at(3, 0), 'right'), -1, 'nothing past the edge');
  assert.equal(move(at(0, 0), 'up'), -1);
});

test('controller in the menus: down from the tiles reaches a wide button under them, and up comes back', () => {
  const footer = { x: 0, y: 360, width: 160, height: 40 }, far = { x: 300, y: 360, width: 130, height: 40 };
  const boxes = [...grid, footer, far];
  assert.equal(pickInDirection(tile(0, 2), boxes.filter(box => box !== grid[at(0, 2)]), 'down'), boxes.filter(box => box !== grid[at(0, 2)]).indexOf(footer));
  const up = boxes.filter(box => box !== far)[pickInDirection(far, boxes.filter(box => box !== far), 'up')];
  assert.equal(up.y, 220, 'the bottom row of tiles');
  assert.ok(up.x === 220 || up.x === 330, 'one of the tiles above it');
});

test('controller in the menus: a stack of buttons of different widths (the home screen)', () => {
  const name = { x: 60, y: 0, width: 400, height: 60 }, single = { x: 0, y: 70, width: 520, height: 100 }, multi = { x: 30, y: 180, width: 460, height: 80 };
  const gear = { x: -500, y: 300, width: 80, height: 80 };
  assert.equal(pickInDirection(single, [name, multi, gear], 'down'), 1);
  assert.equal(pickInDirection(single, [name, multi, gear], 'up'), 0);
  assert.equal(pickInDirection(multi, [name, single, gear], 'left'), 2, 'the corner buttons are reached by going left');
  assert.equal(pickInDirection(gear, [name, single, multi], 'right'), 2);
});

test('controller in the menus: D-pad first, then the stick once it is pushed most of the way', () => {
  const pad = (buttons, axes = [0, 0]) => ({ buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: buttons.includes(index) })), axes });
  assert.equal(padDirection(pad([12])), 'up');
  assert.equal(padDirection(pad([15])), 'right');
  assert.equal(padDirection(pad([], [0.3, -0.2])), null, 'a resting stick does nothing');
  assert.equal(padDirection(pad([], [-0.9, 0.2])), 'left');
  assert.equal(padDirection(pad([], [0.2, 0.8])), 'down');
  assert.equal(padDirection(null), null);
});
