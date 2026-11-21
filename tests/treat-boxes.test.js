import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { TREAT_BOXES, TREAT_BOXES_BY_MAP, touchesTreatBox } from '../shared/treatBoxes.js';
import { PICKUP_PATHS, BOX_ROW_S, BONE_S, GOLDEN_BONE_SPOTS } from '../shared/pickupSpots.js';
import { TREAT_ROAD } from '../shared/treatRoadData.js';
import { MODBURY_HEIGHTS } from '../shared/modburyData.js';
import { FARMYARD } from '../shared/farmData.js';
import { MAPS, sampleGroundHeight } from '../shared/maps.js';
import { FROSTPEAK_SLALOM } from '../shared/frostpeakCannon.js';

const lapDistance = (a, b, L) => { const d = Math.abs(a - b) % L; return Math.min(d, L - d); };

test('all twelve treat boxes have distinct IDs and supported pickup positions', () => {
  assert.equal(TREAT_BOXES.length, 12);
  assert.equal(new Set(TREAT_BOXES.map(box => box.id)).size, 12);
  for (const box of TREAT_BOXES) {
    const [x,y,z] = box.groundPosition;
    assert.ok(TREAT_ROAD.query(x,z).onTrack);
    assert.ok(Math.abs(TREAT_ROAD.query(x,z).y-y)<0.1);
    assert.equal(touchesTreatBox(box.groundPosition,box.groundPosition,box), true);
  }
});

test('Treat Road keeps its box IDs, and the same share of the lap for its boxes and bones on the bigger road', () => {
  assert.deepEqual(TREAT_BOXES.map(b => b.id).slice(0, 3), ['treat-0-0', 'treat-0-1', 'treat-0-2']);
  assert.deepEqual(BOX_ROW_S.treat_road.map(Math.round), [345, 759, 1334, 1886]);
  assert.deepEqual(BONE_S.treat_road.map(Math.round), [184, 587, 1196, 1633]);
});

test('every map has box rows of three and single bones, with IDs unique across all maps', () => {
  const all = [];
  for (const mapId of Object.keys(MAPS)) {
    const boxes = TREAT_BOXES_BY_MAP[mapId], bones = GOLDEN_BONE_SPOTS[mapId];
    // (the Speed Bowl's rows are five across; Neon Nexus has rows of four where it is two roads, two on each)
    if (mapId === 'speed_bowl') assert.equal(boxes.length % 5, 0);
    else if (mapId === 'neon_nexus') assert.ok(boxes.length >= 30);
    else assert.ok(boxes?.length >= 9 && boxes.length % 3 === 0, `${mapId}: box rows`);
    assert.ok(bones?.length >= 4, `${mapId}: bones`);
    all.push(...boxes.map(b => b.id));
  }
  assert.equal(new Set(all).size, all.length);
});

test('pickups keep clear of hazards, the start line and each other', () => {
  for (const [mapId, path] of Object.entries(PICKUP_PATHS)) {
    const spots = [...BOX_ROW_S[mapId], ...BONE_S[mapId]];
    // (three maps say for themselves exactly where everything goes, closer together than the rest: the Speed Bowl is all pickups)
    const placed = Boolean(path.pickups);
    for (const s of spots) {
      assert.ok(lapDistance(s, 0, path.length) >= (placed ? 30 : 60), `${mapId}: ${s.toFixed(0)} m is near the start line`);
      for (const [a, b] of path.hazards) {
        assert.ok(lapDistance(s, (a + b) / 2, path.length) > (b - a) / 2, `${mapId}: ${s.toFixed(0)} m is inside hazard ${a}-${b}`);
      }
    }
    // Frostpeak's black run is packed on purpose (30 bones, 12 box rows); everywhere else keeps 70 m
    const onRun = s => path.slope && s > path.slope.topS && s < path.slope.bottomS;
    const sorted = [...spots].filter(s => !onRun(s)).sort((a, b) => a - b);
    if (!placed) sorted.forEach((s, i) => assert.ok(lapDistance(s, sorted[(i + 1) % sorted.length], path.length) >= 70, `${mapId}: spots too close at ${s.toFixed(0)} m`));
  }
});

test('Frostpeak black run: 30 bones and 12 box rows, none inside a slalom obstacle', () => {
  const path = PICKUP_PATHS.frostpeak;
  const onRun = s => s > path.slope.topS && s < path.slope.bottomS;
  assert.equal(BONE_S.frostpeak.filter(onRun).length, 30);
  assert.equal(BOX_ROW_S.frostpeak.filter(onRun).length, 12);
  const obstacles = FROSTPEAK_SLALOM.map(o => o.position);
  const pickups = [...TREAT_BOXES_BY_MAP.frostpeak.map(b => b.groundPosition), ...GOLDEN_BONE_SPOTS.frostpeak.map(b => [b.x, b.y, b.z])];
  for (const [x, , z] of pickups) {
    for (const [ox, , oz] of obstacles) {
      assert.ok(Math.hypot(x - ox, z - oz) > 3, `pickup at (${x.toFixed(0)}, ${z.toFixed(0)}) is inside a slalom obstacle`);
    }
  }
  // spread down the whole run, not bunched
  const run = BONE_S.frostpeak.filter(onRun).sort((a, b) => a - b);
  assert.ok(run[0] - path.slope.topS < 60 && path.slope.bottomS - run.at(-1) < 60);
});

test('boxes and bones sit on the road on the procedural maps', () => {
  for (const [mapId, track] of [['treat_road', TREAT_ROAD], ['modbury_heights', MODBURY_HEIGHTS], ['farmyard', FARMYARD]]) {
    const ground = [...TREAT_BOXES_BY_MAP[mapId].map(b => b.groundPosition), ...GOLDEN_BONE_SPOTS[mapId].map(b => [b.x, b.y, b.z])];
    for (const [x, y, z] of ground) {
      const q = track.query(x, z);
      assert.ok(q.onTrack, `${mapId}: (${x.toFixed(0)}, ${z.toFixed(0)}) is off the road`);
      assert.ok(Math.abs(q.y - y) < 0.3, `${mapId}: height ${y.toFixed(2)} vs road ${q.y.toFixed(2)}`);
    }
  }
});

test('Frostpeak pickups sit on the ground the game samples from the heightmap', () => {
  const meta = MAPS.frostpeak.heightmap;
  const buf = fs.readFileSync(new URL('../public' + meta.file, import.meta.url));
  const heights = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const ground = [...TREAT_BOXES_BY_MAP.frostpeak.map(b => b.groundPosition), ...GOLDEN_BONE_SPOTS.frostpeak.map(b => [b.x, b.y, b.z])];
  for (const [x, y, z] of ground) {
    const h = sampleGroundHeight(heights, meta, x, z);
    assert.ok(Math.abs(h - y) < 1.0, `frostpeak: pickup at ${y.toFixed(2)} m, ground ${h.toFixed(2)} m`);
  }
});

test('pickup sweep catches sprint crossings but ignores near misses, height and teleport paths', () => {
  const box = { groundPosition: [0,10,0] };
  assert.equal(touchesTreatBox([-4,10,0],[4,10,0],box),true);
  assert.equal(touchesTreatBox([-4,10,2],[4,10,2],box),false);
  assert.equal(touchesTreatBox([-4,14,0],[4,14,0],box),false);
  assert.equal(touchesTreatBox([-100,10,0],[100,10,0],box),false);
  assert.equal(touchesTreatBox([-100,10,0],[0,10,0],box),true);
});
