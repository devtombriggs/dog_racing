import { useState } from 'react';

// Create a game (Tom, 2026-11-27: "when you create a game it's got a password protected box. If you tick it another box
// opens with type password").  The room is made with its password already on it: it is never open to anyone, even for a
// moment.  The host can change or remove the password in the lobby afterwards.
export function HostScreen({ session, state }) {
  const { connected, error } = state;
  const [locked, setLocked] = useState(false), [password, setPassword] = useState('');
  const ready = connected && (!locked || password.trim().length > 0);
  const create = (event) => { event.preventDefault(); if (ready) session.hostGame(locked ? password : null); };

  return (
    <div className="zr-page">
      <form className="zr-card zr-host" onSubmit={create}>
        <h2>Create Game</h2>
        <p>Anyone can join from the list of games, unless you give it a password.</p>
        <label className="zr-toggle zr-host__lock">
          <input type="checkbox" checked={locked} onChange={event => setLocked(event.target.checked)} />
          <span>Password protected<small>Only players you give the password to can join</small></span>
        </label>
        {locked && (
          <label className="zr-host__password">
            <span>Password</span>
            <input value={password} onChange={event => setPassword(event.target.value)} maxLength={32} autoFocus
              placeholder="Type a password" aria-label="Password for this game" autoComplete="off" />
            <small>Capitals matter. Your friends type this to join.</small>
          </label>
        )}
        <div className="zr-host__buttons">
          <button className="zr-btn zr-btn--quiet" type="button" data-pad-back="" onClick={session.backToMenu}>← Back</button>
          <button className="zr-btn zr-btn--yellow" type="submit" data-pad-first="" disabled={!ready}>Create Game</button>
        </div>
        {!connected && <p>Disconnected. Reconnecting to the server…</p>}
        {error && <p className="zr-error" role="alert">{error}</p>}
      </form>
    </div>
  );
}
