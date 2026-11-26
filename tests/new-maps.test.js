import assert from 'node:assert/strict';
import { JUMP } from '../shared/handling.js';
import { test } from 'node:test';
import { DESERT } from '../shared/desertData.js';
import { SPEED_BOWL } from '../shared/speedBowlData.js';
import { KOMBU_HOUSE } from '../shared/kombuHouseData.js';
import { NEON } from '../shared/neonData.js';
import { MAPS, PROCEDURAL_TRACKS, lapsFor } from '../shared/maps.js';
import { GRAND_PRIX } from '../shared/grandPrix.js';
import { TREAT_BOXES_BY_MAP } from '../shared/treatBoxes.js';
import { GOLDEN_BONE_SPOTS } from '../shared/pickupSpots.js';
import { BURROWS } from '../shared/burrows.js';
import { BONE_BOOST } from '../shared/items.js';

const TRACKS = [DESERT, SPEED_BOWL, KOMBU_HOUSE, NEON];
const at = (T, s, lateral = 0) => { const p = T.pointAt(s, lateral); return T.query(p.x, p.z); };

test('the four kit-made maps: closed laps with a grid of six, checkpoints in order, walls all the way round, Ralph\'s two burrows, and a Grand Prix of their own', () => {
  for (const T of TRACKS) {
    assert.equal(MAPS[T.id].procedural, true);
    assert.equal(MAPS[T.id].startPositions.length, 6);
    for (let i = 1; i < T.checkpoints.length; i++) assert.ok(T.checkpoints[i].s > T.checkpoints[i - 1].s);
    for (const start of T.startPositions) { const q = T.query(start.position[0], start.position[2]); assert.ok(q.onTrack && !q.blocked && !q.mud && !q.inWater, `${T.id}: a clear grid`); }
    for (let s = 0; s < T.length; s += 9) {
      if (T.isGap(s)) continue;
      const br = T.branchAt(s), p = T.pointAt(s, -(br?.side ?? 1) * (T.pointAt(s).halfWidth + 3)), q = T.query(p.x, p.z);       // (the side with no second road)
      assert.ok(q.blocked && q.onTrack, `${T.id}: held at the edge at ${s} m, not a fall`);
    }
    assert.equal(BURROWS[T.id].length, 2, `${T.id}: Ralph's burrows`);
    assert.ok(GOLDEN_BONE_SPOTS[T.id].length >= 4);
    // nothing that moves is on the grid when the race starts
    for (const start of T.startPositions) for (const t of [0, 1, 2]) assert.equal(T.hazardHit(start.position, t), null, `${T.id}: the grid is safe at GO`);
  }
  assert.deepEqual(GRAND_PRIX.gp3.maps, ['desert_dunes', 'speed_bowl', 'kombu_house', 'neon_nexus']);
});

test('the Speed Bowl: the shortest lap, five of them, nothing in the way, six rows of five Treat Boxes and a pair of bones between each', () => {
  const T = SPEED_BOWL;
  assert.equal(lapsFor('speed_bowl'), 5);
  assert.equal(lapsFor('wendover'), 3);
  for (const [id, map] of Object.entries(MAPS)) if (map.procedural && id !== 'speed_bowl') assert.ok(MAPS.speed_bowl.checkpoints.length <= map.checkpoints.length, `no longer than ${id}`);
  assert.ok(T.length > 420 && T.length < 580, `${T.length} m`);
  // no bombs, no boost pads
  assert.equal(T.strips.length, 0);
  assert.equal(T.hazardsAt(3).length, 0);
  const boxes = TREAT_BOXES_BY_MAP.speed_bowl, rows = new Map();
  for (const box of boxes) rows.set(box.s, (rows.get(box.s) ?? 0) + 1);
  assert.equal(rows.size, 6);
  for (const count of rows.values()) assert.equal(count, 5, 'five across');
  for (const box of boxes) assert.equal(T.query(box.groundPosition[0], box.groundPosition[2]).blocked, false);
  // a row going into and coming out of each bend, and one in the middle of each straight
  const sections = [...rows.keys()].map(s => T.pointAt(s).section).sort().join('');
  assert.equal(sections, 'ABBCDD');
  assert.equal(GOLDEN_BONE_SPOTS.speed_bowl.length, 12);
});

test('Dune Dash: soft sand is slow, whirlwinds cannot be jumped, tumbleweed can; no leap any more, but the sinkhole (Tom, 2026-11-21)', () => {
  const T = DESERT, sand = T.mud[0], inSand = at(T, sand.s, sand.lateral);
  assert.ok(inSand.mud && T.speedFactor(inSand) < 0.65);
  assert.equal(at(T, sand.s, -sand.lateral).mud, false, 'there is firm sand past each patch');
  for (const rock of T.obstacles) { assert.ok(T.query(rock.x, rock.z).blocked); assert.equal(at(T, rock.s, -rock.lateral).blocked, false); }
  const twister = T.hazardsAt(3).find(h => h.kind === 'twister'), weed = T.hazardsAt(1).find(h => h.kind === 'tumbleweed' && h.active);
  assert.equal(T.hazardHit([twister.x, twister.y + 6, twister.z], 3)?.kind, 'twister');
  assert.equal(T.hazardHit([weed.x, weed.y, weed.z], 1)?.kind, 'tumbleweed');
  assert.equal(T.hazardHit([weed.x, weed.y + 1.4, weed.z], 1), null);
  for (let t = 0; t < 60; t += 0.7) for (const h of T.hazardsAt(t)) if (h.kind === 'twister') assert.ok(T.query(h.x, h.z).distance < T.query(h.x, h.z).halfWidth, 'the whirlwinds stay on the flats');
  assert.equal(T.launch, undefined, 'no leap');
  // the sinkhole: slow and dragging towards the middle near it, swallowing at the middle unless the dog is in the air; firm going either side
  const hole = T.sinkholes[0], edge = T.query(hole.x + hole.radius - 1, hole.z), middle = T.query(hole.x + 1, hole.z), beside = at(T, hole.s, T.pointAt(hole.s).halfWidth - 1);
  assert.ok(edge.mud && T.speedFactor(edge) < 0.6 && edge.pull[0] < 0, 'dragged in');
  assert.ok(middle.gap && T.rules.gapClearance < 1, 'swallowed (a fall), unless in the air');
  assert.ok(!beside.mud && !beside.gap, 'room to go round it');
  // more turns: no straight longer than the start
  const S = T.samples, N = T.sampleCount, step = T.length / N, w = Math.round(30 / step), heading = i => Math.atan2(S.tangentX[i % N], S.tangentZ[i % N]);
  let run = 0, longest = 0;
  for (let i = 0; i < 2 * N; i++) { let d = heading(i + w) - heading(i); d = Math.atan2(Math.sin(d), Math.cos(d)); run = Math.abs(d) < 10 * Math.PI / 180 ? run + 1 : 0; longest = Math.max(longest, run); }
  assert.ok(Math.min(longest, N) * step < 170, `longest straight ${Math.round(longest * step)} m`);
});

test('Kombu\'s House: up the drive, in at the glass doors, the living room, round the pool room and out of the same doorway, the kitchen, up in the lift, the hallway, the computer room, the dog pen, the hill, the back drive and the road', () => {
  const T = KOMBU_HOUSE, S = T.samples, P = T.places;
  // the rooms come in the order the dogs go through them
  assert.equal(T.sections.map(sec => sec.id).join(''), 'ABCDEFGHIJKLMNA');
  assert.deepEqual(T.sections.slice(0, 14).map(sec => sec.name), ['The Drive', 'The Conservatory', 'The Living Room', 'The Pool Room', 'The Living Room', 'The Kitchen', 'The Lift', 'The Hallway', 'The Computer Room', 'The Terrace', 'The Dog Pen', 'Chicken Hill', 'The Back Drive', 'The Main Road']);
  assert.ok(T.length > 1400 && T.length < 1650, `${T.length} m`);
  // which way a dog is heading at a place on the plan.  In the game a dog running +z has +x on its LEFT (a left turn adds to its rotation).
  const heading = u => { const p = T.pointAt(T.sAtU(u)); return [Math.sin(p.rotationY), Math.cos(p.rotationY)]; };
  const leftOf = ([x, z]) => [z, -x], rightOf = ([x, z]) => [-z, x], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const turns = (from, to, way, what) => assert.ok(dot(heading(to), way(heading(from))) > 0.85, what);
  assert.ok(dot(heading(P.glass), [0, 1]) > 0.98, 'straight in at the glass doors');
  assert.ok(T.pointAt(T.sAtU(P.glass)).x > T.pointAt(T.sAtU(1)).x + 4, 'which are to the left of the drive');
  turns(P.living + 1, P.poolIn, leftOf, 'left out of the living room into the pool room');
  assert.ok(dot(heading(P.poolIn + 1), leftOf(heading(P.poolIn))) > 0.2, 'and left again inside it');
  // ...round through the pool and out of the same doorway: the two ways through it are side by side, going opposite ways
  const goingIn = T.pointAt(T.sAtU(P.poolIn)), comingOut = T.pointAt(T.sAtU(P.poolOut)), apart = Math.hypot(goingIn.x - comingOut.x, goingIn.z - comingOut.z);
  assert.ok(apart > 12 && apart < 22, `${apart} m between the way in and the way out`);
  assert.ok(dot(heading(P.poolIn), heading(P.poolOut)) < -0.9);
  turns(P.poolOut, P.kitchen, leftOf, 'left out of the pool room to the kitchen');
  turns(P.kitchen + 2, P.lobby + 0.5, leftOf, 'left out of the kitchen to the lift');
  turns(P.glass2, P.pen + 1, leftOf, 'left out of the glass doors into the dog pen');
  turns(P.hill + 1.5, P.backDrive + 1, rightOf, 'right off the hill down the back drive');
  turns(P.backDrive + 6, P.road + 1.5, rightOf, 'right on to the main road');
  turns(P.road + 1.5, 1, rightOf, 'right into the drive');
  // doorways are narrow, the rooms either side of them wide
  assert.equal(T.doors.length, 8);
  for (const d of T.doors) { assert.ok(T.pointAt(d.s).halfWidth <= d.width / 2 + 0.01); assert.ok(at(T, d.s, d.width / 2 + 1).blocked, 'the door frame'); assert.equal(at(T, d.s, 0).blocked, false); }
  assert.deepEqual(T.doors.filter(d => d.kind === 'glass').map(d => T.pointAt(d.s + 3).section), ['B', 'J']);
  assert.ok(T.pointAt(T.living.sStart + 20).halfWidth > 9 && T.pointAt(T.kitchen.sStart + 20).halfWidth > 9 && T.pointAt(T.computer.sStart + 20).halfWidth > 9);
  // the lap passes close beside itself (the pool room doorway) and the floor above is over nothing the dogs use below: wherever
  // a dog stands on the road, it is found on its own stretch of it
  for (let i = 0; i < T.sampleCount; i++) for (const share of [-0.95, 0, 0.95]) {
    if (T.isGapSegment(i)) continue;
    const lateral = share * (S.width[i] / 2 - 0.7), q = T.query(S.x[i] + S.normalX[i] * lateral, S.z[i] + S.normalZ[i] * lateral);
    assert.ok(Math.abs(T.along(q.s, S.s[i])) < 12, `at ${S.s[i]} m`);
  }
  // things in the way
  for (const thing of T.obstacles) assert.ok(T.query(thing.x, thing.z).blocked, thing.id);
  for (const kind of ['sofa', 'desk', 'kennel', 'van']) assert.ok(T.obstacles.some(o => o.kind === kind), kind);
  // the toy car goes all round the living room, and nothing jumps it
  const cars = []; for (let t = 0; t < T.carRun.period; t += 0.25) cars.push(T.hazardsAt(t).find(h => h.id === 'toy-car'));
  for (const car of cars) { const q = T.query(car.x, car.z); assert.equal(q.section, 'C'); assert.ok(Math.abs(q.lateral) < q.halfWidth - car.radius); }
  assert.ok(Math.max(...cars.map(car => T.query(car.x, car.z).s)) - Math.min(...cars.map(car => T.query(car.x, car.z).s)) > 25);
  assert.equal(T.hazardHit([cars[3].x, cars[3].y + 3, cars[3].z], 0.75)?.kind, 'toy car');
  // the pool: shallow at each end, deep in the middle, and all of it in the pool room
  const mid = (T.pool.sStart + T.pool.sEnd) / 2, deep = at(T, mid), edge = at(T, T.pool.sStart + 2);
  assert.equal(deep.movement, 'swim');
  assert.equal(edge.movement, 'wade');
  assert.equal(T.pointAt(T.pool.sStart).section, 'D');
  assert.equal(T.pointAt(T.pool.sEnd).section, 'D');
  assert.ok(T.pool.sEnd - T.pool.sStart > 60, 'a good length of it');
  const share = swimming => T.speedFactor(deep, { swimming: swimming / 10 });
  assert.ok(Math.abs(share(10) - 0.9) < 1e-9 && Math.abs(share(4) - 0.6) < 1e-9, 'Poppy keeps 90 % of her speed; a poor swimmer 60 %');
  // the kitchen: knives and forks come down where their shadows were, stand in the floor and go; there is always a way through each row
  const one = T.cutleryDrops[0], C = T.cutlery, when = phase => phase - one.offset + C.period * 2, seen = t => T.hazardsAt(t).find(h => h.id === one.id);
  assert.ok(!seen(when(0.5)).active && seen(when(0.5)).warning > 0 && seen(when(0.5)).drop > 10, 'a shadow first, the knife still high up');
  assert.ok(seen(when(C.warn + C.fall + 0.3)).active && seen(when(C.warn + C.fall + 0.3)).drop === 0, 'then it is standing in the floor');
  assert.equal(T.hazardHit([seen(0).x, seen(0).y, seen(0).z], when(C.warn + C.fall + 0.3))?.id, one.id);
  assert.ok(!seen(when(C.period - 0.3)).active, 'and then it is gone');
  assert.ok(T.cutleryDrops.some(d => d.kind === 'knife') && T.cutleryDrops.some(d => d.kind === 'fork') && T.cutleryDrops.length >= 15);
  for (let t = 0; t < 40; t += 0.2) { const down = T.hazardsAt(t).filter(h => h.active && (h.kind === 'knife' || h.kind === 'fork')); for (const d of T.cutleryDrops.filter(d => d.id.endsWith('-0'))) assert.ok(down.filter(h => h.id.startsWith(d.id.slice(0, -1))).length < 3, 'never all three of a row at once'); }
  const kettles = [0, 2, 4, 6].map(t => T.hazardsAt(t).find(h => h.id === 'kettle'));
  for (const kettle of kettles) assert.equal(T.query(kettle.x, kettle.z).section, 'F');
  assert.ok(Math.hypot(kettles[0].x - kettles[1].x, kettles[0].z - kettles[1].z) > 4, 'the kettle moves about');
  // the lift: in at the bottom, straight up the shaft, out on the floor above
  const L = T.launch, bottom = T.launchPoint(0), half = T.launchPoint(L.duration / 2), top = T.launchPoint(L.duration), land = T.pointAt(L.landingS);
  assert.equal(L.lift, true);
  assert.equal(T.pointAt(L.takeoffS).section, 'G');
  assert.ok(Math.abs(bottom.y - T.floor) < 0.05 && Math.abs(top.y - T.upstairs) < 0.05 && T.upstairs - T.floor > 8);
  assert.ok(half.y > bottom.y + 3 && half.y < top.y - 3);
  const quarter = T.launchPoint(L.duration * 0.3), threeQuarters = T.launchPoint(L.duration * 0.75);
  assert.ok(Math.hypot(quarter.x - threeQuarters.x, quarter.z - threeQuarters.z) < 0.01, 'straight up');
  assert.ok(Math.hypot(top.x - land.x, top.z - land.z) < 0.01);
  assert.ok(T.pointAt(L.gapStart - 1).y < 1 && T.pointAt(L.gapEnd + 1).y > 9.9, 'the floor stops at the shaft and starts again at the top of it');
  assert.ok(MAPS.kombu_house.checkpoints.some(cp => cp.launchLanding));
  assert.equal(T.drops.length, 0, 'nothing to fall off the end of');
  // the hallway: five doors, hinged on one wall and then the other, swinging both ways
  assert.equal(T.swingDoors.length, 5);
  for (const d of T.swingDoors) {
    assert.equal(T.pointAt(d.s).section, 'H');
    const tips = []; for (let t = 0; t < T.swing.period; t += 0.1) tips.push(T.hazardsAt(t).find(h => h.id === `${d.id}-2`));
    const where = tips.map(tip => T.along(T.query(tip.x, tip.z).s, d.s));
    assert.ok(Math.max(...where) > 4 && Math.min(...where) < -4, 'up the hall and down it');
    // right across the hall it leaves room to pass on the other side
    const across = tips.reduce((a, b) => (Math.abs(T.along(T.query(a.x, a.z).s, d.s)) < Math.abs(T.along(T.query(b.x, b.z).s, d.s)) ? a : b)), q = T.query(across.x, across.z);
    assert.ok(q.halfWidth - Math.abs(q.lateral) > 4.5 || Math.sign(q.lateral) !== d.side, `${d.id}: room to pass`);
  }
  assert.notEqual(T.swingDoors[0].side, T.swingDoors[1].side);
  // the man in the wheelchair goes from wall to wall, up and down the computer room, and never leaves it
  const chairs = []; for (let t = 0; t < 34; t += 0.25) chairs.push(T.hazardsAt(t).find(h => h.id === 'wheelchair'));
  for (const chair of chairs) { const q = T.query(chair.x, chair.z); assert.equal(q.section, 'I'); assert.ok(Math.abs(q.lateral) < q.halfWidth - chair.radius); }
  assert.ok(Math.max(...chairs.map(c => T.query(c.x, c.z).lateral)) - Math.min(...chairs.map(c => T.query(c.x, c.z).lateral)) > 8);
  assert.ok(Math.max(...chairs.map(c => T.query(c.x, c.z).s)) - Math.min(...chairs.map(c => T.query(c.x, c.z).s)) > 25);
  assert.equal(T.hazardHit([chairs[5].x, chairs[5].y, chairs[5].z], 1.25)?.kind, 'wheelchair');
  // out on the hill the floor above is at ground level, and the back drive runs down to the road
  assert.ok(T.pointAt(T.sAtU(P.pen + 1)).y > 9.5 && T.pointAt(T.sAtU(P.hill + 1.5)).y > 10.5);
  for (let u = P.backDrive; u < P.road - 1; u += 0.5) assert.ok(T.pointAt(T.sAtU(u + 0.5)).y <= T.pointAt(T.sAtU(u)).y + 0.02, 'downhill all the way');
  assert.ok(T.pointAt(T.sAtU(P.road + 1)).y < 0.1);
  // nothing to pick up is inside anything, in the water or where something moves
  for (const box of TREAT_BOXES_BY_MAP.kombu_house) { const q = T.query(box.groundPosition[0], box.groundPosition[2]); assert.ok(!q.blocked && !q.mud && !q.inWater, box.id); assert.ok(!'CFI'.includes(q.section), box.id); for (let t = 0; t < 12; t += 0.2) assert.equal(T.hazardHit(box.groundPosition, t), null, `${box.id}: nothing swings or drives over it`); }
  for (const bone of GOLDEN_BONE_SPOTS.kombu_house) { const q = T.query(bone.x, bone.z); assert.ok(!q.blocked && !q.inWater && Math.abs(q.lateral) < q.halfWidth - 1, `bone at ${bone.s}`); }
});

test('Neon Nexus, the Undercity (Tom, 2026-11-21): every platform a boost; miss a jump and land below, past the robots, and a lift back up', () => {
  const T = NEON;
  T.setClock(3);
  // a boost on every platform, wherever it has slid to
  for (const zone of T.platforms) for (const pad of zone.pads) { const p = T.padAt(pad), q = T.query(p.x, p.z, -1, p.y); assert.ok(q.kick?.speed > 1 && !q.gap, pad.id); }
  // over a gap between two platforms, the ground is the Undercity, `depth` metres down: a dog falls to it and races on
  assert.equal(T.undercity.length, T.platforms.length, 'one under each crossing');
  for (const zone of T.platforms) {
    const s = zone.pads[0].s1 + 4, up = T.pointAt(s), q = T.query(up.x, up.z, -1, up.y);
    const u = T.underAt(s);
    assert.ok(u && q.level === u.id && q.onTrack && !q.gap && Math.abs(up.y - u.depth - q.y) < 0.01, zone.id);
    const without = T.query(up.x, up.z);
    assert.ok(without.gap && !without.level, '(asked without a height: the main road, as before)');
  }
  // down there all the way to its lift (it carries on under the road past the crossing), and up on the road above it is the road
  for (const u of T.undercity) {
    for (let s = u.sStart + 2; s < u.sEnd - 2; s += 10) { const p = T.pointAt(s), low = T.query(p.x, p.z, -1, p.y - u.depth + 0.1); assert.equal(low.level, u.id, `${u.id} at ${s}`); }
    const p = T.pointAt(u.sEnd - 12); assert.equal(T.query(p.x, p.z, -1, p.y).level, undefined);
    // its lift: from the bottom to the road above, landing short of the next catapult
    const lift = T.launches.find(l => l.under === u.id), bottom = T.launchPoint(0, 0, lift), top = T.launchPoint(lift.duration, 0, lift);
    assert.ok(Math.abs(bottom.y - (T.pointAt(lift.takeoffS).y - u.depth)) < 0.01 && Math.abs(top.y - T.pointAt(lift.landingS).y) < 0.01);
    const next = T.launches.filter(l => !l.under && l.padStart > lift.landingS).sort((a, b) => a.padStart - b.padStart)[0];
    assert.ok(next.padStart - lift.landingS > 6, 'room to land before the catapult');
    assert.ok(!T.isGap(lift.takeoffS + 2), 'the road above the lift is whole');
  }
  // a fall costs about two seconds (Tom, 2026-11-23): each Undercity ends just past its own crossing, and its floor runs a dog along
  // as fast as the platforms above do
  for (const zone of T.platforms) {
    const u = T.underAt(zone.sStart + 20), lift = T.launches.find(l => l.under === u.id);
    assert.ok(u.sEnd > zone.sEnd && u.sEnd - zone.sEnd < 30 && lift.landingS - zone.sEnd < 40, `${zone.id}: up again just past it`);
    const p = T.pointAt(zone.sStart + 20), q = T.query(p.x, p.z, -1, p.y - u.depth + 0.1);
    assert.ok(q.level === u.id && q.boost >= zone.boost.speed && T.speedFactor(q) > 1.5, `${zone.id}: a fast floor down there`);
  }
  // the robots: down there, too tall to jump; every so often each fires a ring of lightning, with a warning first
  assert.ok(T.robots.length >= 6);
  let warned = false, zapped = false;
  for (let t = 0; t < T.robot.every * 2; t += 0.05) {
    const h = T.hazardsAt(t), body = h.find(each => each.id === 'robot-0'), zap = h.find(each => each.id === 'robot-0-zap');
    assert.ok(body.height > JUMP.force ** 2 / (2 * JUMP.gravity));
    if (body.warn > 0) warned = true;
    if (zap.active) { zapped = true; assert.ok(warned); }
  }
  assert.ok(zapped);
  // a dog down there that runs into one is hit; one up on the road over it is not
  const robot = T.hazardsAt(2).find(h => h.id === 'robot-0');
  assert.equal(T.hazardHit([robot.x, robot.y, robot.z], 2)?.kind, 'robot');
  const above = T.pointAt(T.query(robot.x, robot.z).s);
  assert.equal(T.hazardHit([robot.x, above.y, robot.z], 2), null);
  // a chew toy dropped on a platform goes along with it
  const pad = T.platforms[0].pads[1], at3 = T.padAt(pad, 3), ride = T.rideAt(at3.x, at3.z, 3), later = T.ridePosition(ride, 5), at5 = T.padAt(pad, 5);
  assert.ok(ride && Math.hypot(later[0] - at5.x, later[2] - at5.z) < 0.5);
});

test('Neon Nexus: the longest lap, three of them and fast; mega pads and three catapults; four pairs of roads where the longer has the bones; platform crossings; the accelerator; no bombs', () => {
  const T = NEON;
  assert.ok(T.length > 4900 && T.length < 5000, `${T.length} m`);
  assert.equal(lapsFor('neon_nexus'), 3);
  for (const [id, map] of Object.entries(MAPS)) if (map.procedural) assert.ok(T.length >= PROCEDURAL_TRACKS[id].length, `longer than ${id}`);
  // nothing that knocks a dog over up on the road: the robots are all down in the Undercity
  for (const h of T.hazardsAt(3)) assert.ok(T.pointAt(T.query(h.x, h.z).s).y - h.y > 10, `${h.id} is below`);
  // not a circle: it goes there and back across the city, so the same x is passed many times
  let crossings = 0; for (let i = 0; i < T.sampleCount; i++) if ((T.samples.x[i] - 100) * (T.samples.x[(i + 1) % T.sampleCount] - 100) < 0) crossings++;
  assert.ok(crossings >= 4, `${crossings} crossings`);
  // more boost pads than any other map, none of them on a crossing.  The boost stays with the dog after the pad;
  // mega pads on the one road, ordinary pads on the other wherever there are two
  assert.ok(T.strips.length >= 40);
  for (const strip of T.strips) {
    const s = (strip.sStart + strip.sEnd) / 2, br = T.branchAt(s), q = at(T, s, strip.branch ? br.side * br.centre : 0);
    assert.equal(q.kick?.id, strip.id); assert.ok(strip.hold >= 2 && strip.speed > 1.5);
    assert.ok(!T.isHole(strip.sStart) && !T.isHole(strip.sEnd) && !T.isGap(strip.sStart) && !T.isGap(strip.sEnd));
    if (br) { const other = T.strips.find(o => o !== strip && Math.abs(o.sStart - strip.sStart) < 1); assert.ok(other && Boolean(other.mega) !== Boolean(strip.mega) && Boolean(other.branch) !== Boolean(strip.branch)); assert.equal(Boolean(strip.mega), (br.branch.kind === 'long') === Boolean(strip.branch)); }
    else assert.ok(strip.mega);
  }
  // three catapults, the accelerator the first of them; every one has its own landing gate (and a lift up from each Undercity)
  assert.equal(T.launches.filter(l => !l.under).length, 3);
  assert.equal(T.launches.filter(l => l.lift && l.under).length, T.undercity.length);
  assert.equal(T.checkpoints.filter(cp => cp.launchLanding).length, 3);
  for (const l of T.launches.filter(each => !each.under)) { const end = T.launchPoint(l.duration, 0, l), land = T.pointAt(l.landingS); assert.ok(Math.hypot(end.x - land.x, end.z - land.z) < 0.01 && l.gapEnd - l.gapStart > 240); }

  assert.equal(T.branches.length, 4);
  const lengths = b => {
    let main = 0, other = 0, a = null, c = null;
    for (let s = b.sStart; s <= b.sEnd; s += 1) { const br = T.branchAt(s), m = T.pointAt(s), o = T.pointAt(s, br ? br.side * br.centre : 0); if (a) { main += Math.hypot(m.x - a.x, m.z - a.z); other += Math.hypot(o.x - c.x, o.z - c.z); } a = m; c = o; }
    return { main, other };
  };
  const bonesOf = b => GOLDEN_BONE_SPOTS.neon_nexus.filter(bone => bone.s > b.sStart && bone.s < b.sEnd).map(bone => Boolean(T.query(bone.x, bone.z).lane));
  for (const b of T.branches) {
    const mid = (b.sStart + b.sEnd) / 2, br = T.branchAt(mid), hw = T.pointAt(mid).halfWidth;
    // two roads with a gap between them: a dog can stand on either, and not between
    assert.ok(br.open);
    const onMain = at(T, mid, 0), onOther = at(T, mid, b.side * br.centre), between = at(T, mid, b.side * (hw + br.centre - br.half) / 2);
    assert.ok(!onMain.blocked && !onMain.lane);
    assert.ok(!onOther.blocked && onOther.lane?.id === b.id);
    assert.ok(between.blocked);
    assert.ok(Math.abs(onOther.trackY - onMain.trackY) > 6, 'at a height of its own');
    for (const s of [b.sStart + 4, b.sEnd - 4]) assert.equal(at(T, s, b.side * (T.pointAt(s).halfWidth - 1)).blocked, false);
    assert.equal(T.branchAt(b.sStart - 5), null);
    // similar distances, but one is the longer: and all the bones are on the longer
    const { main, other } = lengths(b), longOnBranch = other > main, long = Math.max(main, other), short = Math.min(main, other);
    assert.ok(long - short > 15 && long - short < 0.2 * short, `${b.id}: ${Math.round(main)} m and ${Math.round(other)} m`);
    assert.equal(longOnBranch, b.kind === 'long');
    const bones = bonesOf(b);
    assert.ok(bones.length >= 6, `${b.id}: ${bones.length} bones`);
    assert.ok(bones.every(onBranch => onBranch === longOnBranch), 'the bones are on the longer road');
    // risk and reward: boosted all the way down the trail the longer road is the quicker; with no bones it is the slower.
    // (a bone is 130% speed for 2 s and half a second fading: about 2.25 s at full strength)
    const pace = 18, reach = pace * BONE_BOOST.speedMultiplier * (BONE_BOOST.duration + BONE_BOOST.easeOut / 2);
    const boosted = Math.min(long, bones.length * reach), withBones = boosted / BONE_BOOST.speedMultiplier + (long - boosted);
    assert.ok(withBones < short - 5, `${b.id}: ${Math.round(withBones)} m of running against ${Math.round(short)}`);
    assert.ok(long > short);
    // with only a third of the bones it is still the slower road
    const few = Math.min(long, Math.floor(bones.length / 3) * reach);
    assert.ok(few / BONE_BOOST.speedMultiplier + (long - few) > short, `${b.id}: a third of the bones is not enough`);
    // a checkpoint beside it can be passed from either road
    for (const cp of MAPS.neon_nexus.checkpoints) { const q = T.query(cp.x, cp.z); if (T.along(q.s, b.sStart) > 0 && T.along(q.s, b.sEnd) < 0) { const o = T.branchAt(q.s), p = T.pointAt(q.s, o.side * o.centre); assert.ok(Math.hypot(p.x - cp.x, p.z - cp.z) <= cp.radius); } }
    // boxes on both roads in the middle of it
    const row = TREAT_BOXES_BY_MAP.neon_nexus.filter(box => Math.abs(box.s - mid) < 40).map(box => Boolean(T.query(box.groundPosition[0], box.groundPosition[2]).lane));
    assert.ok(row.includes(true) && row.includes(false));
  }

  // the platform crossings: no road, three platforms sliding from side to side, breaks between to jump
  assert.equal(T.platforms.length, 3);
  for (const zone of T.platforms) {
    assert.equal(zone.pads.length, 3);
    assert.equal(T.branchAt(zone.sStart), null);
    for (const t of [0, 1.7, 3.3, 5.9]) {
      T.setClock(t);
      const pad = zone.pads[1], lateral = T.padLateral(pad, t), mid = (pad.s0 + pad.s1) / 2;
      assert.equal(at(T, mid, lateral).gap, false, 'on the platform');
      assert.equal(at(T, mid, lateral - Math.sign(lateral || 1) * (pad.half + 1.5)).gap, true, 'off the side of it');
      assert.equal(at(T, pad.s0 - 3, lateral).gap, true, 'in the break before it');
      // there is always a line from each platform to the next
      for (let k = 0; k < 2; k++) assert.ok(Math.abs(T.padLateral(zone.pads[k], t) - T.padLateral(zone.pads[k + 1], t)) < pad.half * 1.2);
    }
    // it moves
    assert.ok(Math.abs(T.padLateral(zone.pads[0], 0) - T.padLateral(zone.pads[0], 2)) > 2);
    assert.equal(at(T, zone.sStart - 4).gap, false);
    assert.equal(at(T, zone.sEnd + 4).gap, false);
    // a dog that drops starts the crossing again: the checkpoint it goes back to is just before it
    const before = T.checkpoints.filter(cp => cp.s < zone.sStart).at(-1);
    assert.ok(zone.sStart - before.s > 8 && zone.sStart - before.s < 25, `${zone.id}: ${zone.sStart - before.s} m`);
    assert.ok(!T.checkpoints.some(cp => cp.s > zone.sStart && cp.s < zone.sEnd));
    for (const s of [...TREAT_BOXES_BY_MAP.neon_nexus.map(box => box.s), ...GOLDEN_BONE_SPOTS.neon_nexus.map(bone => bone.s)]) assert.ok(!(s > zone.sStart - 30 && s < zone.sEnd + 10));
  }
  T.setClock(0);
  assert.equal(T.rules.gapClearance, 0.2);

  // the accelerator: by far the longest shot in the game, and the longest boost on landing
  const gap = T.launch.gapEnd - T.launch.gapStart;
  assert.ok(gap > 240, `${gap} m`);
  assert.ok(T.launch.duration > 3 && T.launch.boostSeconds >= 2 && T.launch.exitSpeedMultiplier > 1.4);
  const top = T.launchPoint(T.launch.duration / 2);
  assert.ok(top.y > T.pointAt(T.launch.takeoffS).y + 25, 'high over the city');
  const landed = T.launchPoint(T.launch.duration), land = T.pointAt(T.launch.landingS);
  assert.ok(Math.hypot(landed.x - land.x, landed.z - land.z) < 0.01);
});

test('a hazard on a hill is cleared by a jump of its own height, measured from the ground each is on (the cheeses on the Dales)', async () => {
  const { DALES } = await import('../shared/dalesData.js');
  const { pull, cheeseRun } = DALES;
  // a moment when a cheese is rolling, somewhere on the climb (a steady 5 %: Tom, 2026-11-21) where the road is not bending
  let found = null;
  for (let t = 0; t < 60 && !found; t += 0.25) {
    for (const h of DALES.hazardsAt(t)) {
      if (h.kind !== 'cheese' || !h.active) continue;
      const q = DALES.query(h.x, h.z);
      // (on a straight-ish leg of the zig-zags: round a hairpin, 1.5 m back along the road is further than 1.5 m from it)
      if (q.s > pull.sStart + 20 && q.s < pull.sEnd - 20 && Math.abs(q.grade) > 0.04 && Math.abs(q.curvature) < 1 / 60) { found = { t, h, q }; break; }
    }
  }
  assert.ok(found, 'a cheese rolling on the steep part of the climb');
  const { t, h, q } = found;
  // the dog is a metre and a half down the road from it (lower ground), coming up
  const downhill = DALES.pointAt(q.s - 1.5, q.lateral);
  const ground = DALES.query(downhill.x, downhill.z).trackY;
  assert.ok(h.y - ground > 0.05, 'the cheese stands on higher ground than the dog');
  assert.ok(Math.hypot(downhill.x - h.x, downhill.z - h.z) <= cheeseRun.radius + 1, 'near enough to be hit');
  assert.equal(DALES.hazardHit([downhill.x, ground, downhill.z], t)?.id, h.id, 'on the ground: hit');
  assert.equal(DALES.hazardHit([downhill.x, ground + 0.6, downhill.z], t)?.id, h.id, 'a low hop: hit');
  assert.equal(DALES.hazardHit([downhill.x, ground + h.height + 0.15, downhill.z], t), null, 'a jump of the height of the cheese clears it');
});

test('Wendover Woods, remade (Tom, 2026-11-21) and made the fast flagship (Tom, 2026-11-26): the Speed Tunnel, the beck, the two paths, the ridge, the long drift and the fallen trees', async () => {
  const { WENDOVER_WOODS: T } = await import('../shared/wendoverWoodsData.js');
  const at = (s, lateral = 0) => { const p = T.pointAt(s, lateral); return T.query(p.x, p.z, -1, p.y); };
  // the start where it always was: at the origin, running along +x; and the lap the length it was ("the same length")
  assert.ok(Math.hypot(T.startFinish.position[0], T.startFinish.position[2]) < 1 && Math.abs(Math.sin(T.startFinish.rotationY) - 1) < 0.05);
  assert.ok(Math.abs(T.length - 1787) < 25, `${T.length.toFixed(0)} m`);
  // Bluebell Run: steeply downhill
  const bluebell = T.sections.find(sec => sec.id === 'B');
  assert.ok(T.pointAt(bluebell.sStart).y - T.pointAt(bluebell.sEnd).y > 9);
  // the Speed Tunnel: narrow, twice as long as the hollow log was, and a boost all the way through
  const mid = (T.hollow.sStart + T.hollow.sEnd) / 2;
  assert.ok(T.pointAt(mid).halfWidth <= 4.6 && at(mid, 6).blocked && T.hollow.sEnd - T.hollow.sStart >= 80);
  for (let s = T.hollow.sStart + 6; s < T.hollow.sEnd - 6; s += 5) assert.ok(at(s).kick, `no boost in the tunnel at ${s.toFixed(0)} m`);
  // the beck: deep enough to swim, short enough to jump off the ramp, which is right across the path with a boost pad in front of it
  // (Tom, 2026-11-26: on one half only, a dog on the other half missed the jump and the boost)
  assert.equal(at((T.beck.sStart + T.beck.sEnd) / 2).movement, 'swim');
  const ramp = T.beckRamp, rampMid = (ramp.sStart + ramp.sEnd) / 2;
  for (const lateral of [-5, -2.5, 0, 2.5, 5]) { assert.ok(at(rampMid, lateral).hop, `no ramp ${lateral} m across`); assert.ok(at(ramp.sStart - 6, lateral).kick, `no boost in front of the ramp ${lateral} m across`); }
  assert.ok(17 * 2 * ramp.hop / 16 > T.beck.sEnd - ramp.sEnd + 1.5, 'a dog at a run flies the whole pool');          // (17 m/s: a dog flat out; 16: a jump's gravity)
  // the fork.  The High Path: up in the branches, shorter than the road round the bend, with mega pads and two trees across it
  const W = T.treetop, b = T.branchAt((W.sStart + W.sEnd) / 2);
  assert.ok(b.lift > 3 && b.open && W.sEnd - W.sStart > 250);
  let path = 0, prev = null;
  for (let s = W.sStart; s <= W.sEnd; s += 0.5) { const br = T.branchAt(s), p = T.pointAt(s, br ? br.side * br.centre : 0); if (prev) path += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
  assert.ok(path < W.sEnd - W.sStart - 30, `${path.toFixed(0)} m against ${(W.sEnd - W.sStart).toFixed(0)} m`);
  assert.equal(T.strips.filter(strip => strip.branch === W.id && strip.mega).length, 2);
  const high = T.trunks.filter(trunk => Math.abs(trunk.from) > 10);
  assert.equal(high.length, 2);
  for (const trunk of high) {
    for (let lateral = trunk.from - 0.4; lateral <= trunk.to + 0.4; lateral += 0.4) { const p = T.pointAt(trunk.s, lateral); assert.equal(T.hazardHit([p.x, p.y, p.z], 0)?.kind, 'trunk', 'no way round a tree on the High Path'); }
    const p = T.pointAt(trunk.s, (trunk.from + trunk.to) / 2);
    assert.equal(T.hazardHit([p.x, p.y + 1.2, p.z], 0), null, 'a jump clears it');
    assert.ok(Math.abs(at(trunk.s, (trunk.from + trunk.to) / 2).grade) < 0.06, 'on ground flat enough to jump from');
  }
  // ...the Low Path: puddles that slow a dog, never more than half the path, on one side and then the other
  assert.ok(T.mud.length >= 5);
  T.mud.forEach((puddle, k) => {
    assert.ok(puddle.s > W.sStart && puddle.s < W.sEnd && at(puddle.s, puddle.lateral).mud);
    const hw = T.pointAt(puddle.s).halfWidth; let dry = 0;
    for (let lateral = -hw + 1; lateral <= hw - 1; lateral += 0.25) if (!at(puddle.s, lateral).mud) dry += 0.25;
    assert.ok(dry > hw - 1, `puddle ${k}: only ${dry.toFixed(1)} m of dry path beside it`);
    if (k) assert.ok(Math.sign(puddle.lateral) !== Math.sign(T.mud[k - 1].lateral));
    assert.equal(at(puddle.s, W.side * W.offset).mud, false, 'not on the High Path');
  });
  // the other fallen trees lie over half the path only: there is a way round each
  const low = T.trunks.filter(trunk => Math.abs(trunk.from) < 10);
  assert.equal(low.length, 2);
  for (const trunk of low) {
    const hw = T.pointAt(trunk.s).halfWidth, clear = [];
    for (let lateral = -hw + 1; lateral <= hw - 1; lateral += 0.25) { const p = T.pointAt(trunk.s, lateral); if (!T.hazardHit([p.x, p.y, p.z], 0)) clear.push(lateral); }
    assert.ok(clear.length * 0.25 > 3.5, `only ${(clear.length * 0.25).toFixed(1)} m to get round a fallen tree`);
    assert.ok(Math.abs(at(trunk.s).grade) < 0.06);
  }
  // the ridge: hills, and a boost pad on them
  const ridge = T.sections.find(sec => sec.id === 'R');
  let ups = 0, was = 0;
  for (let s = ridge.sStart - 60; s < ridge.sEnd; s += 4) { const g = at(s).grade; if (Math.abs(g) > 0.03) { if (Math.sign(g) !== was) ups += 1; was = Math.sign(g); } }
  assert.ok(ups >= 4, `${ups} ups and downs`);
  assert.ok(T.strips.filter(strip => !strip.hop && strip.sStart > ridge.sStart - 60 && strip.sStart < ridge.sEnd).length >= 3);
  // the long drift: one bend all the way down, a drift's own size (40 to 150 m round), and downhill
  const drift = T.sections.find(sec => sec.id === 'G');
  let turned = 0;
  for (let i = T.indexAtS(drift.sStart); i !== T.indexAtS(drift.sStart + 180); i = (i + 1) % T.sampleCount) turned += T.samples.curvature[i] * T.sampleSpacing;
  assert.ok(Math.abs(turned) > 1.8, `${(Math.abs(turned) * 180 / Math.PI).toFixed(0)} degrees`);
  assert.ok(T.pointAt(drift.sStart).y > T.pointAt(drift.sEnd).y + 8);
  // the fallen log: right across the path, cleared by the jump the ramp in front of it gives
  const logs = T.hazardsAt(0).filter(h => h.kind === 'log'), kicker = T.strips.find(strip => strip.id === 'kicker-log');
  assert.ok(logs.length >= 6 && kicker.sStart < T.fallenLog.s);
  const apex = kicker.hop ** 2 / (2 * 16);
  assert.ok(apex > logs[0].height + 0.5, 'the ramp throws a dog well over it');
  // the narrow trail, and out into the clearing
  const trail = T.sections.find(sec => sec.id === 'I');
  assert.ok(T.pointAt((trail.sStart + trail.sEnd) / 2).halfWidth < 5 && T.pointAt(40).halfWidth > 9);
  // more turns: nothing straighter for longer than the start straight
  const S = T.samples, N = T.sampleCount, step = T.length / N, w = Math.round(30 / step), heading = i => Math.atan2(S.tangentX[i % N], S.tangentZ[i % N]);
  let run = 0, longest = 0;
  for (let i = 0; i < 2 * N; i++) { let d = heading(i + w) - heading(i); d = Math.atan2(Math.sin(d), Math.cos(d)); run = Math.abs(d) < 10 * Math.PI / 180 ? run + 1 : 0; longest = Math.max(longest, run); }
  assert.ok(Math.min(longest, N) * step < 175, `longest straight ${Math.round(longest * step)} m`);
});
