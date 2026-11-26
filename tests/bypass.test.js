import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BYPASS as T } from '../shared/bypassData.js';
import { MAPS, MAP_IDS, RETIRED_MAPS } from '../shared/maps.js';
import { GRAND_PRIX } from '../shared/grandPrix.js';
import { BURROWS } from '../shared/burrows.js';
import { botRoute, createBot } from '../server/bots.js';
import { BOT_LEVEL_IDS } from '../shared/botLevels.js';

const at = (s, lateral = 0) => { const p = T.pointAt(s, lateral); return T.query(p.x, p.z, -1, p.y); };

test('Bypass Dash takes Squelch Hollow\'s place (Tom, 2026-11-26): on offer, in the second cup; Squelch Hollow is not offered but still runs', () => {
  assert.ok(MAP_IDS.includes('bypass_dash') && !MAP_IDS.includes('mud_park') && RETIRED_MAPS.includes('mud_park'));
  assert.ok(MAPS.mud_park && MAPS.bypass_dash.procedural);
  assert.deepEqual(GRAND_PRIX.gp2.maps, ['farmyard', 'modbury_heights', 'bypass_dash', 'frostpeak']);
  assert.equal(MAP_IDS.length, 16);
  assert.equal(MAPS.bypass_dash.startPositions.length, 6);
  assert.equal(BURROWS.bypass_dash.length, 2);
  assert.ok(T.length > 1300 && T.length < 1550 && T.strips.length === 0, 'no boost pads: Golden Bones do that');
});

test('Bypass Dash: the motorway\'s traffic goes the dogs\' way, slower than a dog, in lanes with room between; nothing in it can be jumped', () => {
  const M = T.motorway;
  for (const t of [0, 7.3, 31]) {
    const now = T.hazardsAt(t).filter(h => h.id.startsWith('mway')), later = T.hazardsAt(t + 1).filter(h => h.id.startsWith('mway'));
    assert.ok(now.length >= 12);
    for (const h of now) {
      assert.ok(h.height > 1.6, 'too tall to jump');
      const q = T.query(h.x, h.z), next = later.find(each => each.id === h.id), q2 = T.query(next.x, next.z);
      assert.ok(q.s > M.sStart - 3 && q.s < M.sEnd + 3 && Math.abs(q.lateral) < q.halfWidth);
      if (h.active && next.active && q2.s > q.s) assert.ok(Math.abs(q2.s - q.s - M.speed) < 0.6, 'it moves along the road at its speed');
    }
    // a dog can always get through: across the road at any place, somewhere at least 3.5 m wide is clear
    for (let s = M.sStart + 20; s < M.sEnd - 20; s += 6) {
      const hw = T.pointAt(s).halfWidth; let run = 0, best = 0;
      for (let lateral = -hw + 1; lateral <= hw - 1; lateral += 0.5) { const p = T.pointAt(s, lateral); run = T.hazardHit([p.x, p.y, p.z], t) ? 0 : run + 0.5; best = Math.max(best, run); }
      assert.ok(best >= 3.5, `no way through at ${s.toFixed(0)} m, ${t} s`);
    }
  }
  assert.ok(M.speed < 10);
});

test('Bypass Dash: traffic crosses the road at the crossing, there is always a gap, and nothing reaches a dog on the footbridge', () => {
  const X = T.crossing, B = T.bridge;
  for (const s of X.lanes) {
    let hit = 0, clear = 0;
    for (let t = 0; t < 30; t += 0.1) { const p = T.pointAt(s); if (T.hazardHit([p.x, p.y, p.z], t)) hit += 1; else clear += 1; }
    assert.ok(hit > 10 && clear > hit, `lane at ${s.toFixed(0)} m: hit ${hit}, clear ${clear}`);
    // up on the bridge: never
    const br = T.branchAt(s); assert.ok(br.open && br.lift > 5);
    for (let t = 0; t < 30; t += 0.1) { const p = T.pointAt(s, br.side * br.centre); assert.equal(T.hazardHit([p.x, p.y, p.z], t), null); }
  }
  let path = 0, prev = null;
  for (let s = B.sStart; s <= B.sEnd; s += 0.5) { const br = T.branchAt(s), p = T.pointAt(s, br ? br.side * br.centre : 0); if (prev) path += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
  assert.ok(path > B.sEnd - B.sStart && path < (B.sEnd - B.sStart) + 30, 'the footbridge is a little longer than the road');
});

test('Bypass Dash: the roadworks leave a way through, and the underpass is narrow', () => {
  for (const ob of T.obstacles) assert.ok(at(ob.s, ob.lateral).blocked && !at(ob.s, -ob.lateral).blocked);
  for (const tar of T.mud) { assert.ok(at(tar.s, tar.lateral).mud && !at(tar.s, -tar.lateral).mud); }
  assert.ok(T.pointAt(T.doors[0].s).halfWidth <= 4.6);
});

test('Bypass Dash: every level of computer dog gets round three laps without sticking', () => {
  for (const level of BOT_LEVEL_IDS) for (const dog of ['gsp', 'ralph', 'jazz']) {
    const route = botRoute('bypass_dash'), start = route.pointAt(0), bot = createBot({ mapId: 'bypass_dash', dog, level, seed: 11 });
    bot.place([start.x, start.y, start.z], start.heading);
    let t = 0, hits = 0, immune = -1;
    while (bot.state.travelled < 3 * T.length && t < 480) { const move = bot.step(0.05, { raceSeconds: t }); t += 0.05; if (t > immune && T.hazardHit(move.position, t)) { hits += 1; immune = t + 1.5; bot.hit?.(1100); } }
    assert.ok(bot.state.travelled >= 3 * T.length, `${level} ${dog}: only ${Math.round(bot.state.travelled)} m in eight minutes`);
    assert.ok(hits <= 14, `${level} ${dog}: hit ${hits} times in three laps`);
  }
});
