import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WATER_PARK as T } from '../shared/waterParkData.js';
import { MAPS } from '../shared/maps.js';
import { TREAT_BOXES_BY_MAP } from '../shared/treatBoxes.js';
import { GOLDEN_BONE_SPOTS } from '../shared/pickupSpots.js';
import { DOG_STATS, BASE_SPEED, STAT_EFFECT, statScale } from '../shared/dogStats.js';
import { botRoute, createBot } from '../server/bots.js';

const at = (s, lateral = 0) => { const p = T.pointAt(s, lateral); return T.query(p.x, p.z); };
const stats = dog => ({ swimming: DOG_STATS[dog].swimming / 10 });
const mid = pool => (pool.sStart + pool.sEnd) / 2;

test('Water Park: a closed lap with a grid, checkpoints in order and walls all the way round', () => {
  assert.equal(MAPS.water_park.procedural, true);
  assert.equal(MAPS.water_park.startPositions.length, 6);
  assert.ok(T.length > 1500 && T.length < 1900, `${T.length} m`);
  for (let i = 1; i < T.checkpoints.length; i++) assert.ok(T.checkpoints[i].s > T.checkpoints[i - 1].s);
  for (const start of T.startPositions) assert.ok(T.query(start.position[0], start.position[2]).onTrack);
  // off the side anywhere: held at the wall, never a fall (the only way off is the end of the slide)
  for (let s = 0; s < T.length; s += 9) {
    if (T.isGap(s)) continue;
    const p = T.pointAt(s, T.pointAt(s).halfWidth + 3), q = T.query(p.x, p.z);
    assert.ok(q.blocked && q.onTrack, `${s} m`);
    assert.ok(Math.abs(T.query(q.clampX, q.clampZ).lateral) < q.halfWidth);
  }
});

test('Water Park: two pools to swim, and Poppy is the best in the water', () => {
  assert.deepEqual(T.pools.map(pool => pool.id), ['lagoon', 'river']);
  for (const pool of T.pools) {
    const deep = at(mid(pool));
    assert.equal(deep.movement, 'swim');
    assert.ok(deep.dogY < deep.waterY && deep.dogY > deep.y, 'a swimming dog floats: below the surface, off the bottom');
    assert.equal(at(pool.sStart - 3).movement, 'run');
    assert.equal(at(pool.sStart + 1.5).movement, 'wade', 'it shelves in');
    assert.equal(at(pool.sEnd + 3).movement, 'run');
  }
  const lagoon = at(mid(T.pools[0])), river = at(mid(T.pools[1]));
  // (the lagoon flows like a lazy river now, as its rings drift: Tom, 2026-11-21.  `share` is the swimming without it)
  const lagoonFlow = T.pools[0].flow, share = dog => T.speedFactor(lagoon, stats(dog)) - lagoonFlow;
  assert.ok(lagoonFlow > 0.1, 'the lagoon carries a swimmer along');
  assert.ok(Math.abs(share('black_lab') - 0.9) < 1e-9, 'Poppy keeps 90 % of her speed');
  for (const dog of ['gsp', 'pablo', 'second_dog', 'ralph']) assert.ok(share(dog) >= 0.6 && share(dog) < share('black_lab'), dog);
  assert.ok(share('rocky') > share('pablo') && share('pablo') > share('ralph'));
  // the Lazy River flows with the race: everyone is carried a little
  for (const dog of Object.keys(DOG_STATS)) assert.ok(Math.abs(T.speedFactor(river, stats(dog)) - share(dog) - 0.15) < 1e-9, dog);
  // in the air (off a rubber ring) the water does not slow a dog
  assert.equal(T.speedFactor(lagoon, stats('ralph'), true), 1);
});

test('Water Park: the rubber rings drift down the lagoon (Tom, 2026-11-21), and each bounce carries a dog on to the next ring', () => {
  assert.ok(T.rings.length >= 8);
  const { force, gravity, pace } = T.rules.bounce, airtime = 2 * force / gravity, R = T.ring;
  assert.ok(force * force / (2 * gravity) > 1.5, 'a good bounce');
  // (on still water the pace would be one the dogs run at anyway: between the slowest and the fastest of them)
  const tops = Object.values(DOG_STATS).map(d => BASE_SPEED.sprint * statScale(d.speed, STAT_EFFECT.speed));
  assert.ok(pace - R.flow > Math.min(...tops) && pace - R.flow < Math.max(...tops));
  // a bounce carries a dog the gap between two rings and as far again as they drift while it is in the air
  assert.ok(Math.abs(pace * airtime - (R.spacing + R.flow * airtime)) < 0.01);
  for (const t of [0, 2.5, 7, 13.3]) {
    const now = T.ringsAt(t), later = T.ringsAt(t + 1);
    for (const [k, ring] of now.entries()) {
      if (ring.rise < 1) continue;                                // (sinking at the far end, or coming up at the start)
      assert.equal(at(ring.s, ring.lateral).movement, 'swim', 'floating on deep water');
      assert.equal(T.ringAt(ring.x, ring.z, false, t)?.id, ring.id);
      // drifting on, down the lagoon, a little from side to side
      if (later[k].rise === 1) assert.ok(Math.abs(later[k].s - ring.s - R.flow) < 0.01);
      // a dog that has fallen in and is swimming cannot get back on one, but near the start of the lagoon
      const nearStart = ring.s - T.pools[0].sStart < R.mount;
      assert.equal(Boolean(T.ringAt(ring.x, ring.z, true, t)), nearStart, `${ring.id} at ${ring.s.toFixed(0)}`);
    }
  }
});

test('Water Park: the slide is the fastest stretch, and its end fires every dog over the splash pool to the dock', () => {
  const onSlide = at((T.slide.sStart + T.slide.sEnd) / 2);
  assert.ok(onSlide.slide && T.speedFactor(onSlide, stats('ralph')) > 1.4);
  assert.ok(T.pointAt(T.slide.sStart).y > T.pointAt(T.slide.sEnd).y + 15, 'it comes down a long way');
  const { launch } = T;
  assert.ok(launch.padStart < launch.takeoffS && launch.takeoffS < launch.gapStart && launch.gapEnd < launch.landingS);
  assert.equal(at(launch.takeoffS).onTrack, true);
  assert.equal(at((launch.gapStart + launch.gapEnd) / 2).onTrack, false, 'nothing to stand on under the jump');
  assert.equal(at(launch.landingS).onTrack, true);
  const from = T.launchPoint(0), to = T.launchPoint(launch.duration), top = T.launchPoint(launch.duration / 2), takeoff = T.pointAt(launch.takeoffS), landing = T.pointAt(launch.landingS);
  assert.ok(Math.hypot(from.x - takeoff.x, from.z - takeoff.z) < 1e-6 && Math.hypot(to.x - landing.x, to.z - landing.z) < 1e-6);
  assert.ok(top.y > takeoff.y + 3, 'up and over');
  assert.ok(T.checkpoints.some(cp => cp.launchLanding), 'the landing is a gate');
  assert.ok(T.checkpoints.every(cp => cp.s <= launch.padStart - 8 + 1e-6 || cp.s >= launch.landingS - 1e-6), 'no checkpoint in the air');
});

test('Water Park: beach balls and jets knock dogs over, leave a way through, and keep off checkpoints and pickups', () => {
  const kinds = new Set(T.hazardsAt(0).map(h => h.kind));
  assert.deepEqual([...kinds].sort(), ['beachball', 'jet']);
  const everything = [...T.checkpoints.map(cp => cp.position), ...T.startPositions.map(p => p.position),
    ...TREAT_BOXES_BY_MAP.water_park.map(box => box.groundPosition), ...GOLDEN_BONE_SPOTS.water_park.map(b => [b.x, b.y, b.z])];
  let ballOnRoad = false, jetOn = false;
  for (let t = 0; t < 30; t += 0.1) {
    for (const spot of everything) assert.equal(T.hazardHit(spot, t), null, `something reaches ${spot} at ${t} s`);
    for (const h of T.hazardsAt(t)) {
      if (h.kind === 'beachball' && Math.abs(T.query(h.x, h.z).lateral) < 2) { ballOnRoad = true; assert.equal(T.hazardHit([h.x, T.deckY, h.z], t).id, h.id); }
      if (h.kind === 'jet' && h.active) { jetOn = true; assert.equal(T.hazardHit([h.x, h.y, h.z], t).kind, 'jet'); }
      if (h.kind === 'jet' && !h.active && h.power === 0) assert.equal(T.hazardHit([h.x, h.y, h.z], t), null, 'a jet that is off is safe to cross');
    }
    // every row of jets always has a way through between them
    for (const row of new Set(T.jets.map(jet => jet.row))) {
      const s = T.jets.find(jet => jet.row === row).s, gap = T.pointAt(s, 0.31 * T.pointAt(s).halfWidth);
      assert.equal(T.hazardHit([gap.x, gap.y, gap.z], t), null);
    }
  }
  assert.ok(ballOnRoad && jetOn);
  // boxes and bones are on dry deck, clear of the slide and the jump
  for (const [x, , z] of everything.slice(T.checkpoints.length + 5)) { const q = T.query(x, z); assert.ok(q.movement === 'run' && !q.slide && q.onTrack); }
});

test('Water Park: a computer dog bounces down the rings, and Poppy swims the lagoon as fast as the others bounce it', () => {
  const route = botRoute('water_park'), pool = T.pools[0];
  const cross = (dog) => {
    const start = route.pointAt(pool.sStart - 30), bot = createBot({ mapId: 'water_park', dog, level: 'hard', seed: 3 });
    bot.place([start.x, start.y, start.z], start.heading);
    let ticks = 0, bounced = 0, wasJumping = false;
    for (let t = 0; t < 40 && bot.state.s < pool.sEnd + 5; t += 0.05) {
      T.setClock(t);                       // (as the server does for each room: the rings drift by the race clock)
      bot.step(0.05, {});
      if (bot.state.s > pool.sStart && bot.state.s < pool.sEnd) { ticks += 1; if (bot.state.jumping && !wasJumping) bounced += 1; }
      wasJumping = bot.state.jumping;
    }
    return { seconds: ticks * 0.05, bounced };
  };
  const pippa = cross('gsp'), poppy = cross('black_lab');
  assert.ok(pippa.bounced >= T.rings.length - 3, `Pippa bounced ${pippa.bounced} times`);
  assert.ok(poppy.seconds < pippa.seconds * 1.15 && pippa.seconds < 16, `Poppy ${poppy.seconds} s, Pippa ${pippa.seconds} s`);
});
