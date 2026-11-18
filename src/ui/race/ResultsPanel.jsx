import { useEffect, useState } from 'react';
import { MAPS } from '../../../shared/maps.js';
import { DOGS } from '../../config/dogs.js';
import { formatTime } from '../../utils/format.js';
import { buttonStyle } from '../styles.js';

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
    <div style={{ marginBottom: 12 }}>
      {grandPrix.final
        ? <h1 style={{ color: '#ffd257', margin: '4px 0 2px' }}>🏆 {winner.name === 'CPU' ? DOGS[winner.dog]?.displayName ?? 'CPU' : winner.name} wins!</h1>
        : <h3 style={{ color: '#ffd257', margin: '4px 0' }}>🏆 {grandPrix.name} · after race {grandPrix.round} of {grandPrix.of}</h3>}
      {grandPrix.final && <p style={{ color: '#b4c9b5', margin: '0 0 8px' }}>{grandPrix.name} · final scores</p>}
      <table style={{ margin: '0 auto', borderCollapse: 'collapse', fontSize: 16 }} aria-label="Grand Prix points">
        <tbody>
          {grandPrix.table.map((row, index) => (
            <tr key={row.playerId} style={{ color: row.playerId === socketId ? '#a5e69c' : 'white', fontWeight: index === 0 || row.playerId === socketId ? 'bold' : 'normal' }}>
              <td style={{ padding: '2px 10px', textAlign: 'right' }}>{index + 1}.</td>
              <td style={{ padding: '2px 10px', textAlign: 'left' }}>{row.name} — {DOGS[row.dog]?.displayName ?? 'Dog'}</td>
              <td style={{ padding: '2px 10px', textAlign: 'right' }}>{row.points} pts</td>
              <td style={{ padding: '2px 10px', textAlign: 'right', color: '#b4c9b5' }}>+{row.gained}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Your time once you are home; how long the others have left; the Grand Prix points; and the way
// back to the lobby once it is all over
// buttons: false for player 2's half of a split screen (player 1's half has them)
export function ResultsPanel({ session, finishTime, lobbyReturnAt, raceEndsAt = null, grandPrix = null, socketId = null, buttons = true }) {
  const over = lobbyReturnAt !== null;
  const clockNow = useClock(over || raceEndsAt !== null);

  // still racing, and the first dog is home: the time left, top centre, out of the way of the road
  if (finishTime === null && !over) {
    if (raceEndsAt === null) return null;
    return (
      <div role="status" style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 30, background: 'rgba(10,25,15,0.85)', color: '#ffd257', borderRadius: 10, padding: '8px 18px', fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>
        First dog home · race ends in {secondsTo(raceEndsAt, clockNow)} s
      </div>
    );
  }

  const table = over && grandPrix;
  const midGrandPrix = table && !grandPrix.final;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 35,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        background:
          'rgba(10,25,15,0.92)',
        color: 'white',
        borderRadius: 14,
        padding: '20px 35px',
        textAlign: 'center',
        minWidth: 250
      }}
    >
      {table && <GrandPrixTable grandPrix={grandPrix} socketId={socketId} />}

      {!(table && grandPrix.final) && (
        <>
          <h2>
            {finishTime !== null ? 'Race Complete!' : 'Race Over'}
          </h2>

          <p>
            {finishTime !== null ? '3 laps completed' : 'Time ran out before you finished'}
          </p>
        </>
      )}

      {finishTime !== null && !(table && grandPrix.final) && (
        <h1>
          {formatTime(finishTime)}
        </h1>
      )}

      <p style={{ color: '#b4c9b5' }}>
        {!over
          ? raceEndsAt !== null
            ? `The race ends for everyone in ${secondsTo(raceEndsAt, clockNow)} s`
            : 'Waiting for the other dogs to finish'
          : midGrandPrix
            ? `Next race: ${MAPS[grandPrix.nextMapId]?.name ?? 'the next map'} in ${secondsTo(lobbyReturnAt, clockNow)} s`
            : `Back to the lobby in ${secondsTo(lobbyReturnAt, clockNow)} s`}
      </p>

      {buttons && (
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {over && !midGrandPrix && (
          <button
            style={buttonStyle}
            onClick={session.returnToLobby}
          >
            Back to Lobby
          </button>
        )}
        <button
          style={buttonStyle}
          onClick={session.leaveGame}
        >
          Main Menu
        </button>
      </div>
      )}
    </div>
  );
}
