import { BOT_LEVELS, BOT_LEVEL_IDS, MAX_BOTS } from '../../shared/botLevels.js';

// Computer-controlled dogs: how many fill the empty places on the grid, and how good they are.
// The host chooses; everyone else in the room sees what was chosen.
export function BotSettings({ session, room, canChange }) {
  const bots = room?.bots ?? { count: 0, level: 'medium' };
  const places = Math.max(0, MAX_BOTS + 1 - (room?.players.length ?? 1));     // empty places on the grid
  const racing = Math.min(bots.count, places);

  if (!canChange) {
    return (
      <p className="bot-settings bot-settings--fixed">
        Computer dogs: <strong>{racing === 0 ? 'none' : `${racing} · ${BOT_LEVELS[bots.level].name}`}</strong>
      </p>
    );
  }
  return (
    <div className="bot-settings" role="group" aria-label="Computer-controlled dogs">
      <span className="bot-settings__label">
        Computer dogs
        <small>{bots.count > places ? `${racing} will race: the room has ${places} empty ${places === 1 ? 'place' : 'places'}` : 'Fill the empty places on the grid'}</small>
      </span>
      <span className="bot-settings__count">
        <button onClick={() => session.setBots({ count: bots.count - 1 })} disabled={bots.count <= 0} aria-label="One fewer computer dog">−</button>
        <output aria-live="polite">{bots.count}</output>
        <button onClick={() => session.setBots({ count: bots.count + 1 })} disabled={bots.count >= MAX_BOTS} aria-label="One more computer dog">+</button>
      </span>
      <span className="bot-settings__levels" role="radiogroup" aria-label="How good the computer dogs are">
        {BOT_LEVEL_IDS.map(id => (
          <button
            key={id}
            role="radio"
            aria-checked={bots.level === id}
            className={bots.level === id ? 'bot-settings__level--on' : ''}
            disabled={bots.count === 0}
            onClick={() => session.setBots({ level: id })}
          >
            {BOT_LEVELS[id].name}
          </button>
        ))}
      </span>
    </div>
  );
}
