import { useState } from 'react';
import { DOGS, playerColor } from '../config/dogs.js';
import { IN_A_RACE, playerStatus, clock, useRaceClock } from './lobbyStatus.js';
import { MAPS } from '../../shared/maps.js';

// Who is in the room and what each of them is doing (Tom, 2026-11-27: "wait in the lobby, showing a status of each player
// e.g. still racing, in garage"), and, while a race is on, its clock and the way back into it.

// The host's own: the room's password (open to anyone without one), and the players they have banned, to let back in
function HostTools({ session, room, password }) {
  const [editing, setEditing] = useState(false), [typed, setTyped] = useState(''), [showBanned, setShowBanned] = useState(false);
  const save = (event) => { event.preventDefault(); session.setPassword(typed); setEditing(false); setTyped(''); };
  return (
    <div className="zr-lobby__host">
      {editing ? (
        <form onSubmit={save}>
          <input value={typed} onChange={event => setTyped(event.target.value)} maxLength={32} autoFocus placeholder="Password for friends" aria-label="Room password" autoComplete="off" />
          <button className="zr-btn zr-btn--yellow zr-btn--small" type="submit">{typed.trim() ? 'Set' : 'No password'}</button>
          <button className="zr-btn zr-btn--quiet zr-btn--small" type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <button className="zr-btn zr-btn--quiet zr-btn--small" onClick={() => setEditing(true)} title="Only players with the password can join">
          {/* (the password as typed: capitals matter, and the buttons' lettering is all capitals) */}
          {room.locked ? <>🔒 {password ? <>Password: <span style={{ textTransform: 'none', font: '700 1em var(--zr-text)' }}>{password}</span></> : 'Password set'} · change</> : '🔓 Open to anyone · set a password'}
        </button>
      )}
      {room.banned?.length > 0 && (
        <button className="zr-btn zr-btn--quiet zr-btn--small" aria-expanded={showBanned} onClick={() => setShowBanned(was => !was)}>Banned ({room.banned.length})</button>
      )}
      {showBanned && room.banned?.length > 0 && (
        <ul className="zr-lobby__banned" aria-label="Banned players">
          {room.banned.map(ban => (
            <li key={ban.id}>{ban.name}<button className="zr-btn zr-btn--small" onClick={() => session.unbanPlayer(ban.id)}>Unban</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LobbyPlayers({ session, room, socketId, password = null }) {
  const host = room.hostId === socketId;
  const [confirm, setConfirm] = useState(null);       // the player the host has clicked on, to kick or ban
  const racing = IN_A_RACE.includes(room.status);
  const elapsed = useRaceClock(racing ? room.raceMs : null, room);
  const me = room.players.find(player => player.id === socketId);
  const people = room.players.filter(player => !player.bot), computerDogs = room.players.length - people.length;
  return (
    <section className="zr-lobby" aria-label="Players in this room">
      {racing && (
        <div className="zr-lobby__race" role="status">
          <b>{room.status === 'finished' ? 'Race over' : 'Race in progress'}</b>
          <span>{MAPS[room.mapId]?.name ?? 'A race'}{elapsed !== null && room.status !== 'finished' ? ` · ${clock(elapsed)}` : ''}{computerDogs ? ` · ${computerDogs} computer dog${computerDogs === 1 ? '' : 's'}` : ''}</span>
          {me?.inLobby && room.status !== 'finished' && (
            <button className="zr-btn zr-btn--yellow zr-btn--small" onClick={session.rejoinRace}>{me.finished ? 'Watch the Race' : 'Back into the Race'}</button>
          )}
        </div>
      )}
      <ul className="zr-lobby__players">
        {people.map((player) => {
          const [words, kind] = playerStatus(room, player);
          return (
            <li key={player.id} className={`zr-lobby__player zr-lobby__player--${kind}`}>
              <i style={{ background: playerColor(player) }} aria-hidden="true" />
              <span>
                <b>{player.name}{player.id === socketId ? ' (you)' : ''}{player.id === room.hostId ? ' · host' : ''}</b>
                <small>{player.dog ? `${DOGS[player.dog]?.displayName ?? 'Dog'} · ` : ''}{words}</small>
              </span>
              {/* (the host: remove a player, or ban them: they cannot come back until the host lets them) */}
              {host && player.id !== socketId && (confirm === player.id ? (
                <span className="zr-lobby__kick">
                  <button className="zr-btn zr-btn--small" onClick={() => { session.kickPlayer(player.id, false); setConfirm(null); }}>Kick</button>
                  <button className="zr-btn zr-btn--small zr-btn--danger" onClick={() => { session.kickPlayer(player.id, true); setConfirm(null); }}>Ban</button>
                  <button className="zr-btn zr-btn--quiet zr-btn--small" aria-label="Cancel" onClick={() => setConfirm(null)}>✕</button>
                </span>
              ) : (
                <button className="zr-lobby__more" aria-label={`Remove ${player.name}`} title="Kick or ban" onClick={() => setConfirm(player.id)}>✕</button>
              ))}
            </li>
          );
        })}
      </ul>
      {host && <HostTools session={session} room={room} password={password} />}
    </section>
  );
}
