import { useEffect } from 'react';

// The games waiting for players: pick a host to join their lobby
export function JoinScreen({ session, state }) {
  const { connected, availableLobbies, lobbyListError, joiningRoom, error } = state;

  // The list comes from the server and updates by itself while this screen is open
  useEffect(() => {
    if (!connected) return undefined;
    return session.watchLobbies();
  }, [session, connected]);

  return (
    <div className="zr-page">
      <div className="zr-card" style={{ width: 'min(660px, 92vw)' }}>
        <h2>Join Game</h2>
        <p>Choose a host to join their lobby. Games update automatically.</p>
        <div role="status">
          {!connected ? <p>Disconnected. Reconnecting to the server…</p>
            : lobbyListError ? <p className="zr-error">{lobbyListError}</p>
              : availableLobbies === null ? <p>Looking for games…</p>
                : availableLobbies.length === 0 ? <p>No games waiting for players. Ask a friend to host a game!</p>
                  : <p>{availableLobbies.length} {availableLobbies.length === 1 ? 'lobby' : 'lobbies'} found</p>}
        </div>
        {connected && availableLobbies?.map(lobby => {
          const full = lobby.playerCount >= lobby.maxPlayers;
          const disabled = full || joiningRoom !== null;
          return (
            <div key={lobby.code} className="zr-row">
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <strong>{lobby.hostName}’s lobby</strong>
                <div style={{ marginTop: 6 }}>Picking dogs · map vote next</div>
                <div style={{ marginTop: 6 }}>{lobby.playerCount}/{lobby.maxPlayers} players{full ? ' · Full' : ''}</div>
              </div>
              <button
                className="zr-btn zr-btn--yellow zr-btn--small"
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
            className="zr-btn zr-btn--quiet"
            data-pad-back=""
            disabled={joiningRoom !== null}
            onClick={session.backToMenu}
          >
            ← Back
          </button>
        </div>

        {error && (
          <p className="zr-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
