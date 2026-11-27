import { useEffect, useRef, useState } from 'react';
import { fullscreen } from '../fullscreen.js';
import { MuteButton } from './MuteButton.jsx';
import { VolumeSliders } from './VolumeSliders.jsx';
import { AccountBadge, AccountSheet, LegalLinks } from './AccountSheet.jsx';
import { useAccount } from './useAccount.js';
import { account } from '../session/account.js';
import { onTouch } from '../touch.js';
import { Coins } from './shopArt.jsx';

// The first screen: how you want to play, and who you are (the badge at the top right).
//   Single Player   (Tom, 2026-11-19: no Grand Prix or Maps buttons here for now)
//   Multiplayer  ->  sign in or give a guest name; then host a game, join one, or split screen
//   Leaderboards
// The picture behind (public/ui/home.webp) has the logo and dogs but no buttons; the buttons here are drawn over it.
const ICONS = {
  flags: <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" stroke="#14224f" strokeWidth="2.500" strokeLinejoin="round" d="M6 8l16 4-3 14-16-4zM42 8l-16 4 3 14 16-4z" /><path fill="#14224f" d="M9 10.500l5 1.200-1 4.600-5-1.200zm9 6.800l-1 4.600-5-1.200 1-4.600zM39 10.500l-5 1.200 1 4.600 5-1.200zm-9 6.800l1 4.600 5-1.200-1-4.600z" /><path stroke="#14224f" strokeWidth="3" strokeLinecap="round" d="M20 26l8 16M28 26l-8 16" /></svg>,
  people: <svg viewBox="0 0 48 48" aria-hidden="true"><g fill="#fff" stroke="#14224f" strokeWidth="2.500" strokeLinejoin="round"><circle cx="11" cy="17" r="5" /><circle cx="37" cy="17" r="5" /><path d="M2 36c0-6 4-10 9-10s9 4 9 10zM28 36c0-6 4-10 9-10s9 4 9 10z" /><circle cx="24" cy="15" r="7" /><path d="M11 40c0-8 6-13 13-13s13 5 13 13z" /></g></svg>,
  gear: <svg viewBox="0 0 48 48" aria-hidden="true" style={{ stroke: 'none' }}>{[0, 45, 90, 135].map(turn => <rect key={turn} x="19" y="3" width="10" height="42" rx="2.500" transform={`rotate(${turn} 24 24)`} />)}<circle cx="24" cy="24" r="15" /><circle cx="24" cy="24" r="6.500" fill="#1464d8" /></svg>,
  pad: <svg viewBox="0 0 48 48" aria-hidden="true"><path fillRule="evenodd" d="M14 12h20c6 0 9 5 10 12l1.500 9c.5 4-4 6-7 3l-5-6H14.500l-5 6c-3 3-7.500 1-7-3L4 24c1-7 4-12 10-12zm0 6v3h-3v3h3v3h3v-3h3v-3h-3v-3zm17 1a2 2 0 100 4 2 2 0 000-4zm-4 4a2 2 0 100 4 2 2 0 000-4zm8 0a2 2 0 100 4 2 2 0 000-4z" /></svg>,
  trophy: <svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#14224f" strokeWidth="2.500" strokeLinejoin="round"><path fill="#ffc21a" d="M7 8h7v4H11c0 5 3 8 5 9l-1 3c-5-2-8-7-8-12zM41 8h-7v4h3c0 5-3 8-5 9l1 3c5-2 8-7 8-12z" /><path fill="#ffd22e" d="M12 5h24v10c0 8-5 14-12 14S12 23 12 15z" /><path fill="#ffc21a" d="M21 29h6v6h-6z" /><path fill="#ffd22e" d="M14 35h20v8H14z" /></g><g fill="#b86a12"><ellipse cx="24" cy="19" rx="4" ry="3.300" /><circle cx="18.800" cy="14" r="1.800" /><circle cx="22.300" cy="11.600" r="1.800" /><circle cx="25.700" cy="11.600" r="1.800" /><circle cx="29.200" cy="14" r="1.800" /></g></svg>,
  person: <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="15" r="9" /><path d="M6 44c0-11 8-17 18-17s18 6 18 17z" /></svg>,
  // (a shopping bag, and a kennel)
  shop: <svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#14224f" strokeWidth="2.500" strokeLinejoin="round"><path fill="#fff" d="M8 16h32l-3 26H11z" /><path fill="none" strokeLinecap="round" d="M17 20v-6a7 7 0 0114 0v6" /></g></svg>,
  garage: <svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#14224f" strokeWidth="2.500" strokeLinejoin="round"><path fill="#fff" d="M5 22L24 6l19 16v20H5z" /><path fill="#14224f" d="M18 42V30a6 6 0 0112 0v12z" /></g></svg>,
};

function Settings({ session, state, close }) {
  const [full, setFull] = useState(fullscreen.isOn());
  useEffect(() => fullscreen.onChange(setFull), []);
  return (
    <div className="zr-sheet" onClick={close}>
      <div className="zr-card" role="dialog" aria-label="Settings" onClick={event => event.stopPropagation()}>
        <h2>Settings</h2>
        <VolumeSliders />
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
        <LegalLinks />
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
  const { connected, error } = state;
  const { user, guestName, ready, pending, wallet } = useAccount();
  const [multiplayer, setMultiplayer] = useState(false);
  const [sheet, setSheet] = useState(null);       // 'settings' | 'controls' | 'account' | null
  const [accountMode, setAccountMode] = useState({ mode: 'signin', notice: '' });
  const [nameProblem, setNameProblem] = useState('');
  const nameBox = useRef(null);
  const openAccount = (mode = 'signin', notice = '') => { setAccountMode({ mode, notice }); setSheet('account'); };

  // back from Google: ?signin=username (choose one) or ?signin=<what went wrong>.  The box opens once it is
  // known who is signed in.
  const [fromGoogle, setFromGoogle] = useState(() => {
    const query = new URLSearchParams(window.location.search), word = query.get('signin');
    if (word !== null) { query.delete('signin'); window.history.replaceState(null, '', `${window.location.pathname}${query.size ? `?${query}` : ''}`); }
    return word;
  });
  const googleSheet = fromGoogle !== null && ready && sheet === null;
  const closeAccount = () => { setSheet(null); setFromGoogle(null); };

  // Multiplayer: signed in, or a guest name, before hosting or joining
  const named = action => () => {
    if (!account.name) { setNameProblem('Sign in or enter a guest name first'); nameBox.current?.focus(); return; }
    setNameProblem('');
    action();
  };

  return (
    <main className="zr-home">
      <div className="zr-home__blur" aria-hidden="true" />
      <div className="zr-home__stage">
        <h1 style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>Zoomie Racers</h1>
        {error && <p className="zr-home__error" role="alert">{error}</p>}

        {!multiplayer ? (
          <div className="zr-home__menu">
            <button className="zr-btn zr-btn--yellow" data-pad-first="" disabled={!connected} onClick={() => session.startSinglePlayer()}>{ICONS.flags}Single Player</button>
            <button className="zr-btn" disabled={!connected} onClick={() => setMultiplayer(true)}>{ICONS.people}Multiplayer</button>
            <button className="zr-btn zr-btn--purple" onClick={session.openLeaderboards}>{ICONS.trophy}Leaderboards</button>
            {/* the coins races pay: spent in the Shop, and what is bought is put on in the Garage */}
            <div className="zr-home__pair">
              <button className="zr-btn zr-btn--green" onClick={session.openShop}>{ICONS.shop}Shop</button>
              <button className="zr-btn zr-btn--green" onClick={() => session.openGarage()}>{ICONS.garage}Garage</button>
            </div>
          </div>
        ) : (
          <>
            {!user && (
              <div className="zr-home__who">
                <label className="zr-home__name">
                  {ICONS.person}
                  <input ref={nameBox} value={guestName} onChange={event => { account.setGuestName(event.target.value); setNameProblem(''); }}
                    maxLength={24} placeholder="Enter a guest name..." aria-label="Guest name" autoComplete="nickname" />
                </label>
                <span className="zr-home__or">or</span>
                <button className="zr-btn zr-btn--purple zr-home__signin" onClick={() => openAccount('signin')}>Sign In</button>
                {nameProblem && <p className="zr-home__problem" role="alert">{nameProblem}</p>}
              </div>
            )}
            <div className="zr-home__menu">
              <button className="zr-btn zr-btn--yellow" data-pad-first="" disabled={!connected} onClick={named(session.openHostScreen)}>Host Game</button>
              <button className="zr-btn" disabled={!connected} onClick={named(session.openJoinScreen)}>Join Game</button>
              {/* (not on a phone: split screen is players sharing one screen with a keyboard and controllers) */}
              {!onTouch && <button className="zr-btn zr-btn--purple" disabled={!connected} onClick={session.openLocalJoinScreen} title="Two to four players on this screen: a keyboard and controllers">Split Screen</button>}
            </div>
            <button className="zr-btn zr-btn--quiet zr-btn--small zr-home__back" data-pad-back="" onClick={() => { setMultiplayer(false); setNameProblem(''); }}>← Back</button>
          </>
        )}

        <AccountBadge onOpen={() => openAccount(pending ? 'username' : 'signin')} />
        <div className="zr-home__corner">
          <button className="zr-iconbtn" aria-label="Settings" onClick={() => setSheet('settings')}>{ICONS.gear}</button>
          <button className="zr-iconbtn" aria-label="Controls" onClick={() => setSheet('controls')}>{ICONS.pad}</button>
          <MuteButton />
        </div>
      </div>
      {/* bottom right: the player's coins (Tom, 2026-11-26: "instead of server: connected").  The server is only mentioned when it
          is not there, which is when the buttons stop working */}
      {!connected ? (
        <p className="zr-home__server zr-home__server--off" role="status"><i aria-hidden="true" />Server: <b>Disconnected</b></p>
      ) : user && wallet ? (
        <button className="zr-purse" onClick={session.openShop} aria-label={`${wallet.coins} coins: open the Shop`}><Coins amount={wallet.coins} /></button>
      ) : null}
      {sheet === 'settings' && <Settings session={session} state={state} close={() => setSheet(null)} />}
      {sheet === 'controls' && <Controls close={() => setSheet(null)} />}
      {(sheet === 'account' || googleSheet) && (
        <AccountSheet close={closeAccount} key={googleSheet && fromGoogle === 'username' && pending ? 'username' : 'other'}
          mode={googleSheet ? (fromGoogle === 'username' && pending ? 'username' : 'signin') : accountMode.mode}
          notice={googleSheet ? (fromGoogle === 'username' ? '' : fromGoogle) : accountMode.notice} />
      )}
    </main>
  );
}
