import { DOGS } from '../../config/dogs.js';
import { ordinal } from '../../utils/format.js';

const ROW = 38;          // (px a row, gap included)

// Who to show on a phone (Tom, 2026-11-24): first place and you; if you are first, you and second
function compactStandings(standings, socketId) {
  const me = standings.find(entry => entry.playerId === socketId);
  if (!me) return standings.filter(entry => entry.place <= 2);
  return standings.filter(entry => entry === me || entry.place === (me.place === 1 ? 2 : 1));
}

// Race order, top left: slides rows into place when someone overtakes.
// compact: a phone, just two rows (compactStandings)
export function Standings({ standings, socketId, compact = false }) {
  if (!(standings.length > 0)) return null;
  const rows = compact ? compactStandings(standings, socketId).sort((a, b) => a.place - b.place) : standings;
  const slot = entry => (compact ? rows.indexOf(entry) : entry.place - 1);

  return (
    <ol className={`race-standings${compact ? ' race-standings--compact' : ''}`} aria-label="Race positions" style={{ height: rows.length * ROW - 4 }}>
      {rows.map(entry => (
        <li
          key={entry.playerId}
          className={`race-standings__row${entry.playerId === socketId ? ' race-standings__row--you' : ''}`}
          style={{ transform: `translateY(${slot(entry) * ROW}px)` }}
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
