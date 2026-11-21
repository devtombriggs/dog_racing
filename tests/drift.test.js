import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRIFT, AUTO_DRIFT, autoDriftHeld, autoDriftTurn, DRIFT_PERKS, driftPerks, driftCanStart, driftTurn, driftChargeRate, driftTier, driftBoostSeconds, driftBoost, driftBoostNow } from '../shared/drift.js';
import { DOG_STATS } from '../shared/dogStats.js';
import { BONE_BOOST } from '../shared/items.js';

test('drift: starts only with the button held, the steering over, at a run and on the ground', () => {
  const ok = { held: true, turn: 1, effort: 0.8, grounded: true };
  assert.equal(driftCanStart(ok), true);
  assert.equal(driftCanStart({ ...ok, turn: -1 }), true);
  assert.equal(driftCanStart({ ...ok, held: false }), false);
  assert.equal(driftCanStart({ ...ok, turn: 0.1 }), false, 'going straight');
  assert.equal(driftCanStart({ ...ok, effort: 0.1 }), false, 'at a trot');
  assert.equal(driftCanStart({ ...ok, grounded: false }), false, 'in the air');
});

test('drift: steering into the skid tightens it and charges it faster; steering out opens it and charges slowly', () => {
  assert.ok(driftTurn(1) > driftTurn(0) && driftTurn(0) > driftTurn(-1) && driftTurn(-1) > 0, 'a skid always turns its own way');
  assert.ok(driftTurn(1) > 1, 'tighter than an ordinary hard turn');
  assert.ok(driftChargeRate(7, 1) > driftChargeRate(7, 0) && driftChargeRate(7, 0) > driftChargeRate(7, -1));
  assert.equal(driftChargeRate(7, 1), 1);
});

test('drift: no sparks at first, then three colours of them, and a longer boost for each', () => {
  assert.deepEqual([0, 0.79, 0.8, 1.79, 1.8, 2.99, 3, 9].map(driftTier), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(driftBoostSeconds(7, 0), 0, 'let go too soon: nothing');
  assert.equal(driftBoostSeconds(7, 1), DRIFT.boostSeconds[0]);
  assert.equal(driftBoostSeconds(7, 2), DRIFT.boostSeconds[1]);
  assert.equal(driftBoostSeconds(7, 3), DRIFT.boostSeconds[2]);
  assert.ok(DRIFT.boostSeconds[0] < DRIFT.boostSeconds[1] && DRIFT.boostSeconds[1] < DRIFT.boostSeconds[2]);
  assert.equal(driftBoostNow(1), DRIFT.boostSpeed);
  assert.equal(driftBoostNow(0), 1);
  assert.ok(driftBoostNow(DRIFT.easeOut / 2) > 1 && driftBoostNow(DRIFT.easeOut / 2) < DRIFT.boostSpeed, 'it fades out');
  assert.ok(DRIFT.boostSpeed < BONE_BOOST.speedMultiplier && DRIFT.boostSeconds[2] < BONE_BOOST.duration, 'weaker than a Golden Bone');
});

test('drift: every dog has a Drift rating, and no faster dog is a better drifter than a slower one', () => {
  const dogs = Object.entries(DOG_STATS);
  for (const [id, stats] of dogs) assert.ok(stats.drift >= 1 && stats.drift <= 10, id);
  for (const [a, x] of dogs) for (const [b, y] of dogs) if (x.speed > y.speed) assert.ok(x.drift <= y.drift, `${a} is faster than ${b}`);
  // Ralph, the slowest, gets his sparks soonest and the longest boost; Meela, the fastest, the reverse
  const { ralph, second_dog: meela } = DOG_STATS;
  assert.ok(driftChargeRate(ralph.drift, 1) > 1.25 * driftChargeRate(meela.drift, 1) && driftBoostSeconds(ralph.drift, 3) > 1.4 * driftBoostSeconds(meela.drift, 3));
});

test('drift: in the slide the tail wags and the head moves, and neither winds up over time', async () => {
  const THREE = await import('three');
  const { applyTurnPose, skidSway } = await import('../src/game/dogs/animation.js');
  const { DOGS } = await import('../src/config/dogs.js');
  const life = DOGS.gsp.skid.life, model = new THREE.Group(), bones = {};
  for (const name of ['tail1', 'tail2', 'tail3', 'neck1', 'neck2', 'head']) { bones[name] = new THREE.Bone(); model.add(bones[name]); }
  // (no mixer here: the bones are never put back for us, as when a clip holds them still)
  const rest = new THREE.Quaternion(), seen = { tail1: [], head: [] };
  for (let frame = 0; frame < 600; frame++) {
    applyTurnPose(model, bones, 0.5, 1, skidSway(frame / 60, 1, life));
    for (const name of Object.keys(seen)) seen[name].push(bones[name].quaternion.angleTo(rest));
  }
  for (const [name, angles] of Object.entries(seen)) {
    assert.ok(Math.max(...angles) - Math.min(...angles) > 0.03, `${name} moves`);
    assert.ok(Math.max(...angles) < 0.7, `${name} does not wind up (${Math.max(...angles).toFixed(2)} rad)`);
  }
  assert.ok(Math.max(...seen.tail1) > 0.3, 'a proper wag');
  // out of the slide there is nothing added
  assert.deepEqual(skidSway(1.23, 0, life).tail1.map(Math.abs), [0, 0]);
});

test('drift: Enzo, Ralph and the pug twins get more from a skid: a little faster, tighter and wider steering, sparks sooner', async () => {
  assert.deepEqual(Object.keys(DRIFT_PERKS).sort(), ['baz_naz', 'enzo', 'jimmy', 'ralph']);
  assert.deepEqual(driftPerks('gsp'), { speed: 1, control: 1, charge: 1, boost: null });
  for (const dog of Object.keys(DRIFT_PERKS)) {
    const perk = driftPerks(dog);
    assert.ok(perk.speed > 1 && perk.speed <= 1.1, `${dog}: slightly faster, no more`);
    assert.ok(driftTurn(1, perk.control) > driftTurn(1) && driftTurn(-1, perk.control) < driftTurn(-1) && driftTurn(-1, perk.control) > 0, `${dog}: more control both ways`);
    assert.equal(driftTurn(0, perk.control), driftTurn(0));
    assert.ok(driftChargeRate(7, 1, perk.charge) > driftChargeRate(7, 1), `${dog}: sparks sooner`);
  }
  // every dog has a skid of its own kind, and the three slow dogs each have a different one
  const { DOGS } = await import('../src/config/dogs.js');
  for (const [id, dog] of Object.entries(DOGS)) assert.ok(dog.skid?.hop && dog.skid.slide, `${id} has a skid`);
  assert.ok(DOGS.enzo.skid.drop && !DOGS.enzo.skid.bend, 'Enzo on his belly');
  assert.ok(DOGS.ralph.skid.board, 'Ralph on a skateboard');
  assert.ok(DOGS.baz_naz.skid.stack, 'one twin on the other');
  assert.ok(DOGS.jimmy.skid.bend.forearm && !DOGS.jimmy.skid.bend.thigh && !DOGS.jimmy.skid.board, 'Jimmy braces his front legs: his back ones are in the cart');
  for (const id of ['gsp', 'second_dog', 'black_lab', 'pablo', 'rocky', 'kombu', 'jazz', 'casper']) assert.ok(DOGS[id].skid.bend && !DOGS[id].skid.board && !DOGS[id].skid.stack && !DOGS[id].skid.drop, `${id}: the crouch`);
});

test('drift: for Enzo, Ralph and the twins, letting go on blue sparks is a Golden Bone\'s boost; the other dogs get the short one', () => {
  for (const dog of Object.keys(DRIFT_PERKS)) {
    const perks = driftPerks(dog), stat = DOG_STATS[dog].drift;
    assert.equal(driftBoost(stat, 0, perks), null, 'nothing before the sparks');
    const blue = driftBoost(stat, 1, perks);
    assert.deepEqual([blue.speed, blue.seconds, blue.quick, blue.kick, blue.easeOut],
      [BONE_BOOST.speedMultiplier, BONE_BOOST.duration, BONE_BOOST.accelerationMultiplier, BONE_BOOST.instantKick, BONE_BOOST.easeOut], `${dog}: a bone's boost`);
    assert.ok(driftBoost(stat, 2, perks).seconds > blue.seconds && driftBoost(stat, 3, perks).seconds > driftBoost(stat, 2, perks).seconds, 'longer for orange and purple');
    assert.equal(driftBoostNow(1, blue.speed, blue.easeOut), BONE_BOOST.speedMultiplier);
    // and their sparks are blue in well under a second, steering into the skid
    assert.ok(DRIFT.tiers[0] / driftChargeRate(stat, 1, perks.charge) < 0.5, `${dog}: blue in ${(DRIFT.tiers[0] / driftChargeRate(stat, 1, perks.charge)).toFixed(2)} s`);
  }
  const pippa = driftBoost(DOG_STATS.gsp.drift, 1, driftPerks('gsp'));
  assert.deepEqual([pippa.speed, pippa.seconds], [DRIFT.boostSpeed, driftBoostSeconds(DOG_STATS.gsp.drift, 1)]);
  assert.ok(pippa.speed < BONE_BOOST.speedMultiplier && pippa.seconds < BONE_BOOST.duration);
});

test('hitting a wall costs speed: a fifth of it for a brush, three quarters straight in, and a dog against one is held under its pace', async () => {
  const { WALL, speedAfterWall } = await import('../shared/handling.js');
  assert.ok(Math.abs(speedAfterWall(18, 0) - 18 * 0.8) < 1e-9);
  assert.ok(Math.abs(speedAfterWall(18, 1) - 18 * 0.25) < 1e-9);
  assert.ok(speedAfterWall(18, 0.5) < speedAfterWall(18, 0) && speedAfterWall(18, 0.5) > speedAfterWall(18, 1));
  assert.equal(speedAfterWall(18, 5), speedAfterWall(18, 1));
  assert.ok(WALL.scrape > 0.5 && WALL.scrape < 0.8 && WALL.softBelow < 1);
});

test('accessibility mode drifts by itself: an arrow held into a bend starts the skid, it follows the road, and letting go ends it', () => {
  const left = 0.02, straight = 0.002;        // (the road ahead: bending left, and all but straight)
  // a tap does not start one; a hold into the bend does; not on a straight, and not against the bend
  assert.equal(autoDriftHeld({ turn: 1, heldFor: 0.1, bend: left }), false);
  assert.equal(autoDriftHeld({ turn: 1, heldFor: AUTO_DRIFT.hold, bend: left }), true);
  assert.equal(autoDriftHeld({ turn: -1, heldFor: 1, bend: -left }), true, 'and to the right');
  assert.equal(autoDriftHeld({ turn: 1, heldFor: 1, bend: straight }), false, 'a correction on a straight');
  assert.equal(autoDriftHeld({ turn: -1, heldFor: 1, bend: left }), false, 'steering out of the bend');
  assert.equal(autoDriftHeld({ turn: 0, heldFor: 1, bend: left }), false);
  // once in it: held for as long as the arrow is, even if the road straightens; over when it is let go or reversed
  assert.equal(autoDriftHeld({ turn: 1, heldFor: 2, bend: straight, side: 1 }), true);
  assert.equal(autoDriftHeld({ turn: 0, heldFor: 0, bend: left, side: 1 }), false);
  assert.equal(autoDriftHeld({ turn: -1, heldFor: 0, bend: left, side: 1 }), false);
  // it is steered for the player.  On its line and heading along the road: exactly as hard as the road bends
  const rate = 1.5, speed = 18, half = 10, on = { bend: left, speed, turnRate: rate, halfWidth: half, inside: AUTO_DRIFT.line * half, off: 0 };
  assert.ok(Math.abs(autoDriftTurn(on) * rate - left * speed) < 1e-9, 'round with the road');
  assert.equal(autoDriftTurn({ ...on, bend: -left }), autoDriftTurn(on), 'either way');
  assert.ok(autoDriftTurn(on) < driftTurn(-1), 'gentler than a button skid can be, on an easy bend');
  // out by the outside wall it turns in harder; right in by the inside wall, or already heading in too far, it eases off
  assert.ok(autoDriftTurn({ ...on, inside: -9 }) > autoDriftTurn(on));
  assert.ok(autoDriftTurn({ ...on, inside: 9 }) < autoDriftTurn(on));
  assert.ok(autoDriftTurn({ ...on, off: 0.3 }) < autoDriftTurn(on));
  assert.ok(autoDriftTurn({ ...on, off: -0.3 }) > autoDriftTurn(on));
  // never tighter than a skid can be, and never turned the other way
  assert.equal(autoDriftTurn({ ...on, bend: 0.5 }), driftTurn(1));
  assert.equal(autoDriftTurn({ ...on, bend: 0, off: 1 }), 0.05);
  assert.ok(AUTO_DRIFT.wall > 0 && AUTO_DRIFT.wall < 1, 'a wall costs less');
});
