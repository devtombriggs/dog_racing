import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import { openDb, usernameProblem, AccountError } from '../server/db.js';
import { createAccounts } from '../server/accounts.js';

// A request and response like node:http's, enough for server/accounts.js
function call(accounts, method, path, { body, cookie = '', headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    Object.assign(req, { method, url: path, headers: { host: 'localhost:5173', cookie, ...headers }, socket: { remoteAddress: '1.2.3.4' }, destroy() {} });
    const res = {
      headers: {}, headersSent: false,
      getHeader(name) { return this.headers[name.toLowerCase()]; },
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      writeHead(status, more = {}) { this.status = status; for (const [k, v] of Object.entries(more)) this.headers[k.toLowerCase()] = v; this.headersSent = true; },
      end(text = '') {
        const cookies = Object.fromEntries([].concat(this.headers['set-cookie'] ?? []).map(c => c.split(';')[0].split('=')).map(([k, v]) => [k, decodeURIComponent(v)]));
        resolve({ status: this.status, body: text ? JSON.parse(text) : null, location: this.headers.location, cookies, setCookie: this.headers['set-cookie'] });
      },
    };
    assert.equal(accounts.handle(req, res), true, `${method} ${path} is a route`);
    queueMicrotask(() => { if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); });
  });
}
const jar = cookies => Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');

test('accounts: usernames are checked, and unique whatever the case', () => {
  assert.equal(usernameProblem('Tom'), null);
  assert.equal(usernameProblem('Speedy Pablo'), null);
  assert.match(usernameProblem('ab'), /3 to 16/);
  assert.match(usernameProblem('a'.repeat(17)), /3 to 16/);
  assert.match(usernameProblem('<script>'), /letters/);
  const db = openDb();
  db.createPasswordUser({ email: 'tom@example.com', username: 'Tom', password: 'longenough' });
  assert.throws(() => db.createPasswordUser({ email: 'other@example.com', username: 'tom', password: 'longenough' }), /taken/);
  assert.throws(() => db.createPasswordUser({ email: 'TOM@example.com', username: 'Tom2', password: 'longenough' }), /already an account/);
  assert.throws(() => db.createPasswordUser({ email: 'x@example.com', username: 'Shorty', password: 'short' }), AccountError);
  assert.throws(() => db.createPasswordUser({ email: 'not an email', username: 'Fine', password: 'longenough' }), /real email/);
});

test('accounts: sign up, stay signed in, sign out, and sign in again by email and password', async () => {
  const db = openDb(), accounts = createAccounts(db);
  const signedUp = await call(accounts, 'POST', '/auth/signup', { body: { email: 'pippa@example.com', username: 'Pippa', password: 'woofwoofwoof' } });
  assert.equal(signedUp.status, 200);
  assert.equal(signedUp.body.user.username, 'Pippa');
  assert.match(signedUp.setCookie[0], /HttpOnly; SameSite=Lax/);
  const session = signedUp.cookies.zr_session;
  assert.ok(session.length > 30);

  const me = await call(accounts, 'GET', '/api/me', { cookie: jar({ zr_session: session }) });
  assert.equal(me.body.user.username, 'Pippa');
  assert.equal(me.body.google, false);
  assert.equal(me.body.stats.races, 0);
  // the ticket tells the race connection who this is, once
  assert.equal(accounts.userForTicket(me.body.ticket).username, 'Pippa');
  assert.equal(accounts.userForTicket(me.body.ticket), null);

  assert.equal((await call(accounts, 'POST', '/auth/login', { body: { email: 'pippa@example.com', password: 'wrong password' } })).status, 401);
  assert.equal((await call(accounts, 'POST', '/auth/login', { body: { email: 'nobody@example.com', password: 'woofwoofwoof' } })).status, 401);
  const loggedIn = await call(accounts, 'POST', '/auth/login', { body: { email: 'PIPPA@example.com ', password: 'woofwoofwoof' } });
  assert.equal(loggedIn.body.user.username, 'Pippa');

  await call(accounts, 'POST', '/auth/logout', { cookie: jar({ zr_session: session }) });
  assert.equal((await call(accounts, 'GET', '/api/me', { cookie: jar({ zr_session: session }) })).body.user, null);
  assert.equal((await call(accounts, 'GET', '/api/me', { cookie: jar({ zr_session: loggedIn.cookies.zr_session }) })).body.user.username, 'Pippa');

  const taken = await call(accounts, 'POST', '/auth/signup', { body: { email: 'p2@example.com', username: 'PIPPA', password: 'woofwoofwoof' } });
  assert.deepEqual([taken.status, taken.body.error], [400, 'That username is taken']);
  assert.deepEqual((await call(accounts, 'GET', '/api/username?name=pippa')).body, { ok: false, problem: 'That username is taken' });
  assert.deepEqual((await call(accounts, 'GET', '/api/username?name=Rocky')).body, { ok: true, problem: null });
});

test('accounts: a post from another site is refused, and too many tries are slowed down', async () => {
  const accounts = createAccounts(openDb());
  const elsewhere = await call(accounts, 'POST', '/auth/login', { body: { email: 'a@b.co', password: 'x' }, headers: { origin: 'https://evil.example' } });
  assert.equal(elsewhere.status, 403);
  let last;
  for (let i = 0; i < 21; i++) last = await call(accounts, 'POST', '/auth/login', { body: { email: 'a@b.co', password: 'xxxxxxxx' } });
  assert.equal(last.status, 429);
});

test('accounts: Google sign-in, the first time choosing a username, after that straight in', async () => {
  const db = openDb();
  const asked = [];
  const fetchImpl = async (url, options) => {
    asked.push({ url, body: String(options.body ?? '') });
    if (url.includes('token')) return { ok: true, json: async () => ({ access_token: 'access' }) };
    return { ok: true, json: async () => ({ sub: 'google-123', email: 'jazz@gmail.com', email_verified: true, given_name: 'Jazz' }) };
  };
  const accounts = createAccounts(db, { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }, { fetchImpl });
  assert.equal((await call(accounts, 'GET', '/api/me')).body.google, true);

  const start = await call(accounts, 'GET', '/auth/google');
  const to = new URL(start.location);
  assert.equal(to.origin, 'https://accounts.google.com');
  assert.equal(to.searchParams.get('redirect_uri'), 'http://localhost:5173/auth/google/callback');
  const state = start.cookies.zr_google_state;
  assert.equal(to.searchParams.get('state'), state);

  // (a wrong state is turned away)
  const forged = await call(accounts, 'GET', '/auth/google/callback?code=c&state=wrong', { cookie: jar({ zr_google_state: state }) });
  assert.match(forged.location, /^\/\?signin=Google/);

  const back = await call(accounts, 'GET', `/auth/google/callback?code=c&state=${state}`, { cookie: jar({ zr_google_state: state }) });
  assert.equal(back.location, '/?signin=username');
  assert.match(asked[0].body, /client_secret=secret/);
  const pending = back.cookies.zr_pending;
  const me = await call(accounts, 'GET', '/api/me', { cookie: jar({ zr_pending: pending }) });
  assert.deepEqual(me.body.pending, { provider: 'google', email: 'jazz@gmail.com', suggested: 'Jazz' });

  const made = await call(accounts, 'POST', '/auth/finish', { body: { username: 'JazzHands' }, cookie: jar({ zr_pending: pending }) });
  assert.equal(made.body.user.username, 'JazzHands');
  assert.equal(made.body.user.email, 'jazz@gmail.com');
  assert.ok(made.cookies.zr_session);

  // the second time: signed straight in
  const again = await call(accounts, 'GET', `/auth/google/callback?code=c&state=s2`, { cookie: jar({ zr_google_state: 's2' }) });
  assert.equal(again.location, '/');
  const me2 = await call(accounts, 'GET', '/api/me', { cookie: jar({ zr_session: again.cookies.zr_session }) });
  assert.equal(me2.body.user.username, 'JazzHands');
});

test('leaderboards: fastest laps and races per map, wins, podiums, win rate, Grand Prix wins and dogs', () => {
  const db = openDb();
  const tom = db.createPasswordUser({ email: 'tom@example.com', username: 'Tom', password: 'longenough' });
  const sam = db.createPasswordUser({ email: 'sam@example.com', username: 'Sam', password: 'longenough' });
  const race = (user, place, dog, lap, seconds, mapId = 'wendover') => ({ userId: user.id, mapId, dog, place, racers: 6, finished: seconds != null, raceSeconds: seconds, bestLap: lap, singlePlayer: false });
  db.recordRace([race(tom, 1, 'ralph', 30.5, 100), race(sam, 2, 'casper', 29.9, 104)]);
  db.recordRace([race(tom, 3, 'ralph', 31, 110), race(sam, 1, 'casper', 32, 101)]);
  db.recordRace([race(tom, 1, 'jazz', 20, 70, 'frostpeak'), race(sam, 6, 'casper', null, null, 'frostpeak')]);
  for (let i = 0; i < 10; i++) db.recordRace([race(sam, 2, 'casper', null, null)]);
  db.recordGrandPrix([{ userId: tom.id, grandPrix: 'paw', place: 1, points: 40 }, { userId: sam.id, grandPrix: 'paw', place: 2, points: 30 }]);

  const boards = db.leaderboards();
  assert.deepEqual(boards.fastestLaps.wendover.map(r => [r.username, r.seconds, r.dog]), [['Sam', 29.9, 'casper'], ['Tom', 30.5, 'ralph']]);
  assert.deepEqual(boards.fastestRaces.wendover.map(r => [r.username, r.seconds]), [['Tom', 100], ['Sam', 101]]);
  assert.deepEqual(boards.fastestLaps.frostpeak.map(r => r.username), ['Tom']);
  assert.deepEqual(boards.mostRaces.map(r => [r.username, r.value, r.favouriteDog]), [['Sam', 13, 'casper'], ['Tom', 3, 'ralph']]);
  assert.deepEqual(boards.mostWins.map(r => [r.username, r.value]), [['Tom', 2], ['Sam', 1]]);
  assert.deepEqual(boards.mostPodiums.map(r => [r.username, r.value]), [['Sam', 12], ['Tom', 3]]);
  assert.deepEqual(boards.winRate.map(r => [r.username, r.value, r.races]), [['Sam', 8, 13]], '(only players with 10 races or more)');
  assert.deepEqual(boards.grandPrixWins.map(r => [r.username, r.value]), [['Tom', 1]]);
  assert.deepEqual(boards.popularDogs[0], { dog: 'casper', races: 13, wins: 1 });

  const mine = db.playerStats(tom.id);
  assert.deepEqual([mine.races, mine.wins, mine.podiums, mine.grandPrixWins, mine.favouriteDog], [3, 2, 3, 1, 'ralph']);
  assert.deepEqual(mine.bestLaps, { wendover: 30.5, frostpeak: 20 });
});

test('accounts: sessions run out', () => {
  let time = 1_000;
  const db = openDb(':memory:', { now: () => time });
  const user = db.createPasswordUser({ email: 'a@example.com', username: 'Ayy', password: 'longenough' });
  const token = db.createSession(user.id);
  assert.equal(db.userForSession(token).username, 'Ayy');
  time += 61 * 86400e3;
  assert.equal(db.userForSession(token), null);
});
