import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DALES } from '../shared/dalesData.js';
import { JUMP } from '../shared/handling.js';
import { BONEYARD } from '../shared/boneyardData.js';
import { VETS } from '../shared/vetsData.js';
import { JUNGLE, STAIR_TREE, RIVER_Y } from '../shared/jungleData.js';
import { MAPS, PROCEDURAL_TRACKS, lapsFor } from '../shared/maps.js';
import { GRAND_PRIX } from '../shared/grandPrix.js';
import { TREAT_BOXES_BY_MAP } from '../shared/treatBoxes.js';
import { GOLDEN_BONE_SPOTS } from '../shared/pickupSpots.js';
import { BURROWS } from '../shared/burrows.js';

const TRACKS = [DALES, BONEYARD, VETS, JUNGLE];
const at = (T, s, lateral = 0) => { const p = T.pointAt(s, lateral); return T.query(p.x, p.z); };
const kinds = (T, t = 3) => new Set(T.hazardsAt(t).map(h => h.kind));

test('Grand Prix 4: the Dales, the Boneyard, the Vets, the jungle, in that order', () => {
  assert.deepEqual(GRAND_PRIX.gp4.maps, ['yorkshire_dales', 'boneyard', 'the_vets', 'monkey_jungle']);
  for (const T of TRACKS) {
    assert.equal(PROCEDURAL_TRACKS[T.id], T);
    assert.equal(lapsFor(T.id), 3);
    assert.ok(MAPS[T.id].description.length > 20);
    assert.ok(T.length > 1500 && T.length < 2500, `${T.id}: ${T.length} m`);
    assert.equal(BURROWS[T.id].length, 2);
    assert.ok(TREAT_BOXES_BY_MAP[T.id].length >= 12 && GOLDEN_BONE_SPOTS[T.id].length >= 10, T.id);
  }
});

test('Grand Prix 4: no lap passes close beside itself; everything on it is on the road; the computer knows where the hazards are', () => {
  for (const T of TRACKS) {
    const S = T.samples;
    for (let i = 0; i < T.sampleCount; i += 3) for (let j = i + 45; j < T.sampleCount; j += 3) {
      if (T.sampleCount - (j - i) < 45) continue;
      // (the jungle's stair comes back round to within a road's width or two of where it started, 14 m higher)
      assert.ok(Math.hypot(S.x[i] - S.x[j], S.z[i] - S.z[j]) > (T === JUNGLE ? 30 : 40), `${T.id}: ${S.s[i].toFixed(0)} m and ${S.s[j].toFixed(0)} m`);
    }
    for (const spot of [...TREAT_BOXES_BY_MAP[T.id].map(b => b.groundPosition), ...GOLDEN_BONE_SPOTS[T.id].map(b => [b.x, b.y, b.z])]) {
      const q = T.query(spot[0], spot[2]);
      assert.ok(q.onTrack && !q.gap && !q.blocked, `${T.id}: a pickup at ${q.s.toFixed(0)} m`);
    }
    const ids = T.hazardsAt(5).map(h => h.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length >= 6 && Object.keys(T.hazardZones).length >= 2, T.id);
    // the same at any time for anyone who asks
    assert.deepEqual(T.hazardsAt(12.34), T.hazardsAt(12.34));
  }
});

test('Yorkshire Dales: boost pads up the climbs, faster down than on the flat, cheeses, sheep, the ford, the cave and the waterfall', () => {
  const T = DALES, S = T.samples;
  assert.ok(Math.max(...S.y) - Math.min(...S.y) > 35, 'real hills');
  const pads = T.strips.filter(strip => strip.kind !== 'rock'), rocks = T.strips.filter(strip => strip.kind === 'rock');
  assert.ok(pads.length >= 8);
  for (const strip of pads) {
    const mid = (strip.sStart + strip.sEnd) / 2;
    assert.ok(at(T, mid).kick && at(T, mid).grade > 0.02, `a pad at ${mid.toFixed(0)} m is on a climb`);
  }
  // the stream (Tom, 2026-11-21): down from the waterfall's pool, ankle deep but not slowing anyone, rocks to hop in a zig-zag, each a boost
  assert.ok(rocks.length >= 8);
  rocks.forEach((rock, k) => {
    const mid = (rock.sStart + rock.sEnd) / 2, q = at(T, mid, (rock.latMin + rock.latMax) / 2);
    assert.ok(T.within(mid, T.stream) && q.kick && !q.inWater, `rock ${k}`);
    if (k) assert.ok(Math.sign(rock.latMin + rock.latMax) !== Math.sign(rocks[k - 1].latMin + rocks[k - 1].latMax), 'from side to side');
  });
  assert.ok(T.pointAt(T.stream.sStart).y > T.pointAt(T.stream.sEnd).y, 'downhill');
  assert.ok(T.stream.sStart > T.plunge.sEnd);
  // more turns, fewer straights: no more than 150 m without a bend anywhere on the lap
  const N = T.sampleCount, heading = i => Math.atan2(S.tangentX[i % N], S.tangentZ[i % N]), step = T.length / N, w = Math.round(30 / step);
  let run = 0, longest = 0;
  for (let i = 0; i < 2 * N; i++) { let d = heading(i + w) - heading(i); d = Math.atan2(Math.sin(d), Math.cos(d)); run = Math.abs(d) < 10 * Math.PI / 180 ? run + 1 : 0; longest = Math.max(longest, run); }
  assert.ok(Math.min(longest, N) * step < 150, `longest straight ${Math.round(longest * step)} m`);
  // the goat path: the inside of the first hairpin, shorter than the road round it, and a cheese comes down it
  const goat = T.goatPath;
  let path = 0, prev = null;
  for (let s = goat.sStart; s <= goat.sEnd; s += 0.5) { const br = T.branchAt(s), p = T.pointAt(s, br ? br.side * br.centre : 0); if (prev) path += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
  assert.ok(path < (goat.sEnd - goat.sStart) - 20, `goat path ${path.toFixed(0)} m against ${(goat.sEnd - goat.sStart).toFixed(0)} m`);
  let goatCheese = false;
  for (let t = 0; t < 8 && !goatCheese; t += 0.2) { const h = T.hazardsAt(t).find(each => each.id === 'cheese-goat'); goatCheese = h.active && T.query(h.x, h.z).lane?.id === 'goat-path'; }
  assert.ok(goatCheese);
  // the sheep stand on gentle ground (Tom, 2026-11-21: up the hill they could not be jumped), and a dog at the top of an
  // ordinary jump, right over one, clears it
  const top = JUMP.force ** 2 / (2 * JUMP.gravity);
  for (const s of T.flocks) assert.ok(Math.abs(at(T, s).grade) < 0.06, `the ground under the flock at ${s.toFixed(0)} m`);
  for (let t = 0.5; t < 9; t += 0.5) {
    for (const sheep of T.hazardsAt(t).filter(h => h.kind === 'sheep')) {
      const ground = T.query(sheep.x, sheep.z).trackY;
      assert.equal(T.hazardHit([sheep.x, ground + top - 0.15, sheep.z], t), null, `${sheep.id} jumped at ${t} s`);
      assert.equal(T.hazardHit([sheep.x, ground, sheep.z], t)?.id, sheep.id);
    }
  }
  // a descent adds a lot; the same slope on another map adds very little
  let steepest = 0; for (let i = 0; i < T.sampleCount; i++) if (S.grade[i] < S.grade[steepest]) steepest = i;
  const down = at(T, S.s[steepest]);
  assert.ok(T.speedFactor(down) > 1.3, `${T.speedFactor(down)}`);
  assert.ok(VETS.speedFactor({ ...down }) < 1.1);
  assert.ok(kinds(T).has('cheese') && kinds(T).has('sheep'));
  for (const h of T.hazardsAt(4)) assert.ok(h.height <= 1.3, 'everything here can be jumped');
  const ford = at(T, (T.ford.sStart + T.ford.sEnd) / 2);
  assert.equal(ford.movement, 'wade');
  // the cave: no leap any more.  Road all the way through it, downhill, and out into the waterfall's pool
  assert.equal(T.launch, undefined);
  const cave = T.cave;
  assert.ok(cave.sEnd - cave.sStart > 60 && T.pointAt(cave.sStart).y > T.pointAt(cave.sEnd).y + 8, 'down through the scar');
  for (let s = cave.sStart; s <= cave.sEnd; s += 5) assert.ok(at(T, s).onTrack && !at(T, s).inWater, `road in the cave at ${s}`);
  assert.equal(at(T, (T.plunge.sStart + T.plunge.sEnd) / 2).movement, 'wade');
  assert.ok(T.plunge.sStart - cave.sEnd < 3, 'the pool is right under the fall');
  for (const spot of [...TREAT_BOXES_BY_MAP[T.id].map(b => b.groundPosition), ...GOLDEN_BONE_SPOTS[T.id].map(b => [b.x, b.y, b.z])]) { const s = T.query(spot[0], spot[2]).s; assert.ok(s < cave.sEnd - 14 || s > T.plunge.sEnd, 'nothing hidden behind the water'); }
});

test('The Boneyard: a lap the shape of a bone, bones all the way round, muddy water, slippery', () => {
  const T = BONEYARD, S = T.samples;
  // the same turned right round, and four times as long as it is wide
  const xs = [...S.x], zs = [...S.z];
  assert.ok((Math.max(...xs) - Math.min(...xs)) / (Math.max(...zs) - Math.min(...zs)) > 3);
  const half = Math.round(T.sampleCount / 2);
  for (let i = 0; i < T.sampleCount; i += 25) { const j = (i + half) % T.sampleCount; assert.ok(Math.hypot(S.x[i] + S.x[j], S.z[i] + S.z[j]) < 12); }
  assert.ok(GOLDEN_BONE_SPOTS.boneyard.length >= 60, `${GOLDEN_BONE_SPOTS.boneyard.length} bones`);
  for (const [id, spots] of Object.entries(GOLDEN_BONE_SPOTS)) if (id !== 'boneyard' && id !== 'frostpeak') assert.ok(spots.length < GOLDEN_BONE_SPOTS.boneyard.length, `more than ${id}`);
  assert.equal(T.water.length, 4);
  assert.deepEqual(T.water.map(pool => at(T, (pool.sStart + pool.sEnd) / 2).movement), ['wade', 'swim', 'swim', 'wade']);
  assert.ok(T.mud.length >= 6 && at(T, T.mud[0].s, T.mud[0].lateral).mud);
  assert.ok(at(T, 100).slippery > 0.2 && T.rules.slip);
  assert.ok(kinds(T).has('rolling bone') && kinds(T).has('mud spout'));
  // a spout warns before it goes off
  const spout = t => T.hazardsAt(t).find(h => h.id === 'spout-0');
  let warned = false, blew = false;
  for (let t = 0; t < T.spoutRun.period; t += 0.1) { const h = spout(t); if (h.active) { blew = true; assert.ok(warned); } else if (h.warn > 0) warned = true; }
  assert.ok(blew);
});

test('Grand Prix 4 has no leaps: nothing fires a dog through the air (the jungle\'s vine lifts only carry a dog up out of the river)', () => {
  for (const T of [DALES, BONEYARD, VETS]) assert.equal(T.launch, undefined, T.id);
  for (const l of JUNGLE.launches ?? []) assert.ok(l.lift && l.under, l.id);
});

test('Monkey Jungle (Tom, 2026-11-21): off a bridge, the swings or the log you land in the river, wade it, and a vine lift takes you back up', () => {
  const T = JUNGLE;
  T.setClock(2);
  assert.equal(T.undercity.length, T.platforms.length);
  for (const zone of T.platforms) {
    const u = T.undercity.find(each => each.under === zone.id), mid = (zone.sStart + zone.sEnd) / 2, c = T.pointAt(mid);
    // off the side of it: into the river at the bottom of the gorge, wading
    const off = T.pointAt(mid, c.halfWidth - 0.8), q = T.query(off.x, off.z, -1, off.y);
    const pad = T.padUnder(mid, c.halfWidth - 0.8);
    if (!pad) { assert.equal(q.level, u.id, zone.id); assert.equal(q.movement, 'wade'); assert.ok(Math.abs(q.y - (RIVER_Y - 0.4)) < 0.2, `${zone.id} the river bed`); }
    // on it, still on it
    const on = T.padAt(zone.pads[0]); assert.equal(T.query(on.x, on.z, -1, on.y).level, undefined);
    // its lift: up out of the river to the trail, just past the far end
    const lift = T.launches.find(l => l.under === u.id), top = T.launchPoint(lift.duration, 0, lift);
    assert.ok(Math.abs(top.y - T.pointAt(lift.landingS).y) < 0.01 && lift.landingS > zone.sEnd && lift.takeoffS < zone.sEnd + 1);
  }
});

test('The Vets: in on the treadmill, three storeys up two flights of stairs, and out of the top window', () => {
  const T = VETS, S = T.samples;
  const y = id => { const sec = T.sections.find(q => q.id === id); return [T.pointAt(sec.sStart + 4).y, T.pointAt(sec.sEnd - 4).y]; };
  // three floors, each level, 9 m apart
  for (const [rooms, floor] of [['BC', T.floor], ['EFG', T.first], ['IJK', T.top]]) for (const id of rooms) for (const h of y(id)) assert.ok(Math.abs(h - floor) < 0.5, `${id} is at ${h}`);
  assert.ok(Math.abs(T.first - T.floor - 9) < 1e-9 && Math.abs(T.top - T.first - 9) < 1e-9);
  for (const stairs of ['D', 'H']) assert.ok(y(stairs)[1] - y(stairs)[0] > 6, `${stairs} goes up`);
  // nothing outside but the forecourt they land in and the treadmill
  const outside = T.sections.filter(q => 'AL'.includes(q.id)).reduce((sum, q) => sum + q.sEnd - q.sStart, 0);
  assert.ok(outside < 200, `${outside} m outside`);
  // the treadmill: a belt from before the start line to the front door, quicker than the floor, with the grid on it
  const belt = T.treadmill, door = T.doors[0];
  assert.ok(T.along(0, belt.sStart) > 15 && Math.abs(belt.sEnd - door.s) < 3);
  for (const s of [T.length - 10, 4, door.s - 6]) assert.ok(at(T, s).boost > 1.2, `on the belt at ${s}`);
  assert.equal(at(T, door.s + 6).boost, 0);
  for (const slot of T.startPositions) assert.ok(T.query(slot.position[0], slot.position[2]).boost > 1.2, 'the grid is on the belt');
  // the window: the road stops dead at the front wall, 18 m up, and carries on in the forecourt right underneath
  assert.equal(T.drops.length, 1);
  const drop = T.drops[0], sill = T.pointAt(drop.s - 2.5), below = T.pointAt(drop.s + 2.5);
  assert.ok(Math.abs(sill.y - T.top) < 0.05 && Math.abs(below.y) < 0.05 && Math.abs(drop.height - T.top) < 0.05, `${sill.y} -> ${below.y}`);
  assert.ok(Math.abs(T.pointAt(drop.s - 30).y - T.top) < 0.05 && Math.abs(T.pointAt(drop.s + 40).y) < 0.05, 'level before it and after it: no ramp');
  assert.ok(Math.abs(sill.z - T.pointAt(door.s).z) < 4 && Math.abs(sill.x - T.pointAt(door.s).x) > 40, 'in the front wall, along from the door');
  assert.ok(at(T, drop.s - 2).halfWidth < 5, 'the width of a window');
  assert.ok(at(T, drop.s - 4).section === 'K' && at(T, drop.s + 4).section === 'L');
  // no checkpoint, pickup or burrow where a dog is still in the air
  for (const cp of T.checkpoints) assert.ok(cp.s < drop.s - 6 || cp.s > drop.s + 45);
  for (const spot of [...TREAT_BOXES_BY_MAP[T.id].map(b => b.groundPosition), ...GOLDEN_BONE_SPOTS[T.id].map(b => [b.x, b.y, b.z])]) { const s = T.query(spot[0], spot[2]).s; assert.ok(s < drop.s - 14 || s > drop.s + 50); }
  assert.ok(Math.max(...S.grade.filter((_, i) => Math.abs(i - drop.index) > 2).map(Math.abs)) < 0.25, 'nothing else is steeper than a stair');

  for (const kind of ['cone of shame', 'pill', 'syringe', 'vet', 'trolley']) assert.ok(kinds(T, 1).has(kind), kind);
  // pills, syringes and vets all come towards the dogs: further back down the lap as time goes on
  for (const id of ['pill-0', 'syringe-0', 'vet-0', 'vet-4']) {
    const s = t => { const h = T.hazardsAt(t).find(q => q.id === id); return h.active ? T.query(h.x, h.z).s : null; };
    let checked = 0;
    for (let t = 0; t < 12; t += 0.25) { const a = s(t), b = s(t + 0.25); if (a !== null && b !== null) { assert.ok(b < a, `${id} at ${t}`); checked++; } }
    assert.ok(checked > 5, id);
  }
  // nothing jumps a vet; the rest can be jumped
  for (const h of T.hazardsAt(2)) assert.equal(h.height > 5, h.kind === 'vet', h.kind);
  // there is always a lane of the corridor with no syringe in it
  for (let t = 0; t < 13; t += 0.2) assert.ok(T.hazardsAt(t).filter(h => h.kind === 'syringe' && h.active).length < T.syringeRun.lanes.length);
  assert.ok(at(T, (T.kennels.sStart + T.kennels.sEnd) / 2).slippery > 0.5 && at(T, 60).slippery === 0);
});

test('Monkey Jungle: bridges with no sides, swings to jump along, the tree stair and the jump off it, snakes, monkeys, stone balls, coconuts', () => {
  const T = JUNGLE;
  assert.deepEqual(T.platforms.map(zone => zone.kind), ['bridge', 'swings', 'log', 'bridge']);
  for (const zone of T.platforms) {
    // level from end to end, and the checkpoint a dog goes back to is just before it
    assert.ok(Math.abs(T.pointAt(zone.sStart).y - T.pointAt(zone.sEnd).y) < 0.3);
    const before = T.checkpoints.filter(cp => cp.s < zone.sStart).at(-1);
    assert.ok(zone.sStart - before.s > 8 && zone.sStart - before.s < 25);
  }
  // every crossing can be fallen off: a step past the edge is over nothing
  for (const zone of T.platforms.filter(q => q.kind !== 'swings')) {
    const pad = zone.pads[0], mid = (zone.sStart + zone.sEnd) / 2;
    assert.equal(zone.pads.length, 1);
    for (const t of [0, 1.3, 2.9, 4.4]) {
      T.setClock(t); const lateral = T.padLateral(pad, t);
      for (const s of [zone.sStart + 2, mid, zone.sEnd - 2]) assert.equal(at(T, s, lateral).gap, false, 'on it');
      for (const side of [-1, 1]) assert.equal(at(T, mid, lateral + side * (pad.half + 1.4)).gap, true, 'off the side');
    }
    if (zone.kind === 'bridge') assert.ok(Math.abs(T.padLateral(pad, 0) - T.padLateral(pad, pad.period / 4)) > 0.5, 'it sways');
    else assert.equal(T.padLateral(pad, 1.7), 0, 'the log lies still');
  }
  const swings = T.platforms[1];
  assert.equal(swings.pads.length, 4);
  T.setClock(2); assert.equal(at(T, swings.pads[0].s0 - 2.5, T.padLateral(swings.pads[0], 2)).gap, true, 'a break before the first swing');
  T.setClock(0);
  // the stair: up all the way, most of the way round a circle, then the road stops and carries on 14 m below
  const stair = T.stair, drop = T.drops[0], [cx, cz] = STAIR_TREE;
  assert.equal(T.drops.length, 1);
  assert.ok(Math.abs(drop.height - T.stairRise) < 0.3 && Math.abs(drop.s - stair.sEnd) < 2.5, `${drop.height} m at ${drop.s}`);
  let turned = 0, last = null;
  for (let s = stair.sStart; s < stair.turnS; s += 4) {
    const p = T.pointAt(s), angle = Math.atan2(p.z - cz, p.x - cx);
    assert.ok(T.pointAt(s + 4).y >= p.y - 0.02, `still climbing at ${s}`);
    if (last !== null) { let d = angle - last; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turned += d; if (s > stair.sStart + 50) assert.ok(Math.abs(Math.hypot(p.x - cx, p.z - cz) - 31) < 4, 'round the tree'); }
    last = angle;
  }
  assert.ok(Math.abs(turned) > Math.PI * 1.4, `${(Math.abs(turned) * 180 / Math.PI).toFixed(0)} degrees round`);
  assert.ok(Math.abs(T.pointAt(drop.s - 12).y - drop.top) < 0.1 && Math.abs(T.pointAt(drop.s + 30).y - drop.bottom) < 0.1, 'level at the top, level where they land');
  assert.ok(T.platforms[2].sStart - drop.s > 45, 'room to land before the log');
  // snakes: each goes round and round a circle in the trail, and can be jumped
  assert.equal(T.snakes.length, 4);
  for (let k = 0; k < T.snakes.length; k++) {
    const centre = T.pointAt(T.snakes[k]), head = t => T.hazardsAt(t).find(h => h.id === `snake-${k}-0`);
    const bearings = [];
    for (let t = 0; t <= T.snake.period; t += T.snake.period / 8) { const h = head(t), q = T.query(h.x, h.z); assert.ok(Math.abs(Math.hypot(h.x - centre.x, h.z - centre.z) - Math.min(T.snake.circle, centre.halfWidth - 2.6)) < 0.35, 'on its circle'); assert.ok(!q.blocked && h.height < 1.3 && h.active); bearings.push(Math.atan2(h.z - centre.z, h.x - centre.x)); }
    assert.ok(Math.hypot(head(0).x - head(T.snake.period).x, head(0).z - head(T.snake.period).z) < 0.01, 'once round in a period');
    assert.ok(new Set(bearings.slice(0, 8).map(b => Math.round(b * 4))).size >= 7, 'all the way round');
  }
  assert.equal(T.mud.length, 0, 'no banana skins');
  for (const kind of ['snake', 'monkey', 'stone ball', 'coconut']) assert.ok(kinds(T, 1).has(kind), kind);
  // a coconut's shadow is there before it lands
  const nut = t => T.hazardsAt(t).find(h => h.id === 'coconut-0');
  let shadow = false, hit = false;
  for (let t = 0; t < T.coconut.period; t += 0.05) { const h = nut(t); if (h.active) { hit = true; assert.ok(shadow); } else if (h.fall > 0) shadow = true; }
  assert.ok(hit);
  // never all three lanes of the temple ramp blocked at once
  for (let t = 0; t < 14; t += 0.2) assert.ok(T.hazardsAt(t).filter(h => h.kind === 'stone ball' && h.active).length < 3);
});
