import { useState } from 'react';
import { MAPS } from '../../shared/maps.js';
import { clock, useRaceClock } from './lobbyStatus.js';

// One game in the list: whose it is, what it is doing (in the lobby, voting, or in a race and for how long: Tom, 2026-11-27)
// and how many are in it.  Only a game in its lobby can be joined
// (a locked game: Join opens a box for its password)
export function LobbyRow({ session, lobby, joiningRoom, asking, title = null }) {
  const [password, setPassword] = useState(''), [wanted, setWanted] = useState(false);
  const needs = lobby.locked && (wanted || asking);
  const elapsed = useRaceClock(lobby.status === 'race' ? lobby.raceMs : null, lobby);
  const full = lobby.playerCount >= lobby.maxPlayers, open = (lobby.status ?? 'lobby') === 'lobby';
  // (a game in a race can be joined while it has a computer dog to take over)
  const racing = lobby.status === 'race', canTake = racing && !full && lobby.computerDogs > 0;
  const doing = lobby.status === 'race' ? `In a race${MAPS[lobby.mapId] ? ` on ${MAPS[lobby.mapId].name}` : ''}${elapsed !== null ? ` · ${clock(elapsed)}` : ' · starting'}`
    : lobby.status === 'voting' ? 'Voting on a map · about to race' : 'In the lobby · picking dogs';
  return (
    <div className="zr-row">
      <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        <strong>{lobby.locked ? '🔒 ' : ''}{title ?? `${lobby.hostName}’s game`}</strong>
        <div style={{ marginTop: 6 }}><span className={`zr-status zr-status--${open ? 'lobby' : 'race'}`} />{doing}</div>
        <div style={{ marginTop: 6 }}>
          {lobby.playerCount}/{lobby.maxPlayers} players{lobby.computerDogs ? ` · ${lobby.computerDogs} computer dog${lobby.computerDogs === 1 ? '' : 's'} to take over` : racing && !full ? ' · no computer dogs to take over' : ''}{full ? ' · Full' : ''}
        </div>
      </div>
      {needs && (open || canTake) && !full && (
        <form className="zr-row__password" onSubmit={(event) => { event.preventDefault(); if (password) session.joinGame(lobby.code, password); }}>
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} maxLength={32} autoFocus
            placeholder="Password" aria-label={`Password for ${lobby.hostName}’s game`} autoComplete="off" />
        </form>
      )}
      {racing ? (
        /* a game in a race (Tom, 2026-11-27): Jump In takes over one of its computer dogs where it is; Join Lobby waits for the next race */
        <div className="zr-row__buttons">
          <button className="zr-btn zr-btn--yellow zr-btn--small" disabled={!canTake || joiningRoom !== null || (needs && !password)}
            title="Take over a computer dog where it is. This race will not count for coins or the leaderboards"
            onClick={() => (lobby.locked && !needs ? setWanted(true) : session.joinGame(lobby.code, lobby.locked ? password : null, true))}>
            {joiningRoom === lobby.code ? 'Joining…' : full ? 'Full' : canTake ? 'Jump In' : 'In a race'}
          </button>
          {canTake && (
            <button className="zr-btn zr-btn--small" disabled={joiningRoom !== null || (needs && !password)}
              onClick={() => (lobby.locked && !needs ? setWanted(true) : session.joinGame(lobby.code, lobby.locked ? password : null, false))}>
              Join Lobby
            </button>
          )}
        </div>
      ) : (
        <button
          className="zr-btn zr-btn--yellow zr-btn--small"
          disabled={!open || full || joiningRoom !== null || (needs && !password)}
          aria-label={`Join ${lobby.hostName}’s game`}
          onClick={() => (lobby.locked && !needs ? setWanted(true) : session.joinGame(lobby.code, lobby.locked ? password : null))}
        >
          {joiningRoom === lobby.code ? 'Joining…' : full ? 'Full' : open ? 'Join' : 'Voting'}
        </button>
      )}
    </div>
  );
}
