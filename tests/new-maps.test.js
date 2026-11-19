import assert from 'node:assert/strict';
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

test('Dune Dash: soft sand is slow, whirlwinds cannot be jumped, tumbleweed can, and there is a leap', () => {
  const T = DESERT, sand = T.mud[0], inSand = at(T, sand.s, sand.lateral);
  assert.ok(inSand.mud && T.speedFactor(inSand) < 0.65);
  assert.equal(at(T, sand.s, -sand.lateral).mud, false, 'there is firm sand past each patch');
  for (const rock of T.obstacles) { assert.ok(T.query(rock.x, rock.z).blocked); assert.equal(at(T, rock.s, -rock.lateral).blocked, false); }
  const twister = T.hazardsAt(3).find(h => h.kind === 'twister'), weed = T.hazardsAt(1).find(h => h.kind === 'tumbleweed' && h.active);
  assert.equal(T.hazardHit([twister.x, twister.y + 6, twister.z], 3)?.kind, 'twister');
  assert.equal(T.hazardHit([weed.x, weed.y, weed.z], 1)?.kind, 'tumbleweed');
  assert.equal(T.hazardHit([weed.x, weed.y + 1.4, weed.z], 1), null);
  for (let t = 0; t < 60; t += 0.7) for (const h of T.hazardsAt(t)) if (h.kind === 'twister') assert.ok(T.query(h.x, h.z).distance < T.query(h.x, h.z).halfWidth, 'the whirlwinds stay on the flats');
  assert.ok(T.launch && T.isGap((T.launch.gapStart + T.launch.gapEnd) / 2) && !at(T, (T.launch.gapStart + T.launch.gapEnd) / 2).onTrack);
  assert.ok(MAPS.desert_dunes.checkpoints.some(cp => cp.launchLanding));
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
  assert.ok(share(10) > 0.95 && share(4) < 0.55, 'Poppy keeps her speed; a poor swimmer loses half');
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

test('Neon Nexus: the longest lap, three of them and fast; mega pads and three catapults; four pairs of roads where the longer has the bones; platform crossings; the accelerator; no bombs', () => {
  const T = NEON;
  assert.ok(T.length > 4900 && T.length < 5000, `${T.length} m`);
  assert.equal(lapsFor('neon_nexus'), 3);
  for (const [id, map] of Object.entries(MAPS)) if (map.procedural) assert.ok(T.length >= PROCEDURAL_TRACKS[id].length, `longer than ${id}`);
  // nothing that knocks a dog over
  assert.equal(T.hazardsAt(3).length, 0);
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
  // three catapults, the accelerator the first of them; every one has its own landing gate
  assert.equal(T.launches.length, 3);
  assert.equal(T.checkpoints.filter(cp => cp.launchLanding).length, 3);
  for (const l of T.launches) { const end = T.launchPoint(l.duration, 0, l), land = T.pointAt(l.landingS); assert.ok(Math.hypot(end.x - land.x, end.z - land.z) < 0.01 && l.gapEnd - l.gapStart > 240); }

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
  // a moment when a cheese is rolling, somewhere on the climb where the road is steep
  let found = null;
  for (let t = 0; t < 60 && !found; t += 0.25) {
    for (const h of DALES.hazardsAt(t)) {
      if (h.kind !== 'cheese' || !h.active) continue;
      const q = DALES.query(h.x, h.z);
      if (q.s > pull.sStart + 20 && q.s < pull.sEnd - 20 && Math.abs(q.grade) > 0.12) { found = { t, h, q }; break; }
    }
  }
  assert.ok(found, 'a cheese rolling on the steep part of the climb');
  const { t, h, q } = found;
  // the dog is a metre and a half down the road from it (lower ground), coming up
  const downhill = DALES.pointAt(q.s - 1.5, q.lateral);
  const ground = DALES.query(downhill.x, downhill.z).trackY;
  assert.ok(h.y - ground > 0.15, 'the cheese stands on higher ground than the dog');
  assert.ok(Math.hypot(downhill.x - h.x, downhill.z - h.z) <= cheeseRun.radius + 1, 'near enough to be hit');
  assert.equal(DALES.hazardHit([downhill.x, ground, downhill.z], t)?.id, h.id, 'on the ground: hit');
  assert.equal(DALES.hazardHit([downhill.x, ground + 0.6, downhill.z], t)?.id, h.id, 'a low hop: hit');
  assert.equal(DALES.hazardHit([downhill.x, ground + h.height + 0.15, downhill.z], t), null, 'a jump of the height of the cheese clears it');
});
