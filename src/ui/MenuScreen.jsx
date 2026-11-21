import { useEffect, useState } from 'react';
import { fullscreen } from '../fullscreen.js';
import { MuteButton } from './MuteButton.jsx';

// The first screen: your name, and how you want to play.
//   Single Player   (Tom, 2026-11-19: no Grand Prix or Maps buttons here for now; leaderboards and sign-in will come)
//   Multiplayer  ->  Host a game, join one, or split screen (two players on this screen)
// The picture behind (public/ui/home.webp) has the buttons painted into it; the real ones sit exactly over them.
const ICONS = {
  flags: <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" stroke="#14224f" strokeWidth="2.500" strokeLinejoin="round" d="M6 8l16 4-3 14-16-4zM42 8l-16 4 3 14 16-4z" /><path fill="#14224f" d="M9 10.500l5 1.200-1 4.600-5-1.200zm9 6.800l-1 4.600-5-1.200 1-4.600zM39 10.500l-5 1.200 1 4.600 5-1.200zm-9 6.800l1 4.600 5-1.200-1-4.600z" /><path stroke="#14224f" strokeWidth="3" strokeLinecap="round" d="M20 26l8 16M28 26l-8 16" /></svg>,
  people: <svg viewBox="0 0 48 48" aria-hidden="true"><g fill="#fff" stroke="#14224f" strokeWidth="2.500" strokeLinejoin="round"><circle cx="11" cy="17" r="5" /><circle cx="37" cy="17" r="5" /><path d="M2 36c0-6 4-10 9-10s9 4 9 10zM28 36c0-6 4-10 9-10s9 4 9 10z" /><circle cx="24" cy="15" r="7" /><path d="M11 40c0-8 6-13 13-13s13 5 13 13z" /></g></svg>,
  gear: <svg viewBox="0 0 48 48" aria-hidden="true" style={{ stroke: 'none' }}>{[0, 45, 90, 135].map(turn => <rect key={turn} x="19" y="3" width="10" height="42" rx="2.500" transform={`rotate(${turn} 24 24)`} />)}<circle cx="24" cy="24" r="15" /><circle cx="24" cy="24" r="6.500" fill="#1464d8" /></svg>,
  pad: <svg viewBox="0 0 48 48" aria-hidden="true"><path fillRule="evenodd" d="M14 12h20c6 0 9 5 10 12l1.500 9c.5 4-4 6-7 3l-5-6H14.500l-5 6c-3 3-7.500 1-7-3L4 24c1-7 4-12 10-12zm0 6v3h-3v3h3v3h3v-3h3v-3h-3v-3zm17 1a2 2 0 100 4 2 2 0 000-4zm-4 4a2 2 0 100 4 2 2 0 000-4zm8 0a2 2 0 100 4 2 2 0 000-4z" /></svg>,
  person: <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="15" r="9" /><path d="M6 44c0-11 8-17 18-17s18 6 18 17z" /></svg>,
};

function Settings({ session, state, close }) {
  const [full, setFull] = useState(fullscreen.isOn());
  useEffect(() => fullscreen.onChange(setFull), []);
  return (
    <div className="zr-sheet" onClick={close}>
      <div className="zr-card" role="dialog" aria-label="Settings" onClick={event => event.stopPropagation()}>
        <h2>Settings</h2>
        {fullscreen.available && (
          <label className="zr-toggle">
            <input type="checkbox" checked={full} onChange={() => fullscreen.toggle()} />
            <span>Full screen<small>Races open in full screen while this is on · Esc in a race for the menu</small></span>
          </label>
        )}
        <label className="zr-toggle">
          <input type="checkbox" checked={state.accessibilityMode} onChange={event => session.setAccessibilityMode(event.target.checked)} />
          <span>Accessibility mode<small>Your dog runs by itself · ↑ jumps · ↓ uses the item · hold ← or → round a bend to drift</small></span>
        </label>
        <button className="zr-btn zr-btn--yellow" data-pad-first="" data-pad-back="" onClick={close}>Done</button>
      </div>
    </div>
  );
}

function Controls({ close }) {
  return (
    <div className="zr-sheet" onClick={close}>
      <div className="zr-card" role="dialog" aria-label="Controls" onClick={event => event.stopPropagation()}>
        <h2>Controls</h2>
        <table>
          <tbody>
            <tr><th colSpan="2">Keyboard</th></tr>
            <tr><td>W or ↑</td><td>Go</td></tr>
            <tr><td>S or ↓</td><td>Brake, then reverse</td></tr>
            <tr><td>A / D or ← / →</td><td>Steer</td></tr>
            <tr><td>Space</td><td>Jump</td></tr>
            <tr><td>Shift or E</td><td>Use the item</td></tr>
            <tr><td>K or C (hold)</td><td>Drift round a corner</td></tr>
            <tr><td>Esc</td><td>Menu</td></tr>
            <tr><th colSpan="2">Controller</th></tr>
            <tr><td>Right trigger</td><td>Go</td></tr>
            <tr><td>Left trigger (hold)</td><td>Drift round a corner while going; otherwise brake, then reverse</td></tr>
            <tr><td>Left stick or D-pad</td><td>Steer</td></tr>
            <tr><td>A</td><td>Jump</td></tr>
            <tr><td>X, B or left bumper</td><td>Use the item</td></tr>
            <tr><td>Right bumper (hold)</td><td>Drift too</td></tr>
          </tbody>
        </table>
        <button className="zr-btn zr-btn--yellow" data-pad-first="" data-pad-back="" onClick={close}>Done</button>
      </div>
    </div>
  );
}

export function MenuScreen({ session, state }) {
  const { playerName, connected, error } = state;
  const [multiplayer, setMultiplayer] = useState(false);
  const [sheet, setSheet] = useState(null);       // 'settings' | 'controls' | null

  return (
    <main className="zr-home">
      <div className="zr-home__blur" aria-hidden="true" />
      <div className="zr-home__stage">
        <h1 style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>Zoomies Racing</h1>
        {error && <p className="zr-home__error" role="alert">{error}</p>}

        <div className={`zr-home__menu${multiplayer ? '' : ' zr-home__menu--two'}`}>
          <label className="zr-home__name">
            {ICONS.person}
            <input
              value={playerName}
              onChange={event => session.setPlayerName(event.target.value)}
              maxLength={24}
              placeholder="Enter your name..."
              aria-label="Your name"
              autoComplete="nickname"
            />
          </label>
          {!multiplayer ? (
            <>
              <button className="zr-btn zr-btn--yellow zr-btn--big" data-pad-first="" disabled={!connected} onClick={() => session.startSinglePlayer()}>{ICONS.flags}Single Player</button>
              <button className="zr-btn" disabled={!connected} onClick={() => setMultiplayer(true)}>{ICONS.people}Multiplayer</button>
            </>
          ) : (
            <>
              <button className="zr-btn zr-btn--yellow zr-btn--big" data-pad-first="" disabled={!connected} onClick={session.hostGame}>Host Game</button>
              <button className="zr-btn" disabled={!connected} onClick={session.openJoinScreen}>Join Game</button>
              <button className="zr-btn" disabled={!connected} onClick={session.openLocalJoinScreen} title="Two players on this screen: a keyboard and a controller, or two controllers">Split Screen</button>
              <button className="zr-btn zr-btn--quiet" data-pad-back="" onClick={() => setMultiplayer(false)}>← Back</button>
            </>
          )}
        </div>

      </div>
      <p className={`zr-home__server${connected ? '' : ' zr-home__server--off'}`} role="status">
        <i aria-hidden="true" />Server: <b>{connected ? 'Connected' : 'Disconnected'}</b>
      </p>
        <div className="zr-home__corner">
          <button className="zr-iconbtn" aria-label="Settings" onClick={() => setSheet('settings')}>{ICONS.gear}</button>
          <button className="zr-iconbtn" aria-label="Controls" onClick={() => setSheet('controls')}>{ICONS.pad}</button>
          <MuteButton />
        </div>
      {sheet === 'settings' && <Settings session={session} state={state} close={() => setSheet(null)} />}
      {sheet === 'controls' && <Controls close={() => setSheet(null)} />}
    </main>
  );
}
