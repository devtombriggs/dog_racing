// The game's database: player accounts, how they sign in, and every race they have run (for the
// leaderboards).  SQLite, built into Node: in memory unless DB_PATH names a file (Docker keeps that file on
// a volume, so it survives a rebuild).  Plain SQL throughout, kept to this file, so that moving to a
// database server of its own later is a change here and nowhere else.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { SHOP_ITEM, SHOP_ITEMS, SLOTS, PLACE_COINS, DID_NOT_FINISH, fitsDog } from '../shared/shop.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,       -- (lower case: no two players called Tom and tom)
    email TEXT,
    email_key TEXT UNIQUE,
    created_at INTEGER NOT NULL
  );
  -- how a player signs in: 'password' (email and password) or 'google'; one row each
  CREATE TABLE IF NOT EXISTS logins (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,                   -- the email for 'password', Google's id for the player for 'google'
    secret TEXT,                             -- 'password': salt and scrypt hash
    PRIMARY KEY (provider, subject)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  -- one row for each signed-in player in each race
  CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_id TEXT NOT NULL,
    dog TEXT NOT NULL,
    place INTEGER NOT NULL,
    racers INTEGER NOT NULL,
    finished INTEGER NOT NULL,
    race_seconds REAL,                       -- (null: did not finish)
    best_lap REAL,                           -- (null: no whole lap run)
    grand_prix TEXT,
    single_player INTEGER NOT NULL,
    raced_at INTEGER NOT NULL,
    humans INTEGER                           -- people in the race (2 or more: the Multiplayer boards; null, from before: by single_player)
  );
  CREATE INDEX IF NOT EXISTS race_results_user ON race_results(user_id);
  CREATE INDEX IF NOT EXISTS race_results_map ON race_results(map_id);
  -- the end of a Grand Prix: each signed-in player's final place
  CREATE TABLE IF NOT EXISTS grand_prix_results (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grand_prix TEXT NOT NULL,
    place INTEGER NOT NULL,
    points INTEGER NOT NULL,
    raced_at INTEGER NOT NULL,
    humans INTEGER                           -- (as race_results: the people in its last race)
  );
  -- the shop (shared/shop.js): what each player has bought, and what each of their dogs is wearing.  (How many coins they
  -- have is users.coins, added to an older database when it is opened)
  CREATE TABLE IF NOT EXISTS purchases (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    price INTEGER NOT NULL,
    bought_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );
  CREATE TABLE IF NOT EXISTS equipped (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dog TEXT NOT NULL,
    slot TEXT NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (user_id, dog, slot)
  );
`;

export const SESSION_DAYS = 60;
export const USERNAME = { min: 3, max: 16, pattern: /^[A-Za-z0-9_][A-Za-z0-9_ .-]*[A-Za-z0-9_]$/ };
const BOARD_SIZE = 10;
const WIN_RATE_MIN_RACES = 10;

export class AccountError extends Error {}

/** What is wrong with a username, or null if it will do. */
export function usernameProblem(name) {
  if (typeof name !== 'string') return 'Choose a username';
  const trimmed = name.trim();
  if (trimmed.length < USERNAME.min || trimmed.length > USERNAME.max) return `Usernames are ${USERNAME.min} to ${USERNAME.max} characters`;
  if (!USERNAME.pattern.test(trimmed) || /\s{2}/.test(trimmed)) return 'Usernames can have letters, numbers, spaces, dots, dashes and underscores';
  return null;
}

const emailKey = email => email.trim().toLowerCase();
export const looksLikeEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString('base64')}:${scryptSync(password, salt, 64).toString('base64')}`;
}
function passwordMatches(password, stored) {
  const [kind, salt, hash] = String(stored).split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(expected, got);
}

/** How many coins an admin is shown as having: they own everything anyway */
export const ADMIN_COINS = 999999;

/**
 * Opens the database (path: a file, or ':memory:') and makes its tables if they are not there yet.
 * admins: email addresses whose accounts own everything in the shop without buying it (ADMIN_EMAILS on the server: for the
 * people who run the game to see and try everything).  Nothing is written to the database for it: take the address out and
 * the account is an ordinary one again, with whatever it had really won and bought.
 */
export function openDb(path = ':memory:', { now = () => Date.now(), admins = [] } = {}) {
  const adminKeys = new Set(admins.map(email => String(email).trim().toLowerCase()).filter(Boolean));
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // (a database from before the Single Player and Multiplayer boards: add the column; its races count as Single Player)
  for (const table of ['race_results', 'grand_prix_results']) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === 'humans')) db.exec(`ALTER TABLE ${table} ADD COLUMN humans INTEGER`);
  }

  // (a database from before coins: add the purse, and pay every player for the races they have already run, as those races
  // would pay now: by the place they finished in, in full)
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'coins')) {
    db.exec('ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0');
    const pay = PLACE_COINS.map((coins, k) => `WHEN ${k + 1} THEN ${coins}`).join(' ');
    db.exec(`UPDATE users SET coins = COALESCE((SELECT SUM(CASE WHEN r.finished = 0 THEN ${DID_NOT_FINISH} ELSE CASE MIN(r.place, ${PLACE_COINS.length}) ${pay} ELSE 0 END END)
      FROM race_results r WHERE r.user_id = users.id), 0)`);
  }

  const q = sql => db.prepare(sql);
  const userRow = q('SELECT id, username, email, created_at AS createdAt FROM users WHERE id = ?');
  const publicUser = row => (row ? { id: Number(row.id), username: row.username, email: row.email ?? null } : null);

  function transaction(work) {
    db.exec('BEGIN');
    try { const result = work(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function insertUser(username, email) {
    const problem = usernameProblem(username);
    if (problem) throw new AccountError(problem);
    const name = username.trim();
    if (q('SELECT 1 FROM users WHERE username_key = ?').get(name.toLowerCase())) throw new AccountError('That username is taken');
    if (email && q('SELECT 1 FROM users WHERE email_key = ?').get(emailKey(email))) throw new AccountError('There is already an account with that email');
    const { lastInsertRowid } = q('INSERT INTO users (username, username_key, email, email_key, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, name.toLowerCase(), email ? email.trim() : null, email ? emailKey(email) : null, now());
    return Number(lastInsertRowid);
  }

  return {
    close: () => db.close(),

    // ---------- accounts ----------
    usernameTaken: name => Boolean(q('SELECT 1 FROM users WHERE username_key = ?').get(String(name).trim().toLowerCase())),

    /** A new account signed into with an email and password.  Throws AccountError with words for the player. */
    createPasswordUser({ email, username, password }) {
      if (!looksLikeEmail(email)) throw new AccountError('Enter a real email address');
      if (typeof password !== 'string' || password.length < 8) throw new AccountError('Passwords need at least 8 characters');
      if (password.length > 200) throw new AccountError('That password is too long');
      return transaction(() => {
        const id = insertUser(username, email);
        q('INSERT INTO logins (user_id, provider, subject, secret) VALUES (?, ?, ?, ?)').run(id, 'password', emailKey(email), hashPassword(password));
        return publicUser(userRow.get(id));
      });
    },

    /** The account for this email and password, or null. */
    checkPassword(email, password) {
      if (typeof email !== 'string' || typeof password !== 'string') return null;
      const login = q("SELECT user_id, secret FROM logins WHERE provider = 'password' AND subject = ?").get(emailKey(email));
      if (!login) { hashPassword(password); return null; }          // (as slow as a real check: no telling which emails have accounts)
      return passwordMatches(password, login.secret) ? publicUser(userRow.get(login.user_id)) : null;
    },

    /** The account signed into with this Google id, or null. */
    userForLogin(provider, subject) {
      const login = q('SELECT user_id FROM logins WHERE provider = ? AND subject = ?').get(provider, String(subject));
      return login ? publicUser(userRow.get(login.user_id)) : null;
    },

    /** A new account signed into with Google (the player has just chosen the username). */
    createProviderUser({ provider, subject, email, username }) {
      return transaction(() => {
        if (q('SELECT 1 FROM logins WHERE provider = ? AND subject = ?').get(provider, String(subject))) throw new AccountError('That account already exists');
        // (an email already on another account is not taken over: the new account just has none)
        const free = email && looksLikeEmail(email) && !q('SELECT 1 FROM users WHERE email_key = ?').get(emailKey(email));
        const id = insertUser(username, free ? email : null);
        q('INSERT INTO logins (user_id, provider, subject) VALUES (?, ?, ?)').run(id, provider, String(subject));
        return publicUser(userRow.get(id));
      });
    },

    user: id => publicUser(userRow.get(id)),
    /** Deletes an account and everything kept about it: its sign-ins, sessions and race results (ON DELETE CASCADE) */
    deleteUser: id => Number(q('DELETE FROM users WHERE id = ?').run(id).changes) > 0,

    // ---------- sessions ----------
    createSession(userId) {
      const token = randomBytes(32).toString('base64url');
      q('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, now() + SESSION_DAYS * 86400e3);
      return token;
    },
    userForSession(token) {
      if (typeof token !== 'string' || !token) return null;
      const row = q('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token);
      if (!row) return null;
      if (row.expires_at < now()) { q('DELETE FROM sessions WHERE token = ?').run(token); return null; }
      return publicUser(userRow.get(row.user_id));
    },
    endSession: token => { if (typeof token === 'string') q('DELETE FROM sessions WHERE token = ?').run(token); },
    clearOldSessions: () => q('DELETE FROM sessions WHERE expires_at < ?').run(now()),

    // ---------- races ----------
    /** results: [{ userId, mapId, dog, place, racers, finished, raceSeconds, bestLap, grandPrix, singlePlayer, humans }] */
    recordRace(results) {
      const insert = q(`INSERT INTO race_results (user_id, map_id, dog, place, racers, finished, race_seconds, best_lap, grand_prix, single_player, raced_at, humans)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      transaction(() => {
        for (const r of results) {
          insert.run(r.userId, r.mapId, r.dog, r.place, r.racers, r.finished ? 1 : 0, r.finished ? r.raceSeconds : null,
            r.bestLap ?? null, r.grandPrix ?? null, r.singlePlayer ? 1 : 0, now(), r.humans ?? 1);
        }
      });
    },
    /** results: [{ userId, grandPrix, place, points, humans }] */
    recordGrandPrix(results) {
      const insert = q('INSERT INTO grand_prix_results (user_id, grand_prix, place, points, raced_at, humans) VALUES (?, ?, ?, ?, ?, ?)');
      transaction(() => { for (const r of results) insert.run(r.userId, r.grandPrix, r.place, r.points, now(), r.humans ?? 1); });
    },

    // ---------- coins, the shop and the garage (shared/shop.js) ----------
    /** What a player has: { coins, owned: [item id], equipped: { dog: { slot: item id } } } */
    /** Is this account one of the admins' (see openDb)? */
    isAdmin(userId) {
      if (!adminKeys.size) return false;
      const key = q('SELECT email_key FROM users WHERE id = ?').get(userId)?.email_key;
      return Boolean(key) && adminKeys.has(key);
    },
    wallet(userId) {
      const row = q('SELECT coins FROM users WHERE id = ?').get(userId);
      if (!row) return null;
      const admin = this.isAdmin(userId);
      const owned = admin ? SHOP_ITEMS.map(item => item.id)
        : q('SELECT item_id FROM purchases WHERE user_id = ? ORDER BY bought_at, item_id').all(userId).map(each => each.item_id).filter(id => SHOP_ITEM[id]);
      const equipped = {};
      for (const each of q('SELECT dog, slot, item_id FROM equipped WHERE user_id = ?').all(userId)) {
        if (owned.includes(each.item_id) && SHOP_ITEM[each.item_id]) (equipped[each.dog] ??= {})[each.slot] = each.item_id;
      }
      return admin ? { coins: ADMIN_COINS, owned, equipped, admin: true } : { coins: Number(row.coins), owned, equipped };
    },
    /** Pays a player (a race's winnings).  Returns how many coins they have now. */
    addCoins(userId, coins) {
      const n = Math.max(0, Math.round(Number(coins) || 0));
      if (n) q('UPDATE users SET coins = coins + ? WHERE id = ?').run(n, userId);
      return Number(q('SELECT coins FROM users WHERE id = ?').get(userId)?.coins ?? 0);
    },
    /** Buys something from the shop.  Throws AccountError with words for the player.  Returns their wallet. */
    buy(userId, itemId) {
      const item = SHOP_ITEM[itemId];
      if (!item) throw new AccountError('That is not in the shop');
      if (this.isAdmin(userId)) throw new AccountError('You already have that');
      return transaction(() => {
        if (q('SELECT 1 FROM purchases WHERE user_id = ? AND item_id = ?').get(userId, item.id)) throw new AccountError('You already have that');
        // (taken only if there is enough: two buys at the same moment cannot spend the same coins)
        const paid = q('UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?').run(item.price, userId, item.price);
        if (!Number(paid.changes)) throw new AccountError('You do not have enough coins for that yet');
        q('INSERT INTO purchases (user_id, item_id, price, bought_at) VALUES (?, ?, ?, ?)').run(userId, item.id, item.price, now());
        return this.wallet(userId);
      });
    },
    /** Puts something a player owns on one of their dogs (itemId null: takes off whatever is in that slot).  Returns their wallet. */
    equip(userId, dog, slot, itemId) {
      if (typeof dog !== 'string' || !SLOTS[slot]) throw new AccountError('That cannot be worn there');
      if (itemId == null) { q('DELETE FROM equipped WHERE user_id = ? AND dog = ? AND slot = ?').run(userId, dog, slot); return this.wallet(userId); }
      const item = SHOP_ITEM[itemId];
      if (!item || item.slot !== slot || !fitsDog(item, dog)) throw new AccountError('That does not fit this dog');
      if (!this.isAdmin(userId) && !q('SELECT 1 FROM purchases WHERE user_id = ? AND item_id = ?').get(userId, item.id)) throw new AccountError('Buy it in the shop first');
      q('INSERT INTO equipped (user_id, dog, slot, item_id) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, dog, slot) DO UPDATE SET item_id = excluded.item_id').run(userId, dog, slot, item.id);
      return this.wallet(userId);
    },

    // ---------- leaderboards ----------
    /**
     * Every board at once (they are small), twice: `multiplayer`, races between two or more people, and `singlePlayer`,
     * everything else (against the computer dogs alone).  See the Leaderboards screen
     */
    leaderboards() {
      return { multiplayer: this.boards(true), singlePlayer: this.boards(false), winRateMinRaces: WIN_RATE_MIN_RACES };
    },
    boards(multiplayer) {
      // (a race from before the count was kept, humans null, goes by how it was started: from Multiplayer, Multiplayer (Tom,
      // 2026-11-23: his early online races had all gone to Single Player).  A Grand Prix from then goes by its races)
      const side = multiplayer ? '>=' : '<';
      const mode = `COALESCE(humans, CASE WHEN single_player = 0 THEN 2 ELSE 1 END) ${side} 2`;
      const gpMode = `COALESCE(g.humans, CASE WHEN EXISTS (SELECT 1 FROM race_results o WHERE o.user_id = g.user_id AND o.grand_prix = g.grand_prix
        AND o.humans IS NULL AND o.single_player = 0 AND ABS(o.raced_at - g.raced_at) < 60000) THEN 2 ELSE 1 END) ${side} 2`;
      const limit = BOARD_SIZE;
      const favourite = q(`SELECT dog FROM race_results WHERE user_id = ? AND ${mode} GROUP BY dog ORDER BY COUNT(*) DESC, MAX(raced_at) DESC LIMIT 1`);
      const withDog = rows => rows.map(row => ({ ...row, userId: Number(row.userId), favouriteDog: favourite.get(row.userId)?.dog ?? null }));
      const byPlayer = (select, having = '', order) => withDog(q(`
        SELECT u.id AS userId, u.username, ${select}
        FROM race_results r JOIN users u ON u.id = r.user_id WHERE ${mode}
        GROUP BY u.id ${having} ORDER BY ${order}, MIN(r.raced_at) LIMIT ${limit}`).all());

      // the fastest lap and the fastest race on each map: each player's best once, with the dog it was done with
      const fastest = (column) => {
        const rows = q(`
          SELECT map_id AS mapId, userId, username, dog, value FROM (
            SELECT r.map_id, u.id AS userId, u.username, r.dog, r.${column} AS value,
              ROW_NUMBER() OVER (PARTITION BY r.map_id, r.user_id ORDER BY r.${column}, r.raced_at) AS mine,
              r.raced_at
            FROM race_results r JOIN users u ON u.id = r.user_id
            WHERE r.${column} IS NOT NULL AND ${mode}
          ) WHERE mine = 1 ORDER BY map_id, value, raced_at`).all();
        const maps = {};
        for (const row of rows) {
          const list = (maps[row.mapId] ??= []);
          if (list.length < limit) list.push({ userId: Number(row.userId), username: row.username, dog: row.dog, seconds: row.value });
        }
        return maps;
      };

      return {
        fastestLaps: fastest('best_lap'),
        fastestRaces: fastest('race_seconds'),
        mostRaces: byPlayer('COUNT(*) AS value', '', 'value DESC'),
        mostWins: byPlayer('SUM(r.place = 1) AS value', 'HAVING value > 0', 'value DESC'),
        mostPodiums: byPlayer('SUM(r.place <= 3) AS value', 'HAVING value > 0', 'value DESC'),
        winRate: byPlayer('ROUND(100.0 * SUM(r.place = 1) / COUNT(*)) AS value, COUNT(*) AS races', `HAVING races >= ${WIN_RATE_MIN_RACES}`, 'value DESC, races DESC'),
        grandPrixWins: withDog(q(`
          SELECT u.id AS userId, u.username, COUNT(*) AS value
          FROM grand_prix_results g JOIN users u ON u.id = g.user_id WHERE g.place = 1 AND ${gpMode}
          GROUP BY u.id ORDER BY value DESC, MIN(g.raced_at) LIMIT ${limit}`).all()),
        popularDogs: q(`SELECT dog, COUNT(*) AS races, SUM(place = 1) AS wins FROM race_results WHERE ${mode} GROUP BY dog ORDER BY races DESC, wins DESC`).all()
          .map(row => ({ dog: row.dog, races: Number(row.races), wins: Number(row.wins) })),
      };
    },

    /** One player's own numbers */
    playerStats(userId) {
      const totals = q(`SELECT COUNT(*) AS races, COALESCE(SUM(place = 1), 0) AS wins, COALESCE(SUM(place <= 3), 0) AS podiums,
        COALESCE(SUM(finished), 0) AS finished FROM race_results WHERE user_id = ?`).get(userId);
      const dogs = q('SELECT dog, COUNT(*) AS races, SUM(place = 1) AS wins FROM race_results WHERE user_id = ? GROUP BY dog ORDER BY races DESC, MAX(raced_at) DESC').all(userId)
        .map(row => ({ dog: row.dog, races: Number(row.races), wins: Number(row.wins) }));
      const bestLaps = Object.fromEntries(q('SELECT map_id, MIN(best_lap) AS lap FROM race_results WHERE user_id = ? AND best_lap IS NOT NULL GROUP BY map_id').all(userId)
        .map(row => [row.map_id, row.lap]));
      const grandPrixWins = Number(q('SELECT COUNT(*) AS n FROM grand_prix_results WHERE user_id = ? AND place = 1').get(userId).n);
      return { races: Number(totals.races), wins: Number(totals.wins), podiums: Number(totals.podiums), finished: Number(totals.finished),
        grandPrixWins, dogs, favouriteDog: dogs[0]?.dog ?? null, bestLaps };
    },
  };
}
