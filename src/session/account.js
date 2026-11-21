// Who is signed in (server/accounts.js), for the whole page: the badge at the top of the home screen,
// the sign-in card, the names in multiplayer and the leaderboards.  The account requests go to the page's
// own address (/auth, /api): nginx passes them to the game server, and so does Vite when running locally.

const GUEST_NAME_KEY = 'zoomies.guestName';

async function request(method, path, body) {
  const response = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch { /* not JSON: the server is not there */ }
  if (!response.ok) throw new Error(data?.error ?? 'Could not reach the server');
  return data;
}

class Account {
  // user: { id, username, email } or null.  pending: a first Google sign-in waiting for a username.
  state = { ready: false, user: null, stats: null, google: false, pending: null, offline: false, guestName: '' };
  #listeners = new Set();
  #ticket = null;

  constructor() {
    try { this.state.guestName = localStorage.getItem(GUEST_NAME_KEY) ?? ''; } catch { /* storage blocked */ }
  }

  subscribe = (listener) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  getState = () => this.state;
  #set(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.#listeners]) listener();
  }

  /** Asks the server who is signed in.  Returns a ticket for the race connection (or null for a guest). */
  async refresh() {
    try {
      const me = await request('GET', `/api/me?t=${Date.now()}`);          // (never a cached answer)
      this.#ticket = me.ticket;
      this.#set({ ready: true, offline: false, user: me.user, stats: me.stats, google: me.google, pending: me.pending });
      return me.ticket;
    } catch {
      this.#set({ ready: true, offline: true });
      return null;
    }
  }

  /** A ticket for the race connection to say who this is (each works once) */
  async ticket() {
    if (this.#ticket) { const ticket = this.#ticket; this.#ticket = null; return ticket; }
    const ticket = await this.refresh();
    this.#ticket = null;
    return ticket;
  }

  // Signing in and out; each tells the race connection afterwards (onChange)
  async signUp(details) { await request('POST', '/auth/signup', details); await this.#changed(); this.#checkSignedIn(); }
  async signIn(details) { await request('POST', '/auth/login', details); await this.#changed(); this.#checkSignedIn(); }
  async signOut() { await request('POST', '/auth/logout'); await this.#changed(); }
  async finishSignUp(username) { await request('POST', '/auth/finish', { username }); await this.#changed(); this.#checkSignedIn(); }

  // The server said yes, but asking again who this is says nobody: the browser did not keep the sign-in cookie, or a
  // proxy in front of the game kept it from the server (or answered /api/me from a cache).  Better said than a quiet "Guest".
  #checkSignedIn() {
    if (this.state.user) return;
    throw new Error(this.state.offline
      ? 'Signed in, but the server could not be reached to check: try again in a moment'
      : 'The server signed you in, but this browser did not keep it (the sign-in cookie never came back). Check the server is on https and that nothing caches /api.');
  }
  async cancelSignUp() { await request('POST', '/auth/cancel'); await this.refresh(); }
  /** Is this username free?  { ok, problem } */
  checkUsername = name => request('GET', `/api/username?name=${encodeURIComponent(name)}`);
  leaderboards = () => request('GET', '/api/leaderboards');
  googleSignIn() { window.location.assign('/auth/google'); }

  #changeListeners = new Set();
  /** Called after every sign in and out (the race connection is told: see GameSession) */
  onChange(listener) { this.#changeListeners.add(listener); return () => this.#changeListeners.delete(listener); }
  async #changed() {
    await this.refresh();
    for (const listener of [...this.#changeListeners]) listener();
  }

  /** The name to race under: the username, or the guest name typed in */
  get name() { return this.state.user?.username ?? this.state.guestName.trim(); }
  setGuestName(guestName) {
    this.#set({ guestName });
    try { localStorage.setItem(GUEST_NAME_KEY, guestName); } catch { /* storage blocked */ }
  }
}

export const account = new Account();
