import { useEffect, useState } from 'react';
import { MAPS } from '../../shared/maps.js';
import { GRAND_PRIX, GRAND_PRIX_POINTS } from '../../shared/grandPrix.js';
import { playerColor } from '../config/dogs.js';
import { BotSettings } from './BotSettings.jsx';

// Map vote countdown: the seconds left until the vote closes, redrawn as they pass
function useVoteSecondsLeft(session, voting) {
  const [secondsLeft, setSecondsLeft] = useState(15);
  useEffect(() => {
    if (!voting) return undefined;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((session.voteDeadline - performance.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [session, voting]);
  return secondsLeft;
}

// Map select (single player: click a map to race on it) and map vote (multiplayer)
export function MapScreen({ session, state }) {
  const { screen, room, socketId, connected, error } = state;

  const voting = screen === 'mapVote';
  const votes = room?.votes ?? {};
  const myVote = votes[socketId];
  const voteCount = Object.keys(votes).length;
  const secondsLeft = useVoteSecondsLeft(session, voting);
  return (
    <main className="character-select map-select">
      <section className="character-select__panel" aria-labelledby="map-select-title">
        <header className="character-select__header">
          <div>
            <p className="character-select__eyebrow">Dog Racing / {voting ? 'Map Vote' : 'Map Select'}</p>
            <h1 id="map-select-title">{voting ? 'Vote for a Map' : 'Choose a Map'}</h1>
            <p className="character-select__hint">
              {voting
                ? `${voteCount} of ${room?.players.length ?? 0} voted for a map or a Grand Prix. Most votes wins; a tie is picked at random.`
                : 'Click a map for a single race, or a Grand Prix for four races in a row.'}
            </p>
          </div>
          {voting && (
            <div className="map-select__timer" role="timer" aria-live="polite">
              <span>Starting in</span>
              <strong>{secondsLeft}s</strong>
            </div>
          )}
        </header>

        {/* Grand Prix: four races, points for each place (shared/grandPrix.js) */}
        <div className="map-select__grid map-select__grid--cups" role="group" aria-label={voting ? 'Vote for a Grand Prix' : 'Choose a Grand Prix'}>
          {Object.entries(GRAND_PRIX).map(([id, cup]) => {
            const voters = (room?.players ?? []).filter(player => votes[player.id] === id);
            return (
              <button
                key={id}
                className={`map-card map-card--cup${myVote === id ? ' map-card--mine' : ''}`}
                disabled={!connected}
                onClick={() => (voting ? session.voteMap(id) : session.startSoloGrandPrix(id))}
                aria-label={`${cup.name}: four races. ${cup.maps.map(mapId => MAPS[mapId].name).join(', ')}.${voting ? ` ${voters.length} ${voters.length === 1 ? 'vote' : 'votes'}.` : ''}`}
              >
                <span className="map-card__strip" aria-hidden="true">
                  {cup.maps.map(mapId => <img key={mapId} src={`/maps/${mapId}.jpg`} alt="" width="640" height="360" draggable="false" />)}
                </span>
                {voting && voters.length > 0 && (
                  <span className="map-card__voters" aria-hidden="true">
                    {voters.map(player => (
                      <span key={player.id} style={{ background: playerColor(player) }}>
                        {player.id === socketId ? 'You' : player.name}
                      </span>
                    ))}
                  </span>
                )}
                <span className="map-card__caption">
                  <strong>🏆 {cup.name}</strong>
                  <span>{cup.maps.map(mapId => MAPS[mapId].name).join(' · ')}</span>
                  <span>4 races · {GRAND_PRIX_POINTS.join(', ')} points for 1st to 5th</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="map-select__grid" role="group" aria-label={voting ? 'Vote for a map' : 'Choose a map'}>
          {Object.entries(MAPS).map(([id, map]) => {
            const voters = (room?.players ?? []).filter(player => votes[player.id] === id);
            return (
              <button
                key={id}
                className={`map-card${myVote === id ? ' map-card--mine' : ''}`}
                disabled={!connected}
                onClick={() => (voting ? session.voteMap(id) : session.startSoloRace(id))}
                aria-label={`${map.name}. ${map.description}.${voting ? ` ${voters.length} ${voters.length === 1 ? 'vote' : 'votes'}.` : ''}`}
              >
                <img src={`/maps/${id}.jpg`} alt="" width="640" height="360" draggable="false" />
                {voting && voters.length > 0 && (
                  <span className="map-card__voters" aria-hidden="true">
                    {voters.map(player => (
                      <span key={player.id} style={{ background: playerColor(player) }}>
                        {player.id === socketId ? 'You' : player.name}
                      </span>
                    ))}
                  </span>
                )}
                <span className="map-card__caption">
                  <strong>{map.name}</strong>
                  <span>{map.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <footer className="character-select__footer">
          <button className="character-select__back" onClick={session.leaveGame}>Leave Game</button>
          {/* (the vote is too late to change them: they are settled in the lobby) */}
          <BotSettings session={session} room={room} canChange={!voting && connected && room?.hostId === socketId} />
          <p>
            {!connected ? 'Disconnected. Reconnecting to the server…'
              : !voting ? 'Pick where to race'
                : myVote ? `You voted for ${(MAPS[myVote] ?? GRAND_PRIX[myVote]).name}. Click another to change your vote.` : 'Click a map or a Grand Prix to vote'}
          </p>
        </footer>
        {error && <p className="character-select__error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
