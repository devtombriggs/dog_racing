import { useEffect, useState } from 'react';
import { DOGS, STAT_LABELS, playerColor } from '../config/dogs.js';
import { shownStat } from '../../shared/dogStats.js';
import { SPECIALS } from '../../shared/specials.js';
import { VOICE_CHAT } from '../config/env.js';
import { BotSettings } from './BotSettings.jsx';
import { Paw } from './Paw.jsx';
import { arrowKeys, tileHandlers } from './tileGrid.js';

const DOG_IDS = Object.keys(DOGS);
const COLUMNS = 4;
const ROWS = Math.ceil((DOG_IDS.length + 2) / COLUMNS);       // (the Random tile at the end is two wide)
// (small copies of the portraits, made beside the full-size ones: public/portraits/*.webp)
const portrait = dog => dog.portrait.replace(/\.png.*$/, '.webp');

// What each dog's special does, in a line (the rules are in shared/specials.js)
const SPECIAL_WORDS = {
  ralph: 'Flies over everyone for 15 seconds, and nothing can hit him',
  pablo: 'Ten seconds on a sled with two friends, knocking over any dog in the way',
  second_dog: 'A five-second whirl that knocks over any dog she spins into',
  gsp: 'Sends a pheasant after every other dog to knock it over',
  enzo: 'Ten seconds of bounding on his belly, squashing any dog he lands on',
  rocky: 'Five sheep charge up the road, each knocking over the first dog it reaches',
  kombu: 'Seaweed pulls him under and puts him down far up the road',
  baz_naz: 'The twins pull their rope tight across the road, run faster through anything, and trip whoever it catches',
  jazz: 'One great stomp: every other dog can barely move for five seconds',
  black_lab: 'Rides her own wave for five seconds: the fastest of the lot, but it steers itself',
};

// Character select: one of each dog per race, and everyone can see who is looking at what.
// A box of portraits; the dog highlighted is shown large beside it with its stats and its special.
export function DogSelectScreen({ session, state }) {
  const { room, hoveredDog, connected, accessibilityMode, voiceEnabled, voiceStatus, error, local } = state;

  // Split screen: player 1 picks, then player 2 (each time the screen is come back to, both pick again)
  const [turn, setTurn] = useState(0);
  useEffect(() => { if (local) session.freeLocalDogs(); }, [local, session]);
  const picker = local && turn === 1 ? room?.players.find(player => player.id !== state.socketId && !player.bot) : null;
  // (whose screen this is just now: in split screen, the player whose turn it is)
  const socketId = picker?.id ?? state.socketId;
  const pick = id => (local ? session.pickLocalDog(turn, id, () => setTurn(1)) : session.selectDog(id));

  const myDog = room?.players.find(player => player.id === socketId)?.dog ?? null;
  const multiplayer = !room?.singlePlayer;
  const waitingFor = room?.players.filter(player => !player.dog).length ?? 0;
  const takenBy = id => room?.players.find(player => player.dog === id && player.id !== socketId);

  // the dog shown large: the last one pointed at, to begin with this player's own (or the first free one)
  const [pointedAt, setPointedAt] = useState(null);
  const shown = pointedAt ?? myDog ?? DOG_IDS.find(id => !takenBy(id)) ?? DOG_IDS[0];
  const show = (id) => { setPointedAt(id); session.hoverDog(id); };
  const dog = DOGS[shown], taken = takenBy(shown);
  const free = DOG_IDS.filter(id => !takenBy(id) && id !== myDog);

  return (
    <main className="zr-screen">
      <header className="zr-screen__head">
        <Paw /><h1 className="zr-title">{local ? `Player ${turn + 1}: Choose Your Dog` : 'Choose Your Dog'}</h1><Paw />
      </header>
      <p className="zr-screen__sub">
        {local ? (turn === 0 ? 'Player 1 picks first, then player 2. You race on the left half of the screen.' : 'Player 2: your turn. You race on the right half of the screen.')
          : !room || room.players.length < 2
            ? 'Pick your partner. Own the track.'
            : `One of each dog per race · ${room.players.filter(player => player.dog).length} of ${room.players.length} players have picked`}
      </p>

      <section className="zr-board zr-board--dogs">
        <aside className="zr-detail" aria-live="polite">
          <div className="zr-detail__art"><img src={portrait(dog)} alt="" draggable="false" /></div>
          <h2>{dog.displayName}</h2>
          <p className="zr-detail__sub">{dog.breed}</p>
          <div className="zr-stats">
            {STAT_LABELS.map(([key, label]) => (
              <div key={key} className="zr-stat">
                <span>{label}</span>
                <span className="zr-stat__bar"><span style={{ width: `${shownStat(shown, key) * 10}%` }} /></span>
                <span className="zr-stat__value">{shownStat(shown, key)}</span>
              </div>
            ))}
          </div>
          {SPECIALS[shown] && <p className="zr-special"><strong>★ {SPECIALS[shown].name}</strong>{SPECIAL_WORDS[shown]}</p>}
          <button className="zr-btn zr-btn--yellow" disabled={!connected || Boolean(taken) || (multiplayer && !local && myDog === shown)} onClick={() => pick(shown)}>
            {taken ? `Taken · ${taken.name}` : myDog === shown ? 'Your pick ✓' : `Choose ${dog.displayName}`}
          </button>
        </aside>

        <div className="zr-gridwrap" style={{ '--cols': COLUMNS, '--rows': ROWS }}>
          <div className="zr-grid" style={{ '--cols': COLUMNS, '--rows': ROWS }} role="group" aria-label="Choose your racing dog"
            onKeyDown={arrowKeys(COLUMNS)} onPointerLeave={() => session.hoverDog(null)}>
            {DOG_IDS.map((id) => {
              const other = takenBy(id);
              // Everyone looking at this dog right now, this player first
              const looking = (room?.players ?? []).filter(player =>
                player.id === socketId ? hoveredDog === id : player.hover === id && !player.dog
              ).sort((a, b) => (b.id === socketId) - (a.id === socketId));
              return (
                <button
                  key={id}
                  className={`zr-tile${shown === id ? ' zr-tile--shown' : ''}${myDog === id ? ' zr-tile--mine' : ''}${other ? ' zr-tile--taken' : ''}`}
                  {...tileHandlers(id, shown, show, chosen => { if (!takenBy(chosen)) pick(chosen); })}
                  onBlur={() => session.hoverDog(null)}
                  aria-label={`${DOGS[id].name}. ${other ? `Taken by ${other.name}. ` : ''}${STAT_LABELS.map(([key, label]) => `${label} ${shownStat(id, key)} out of 10`).join(', ')}`}
                  aria-disabled={Boolean(other)}
                  disabled={!connected}
                >
                  <img src={portrait(DOGS[id])} alt="" draggable="false" />
                  {multiplayer && looking.length > 0 && (
                    <span className="zr-tile__tags" aria-hidden="true">
                      {looking.map(player => <span key={player.id} style={{ background: playerColor(player) }}>{player.id === socketId ? 'You' : player.name}</span>)}
                    </span>
                  )}
                  <span className="zr-tile__name" aria-hidden="true">{DOGS[id].displayName}</span>
                  {other
                    ? <span className="zr-tile__flag" style={{ background: playerColor(other) }} aria-hidden="true">{other.name}</span>
                    : myDog === id && <span className="zr-tile__flag zr-tile__flag--mine" aria-hidden="true">Your pick ✓</span>}
                </button>
              );
            })}
            <button className="zr-tile zr-tile--wide" data-tile="random" disabled={!connected || free.length === 0}
              onClick={() => pick(free[Math.floor(Math.random() * free.length)])} aria-label="Random: any dog that is free">
              <b aria-hidden="true">?</b>Random
            </button>
          </div>
        </div>
      </section>

      <footer className="zr-footer">
        <button className="zr-btn zr-btn--quiet zr-btn--small" onClick={session.leaveGame}>Leave Game</button>
        {!local && <label className="zr-toggle">
          <input type="checkbox" checked={accessibilityMode} onChange={(event) => session.setAccessibilityMode(event.target.checked)} />
          <span>Accessibility mode<small>Runs for you · ↑ jump · ↓ use item</small></span>
        </label>}
        <BotSettings session={session} room={room} canChange={connected && room?.hostId === state.socketId} />
        {VOICE_CHAT && multiplayer && (
          <label className="zr-toggle">
            <input type="checkbox" checked={voiceEnabled} onChange={(event) => session.setVoiceEnabled(event.target.checked)} />
            <span>
              Voice chat
              <small>{voiceStatus.error ?? (voiceStatus.enabled ? 'Microphone on · stays on in the race · M mutes' : 'Microphone on to talk in the race')}</small>
            </span>
          </label>
        )}
        <p>
          {!connected ? 'Disconnected. Reconnecting to the server…'
            : !multiplayer || !myDog ? 'Choose a dog to continue'
              : room?.hostId === socketId
                ? `Press Next when everyone is in${waitingFor ? ` (${waitingFor} still picking: they will get a free dog)` : ''}`
                : 'Waiting for the host to start the map vote'}
        </p>
        {multiplayer && room?.hostId === socketId && (
          <button className="zr-btn zr-btn--yellow zr-btn--small" onClick={session.skipToMapVote} disabled={!connected}>Next: Map Vote →</button>
        )}
      </footer>
      {error && <p className="zr-screen__error" role="alert">{error}</p>}
    </main>
  );
}
