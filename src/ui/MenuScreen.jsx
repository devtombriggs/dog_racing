import { pageStyle, panelStyle, buttonStyle } from './styles.js';

// The first screen: your name, and how you want to play
export function MenuScreen({ session, state }) {
  const { playerName, connected, error } = state;

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

        <button
          style={buttonStyle}
          disabled={!connected}
          onClick={session.startSinglePlayer}
        >
          Single Player
        </button>

        <button
          style={buttonStyle}
          disabled={!connected}
          onClick={session.hostGame}
        >
          Host Game
        </button>

        <button
          style={buttonStyle}
          disabled={!connected}
          onClick={session.openJoinScreen}
        >
          Join Game
        </button>

        {error && (
          <p style={{ color: 'salmon' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
