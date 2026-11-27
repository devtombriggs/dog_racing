import { useEffect } from 'react';
import { LobbyRow } from './LobbyRow.jsx';
import { FriendsPanel } from './FriendsPanel.jsx';

// The games waiting for players: pick a host to join their lobby
export function JoinScreen({ session, state }) {
  const { connected, availableLobbies, lobbyListError, joiningRoom, error, passwordFor } = state;

  // The list comes from the server and updates by itself while this screen is open
  useEffect(() => {
    if (!connected) return undefined;
    return session.watchLobbies();
  }, [session, connected]);

  return (
    <div className="zr-page">
      <div className="zr-card" style={{ width: 'min(660px, 92vw)' }}>
        <h2>Join Game</h2>
        <p>Choose a game to join. Games update automatically.</p>
        <div role="status">
          {!connected ? <p>Disconnected. Reconnecting to the server…</p>
            : lobbyListError ? <p className="zr-error">{lobbyListError}</p>
              : availableLobbies === null ? <p>Looking for games…</p>
                : availableLobbies.length === 0 ? <p>No games yet. Ask a friend to host a game!</p>
                  : <p>{availableLobbies.length} {availableLobbies.length === 1 ? 'game' : 'games'} found</p>}
        </div>
        {connected && availableLobbies?.map(lobby => <LobbyRow key={lobby.code} session={session} lobby={lobby} joiningRoom={joiningRoom} asking={passwordFor === lobby.code} />)}
        <FriendsPanel session={session} state={state} />
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
