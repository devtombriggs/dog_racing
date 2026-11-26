// Signing in, over plain HTTP beside the race connection: an email and password, or Google.  A signed-in
// browser holds a session cookie (httpOnly: the page itself never sees it).  The race connection is told who
// the player is with a ticket: GET /api/me hands one out, and the game passes it on (socket 'account').
//
//   GET  /api/me                      who is signed in: { user, stats, ticket, google, pending }
//   POST /auth/signup                 { email, username, password }
//   POST /auth/login                  { email, password }
//   POST /auth/logout
//   POST /auth/delete                 { confirm: username }: deletes the signed-in account and all its races
//   GET  /auth/google                 off to Google's sign-in page...
//   GET  /auth/google/callback        ...and back: signed in, or (the first time) on to choose a username
//   POST /auth/finish                 { username }: makes the account for a first Google sign-in
//   GET  /api/leaderboards            every leaderboard
//
// Google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; without them its button is not shown.  The address
// Google sends the player back to is PUBLIC_URL + /auth/google/callback (PUBLIC_URL: e.g. https://zoomies.example;
// left out, it is worked out from the request).
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { AccountError, usernameProblem } from './db.js';

const SESSION_COOKIE = 'zr_session';
const STATE_COOKIE = 'zr_google_state';
const PENDING_COOKIE = 'zr_pending';
const TICKET_MS = 5 * 60e3;
const PENDING_MS = 15 * 60e3;
const LIMIT = { attempts: 20, windowMs: 10 * 60e3 };      // sign-in and sign-up tries from one address
const BODY_LIMIT = 10_000;

const GOOGLE = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
};

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

/** The token in a request's session cookie (also used for the race connection's own handshake) */
export const sessionTokenOf = req => cookies(req)[SESSION_COOKIE] ?? null;

/**
 * env: { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL }.  fetchImpl: for the tests.
 * Returns { handle(req, res) -> true if it was one of these routes, userForTicket(ticket) }.
 */
export function createAccounts(db, env = {}, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET } : null;
  const tickets = new Map();      // ticket -> { userId, expires }
  const pending = new Map();      // first Google sign-in waiting for a username: key -> { provider, subject, email, name, expires }
  const tries = new Map();        // address -> { count, since }

  const tidy = () => {
    const t = now();
    for (const [key, value] of tickets) if (value.expires < t) tickets.delete(key);
    for (const [key, value] of pending) if (value.expires < t) pending.delete(key);
    for (const [key, value] of tries) if (t - value.since > LIMIT.windowMs) tries.delete(key);
  };

  const secure = req => (req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https' || Boolean(req.socket?.encrypted);
  const origin = req => env.PUBLIC_URL?.replace(/\/$/, '')
    || `${secure(req) ? 'https' : 'http'}://${(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim()}`;
  const address = req => (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || '?';

  function setCookie(res, req, name, value, maxAgeSeconds) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (secure(req)) parts.push('Secure');
    const list = [].concat(res.getHeader('Set-Cookie') ?? []);
    res.setHeader('Set-Cookie', [...list, parts.join('; ')]);
  }
  const clearCookie = (res, req, name) => setCookie(res, req, name, '', 0);

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  function redirect(res, location) {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', chunk => { size += chunk.length; if (size > BODY_LIMIT) { reject(new AccountError('Too much data')); req.destroy(); } else chunks.push(chunk); });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new AccountError('Bad request')); } });
      req.on('error', reject);
    });
  }

  // (too many tries from one address: wait a while)
  function limited(req) {
    tidy();
    const key = address(req), entry = tries.get(key) ?? { count: 0, since: now() };
    entry.count += 1; tries.set(key, entry);
    return entry.count > LIMIT.attempts;
  }

  function signIn(res, req, user) {
    setCookie(res, req, SESSION_COOKIE, db.createSession(user.id), 60 * 60 * 24 * 60);
  }

  function ticketFor(user) {
    tidy();
    const ticket = randomBytes(24).toString('base64url');
    tickets.set(ticket, { userId: user.id, expires: now() + TICKET_MS });
    return ticket;
  }

  const pendingOf = req => { const entry = pending.get(cookies(req)[PENDING_COOKIE]); return entry && entry.expires >= now() ? entry : null; };
  // (a username suggested from the Google name: letters and numbers only, made unique)
  function suggestion(name) {
    const base = String(name ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 12) || 'Racer';
    const start = base.length >= 3 ? base : `${base}Dog`;
    for (let n = 0; n < 50; n++) {
      const candidate = n ? `${start}${n + 1}` : start;
      if (!db.usernameTaken(candidate)) return candidate;
    }
    return '';
  }

  const routes = {
    'GET /api/me': (req, res) => {
      const user = db.userForSession(sessionTokenOf(req));
      const waiting = !user && pendingOf(req);
      send(res, 200, {
        user, google: Boolean(google),
        stats: user ? db.playerStats(user.id) : null,
        wallet: user ? db.wallet(user.id) : null,          // coins, what is owned and what each dog wears (shared/shop.js)
        ticket: user ? ticketFor(user) : null,
        pending: waiting ? { provider: waiting.provider, email: waiting.email, suggested: suggestion(waiting.name) } : null,
      });
    },

    'POST /auth/signup': async (req, res) => {
      if (limited(req)) return send(res, 429, { error: 'Too many tries: wait a few minutes' });
      const { email, username, password } = await readJson(req);
      const user = db.createPasswordUser({ email, username, password });
      signIn(res, req, user);
      send(res, 200, { user });
    },

    'POST /auth/login': async (req, res) => {
      if (limited(req)) return send(res, 429, { error: 'Too many tries: wait a few minutes' });
      const { email, password } = await readJson(req);
      const user = db.checkPassword(email, password);
      if (!user) return send(res, 401, { error: 'That email and password do not match an account' });
      signIn(res, req, user);
      send(res, 200, { user });
    },

    'POST /auth/logout': (req, res) => {
      db.endSession(sessionTokenOf(req));
      clearCookie(res, req, SESSION_COOKIE);
      send(res, 200, { user: null });
    },

    'GET /auth/google': (req, res) => {
      if (!google) return send(res, 404, { error: 'Google sign-in is not set up' });
      const state = randomBytes(24).toString('base64url');
      setCookie(res, req, STATE_COOKIE, state, 600);
      const query = new URLSearchParams({
        client_id: google.id, redirect_uri: `${origin(req)}/auth/google/callback`, response_type: 'code',
        scope: 'openid email profile', state, prompt: 'select_account',
      });
      redirect(res, `${GOOGLE.authorize}?${query}`);
    },

    'GET /auth/google/callback': async (req, res, url) => {
      if (!google) return send(res, 404, { error: 'Google sign-in is not set up' });
      const back = problem => redirect(res, `/?signin=${encodeURIComponent(problem)}`);
      const state = cookies(req)[STATE_COOKIE];
      clearCookie(res, req, STATE_COOKIE);
      if (url.searchParams.get('error')) return back('Google sign-in was cancelled');
      if (!state || url.searchParams.get('state') !== state || !url.searchParams.get('code')) return back('Google sign-in did not work: try again');
      let profile;
      try {
        const tokenResponse = await fetchImpl(GOOGLE.token, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: google.id, client_secret: google.secret,
            redirect_uri: `${origin(req)}/auth/google/callback`, grant_type: 'authorization_code' }),
        });
        const token = await tokenResponse.json();
        if (!tokenResponse.ok || !token.access_token) throw new Error(token.error ?? 'no token');
        const infoResponse = await fetchImpl(GOOGLE.userinfo, { headers: { Authorization: `Bearer ${token.access_token}` } });
        profile = await infoResponse.json();
        if (!infoResponse.ok || !profile.sub) throw new Error('no profile');
      } catch (error) {
        console.warn('Google sign-in failed:', error.message);
        return back('Google sign-in did not work: try again');
      }
      const user = db.userForLogin('google', profile.sub);
      if (user) { signIn(res, req, user); return redirect(res, '/'); }
      // the first time: the player chooses a username, then the account is made (POST /auth/finish)
      const key = randomBytes(24).toString('base64url');
      pending.set(key, { provider: 'google', subject: profile.sub, email: profile.email_verified ? profile.email : null,
        name: profile.given_name ?? profile.name, expires: now() + PENDING_MS });
      setCookie(res, req, PENDING_COOKIE, key, PENDING_MS / 1000);
      redirect(res, '/?signin=username');
    },

    // Deleting your own account (the Privacy page promises it): the player types their username to be sure
    'POST /auth/delete': async (req, res) => {
      const user = db.userForSession(sessionTokenOf(req));
      if (!user) return send(res, 401, { error: 'Sign in first' });
      const { confirm } = await readJson(req);
      if (typeof confirm !== 'string' || confirm.trim().toLowerCase() !== user.username.toLowerCase()) {
        return send(res, 400, { error: 'Type your username exactly to delete your account' });
      }
      db.deleteUser(user.id);
      clearCookie(res, req, SESSION_COOKIE);
      console.log(`[accounts] account ${user.id} deleted by its owner`);
      send(res, 200, { user: null });
    },

    'POST /auth/finish': async (req, res) => {
      const waiting = pendingOf(req);
      if (!waiting) return send(res, 400, { error: 'That took too long: sign in again' });
      const { username } = await readJson(req);
      const user = db.createProviderUser({ provider: waiting.provider, subject: waiting.subject, email: waiting.email, username });
      pending.delete(cookies(req)[PENDING_COOKIE]);
      clearCookie(res, req, PENDING_COOKIE);
      signIn(res, req, user);
      send(res, 200, { user });
    },

    'POST /auth/cancel': (req, res) => {
      pending.delete(cookies(req)[PENDING_COOKIE]);
      clearCookie(res, req, PENDING_COOKIE);
      send(res, 200, { ok: true });
    },

    'GET /api/username': (req, res, url) => {
      const name = url.searchParams.get('name') ?? '';
      const problem = usernameProblem(name) ?? (db.usernameTaken(name) ? 'That username is taken' : null);
      send(res, 200, { ok: !problem, problem });
    },

    'GET /api/leaderboards': (req, res) => send(res, 200, db.leaderboards()),

    // The shop and the garage (shared/shop.js).  Each answers with the player's wallet as it now is.
    'POST /api/shop/buy': async (req, res) => {
      const user = db.userForSession(sessionTokenOf(req));
      if (!user) return send(res, 401, { error: 'Sign in to use the shop' });
      const { itemId } = await readJson(req);
      send(res, 200, { wallet: db.buy(user.id, itemId) });
    },
    'POST /api/shop/equip': async (req, res) => {
      const user = db.userForSession(sessionTokenOf(req));
      if (!user) return send(res, 401, { error: 'Sign in to use the garage' });
      const { dog, slot, itemId } = await readJson(req);
      if (typeof dog !== 'string' || !/^[a-z_]{2,24}$/.test(dog)) return send(res, 400, { error: 'That is not one of the dogs' });
      send(res, 200, { wallet: db.equip(user.id, dog, slot, itemId ?? null) });
    },
  };

  return {
    google: Boolean(google),

    /** Answers the request if it is one of the routes above (true), or leaves it alone (false) */
    handle(req, res) {
      const url = new URL(req.url, 'http://x');
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) return false;
      // (a form posted from another site is not let through: these come from the game's own pages)
      if (req.method === 'POST') {
        // (compared by host, not http/https: a proxy in front that ends HTTPS can make the scheme look wrong)
        const from = req.headers.origin;
        const hostOf = text => { try { return new URL(text).host.toLowerCase(); } catch { return null; } };
        const ours = [origin(req), `http://${req.headers['x-forwarded-host'] ?? ''}`.split(',')[0], `http://${req.headers.host ?? ''}`, ...(env.ALLOW_ORIGIN ?? '').split(',')]
          .map(hostOf).filter(Boolean);
        if (from && !ours.includes(hostOf(from))) {
          console.warn(`[accounts] refused a post from ${from} (expected ${[...new Set(ours)].join(' or ')})`);
          send(res, 403, { error: 'Not allowed' }); return true;
        }
      }
      Promise.resolve()
        .then(() => route(req, res, url))
        .catch((error) => {
          if (res.headersSent) return;
          if (error instanceof AccountError) send(res, 400, { error: error.message });
          else { console.error('Account request failed:', error); send(res, 500, { error: 'Something went wrong' }); }
        });
      return true;
    },

    /** The account a ticket from GET /api/me stands for (each ticket works once) */
    userForTicket(ticket) {
      const entry = typeof ticket === 'string' && tickets.get(ticket);
      if (!entry) return null;
      tickets.delete(ticket);
      return entry.expires >= now() ? db.user(entry.userId) : null;
    },
  };
}
