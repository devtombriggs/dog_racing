import { useEffect, useState } from 'react';
import { MAPS } from '../../../shared/maps.js';
import { DOGS } from '../../config/dogs.js';
import { formatTime, ordinal } from '../../utils/format.js';

// A clock to redraw the seconds left (before the race ends, the next race starts, or the room goes back to the lobby)
function useClock(running) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const tick = () => setNow(performance.now());
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

const secondsTo = (when, now) => Math.max(0, Math.ceil((when - now) / 1000));

// The Grand Prix points after a race: everyone's total, what they just scored, and after the last
// race the winner
function GrandPrixTable({ grandPrix, socketId }) {
  const winner = grandPrix.table[0];
  return (
    <div className="race-results__gp">
      {grandPrix.final
        ? <h2 className="race-results__winner">🏆 {winner.name === 'CPU' ? DOGS[winner.dog]?.displayName ?? 'CPU' : winner.name} wins!</h2>
        : <h3>🏆 {grandPrix.name} · after race {grandPrix.round} of {grandPrix.of}</h3>}
      {grandPrix.final && <p>{grandPrix.name} · final scores</p>}
      <table aria-label="Grand Prix points">
        <tbody>
          {grandPrix.table.map((row, index) => (
            <tr key={row.playerId} className={row.playerId === socketId ? 'race-results__you' : index === 0 ? 'race-results__top' : ''}>
              <td>{index + 1}.</td>
              <td>{row.name} — {DOGS[row.dog]?.displayName ?? 'Dog'}</td>
              <td>{row.points} pts</td>
              <td className="race-results__gained">+{row.gained}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Your time once you are home; how long the others have left; the Grand Prix points; and the way
// back to the lobby once it is all over
// buttons: false for the other players' shares of a split screen (player 1's has them)
// coins: what the race paid this player ({ race, grandPrix, total }: shared/shop.js), once the server has said
// Home while others are still running: Watch the race puts the results away and the camera behind another dog, with
// arrows (and the arrow keys) to go from dog to dog (Tom, 2026-11-27: "spectate by jumping to each character view")
// standings: the race order; spectating: the id of the dog being watched (session.state.spectating)
export function ResultsPanel({ session, finishTime, lobbyReturnAt, raceEndsAt = null, grandPrix = null, socketId = null, buttons = true, coins = null, standings = [], spectating = null }) {
  const over = lobbyReturnAt !== null;
  const clockNow = useClock(over || raceEndsAt !== null);
  const [watching, setWatching] = useState(false);
  const running = standings.filter(entry => !entry.finished && entry.playerId !== socketId);
  const canWatch = buttons && finishTime !== null && !over && running.length > 0;
  const watchingNow = watching && canWatch;
  useEffect(() => {
    if (!watchingNow) return undefined;
    const onKey = (event) => {
      if (event.repeat) return;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') session.spectate(1);
      else if (event.code === 'ArrowLeft' || event.code === 'KeyA') session.spectate(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [watchingNow, session]);
  // (nobody left to watch, or the race is over: the results come back, and the session puts the camera back: GameSession.spectate)

  // still racing, and the first dog is home: the time left, top centre, out of the way of the road
  if (finishTime === null && !over) {
    if (raceEndsAt === null) return null;
    return <div className="race-ending" role="status">First dog home · race ends in {secondsTo(raceEndsAt, clockNow)} s</div>;
  }

  if (watchingNow) {
    const dog = standings.find(entry => entry.playerId === spectating);
    return (
      <div className="race-spectate" role="group" aria-label="Watching the race">
        <button className="zr-btn zr-btn--small" aria-label="The dog before" onClick={() => session.spectate(-1)}>◀</button>
        <div className="race-spectate__who" role="status">
          <small>Watching{raceEndsAt !== null ? ` · race ends in ${secondsTo(raceEndsAt, clockNow)} s` : ''}</small>
          <b>{dog ? `${ordinal(dog.place)} · ${dog.name} — ${DOGS[dog.dog]?.displayName ?? 'Dog'}` : '…'}</b>
        </div>
        <button className="zr-btn zr-btn--small" aria-label="The next dog" onClick={() => session.spectate(1)}>▶</button>
        <button className="zr-btn zr-btn--small zr-btn--quiet" onClick={() => { setWatching(false); session.spectate(0); }}>Results</button>
        <button className="zr-btn zr-btn--small zr-btn--quiet" onClick={session.backToLobby}>Back to Lobby</button>
      </div>
    );
  }

  const table = over && grandPrix;
  const midGrandPrix = table && !grandPrix.final;
  return (
    <div className="zr-card race-results">
      {table && <GrandPrixTable grandPrix={grandPrix} socketId={socketId} />}

      {!(table && grandPrix.final) && (
        <>
          <h2>{finishTime !== null ? 'Race Complete!' : 'Race Over'}</h2>
          {finishTime === null && <p>Time ran out before you finished</p>}
        </>
      )}

      {finishTime !== null && !(table && grandPrix.final) && <div className="race-results__time">{formatTime(finishTime)}</div>}

      {coins && (coins.race > 0 || coins.grandPrix > 0) && (
        <p className="race-results__coins" role="status">
          <img src="/ui/coin.webp" alt="" draggable="false" />
          <b>+{coins.race + coins.grandPrix}</b> coins{coins.grandPrix > 0 ? ` (${coins.grandPrix} for the Grand Prix)` : ''}
          <small>You have {Number(coins.total).toLocaleString('en-GB')}</small>
        </p>
      )}

      <p>
        {!over
          ? raceEndsAt !== null
            ? `The race ends for everyone in ${secondsTo(raceEndsAt, clockNow)} s`
            : 'Waiting for the other dogs to finish'
          : midGrandPrix
            ? `Next race: ${MAPS[grandPrix.nextMapId]?.name ?? 'the next map'} in ${secondsTo(lobbyReturnAt, clockNow)} s`
            : `Back to the lobby in ${secondsTo(lobbyReturnAt, clockNow)} s`}
      </p>

      {buttons && (
        <div className="race-results__buttons">
          {canWatch && <button className="zr-btn zr-btn--yellow" onClick={() => { setWatching(true); session.spectate(1); }}>Watch the Race</button>}
          {/* (no Main Menu here: Tom, 2026-11-27.  The lobby has Leave Game, and the Esc menu still quits) */}
          {!midGrandPrix && <button className={`zr-btn${over ? ' zr-btn--yellow' : ' zr-btn--quiet'}`} onClick={session.backToLobby}>Back to Lobby</button>}
        </div>
      )}
    </div>
  );
}
