import { useEffect, useState } from 'react';
import { useAccount } from './useAccount.js';
import { LobbyRow } from './LobbyRow.jsx';

// Friends (Tom, 2026-11-27: "friends list with friends online as well would be good"): on the Join Game screen, under the
// list of games.  Who is online and what they are doing; a friend's game is joined from here like any other (its password
// is still asked for).  Friends are asked by username and have to say yes; only players with an account have them.
export function FriendsPanel({ session, state }) {
  const { user } = useAccount();
  const { friends, friendsError, connected, joiningRoom, passwordFor } = state;
  const [name, setName] = useState(''), [manage, setManage] = useState(false);

  // (kept up to date while the screen is open: the server says when someone asks or answers; who is online is asked for)
  useEffect(() => {
    if (!user || !connected) return undefined;
    return session.watchFriends();
  }, [session, user, connected]);

  if (!user) return <p className="zr-friends__none">Sign in on the home screen to add friends and see when they are online.</p>;
  const list = friends?.friends ?? [], incoming = friends?.incoming ?? [], outgoing = friends?.outgoing ?? [];
  const onlineFirst = [...list].sort((a, b) => Number(b.online) - Number(a.online));
  const ask = (event) => { event.preventDefault(); if (name.trim()) { session.askFriend(name.trim()); setName(''); } };

  return (
    <section className="zr-friends" aria-label="Friends">
      <header>
        <h3>Friends{list.length ? ` · ${list.filter(friend => friend.online).length} of ${list.length} online` : ''}</h3>
        <button className="zr-btn zr-btn--quiet zr-btn--small" aria-expanded={manage} onClick={() => setManage(was => !was)}>{manage ? 'Done' : 'Add or remove'}</button>
      </header>

      {incoming.map(asker => (
        <div key={asker.id} className="zr-friends__row zr-friends__row--asks">
          <span><b>{asker.username}</b> wants to be friends</span>
          <span className="zr-friends__buttons">
            <button className="zr-btn zr-btn--yellow zr-btn--small" onClick={() => session.acceptFriend(asker.id)}>Accept</button>
            <button className="zr-btn zr-btn--quiet zr-btn--small" onClick={() => session.removeFriend(asker.id)}>No</button>
          </span>
        </div>
      ))}

      {manage && (
        <form className="zr-friends__add" onSubmit={ask}>
          <input value={name} onChange={event => setName(event.target.value)} maxLength={16} placeholder="A player’s username" aria-label="Username to add as a friend" autoComplete="off" />
          <button className="zr-btn zr-btn--yellow zr-btn--small" type="submit" disabled={!name.trim()}>Add Friend</button>
        </form>
      )}
      {friendsError && <p className="zr-error" role="alert">{friendsError}</p>}
      {manage && outgoing.map(asked => (
        <div key={asked.id} className="zr-friends__row">
          <span><b>{asked.username}</b> · asked, waiting for their answer</span>
          <button className="zr-btn zr-btn--quiet zr-btn--small" onClick={() => session.removeFriend(asked.id)}>Take back</button>
        </div>
      ))}

      {friends === null ? <p>Loading friends…</p>
        : list.length === 0 && !manage ? <p>No friends yet. Add one by their username.</p> : null}

      {onlineFirst.map(friend => (friend.room && !manage ? (
        // a friend in a game that can be seen in the list: the same row, by their name
        <LobbyRow key={friend.id} session={session} lobby={friend.room} joiningRoom={joiningRoom} asking={passwordFor === friend.room.code}
          title={friend.room.hostName === friend.username ? `${friend.username}’s game` : `${friend.username} · in ${friend.room.hostName}’s game`} />
      ) : (
        <div key={friend.id} className={`zr-friends__row${friend.online ? '' : ' zr-friends__row--off'}`}>
          <span><i className={`zr-status${friend.online ? '' : ' zr-status--off'}`} /><b>{friend.username}</b> · {friend.room ? 'in a game' : friend.playing ? 'playing on their own' : friend.online ? 'online' : 'offline'}</span>
          {manage && <button className="zr-btn zr-btn--quiet zr-btn--small" onClick={() => session.removeFriend(friend.id)}>Remove</button>}
        </div>
      )))}
    </section>
  );
}
