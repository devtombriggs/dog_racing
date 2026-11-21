import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MUD_PARK as T } from '../shared/mudParkData.js';
import { MAPS } from '../shared/maps.js';
import { TREAT_BOXES_BY_MAP } from '../shared/treatBoxes.js';
import { GOLDEN_BONE_SPOTS } from '../shared/pickupSpots.js';
import { BURROWS } from '../shared/burrows.js';
import { botRoute, createBot } from '../server/bots.js';

// (the lap crosses itself (Tom, 2026-11-21): where the road is asked about, the height says which of the two it is)
const at = (s, lateral = 0) => { const p = T.pointAt(s, lateral); return T.query(p.x, p.z, -1, p.y); };

test('Mud Run: a closed lap with a grid, checkpoints in order and tape all the way round', () => {
  assert.equal(MAPS.mud_park.procedural, true);
  assert.equal(MAPS.mud_park.startPositions.length, 6);
  assert.ok(T.length > 1300 && T.length < 1600, `${T.length} m`);
  for (let i = 1; i < T.checkpoints.length; i++) assert.ok(T.checkpoints[i].s > T.checkpoints[i - 1].s);
  for (const start of T.startPositions) { const q = T.query(start.position[0], start.position[2]); assert.ok(q.onTrack && !q.blocked && !q.mud); }
  for (let s = 0; s < T.length; s += 9) {
    if (T.isGap(s)) continue;
    const p = T.pointAt(s, T.pointAt(s).halfWidth + 3), q = T.query(p.x, p.z, -1, p.y);
    assert.ok(q.blocked && q.onTrack, `held at the tape at ${s} m, not a fall`);
  }
  assert.equal(BURROWS.mud_park.length, 2, 'Ralph has his two burrows here too');
});

test('Mud Run: it is wet everywhere, wettest on the clay and the mudslide; deep mud is slow, the slide is fast', () => {
  const paddock = at(40), clay = at((T.clay.sStart + T.clay.sEnd) / 2), slide = at((T.slide.sStart + T.slide.sEnd) / 2);
  assert.ok(paddock.slippery > 0 && paddock.slippery < 0.5);
  assert.equal(clay.slippery, 1);
  assert.ok(slide.slippery > 0.7 && slide.slide && T.speedFactor(slide) > 1.3);
  for (let s = 0; s < T.length; s += 11) assert.equal(T.slipAt(s), at(s).slippery);
  // what the wet does: less grip and slower to pick up speed, never none of either
  assert.ok(T.rules.slip.grip > 0 && T.rules.slip.grip < 0.5 && T.rules.slip.acceleration > 0.3 && T.rules.slip.acceleration < 1);
  const bog = T.mud[0], inBog = at(bog.s, bog.lateral);
  assert.ok(inBog.mud && T.speedFactor(inBog) < 0.6);
  assert.equal(at(bog.s, -bog.lateral).mud, false, 'there is a firm line past each patch');
  assert.ok(T.pointAt(T.slide.sStart).y > T.pointAt(T.slide.sEnd).y + 5, 'the slide comes down a long way');
  for (const stack of T.obstacles) { assert.ok(T.query(stack.x, stack.z).blocked); assert.equal(at(stack.s, -stack.lateral).blocked, false); }
});

test('Mud Run: the leap off the bottom of the mudslide fires every dog over the pit', () => {
  const { launch } = T;
  assert.ok(launch.padStart < launch.takeoffS && launch.takeoffS < launch.gapStart && launch.gapEnd < launch.landingS);
  assert.equal(at(launch.takeoffS).onTrack, true);
  assert.equal(at((launch.gapStart + launch.gapEnd) / 2).onTrack, false);
  assert.equal(at(launch.landingS).onTrack, true);
  const landing = T.pointAt(launch.landingS), down = T.launchPoint(launch.duration);
  assert.ok(T.launchPoint(launch.duration / 2).y > T.pointAt(launch.takeoffS).y && Math.hypot(down.x - landing.x, down.z - landing.z) < 1e-6);
  assert.ok(T.checkpoints.some(cp => cp.launchLanding));
});

test('Mud Run: the quad bike and the logs knock dogs over, a log can be jumped, and nothing sits on a checkpoint or a pickup', () => {
  assert.deepEqual([...new Set(T.hazardsAt(0).map(h => h.kind))].sort(), ['log', 'quad']);
  const spots = [...T.checkpoints.map(cp => cp.position), ...T.startPositions.map(p => p.position),
    ...TREAT_BOXES_BY_MAP.mud_park.map(box => box.groundPosition), ...GOLDEN_BONE_SPOTS.mud_park.map(b => [b.x, b.y, b.z])];
  const seen = new Set();
  for (let t = 0; t < 30; t += 0.1) {
    for (const spot of spots) assert.equal(T.hazardHit(spot, t), null, `something reaches ${spot} at ${t} s`);
    for (const h of T.hazardsAt(t)) {
      if (!h.active || Math.abs(T.query(h.x, h.z).lateral) > 2) continue;
      seen.add(h.kind);
      assert.equal(T.hazardHit([h.x, h.y, h.z], t)?.kind, h.kind);
      assert.equal(T.hazardHit([h.x, h.y + 1.4, h.z], t) === null, h.kind === 'log', 'a jump clears a log, not the quad bike');
    }
  }
  assert.deepEqual([...seen].sort(), ['log', 'quad']);
  for (const [x, y, z] of spots.slice(T.checkpoints.length + 5)) { const q = T.query(x, z, -1, y); assert.ok(q.onTrack && !q.mud && !q.blocked && !q.slide); }
});

test('Mud Run: a computer dog eases off more for a bend on the clay than for the same bend would need in the dry', () => {
  const route = botRoute('mud_park');
  assert.equal(route.slipAt((T.clay.sStart + T.clay.sEnd) / 2), 1);
  // through the clay bends flat out, a hard computer dog is slower than its top speed, and stays on the trail
  const start = route.pointAt(T.clay.sStart - 20), bot = createBot({ mapId: 'mud_park', dog: 'second_dog', level: 'hard', seed: 5 });
  bot.place([start.x, start.y, start.z], start.heading);
  let slowest = Infinity;
  for (let t = 0; t < 14; t += 0.05) { bot.step(0.05, {}); if (t > 3) slowest = Math.min(slowest, bot.state.speed); assert.ok(Math.abs(bot.state.lateral) < route.pointAt(bot.state.s).halfWidth); }
  assert.ok(slowest < bot.sprintSpeed * 0.9, `slowest ${slowest} m/s of ${bot.sprintSpeed}`);
});
