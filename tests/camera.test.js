// Indoors the camera stays inside the walls (Tom, 2026-11-26: "the inside maps you can see inside the walls, shouldn't be able to
// do this at any time"), and every dog has a colour of its own on the course map ("make sure all the icons on the map are
// different colours for each dog").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confineToWalls } from '../src/game/ChaseCamera.js';
import { PROCEDURAL_TRACKS } from '../shared/maps.js';
import { DOGS } from '../src/config/dogs.js';

test('the camera is kept inside the walls all the way round Kombu\'s House, the Vets and the Pet Mall, for every dog\'s camera', () => {
  for (const mapId of ['kombu_house', 'the_vets', 'pet_mall']) {
    const T = PROCEDURAL_TRACKS[mapId], confine = confineToWalls(T);
    assert.ok(confine, mapId);
    let moved = 0, checked = 0;
    for (const [up, back] of [[4, 8], [5, 9.4], [2.6, 5.6]]) for (const lateralShare of [-0.8, 0, 0.8]) for (let s = 0; s < T.length; s += 1.5) {
      const c = T.pointAt(s), dogAt = T.pointAt(s, lateralShare * (c.halfWidth - 1.2)), q0 = T.query(dogAt.x, dogAt.z, -1, dogAt.y);
      if (!T.enclosed.includes(q0.section) || q0.blocked || T.isGap?.(s)) continue;
      // where the camera wants to be: straight back from the dog the way it is facing, and (as it eases round a bend) off to each side
      for (const swing of [-0.5, 0, 0.5]) {
        const yaw = c.rotationY + swing, dog = { x: dogAt.x, y: dogAt.y, z: dogAt.z }, place = { x: dog.x - Math.sin(yaw) * back, y: dog.y + up, z: dog.z - Math.cos(yaw) * back };
        const wanted = Math.hypot(place.x - dog.x, place.z - dog.z);
        confine(place, dog);
        const q = T.query(place.x, place.z, q0.index, dog.y), got = Math.hypot(place.x - dog.x, place.z - dog.z);
        assert.ok(Math.abs(q.lateral) <= q.halfWidth - 0.4, `${mapId}: camera ${(Math.abs(q.lateral) - q.halfWidth).toFixed(2)} m past the wall at ${s.toFixed(0)} m`);
        assert.ok(got <= wanted + 1e-6 && place.y >= dog.y + up * 0.5 && place.y <= dog.y + up + 1e-6);
        checked += 1; if (got < wanted - 0.05) moved += 1;
      }
    }
    assert.ok(checked > 2000 && moved > 50 && moved < checked * 0.75, `${mapId}: moved ${moved} of ${checked}`);
  }
});

test('out of doors the camera is left alone, and maps with no walls have nothing to keep it in', () => {
  assert.equal(confineToWalls(PROCEDURAL_TRACKS.wendover), null);
  assert.equal(confineToWalls(null), null);
  const T = PROCEDURAL_TRACKS.kombu_house, confine = confineToWalls(T), drive = T.sections.find(sec => sec.id === 'M');
  const dog = T.pointAt((drive.sStart + drive.sEnd) / 2), place = { x: dog.x + 30, y: dog.y + 4, z: dog.z + 30 };
  confine(place, { x: dog.x, y: dog.y, z: dog.z });
  assert.deepEqual([place.x, place.z], [dog.x + 30, dog.z + 30]);
});

test('every dog has its own colour on the course map, well apart from every other dog\'s', () => {
  const rgb = hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
  const ids = Object.keys(DOGS);
  assert.equal(ids.length, 12);
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const [p, q] = [rgb(DOGS[a].accent), rgb(DOGS[b].accent)], apart = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    assert.ok(apart > 75, `${a} ${DOGS[a].accent} and ${b} ${DOGS[b].accent} are too alike (${apart.toFixed(0)})`);
  }
});
