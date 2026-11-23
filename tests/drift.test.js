import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRIFT, DRIFT_ARC, AUTO_DRIFT, autoDriftHeld, autoDriftCurvature, DRIFT_PERKS, driftPerks, driftCanStart, driftArc, driftCurvature, driftSteering, driftStep, driftChargeRate, driftTier, driftBoost, DRIFT_BOOST, SUPER_DRIFT_BOOST, driftBoostNow, driftSpeedNow } from '../shared/drift.js';
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

// ----- the drift's own curve (Tom, 2026-11-21: "like Mario Kart"): a simulated dog, driven by shared/drift.js alone
const SPRINT = 17;           // m/s, about a dog of Speed 7 flat out
// Drive a drift for `seconds`: input(t) gives the arrows.  Travel follows the nose at the drift's grip, as LocalDog's
// does.  Returns where it got to, its heading, and the turn at every step
function drive({ arc = driftArc(), side = -1, seconds = 3, dt = 1 / 60, input = () => 0, speed = SPRINT, start = 0 }) {
  const state = driftSteering(side, start, arc, speed);
  let x = 0, z = 0, heading = 0, travel = 0, t = 0;
  const turns = [];
  while (t < seconds - 1e-9) {
    const step = Math.min(dt, seconds - t);
    driftStep(state, arc, { input: input(t, { x, z, heading, travel, state }), speed, dt: step });
    heading += state.turned;
    travel += Math.atan2(Math.sin(heading - travel), Math.cos(heading - travel)) * (1 - Math.exp(-DRIFT_ARC.grip * step));
    x += Math.sin(travel) * speed * step; z += Math.cos(travel) * speed * step;
    turns.push({ t, yawRate: state.yawRate, dt: step });
    t += step;
  }
  return { x, z, heading, travel, turns, state };
}
const radiusOf = run => SPRINT / Math.abs(run.state.yawRate);

test('drift: with no arrow, a right-hand drift carries on round a steady medium curve (1)', () => {
  const run = drive({ side: -1, seconds: 4 });
  assert.ok(Math.abs(radiusOf(run) - DRIFT_ARC.radius.base) < 0.5, `about ${DRIFT_ARC.radius.base} m round: ${radiusOf(run).toFixed(1)}`);
  assert.ok(run.turns.every(s => s.yawRate <= 1e-9), 'always to the right');
  // ...and it settles: the turn in the last second barely changes
  const last = run.turns.filter(s => s.t > 3).map(s => s.yawRate);
  assert.ok(Math.max(...last) - Math.min(...last) < 1e-6);
  // much wider than the old drift, which went round 12 m with no arrow: nearly every bend in the game is wider than that
  assert.ok(DRIFT_ARC.radius.base >= 30 && DRIFT_ARC.radius.tight >= 12 && DRIFT_ARC.radius.wide >= 80);
});

test('drift: the arrow into the corner tightens it, the other widens it and never turns it back (2, 3, 7)', () => {
  for (const side of [-1, 1]) {
    const into = drive({ side, input: () => side, seconds: 4 }), out = drive({ side, input: () => -side, seconds: 4 }), none = drive({ side, seconds: 4 });
    assert.ok(Math.abs(radiusOf(into) - DRIFT_ARC.radius.tight) < 0.5, `tight: ${radiusOf(into).toFixed(1)} m`);
    assert.ok(Math.abs(radiusOf(out) - DRIFT_ARC.radius.wide) < 1, `wide: ${radiusOf(out).toFixed(1)} m`);
    assert.ok(out.turns.every(s => Math.sign(s.yawRate) !== -side), 'held out of the corner it still turns its own way');
    // left and right are mirror images
    const mirror = drive({ side: -side, input: () => -side, seconds: 4 });
    assert.ok(Math.abs(into.x + mirror.x) < 1e-9 && Math.abs(into.z - mirror.z) < 1e-9);
    assert.ok(Math.abs(none.state.yawRate) > Math.abs(out.state.yawRate) && Math.abs(none.state.yawRate) < Math.abs(into.state.yawRate));
  }
  // and the arrows ease it there: a third of a second or so, not at once
  const run = drive({ side: -1, input: () => -1, seconds: 0.1 });
  assert.ok(run.state.guide < 0.5, 'still on its way in after a tenth of a second');
});

test('drift: hammering the arrows left and right makes no sudden change of heading (4)', () => {
  const arc = driftArc();
  for (const every of [1 / 60, 0.1, 0.25]) {
    const run = drive({ side: -1, seconds: 4, input: t => (Math.floor(t / every) % 2 ? 1 : -1) });
    for (let i = 1; i < run.turns.length; i++) {
      assert.ok(Math.abs(run.turns[i].yawRate - run.turns[i - 1].yawRate) <= arc.yawAccel * run.turns[i].dt + 1e-9, 'the turn changes steadily');
    }
    // it stays a right-hand drift between its widest and tightest
    const late = run.turns.filter(s => s.t > 1);
    assert.ok(late.every(s => s.yawRate < 0 && -s.yawRate <= SPRINT / DRIFT_ARC.radius.tight + 1e-9 && -s.yawRate >= SPRINT / DRIFT_ARC.radius.wide - 1e-9));
  }
});

test('drift: the same drift goes to the same place at 30, 60 and 144 frames a second (8)', () => {
  const input = t => (t < 1 ? 0 : t < 2 ? -1 : 1);
  const runs = [1 / 30, 1 / 60, 1 / 144].map(dt => drive({ side: -1, seconds: 3, dt, input }));
  for (const run of runs.slice(1)) {
    assert.ok(Math.hypot(run.x - runs[0].x, run.z - runs[0].z) < 0.5, `within half a metre: ${Math.hypot(run.x - runs[0].x, run.z - runs[0].z).toFixed(2)} m`);
    assert.ok(Math.abs(run.heading - runs[0].heading) < 0.05, 'within 3 degrees (a key is seen a frame later at 30 frames a second)');
  }
});

test('drift: a player can follow long sweeping bends with the arrows without being thrown off the road (9)', () => {
  // A right-hand bend of radius R and a road 14 m wide; the dog starts in the middle of it, heading along it.  The
  // player watches where the curve they are on will take the dog in a moment: if that is wide of the middle they press
  // into the corner, if inside it they press out of it, otherwise they leave the arrows alone.  Tried for players who
  // look 0.6 or 0.8 s ahead, put up with half a metre or a metre off line, and react a tenth or a fifth of a second late
  const ahead = (x, z, travel, yawRate, look) => {
    for (let i = 0; i < 10; i++) { travel += yawRate * look / 10; x += Math.sin(travel) * SPRINT * look / 10; z += Math.cos(travel) * SPRINT * look / 10; }
    return [x, z];
  };
  for (const R of [25, 40, 60, 80, 100]) {             // (on gentler bends than that there is no need to drift)
    for (const look of [0.6, 0.8]) for (const slack of [0.5, 1]) for (const late of [6, 12]) {
      const half = 7, centre = { x: -R, z: 0 };        // (heading +z, right is -x: the bend's centre is out to the right)
      let worst = 0;
      const seen = [];
      drive({
        side: -1, seconds: Math.PI * R / 2 / SPRINT,   // a quarter of a circle
        start: -SPRINT / R,                            // (the ordinary steering already had it turning with the bend)
        input: (t, { x, z, travel, state }) => {
          worst = Math.max(worst, Math.abs(Math.hypot(x - centre.x, z - centre.z) - R));
          const [ax, az] = ahead(x, z, travel, state.yawRate, look);
          seen.push(Math.hypot(ax - centre.x, az - centre.z) - R);       // + wide of the middle
          const was = seen[Math.max(0, seen.length - 1 - late)];
          return was > slack ? -1 : was < -slack ? 1 : 0;                // (right is -1: into this corner)
        },
      });
      assert.ok(worst < half - 2, `a ${R} m bend (looking ${look} s ahead, ${late / 60} s late): never more than ${worst.toFixed(1)} m off the middle of a ${2 * half} m road`);
    }
  }
});

test('drift: each dog\'s drift comes from its stats: agility tightens it, size slows its answer, the slow dogs\' perk widens its range', () => {
  const pippa = driftArc({ agility: 7 }), meela = driftArc({ agility: 5 }), ralph = driftArc({ agility: 9, size: 0.45, control: driftPerks('ralph').control });
  const jazz = driftArc({ agility: 10, size: 1.15 }), rocky = driftArc({ agility: 10, size: 1 });
  assert.ok(meela.base < pippa.base && meela.tight < pippa.tight, 'the greyhound drifts wider');
  assert.ok(ralph.tight > pippa.tight && ralph.steerRate > pippa.steerRate, 'the dachshund tighter and quicker');
  assert.ok(jazz.steerRate < rocky.steerRate && jazz.yawAccel < rocky.yawAccel, 'the Great Dane slower to answer than a collie of the same agility');
  assert.ok(rocky.tight > pippa.tight, 'the collie tight and precise');
  assert.ok(ralph.wide < driftArc({ agility: 9, size: 0.45 }).wide, 'a perk dog can open it wider too');
  assert.equal(driftCurvature(pippa, 0), pippa.base);
  assert.equal(driftCurvature(pippa, 5), pippa.tight);
});

test('drift: steering into the drift charges the sparks faster; steering out charges slowly', () => {
  assert.ok(driftChargeRate(7, 1) > driftChargeRate(7, 0) && driftChargeRate(7, 0) > driftChargeRate(7, -1));
  assert.equal(driftChargeRate(7, 1), 1);
});

test('drift: no sparks at first, then blue (the only colour), and letting go on blue is a Golden Bone\'s boost', () => {
  assert.deepEqual([0, 0.39, 0.4, 3, 9].map(driftTier), [0, 0, 1, 1, 1]);
  assert.equal(driftBoost(0), null, 'let go too soon: nothing');
  const blue = driftBoost(1);
  assert.deepEqual([blue.speed, blue.seconds, blue.quick, blue.kick, blue.easeOut, blue.super],
    [BONE_BOOST.speedMultiplier, BONE_BOOST.duration, BONE_BOOST.accelerationMultiplier, BONE_BOOST.instantKick, BONE_BOOST.easeOut, false]);
  assert.equal(driftBoostNow(1), BONE_BOOST.speedMultiplier);
  assert.equal(driftBoostNow(0), 1);
  assert.ok(driftBoostNow(BONE_BOOST.easeOut / 2) > 1 && driftBoostNow(BONE_BOOST.easeOut / 2) < BONE_BOOST.speedMultiplier, 'it fades out');
  // blue in about half a second for a dog of Drift 7 steering into the skid (it was about a second)
  assert.ok(DRIFT.tiers[0] / driftChargeRate(7, 1) <= 0.5);
});

test('drift: every dog has a Drift rating, and no faster dog is a better drifter than a slower one', () => {
  const dogs = Object.entries(DOG_STATS);
  for (const [id, stats] of dogs) assert.ok(stats.drift >= 1 && stats.drift <= 10, id);
  for (const [a, x] of dogs) for (const [b, y] of dogs) if (x.speed > y.speed) assert.ok(x.drift <= y.drift, `${a} is faster than ${b}`);
  // Ralph, the slowest, gets his sparks soonest; Meela, the fastest, latest
  const { ralph, second_dog: meela } = DOG_STATS;
  assert.ok(driftChargeRate(ralph.drift, 1) > 1.25 * driftChargeRate(meela.drift, 1));
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

test('drift: Enzo, Ralph, the pug twins and Jimmy get more from a skid: a little faster, tighter and wider steering, sparks sooner', async () => {
  assert.deepEqual(Object.keys(DRIFT_PERKS).sort(), ['baz_naz', 'enzo', 'jimmy', 'ralph']);
  assert.deepEqual(driftPerks('gsp'), { speed: DRIFT.speed, control: 1, charge: 1, boost: DRIFT_BOOST });
  for (const dog of Object.keys(DRIFT_PERKS)) {
    const perk = driftPerks(dog);
    assert.ok(perk.speed > DRIFT.speed && perk.speed <= 1.15, `${dog}: slightly faster than any dog in a skid, no more`);
    const own = driftArc({ control: perk.control }), plain = driftArc();
    assert.ok(own.tight > plain.tight && own.wide < plain.wide && own.wide > 0, `${dog}: tighter and wider both ways, still its own way round`);
    assert.equal(own.base, plain.base, 'the same curve with no arrow');
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

test('drift: for Enzo, Ralph, the twins and Jimmy, blue comes almost at once and letting go is a super boost; the other dogs get a bone\'s', () => {
  for (const dog of Object.keys(DRIFT_PERKS)) {
    const perks = driftPerks(dog), stat = DOG_STATS[dog].drift;
    assert.equal(driftBoost(0, perks), null, 'nothing before the sparks');
    const blue = driftBoost(1, perks);
    assert.ok(blue.super && blue.speed > BONE_BOOST.speedMultiplier && blue.seconds > BONE_BOOST.duration, `${dog}: more than a bone`);
    assert.equal(driftBoostNow(1, blue.speed, blue.easeOut), blue.speed);
    const wait = DRIFT.tiers[0] / driftChargeRate(stat, 1, perks.charge);
    assert.ok(wait < 0.2, `${dog}: blue in ${wait.toFixed(2)} s`);
  }
  for (const dog of ['gsp', 'second_dog', 'casper']) assert.deepEqual(driftBoost(1, driftPerks(dog)), DRIFT_BOOST, `${dog}: a bone's boost`);
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
  // it is steered for the player.  On its line and heading along the road: exactly as tight as the road bends
  const speed = 18, half = 10, on = { bend: left, speed, halfWidth: half, inside: AUTO_DRIFT.line * half, off: 0 };
  assert.ok(Math.abs(autoDriftCurvature(on) - left) < 1e-9, 'round with the road');
  assert.equal(autoDriftCurvature({ ...on, bend: -left }), autoDriftCurvature(on), 'either way');
  // out by the outside wall it turns in harder; right in by the inside wall, or already heading in too far, it eases off
  assert.ok(autoDriftCurvature({ ...on, inside: -9 }) > autoDriftCurvature(on));
  assert.ok(autoDriftCurvature({ ...on, inside: 9 }) < autoDriftCurvature(on));
  assert.ok(autoDriftCurvature({ ...on, off: 0.3 }) < autoDriftCurvature(on));
  assert.ok(autoDriftCurvature({ ...on, off: -0.3 }) > autoDriftCurvature(on));
  // the drift keeps it between the dog's own tightest and widest curves, and never turns it the other way
  const arc = driftArc(), state = driftSteering(1);
  for (let i = 0; i < 300; i++) driftStep(state, arc, { speed, dt: 1 / 60, curvature: autoDriftCurvature({ ...on, bend: 0.5 }) });
  assert.ok(Math.abs(state.yawRate - arc.tight * speed) < 1e-9, 'no tighter than its tightest');
  for (let i = 0; i < 300; i++) driftStep(state, arc, { speed, dt: 1 / 60, curvature: autoDriftCurvature({ ...on, bend: 0, off: 1 }) });
  assert.ok(Math.abs(state.yawRate - arc.wide * speed) < 1e-9 && state.yawRate > 0, 'no wider than its widest');
  assert.ok(AUTO_DRIFT.wall > 0 && AUTO_DRIFT.wall < 1, 'a wall costs less');
});

test('drift: a skid is a little faster than flat out from the start, and builds the longer it is held, then holds', () => {
  const plain = driftPerks('gsp'), slow = driftPerks('ralph');
  assert.equal(driftSpeedNow(0), DRIFT.speed);
  assert.ok(driftSpeedNow(1.5) > driftSpeedNow(0.5) && driftSpeedNow(0.5) > driftSpeedNow(0), 'builds');
  assert.equal(driftSpeedNow(DRIFT.speedSeconds), driftSpeedNow(10), 'then holds');
  assert.ok(driftSpeedNow(10) < DRIFT_BOOST.speed && driftSpeedNow(10, slow) < SUPER_DRIFT_BOOST.speed, 'never as fast as the boost out of it');
  assert.ok(driftSpeedNow(1, slow) > driftSpeedNow(1, plain), 'a slow dog stays ahead of the rest');
});
