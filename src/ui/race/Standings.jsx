import { DOGS } from '../../config/dogs.js';
import { ordinal } from '../../utils/format.js';

// Race order, top left: slides rows into place when someone overtakes
export function Standings({ standings, socketId }) {
  if (!(standings.length > 0)) return null;

  return (
    <ol className="race-standings" aria-label="Race positions" style={{ height: standings.length * 38 - 4 }}>
      {standings.map(entry => (
        <li
          key={entry.playerId}
          className={`race-standings__row${entry.playerId === socketId ? ' race-standings__row--you' : ''}`}
          style={{ transform: `translateY(${(entry.place - 1) * 38}px)` }}
        >
          <span className="race-standings__place">{ordinal(entry.place)}</span>
          <span className="race-standings__name">
            {entry.name} — {DOGS[entry.dog]?.displayName ?? 'Dog'}
          </span>
          {entry.away && !entry.finished && <span className="race-standings__flag" title="Lost connection: the dog is running itself" aria-label="lost connection">📡</span>}
          {entry.finished && <span className="race-standings__flag" aria-label="finished">🏁</span>}
        </li>
      ))}
    </ol>
  );
}
