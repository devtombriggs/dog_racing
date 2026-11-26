// Coins, the Shop and the Garage (Tom, 2026-11-26): shared/shop.js, and the database and requests behind them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, AccountError } from '../server/db.js';
import { createAccounts } from '../server/accounts.js';
import { SHOP_ITEMS, SHOP_ITEM, PLACE_COINS, DID_NOT_FINISH, LOCKED_DOGS, SLOTS, coinsForRace, coinsForGrandPrix, dogUnlocked, fitsDog, cosmeticsFor } from '../shared/shop.js';

function call(accounts, method, path, { body, cookie = '' } = {}) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    Object.assign(req, { method, url: path, headers: { host: 'localhost:5173', cookie }, socket: { remoteAddress: '1.2.3.4' }, destroy() {} });
    const res = {
      headers: {}, headersSent: false,
      getHeader(name) { return this.headers[name.toLowerCase()]; },
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      writeHead(status, more = {}) { this.status = status; for (const [k, v] of Object.entries(more)) this.headers[k.toLowerCase()] = v; this.headersSent = true; },
      end(text = '') { resolve({ status: this.status, body: text ? JSON.parse(text) : null }); },
    };
    assert.equal(accounts.handle(req, res), true, `${method} ${path} is a route`);
    queueMicrotask(() => { if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); });
  });
}

test('what a race pays: more the better the place, less against easier computer dogs, in full between people', () => {
  assert.deepEqual(PLACE_COINS, [100, 70, 50, 35, 25, 15]);
  for (let place = 1; place < 6; place++) assert.ok(coinsForRace({ place, finished: true }) > coinsForRace({ place: place + 1, finished: true }));
  assert.equal(coinsForRace({ place: 1, finished: true, racers: 6, humans: 1, botLevel: 'hard' }), 100);
  assert.equal(coinsForRace({ place: 1, finished: true, racers: 6, humans: 1, botLevel: 'medium' }), 75);
  assert.equal(coinsForRace({ place: 1, finished: true, racers: 6, humans: 1, botLevel: 'easy' }), 50);
  assert.equal(coinsForRace({ place: 1, finished: true, racers: 6, humans: 3, botLevel: 'easy' }), 100, 'people in the race: in full whatever the computer dogs');
  assert.equal(coinsForRace({ place: 9, finished: true }), 15, 'further back than sixth pays as sixth');
  assert.equal(coinsForRace({ place: 2, finished: false }), DID_NOT_FINISH);
  assert.equal(coinsForRace({ place: 1, finished: true, racers: 1 }), 15, 'alone on the road is not a win');
  for (const level of ['easy', 'medium', 'hard']) for (let place = 1; place <= 6; place++) { const coins = coinsForRace({ place, finished: true, botLevel: level }); assert.ok(coins >= DID_NOT_FINISH && coins % 5 === 0); }
  assert.deepEqual([1, 2, 3, 4].map(coinsForGrandPrix), [150, 75, 40, 0]);
});

test('the shop\'s prices: silly things to wear are cheap, skins dearer, characters dearest (Tom, 2026-11-26)', () => {
  const cheapest = kind => Math.min(...SHOP_ITEMS.filter(item => item.kind === kind).map(item => item.price));
  const dearest = kind => Math.max(...SHOP_ITEMS.filter(item => item.kind === kind).map(item => item.price));
  assert.ok(dearest('accessory') < cheapest('character'));
  // an accessory is a handful of middling races; a character is a long way off, but not out of reach
  const middling = PLACE_COINS[2];
  assert.ok(dearest('accessory') / middling <= 12 && cheapest('character') / middling >= 60 && dearest('character') / PLACE_COINS[0] <= 120);
  assert.equal(SHOP_ITEM.hat_santa.slot, 'head'); assert.equal(SHOP_ITEM.hat_santa.dogs, undefined, 'the Santa hat fits every dog');
  assert.deepEqual(SHOP_ITEM.coat_pippa.dogs, ['gsp']); assert.equal(SHOP_ITEM.coat_pippa.slot, 'body');
  assert.deepEqual(LOCKED_DOGS, { ziggy: 'dog_ziggy', barney: 'dog_barney', merlin: 'dog_merlin', nacho: 'dog_nacho' });         // (Jimmy was the first; he is free again)
  assert.ok(dogUnlocked('jimmy', []));
  assert.equal(new Set(SHOP_ITEMS.map(item => item.id)).size, SHOP_ITEMS.length);
  for (const item of SHOP_ITEMS) { assert.ok(item.price > 0 && item.name && item.blurb); if (item.kind === 'accessory') assert.ok(SLOTS[item.slot]); }
});

test('who may race as what, and what a dog may wear', () => {
  assert.ok(dogUnlocked('gsp', []) && !dogUnlocked('merlin', []) && !dogUnlocked('merlin', ['hat_santa', 'dog_ziggy']) && dogUnlocked('merlin', ['dog_merlin']));
  assert.ok(fitsDog(SHOP_ITEM.hat_santa, 'ralph') && fitsDog(SHOP_ITEM.coat_pippa, 'gsp') && !fitsDog(SHOP_ITEM.coat_pippa, 'ralph') && !fitsDog(SHOP_ITEM.dog_merlin, 'merlin'));
  const owned = ['hat_santa', 'coat_pippa'];
  assert.deepEqual(cosmeticsFor('gsp', owned, { gsp: { head: 'hat_santa', body: 'coat_pippa' } }), { head: 'hat_santa', body: 'coat_pippa' });
  // nothing that is not owned, does not fit, is in the wrong place or does not exist
  assert.deepEqual(cosmeticsFor('gsp', ['coat_pippa'], { gsp: { head: 'hat_santa', body: 'coat_pippa' } }), { body: 'coat_pippa' });
  assert.deepEqual(cosmeticsFor('ralph', owned, { ralph: { body: 'coat_pippa', head: 'hat_santa' } }), { head: 'hat_santa' });
  assert.deepEqual(cosmeticsFor('gsp', owned, { gsp: { body: 'hat_santa', head: 'nonsense', tail: 'hat_santa' } }), {});
  assert.deepEqual(cosmeticsFor('gsp', owned, {}), {}); assert.deepEqual(cosmeticsFor('gsp'), {});
});

test('the database: a purse, buying (once, and only with enough coins), and putting things on', () => {
  const db = openDb();
  const tom = db.createPasswordUser({ email: 'tom@example.com', username: 'Tom', password: 'longenough' }), sam = db.createPasswordUser({ email: 'sam@example.com', username: 'Sam', password: 'longenough' });
  assert.deepEqual(db.wallet(tom.id), { coins: 0, owned: [], equipped: {} });
  assert.equal(db.wallet(999), null);
  assert.throws(() => db.buy(tom.id, 'hat_santa'), { name: 'Error', message: /not have enough coins/ });
  assert.throws(() => db.buy(tom.id, 'nonsense'), AccountError);
  assert.equal(db.addCoins(tom.id, 70), 70); assert.equal(db.addCoins(tom.id, 250.4), 320); assert.equal(db.addCoins(tom.id, -50), 320, 'never taken away by a payment');
  assert.deepEqual(db.buy(tom.id, 'hat_santa'), { coins: 20, owned: ['hat_santa'], equipped: {} });
  assert.throws(() => db.buy(tom.id, 'hat_santa'), /already have/);
  assert.equal(db.wallet(tom.id).coins, 20, 'a refused buy costs nothing');
  assert.throws(() => db.buy(tom.id, 'coat_pippa'), /enough coins/);
  // putting on
  assert.throws(() => db.equip(tom.id, 'gsp', 'head', 'coat_pippa'), /does not fit/);
  assert.throws(() => db.equip(tom.id, 'gsp', 'body', 'coat_pippa'), /Buy it in the shop/);
  assert.throws(() => db.equip(tom.id, 'gsp', 'tail', 'hat_santa'), AccountError);
  assert.deepEqual(db.equip(tom.id, 'gsp', 'head', 'hat_santa').equipped, { gsp: { head: 'hat_santa' } });
  db.equip(tom.id, 'ralph', 'head', 'hat_santa');
  assert.deepEqual(db.wallet(tom.id).equipped, { gsp: { head: 'hat_santa' }, ralph: { head: 'hat_santa' } });
  assert.deepEqual(db.equip(tom.id, 'gsp', 'head', null).equipped, { ralph: { head: 'hat_santa' } });
  // one player's things are their own
  assert.deepEqual(db.wallet(sam.id), { coins: 0, owned: [], equipped: {} });
  assert.throws(() => db.equip(sam.id, 'gsp', 'head', 'hat_santa'), /Buy it/);
  // a deleted account takes its purse and its things with it
  db.deleteUser(tom.id);
  assert.equal(db.wallet(tom.id), null);
  db.close();
});

test('a database from before coins: every player is paid for the races they have already run', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'zr-shop-')), 'old.sqlite');
  const old = openDb(path);
  const tom = old.createPasswordUser({ email: 'tom@example.com', username: 'Tom', password: 'longenough' }), sam = old.createPasswordUser({ email: 'sam@example.com', username: 'Sam', password: 'longenough' });
  old.recordRace([1, 2, 6, 7].map(place => ({ userId: tom.id, mapId: 'wendover', dog: 'gsp', place, racers: 8, finished: true, raceSeconds: 100, bestLap: 30, singlePlayer: true, humans: 1 })));
  old.recordRace([{ userId: tom.id, mapId: 'wendover', dog: 'gsp', place: 3, racers: 6, finished: false, raceSeconds: null, bestLap: null, singlePlayer: true, humans: 1 }]);
  old.close();
  // (as it was before: no purse)
  const raw = new DatabaseSync(path); raw.exec('ALTER TABLE users DROP COLUMN coins'); raw.close();
  const db = openDb(path);
  assert.equal(db.wallet(tom.id).coins, 100 + 70 + 15 + 15 + DID_NOT_FINISH);
  assert.equal(db.wallet(sam.id).coins, 0);
  db.addCoins(sam.id, 40); db.close();
  // opened again: nobody is paid twice
  const again = openDb(path);
  assert.equal(again.wallet(tom.id).coins, 100 + 70 + 15 + 15 + DID_NOT_FINISH); assert.equal(again.wallet(sam.id).coins, 40);
  again.close();
});

test('the requests: who is signed in comes with their wallet; buying and putting on need signing in', async () => {
  const db = openDb(), accounts = createAccounts(db);
  const user = db.createPasswordUser({ email: 'tom@example.com', username: 'Tom', password: 'longenough' }), cookie = `zr_session=${db.createSession(user.id)}`;
  assert.equal((await call(accounts, 'GET', '/api/me')).body.wallet, null);
  assert.deepEqual((await call(accounts, 'GET', '/api/me', { cookie })).body.wallet, { coins: 0, owned: [], equipped: {} });
  assert.equal((await call(accounts, 'POST', '/api/shop/buy', { body: { itemId: 'hat_santa' } })).status, 401);
  assert.equal((await call(accounts, 'POST', '/api/shop/equip', { body: { dog: 'gsp', slot: 'head', itemId: 'hat_santa' } })).status, 401);
  const poor = await call(accounts, 'POST', '/api/shop/buy', { cookie, body: { itemId: 'hat_santa' } });
  assert.equal(poor.status, 400); assert.match(poor.body.error, /enough coins/);
  db.addCoins(user.id, 1000);
  const bought = await call(accounts, 'POST', '/api/shop/buy', { cookie, body: { itemId: 'hat_santa' } });
  assert.equal(bought.status, 200); assert.deepEqual(bought.body.wallet, { coins: 700, owned: ['hat_santa'], equipped: {} });
  const worn = await call(accounts, 'POST', '/api/shop/equip', { cookie, body: { dog: 'gsp', slot: 'head', itemId: 'hat_santa' } });
  assert.deepEqual(worn.body.wallet.equipped, { gsp: { head: 'hat_santa' } });
  assert.equal((await call(accounts, 'POST', '/api/shop/equip', { cookie, body: { dog: '../etc', slot: 'head', itemId: 'hat_santa' } })).status, 400);
  assert.equal((await call(accounts, 'POST', '/api/shop/equip', { cookie, body: { dog: 'gsp', slot: 'body', itemId: 'hat_santa' } })).status, 400);
  const off = await call(accounts, 'POST', '/api/shop/equip', { cookie, body: { dog: 'gsp', slot: 'head', itemId: null } });
  assert.deepEqual(off.body.wallet.equipped, {});
  db.close();
});

test('an admin (ADMIN_EMAILS) owns everything without buying it, and is an ordinary account again when taken off the list', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'zr-admin-')), 'db.sqlite');
  let db = openDb(path, { admins: [' Boss@Example.com ', ''] });
  const boss = db.createPasswordUser({ email: 'boss@example.com', username: 'Boss', password: 'longenough' }), sam = db.createPasswordUser({ email: 'sam@example.com', username: 'Sam', password: 'longenough' });
  assert.ok(db.isAdmin(boss.id) && !db.isAdmin(sam.id) && !db.isAdmin(999));
  const all = SHOP_ITEMS.map(item => item.id);
  assert.deepEqual(db.wallet(boss.id), { coins: 999999, owned: all, equipped: {}, admin: true });
  assert.ok(['ziggy', 'barney', 'merlin', 'nacho'].every(dog => dogUnlocked(dog, db.wallet(boss.id).owned)));
  assert.throws(() => db.buy(boss.id, 'hat_santa'), /already have/);
  assert.deepEqual(db.equip(boss.id, 'gsp', 'body', 'coat_pippa').equipped, { gsp: { body: 'coat_pippa' } });
  assert.throws(() => db.equip(boss.id, 'ralph', 'body', 'coat_pippa'), /does not fit/);
  db.addCoins(boss.id, 70);
  assert.deepEqual(db.wallet(sam.id), { coins: 0, owned: [], equipped: {} }, 'nobody else is touched');
  db.close();
  // off the list: what was really won is still there, and nothing that was not bought
  db = openDb(path);
  assert.deepEqual(db.wallet(boss.id), { coins: 70, owned: [], equipped: {} });
  db.close();
  // an account with no email (a Google sign-in whose address was taken) is never an admin
  const none = openDb(':memory:', { admins: [''] });
  assert.equal(none.isAdmin(none.createProviderUser({ provider: 'google', subject: '1', email: null, username: 'NoMail' }).id), false);
  none.close();
});
