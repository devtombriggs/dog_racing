import { useEffect, useRef, useState } from 'react';
import { account } from '../session/account.js';
import { useAccount } from './useAccount.js';
import { DOGS } from '../config/dogs.js';

// Signing in: the badge at the top right of the home screen, and the box it opens (sign in, create an
// account, choose a username after a first Google sign-in, or, signed in, your numbers and Sign Out).

const PERSON = <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="15" r="9" /><path d="M6 44c0-11 8-17 18-17s18 6 18 17z" /></svg>;
const GOOGLE_G = (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="zr-google__g">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

/** The badge: "Guest · Sign In", or the player's username */
export function AccountBadge({ onOpen }) {
  const { user } = useAccount();
  return (
    <button className="zr-account" onClick={onOpen} aria-label={user ? `Signed in as ${user.username}: your account` : 'Playing as a guest: sign in'}>
      {PERSON}
      <span className="zr-account__name">{user ? user.username : <>Guest · <u>Sign In</u></>}</span>
      <svg className="zr-account__more" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>
  );
}

function Field({ label, ...input }) {
  return (
    <label className="zr-field">
      <span>{label}</span>
      <input {...input} />
    </label>
  );
}

// (a moment of waiting on the server: the buttons say so and do nothing more)
function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (work) => {
    setBusy(true); setError('');
    try { await work(); return true; } catch (problem) { setError(problem.message); return false; } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

function SignIn({ mode, setMode, close, notice }) {
  const { google } = useAccount();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [username, setUsername] = useState('');
  const { busy, error, run } = useBusy();
  const creating = mode === 'signup';
  const submit = async (event) => {
    event.preventDefault();
    const done = await run(() => (creating ? account.signUp({ email, username, password }) : account.signIn({ email, password })));
    if (done) close();
  };
  return (
    <>
      <h2>{creating ? 'Create Account' : 'Sign In'}</h2>
      <p>{creating ? 'Your username goes on the leaderboards and above your dog in races.' : 'Sign in to race under your name and get onto the leaderboards.'}</p>
      {notice && <p className="zr-error" role="alert">{notice}</p>}
      {google && (
        <>
          <button type="button" className="zr-google" onClick={() => account.googleSignIn()} disabled={busy}>{GOOGLE_G}<span>{creating ? 'Sign up with Google' : 'Sign in with Google'}</span></button>
          <div className="zr-or" aria-hidden="true"><span>or with email</span></div>
        </>
      )}
      <form className="zr-form" onSubmit={submit}>
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} data-pad-first="" />
        {creating && <Field label="Username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={16} placeholder="3 to 16 letters or numbers" />}
        <Field label="Password" type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={creating ? 8 : 1} maxLength={200} placeholder={creating ? 'At least 8 characters' : ''} />
        {error && <p className="zr-error" role="alert">{error}</p>}
        <button className="zr-btn zr-btn--yellow" type="submit" disabled={busy}>{busy ? 'One moment…' : creating ? 'Create Account' : 'Sign In'}</button>
      </form>
      <p className="zr-switch">
        {creating ? 'Already have an account? ' : 'New here? '}
        <button type="button" className="zr-link" onClick={() => setMode(creating ? 'signin' : 'signup')}>{creating ? 'Sign in' : 'Create an account'}</button>
      </p>
      <button type="button" className="zr-btn zr-btn--quiet zr-btn--small" data-pad-back="" onClick={close}>Not now</button>
    </>
  );
}

// After a first Google sign-in: the account is made once the player has chosen a username
function ChooseUsername({ close }) {
  const { pending } = useAccount();
  const [username, setUsername] = useState(pending?.suggested ?? '');
  const { busy, error, run } = useBusy();
  const submit = async (event) => {
    event.preventDefault();
    if (await run(() => account.finishSignUp(username))) close();
  };
  return (
    <>
      <h2>Choose a Username</h2>
      <p>Signed in with Google{pending?.email ? ` as ${pending.email}` : ''}. Pick the name everyone will see on the leaderboards and in races.</p>
      <form className="zr-form" onSubmit={submit}>
        <Field label="Username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={16} data-pad-first="" />
        {error && <p className="zr-error" role="alert">{error}</p>}
        <button className="zr-btn zr-btn--yellow" type="submit" disabled={busy}>{busy ? 'One moment…' : 'Start Racing'}</button>
      </form>
      <button type="button" className="zr-btn zr-btn--quiet zr-btn--small" data-pad-back="" onClick={async () => { await account.cancelSignUp().catch(() => {}); close(); }}>Cancel</button>
    </>
  );
}

function SignedIn({ close }) {
  const { user, stats } = useAccount();
  const { busy, error, run } = useBusy();
  const favourite = stats?.favouriteDog && DOGS[stats.favouriteDog];
  return (
    <>
      <h2>{user.username}</h2>
      {user.email && <p>{user.email}</p>}
      {stats && (
        <div className="zr-statgrid">
          <div><b>{stats.races}</b><span>Races</span></div>
          <div><b>{stats.wins}</b><span>Wins</span></div>
          <div><b>{stats.podiums}</b><span>Podiums</span></div>
          <div><b>{stats.grandPrixWins}</b><span>Grand Prix won</span></div>
        </div>
      )}
      {favourite && <p>Favourite dog: <strong>{favourite.displayName}</strong></p>}
      {error && <p className="zr-error" role="alert">{error}</p>}
      <button className="zr-btn zr-btn--yellow" data-pad-first="" data-pad-back="" onClick={close}>Done</button>
      <button className="zr-btn zr-btn--quiet" disabled={busy} onClick={async () => { if (await run(() => account.signOut())) close(); }}>Sign Out</button>
    </>
  );
}

/**
 * The account box.  mode: 'signin' | 'signup' | 'username'; signed in, it shows the account whatever the mode.
 * notice: a word to show first (Google sign-in did not work, ...)
 */
export function AccountSheet({ mode: startMode = 'signin', notice = '', close }) {
  const { user, pending } = useAccount();
  const [mode, setMode] = useState(startMode);
  const card = useRef(null);
  useEffect(() => { card.current?.querySelector('input, button')?.focus(); }, [mode]);
  return (
    <div className="zr-sheet" onClick={close}>
      <div className="zr-card zr-card--account" ref={card} role="dialog" aria-label="Your account" onClick={event => event.stopPropagation()}>
        {user ? <SignedIn close={close} />
          : pending && mode === 'username' ? <ChooseUsername close={close} />
            : <SignIn mode={mode === 'signup' ? 'signup' : 'signin'} setMode={setMode} close={close} notice={notice} />}
      </div>
    </div>
  );
}
