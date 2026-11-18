import { useState } from 'react';
import { pageStyle, panelStyle, buttonStyle } from './styles.js';
import { fullscreen } from '../fullscreen.js';

// The first screen: your name, and how you want to play.
//   Single Player
//   Multiplayer  ->  Online (host a game, or join one)  or  Local (two players, split screen)
export function MenuScreen({ session, state }) {
  const { playerName, connected, error } = state;
  const [multiplayer, setMultiplayer] = useState(false);
  const heading = { margin: '18px 0 4px', fontSize: 13, letterSpacing: 1, color: '#b4c9b5', textTransform: 'uppercase' };

  return (
    <div style={pageStyle}>
      <div style={panelStyle}>
        <h1>Dog Racing</h1>
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          value={playerName}
          onChange={event => session.setPlayerName(event.target.value)}
          maxLength={24}
          placeholder="Enter your name"
          autoComplete="nickname"
          style={{ display: 'block', width: '100%', padding: 12, marginTop: 8, marginBottom: 20, fontSize: 16 }}
        />

        <p>
          Server:{' '}
          {connected
            ? 'Connected'
            : 'Disconnected'}
        </p>

        {!multiplayer ? (
          <>
            <button style={buttonStyle} disabled={!connected} onClick={session.startSinglePlayer}>Single Player</button>
            <button style={buttonStyle} disabled={!connected} onClick={() => setMultiplayer(true)}>Multiplayer</button>
          </>
        ) : (
          <>
            <p style={heading}>Online</p>
            <button style={buttonStyle} disabled={!connected} onClick={session.hostGame}>Host Game</button>
            <button style={buttonStyle} disabled={!connected} onClick={session.openJoinScreen}>Join Game</button>
            <p style={heading}>Local</p>
            <button style={buttonStyle} disabled={!connected} onClick={session.openLocalJoinScreen}>Split Screen (2 players)</button>
            <p style={{ margin: '4px 0 14px', fontSize: 13, color: '#b4c9b5' }}>Two players on this screen: a keyboard and a controller, or two controllers</p>
            <button style={{ ...buttonStyle, background: '#3d5a45', color: 'white' }} onClick={() => setMultiplayer(false)}>← Back</button>
          </>
        )}

        {fullscreen.available && (
          <p style={{ margin: '16px 0 0', fontSize: 13, color: '#b4c9b5' }}>
            Races open in full screen. <button onClick={() => fullscreen.toggle()} style={{ background: 'none', border: 'none', color: '#9fe49b', cursor: 'pointer', textDecoration: 'underline', fontSize: 13, padding: 0 }}>Turn full screen on or off</button> · Esc in a race for the menu
          </p>
        )}

        {error && (
          <p style={{ color: 'salmon' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
