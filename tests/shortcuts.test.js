// Short cuts over rough ground (a kit branch with `rough`, for a dog on a Golden Bone) were tried on Bypass Dash, the Speed
// Bowl and The Boneyard on 2026-11-26, and Tom had them all taken out the same day: "remove the shortcuts for now, they all
// don't feel right".  The builder still understands a rough branch; no map has one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROCEDURAL_TRACKS } from '../shared/maps.js';

test('no map has a rough short cut (Tom, 2026-11-26)', () => {
  for (const [mapId, T] of Object.entries(PROCEDURAL_TRACKS)) {
    assert.ok(!(T.branches ?? []).some(branch => branch.rough), `${mapId} has a rough short cut`);
    assert.equal(T.cut, undefined, mapId);
  }
});
