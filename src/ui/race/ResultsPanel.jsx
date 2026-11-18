import { useEffect, useState } from 'react';
import { formatTime } from '../../utils/format.js';
import { buttonStyle } from '../styles.js';

// A clock to redraw the seconds left before the room goes back to the lobby
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

// Your time once you are home, and the way back to the lobby once the race is over for everyone
export function ResultsPanel({ session, finishTime, lobbyReturnAt }) {
  const clockNow = useClock(lobbyReturnAt !== null);
  if (!((finishTime !== null || lobbyReturnAt !== null))) return null;

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
      <h2>
        {finishTime !== null ? 'Race Complete!' : 'Race Over'}
      </h2>

      <p>
        {finishTime !== null ? '3 laps completed' : 'Time ran out before you finished'}
      </p>

      {finishTime !== null && (
        <h1>
          {formatTime(finishTime)}
        </h1>
      )}

      <p style={{ color: '#b4c9b5' }}>
        {lobbyReturnAt !== null
          ? `Back to the lobby in ${Math.max(0, Math.ceil((lobbyReturnAt - clockNow) / 1000))} s`
          : 'Waiting for the other dogs to finish: then everyone goes back to the lobby'}
      </p>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {lobbyReturnAt !== null && (
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
    </div>
  );
}
