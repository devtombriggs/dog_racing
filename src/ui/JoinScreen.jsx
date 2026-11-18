import { useEffect } from 'react';
import { pageStyle, panelStyle, buttonStyle } from './styles.js';

// The games waiting for players: pick a host to join their lobby
export function JoinScreen({ session, state }) {
  const { connected, availableLobbies, lobbyListError, joiningRoom, error } = state;

  // The list comes from the server and updates by itself while this screen is open
  useEffect(() => {
    if (!connected) return undefined;
    return session.watchLobbies();
  }, [session, connected]);

  return (
    <div style={pageStyle}>
      <div style={{ ...panelStyle, width: 620, maxHeight: '90dvh', overflowY: 'auto' }}>
        <h2>Join Game</h2>
        <p>Choose a host to join their lobby. Games update automatically.</p>
        <div role="status">
          {!connected ? <p>Disconnected. Reconnecting to the server…</p>
            : lobbyListError ? <p style={{ color: 'salmon' }}>{lobbyListError}</p>
              : availableLobbies === null ? <p>Looking for games…</p>
                : availableLobbies.length === 0 ? <p>No games waiting for players. Ask a friend to host a game!</p>
                  : <p>{availableLobbies.length} {availableLobbies.length === 1 ? 'lobby' : 'lobbies'} found</p>}
        </div>
        {connected && availableLobbies?.map(lobby => {
          const full = lobby.playerCount >= lobby.maxPlayers;
          const disabled = full || joiningRoom !== null;
          return (
            <div key={lobby.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: 16, marginBottom: 12, background: '#34523b', borderRadius: 8, textAlign: 'left' }}>
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <strong>{lobby.hostName}’s lobby</strong>
                <div style={{ marginTop: 6 }}>Picking dogs · map vote next</div>
                <div style={{ marginTop: 6 }}>{lobby.playerCount}/{lobby.maxPlayers} players{full ? ' · Full' : ''}</div>
              </div>
              <button
                style={{ ...buttonStyle, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer' }}
                disabled={disabled}
                aria-label={`Join ${lobby.hostName}’s lobby`}
                onClick={() => session.joinGame(lobby.code)}
              >
                {joiningRoom === lobby.code ? 'Joining…' : full ? 'Full' : 'Join'}
              </button>
            </div>
          );
        })}
        <div>
          <button
            style={buttonStyle}
            disabled={joiningRoom !== null}
            onClick={session.backToMenu}
          >
            Back
          </button>
        </div>

        {error && (
          <p style={{ color: 'salmon' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
