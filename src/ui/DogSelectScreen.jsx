import { useEffect, useState } from 'react';
import { DOGS, STAT_LABELS, playerColor } from '../config/dogs.js';
import { VOICE_CHAT } from '../config/env.js';
import { BotSettings } from './BotSettings.jsx';

// Character select: one of each dog per race, and everyone can see who is looking at what
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
  return (
    <main className="character-select">
      <section className="character-select__panel" aria-labelledby="character-select-title">
        <header className="character-select__header">
          <div>
            <p className="character-select__eyebrow">Dog Racing / Character Select</p>
            <h1 id="character-select-title">{local ? `Player ${turn + 1}: Choose Your Dog` : 'Choose Your Dog'}</h1>
            <p className="character-select__hint">
              {local ? (turn === 0 ? 'Player 1 picks first, then player 2. You race on the left half of the screen.' : 'Player 2: your turn. You race on the right half of the screen.')
                : !room || room.players.length < 2
                ? 'Pick your partner. Own the track.'
                : `One of each dog per race. ${room.players.filter(player => player.dog).length} of ${room.players.length} players have picked.`}
            </p>
          </div>
          <div className="character-select__course">
            <span>Next</span>
            <strong>Map {room?.singlePlayer ? 'select' : 'vote'}</strong>
          </div>
        </header>

        <div className="character-select__grid" role="group" aria-label="Choose your racing dog">
          {Object.entries(DOGS).map(([id, dog]) => {
            // Another player in this game already has this dog
            const takenBy = room?.players.find(player => player.dog === id && player.id !== socketId);
            // Everyone looking at this dog right now, this player first
            const looking = (room?.players ?? []).filter(player =>
              player.id === socketId ? hoveredDog === id : player.hover === id && !player.dog
            ).sort((a, b) => (b.id === socketId) - (a.id === socketId));
            const rings = looking.map((player, index) =>
              `0 0 0 ${3 * (index + 1)}px ${playerColor(player)}`
            );
            return (
            <button
              key={id}
              className={`character-card${takenBy ? ' character-card--taken' : ''}`}
              style={{
                '--portrait-accent': dog.accent,
                ...(rings.length ? { boxShadow: rings.join(', '), borderColor: 'transparent' } : {})
              }}
              onPointerEnter={() => session.hoverDog(id)}
              onPointerLeave={() => session.hoverDog(null)}
              onFocus={() => session.hoverDog(id)}
              onBlur={() => session.hoverDog(null)}
              aria-label={`${dog.name}. ${takenBy ? `Taken by ${takenBy.name}. ` : ''}${STAT_LABELS.map(([key, label]) => `${label} ${dog.stats[key]} out of 10`).join(', ')}`}
              disabled={!connected || Boolean(takenBy)}
              onClick={() => pick(id)}
            >
              <img src={dog.portrait} alt="" width="1280" height="1280" draggable="false" />
              {takenBy
                ? <span className="character-card__taken" style={{ borderColor: playerColor(takenBy), color: playerColor(takenBy) }} aria-hidden="true">Taken · {takenBy.name}</span>
                : myDog === id
                  ? <span className="character-card__action character-card__action--mine" aria-hidden="true">Your pick ✓</span>
                  : <span className="character-card__action" aria-hidden="true">Select ↗</span>}
              {looking.length > 0 && (
                <span className="character-card__cursors" aria-hidden="true">
                  {looking.map(player => (
                    <span key={player.id} style={{ background: playerColor(player) }}>
                      {player.id === socketId ? 'You' : player.name}
                    </span>
                  ))}
                </span>
              )}
              <span className="character-card__caption">
                <strong>{dog.displayName}</strong>
                <span>{dog.breed}</span>
                <span className="character-card__stats" aria-hidden="true">
                  {STAT_LABELS.map(([key, label]) => (
                    <span key={key} className="character-card__stat">
                      <span className="character-card__stat-name">{label}</span>
                      <span className="character-card__stat-bar">
                        <span style={{ width: `${dog.stats[key] * 10}%` }} />
                      </span>
                      <span className="character-card__stat-value">{dog.stats[key]}</span>
                    </span>
                  ))}
                </span>
              </span>
            </button>
            );
          })}
        </div>

        <footer className="character-select__footer">
          <button className="character-select__back" onClick={session.leaveGame}>Leave Game</button>
          {!local && <label className="character-select__accessibility">
            <input
              type="checkbox"
              checked={accessibilityMode}
              onChange={(event) => session.setAccessibilityMode(event.target.checked)}
            />
            <span>
              Accessibility mode
              <small>Runs for you · ↑ jump · ↓ use item</small>
            </span>
          </label>}
          <BotSettings session={session} room={room} canChange={connected && room?.hostId === state.socketId} />
          {VOICE_CHAT && multiplayer && (
            <label className="character-select__accessibility">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(event) => session.setVoiceEnabled(event.target.checked)}
              />
              <span>
                Voice chat
                <small>
                  {voiceStatus.error
                    ?? (voiceStatus.enabled ? 'Microphone on · stays on in the race · M mutes' : 'Microphone on to talk in the race')}
                </small>
              </span>
            </label>
          )}
          <p>
            {!connected ? 'Disconnected. Reconnecting to the server…'
              : !multiplayer || !myDog ? 'Select a portrait to continue'
                : room?.hostId === socketId
                  ? `Press Next when everyone is in${waitingFor ? ` (${waitingFor} still picking: they will get a free dog)` : ''}`
                  : 'Waiting for the host to start the map vote'}
          </p>
          {multiplayer && room?.hostId === socketId && (
            <button className="character-select__next" onClick={session.skipToMapVote} disabled={!connected}>Next: Map Vote →</button>
          )}
        </footer>
        {error && <p className="character-select__error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
