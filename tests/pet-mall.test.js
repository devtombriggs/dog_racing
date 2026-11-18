import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PET_MALL as T } from '../shared/petMallData.js';
import { MAPS } from '../shared/maps.js';
import { TREAT_BOXES_BY_MAP } from '../shared/treatBoxes.js';
import { GOLDEN_BONE_SPOTS } from '../shared/pickupSpots.js';
import { BURROWS } from '../shared/burrows.js';

const at = (s, lateral = 0) => { const p = T.pointAt(s, lateral); return T.query(p.x, p.z); };

test('Pet Mall: a closed lap with a grid, checkpoints in order and shop fronts all the way round', () => {
  assert.equal(MAPS.pet_mall.procedural, true);
  assert.equal(MAPS.pet_mall.startPositions.length, 6);
  assert.ok(T.length > 1200 && T.length < 1500, `${T.length} m`);
  for (let i = 1; i < T.checkpoints.length; i++) assert.ok(T.checkpoints[i].s > T.checkpoints[i - 1].s);
  for (const start of T.startPositions) { const q = T.query(start.position[0], start.position[2]); assert.ok(q.onTrack && !q.blocked); }
  for (let s = 0; s < T.length; s += 9) {
    if (T.isGap(s)) continue;
    const p = T.pointAt(s, T.pointAt(s).halfWidth + 3), q = T.query(p.x, p.z);
    assert.ok(q.blocked && q.onTrack, `held at the wall at ${s} m, not a fall`);
  }
  assert.equal(BURROWS.pet_mall.length, 2, 'Ralph has his two burrows here too');
});

test('Pet Mall: puddles slow a dog, the escalator carries it up faster than it can sprint, tins are solid', () => {
  const puddle = T.mud[0], inPuddle = at(puddle.s, puddle.lateral);
  assert.ok(inPuddle.mud && T.speedFactor(inPuddle) < 0.7);
  assert.equal(at(puddle.s, -puddle.lateral).mud, false, 'the other side of the aisle is dry');
  const stairs = at((T.escalator.sStart + T.escalator.sEnd) / 2);
  assert.ok(stairs.escalator && T.speedFactor(stairs) > 1.2);
  assert.ok(T.pointAt(T.escalator.sEnd).y > T.pointAt(T.escalator.sStart).y + 6, 'it goes up to the gallery');
  for (const tower of T.obstacles) {
    const q = T.query(tower.x, tower.z);
    assert.ok(q.blocked && Math.hypot(q.clampX - tower.x, q.clampZ - tower.z) >= tower.radius, `${tower.id} cannot be run through`);
    assert.equal(at(tower.s, -tower.lateral).blocked, false, 'there is room to pass it');
  }
});

test('Pet Mall: the leap off the gallery fires every dog over the fountain to the dog beds', () => {
  const { launch } = T;
  assert.ok(launch.padStart < launch.takeoffS && launch.takeoffS < launch.gapStart && launch.gapEnd < launch.landingS);
  assert.equal(at(launch.takeoffS).onTrack, true);
  assert.equal(at((launch.gapStart + launch.gapEnd) / 2).onTrack, false);
  assert.equal(at(launch.landingS).onTrack, true);
  const takeoff = T.pointAt(launch.takeoffS), landing = T.pointAt(launch.landingS), top = T.launchPoint(launch.duration / 2), down = T.launchPoint(launch.duration);
  assert.ok(takeoff.y > landing.y + 5, 'from the upper floor to the ground floor');
  assert.ok(top.y > takeoff.y && Math.hypot(down.x - landing.x, down.z - landing.z) < 1e-6);
  assert.ok(T.checkpoints.some(cp => cp.launchLanding));
});

test('Pet Mall: cats, trolleys and hamster balls knock dogs over, cats and hamsters can be jumped, and nothing sits on a checkpoint or a pickup', () => {
  assert.deepEqual([...new Set(T.hazardsAt(0).map(h => h.kind))].sort(), ['cat', 'hamster', 'trolley']);
  const spots = [...T.checkpoints.map(cp => cp.position), ...T.startPositions.map(p => p.position),
    ...TREAT_BOXES_BY_MAP.pet_mall.map(box => box.groundPosition), ...GOLDEN_BONE_SPOTS.pet_mall.map(b => [b.x, b.y, b.z])];
  const seen = new Set();
  for (let t = 0; t < 30; t += 0.1) {
    for (const spot of spots) assert.equal(T.hazardHit(spot, t), null, `something reaches ${spot} at ${t} s`);
    for (const h of T.hazardsAt(t)) {
      if (Math.abs(T.query(h.x, h.z).lateral) > 2) continue;
      seen.add(h.kind);
      assert.equal(T.hazardHit([h.x, h.y, h.z], t)?.kind, h.kind, 'on the floor in front of it: hit');
      // a jump (about 1.5 m) clears a cat or a hamster ball; nothing clears a trolley
      assert.equal(T.hazardHit([h.x, h.y + 1.4, h.z], t) === null, h.kind !== 'trolley', h.kind);
    }
  }
  assert.deepEqual([...seen].sort(), ['cat', 'hamster', 'trolley'], 'each of them comes across the middle of the aisle');
  for (const [x, , z] of spots.slice(T.checkpoints.length + 5)) { const q = T.query(x, z); assert.ok(q.onTrack && !q.mud && !q.blocked); }      // (some are on the escalator: fair game)
});
