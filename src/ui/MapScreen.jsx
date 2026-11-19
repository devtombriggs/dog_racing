import { useEffect, useState } from 'react';
import { MAPS, lapsFor } from '../../shared/maps.js';
import { GRAND_PRIX, GRAND_PRIX_POINTS } from '../../shared/grandPrix.js';
import { playerColor } from '../config/dogs.js';
import { BotSettings } from './BotSettings.jsx';
import { fullscreen } from '../fullscreen.js';
import { Paw } from './Paw.jsx';
import { arrowKeys, tileHandlers } from './tileGrid.js';

const icon = mapId => `/maps/icons/${mapId}.webp`;
const MAP_IDS = Object.keys(MAPS);
const CUP_IDS = Object.keys(GRAND_PRIX);

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

// Map select (single player: choose a map to race on it) and map vote (multiplayer).
// Two tabs: the Grand Prix (each a box of its four maps) and the single maps.  Whatever is highlighted
// is described in the box on the left.
export function MapScreen({ session, state }) {
  const { screen, room, socketId, connected, error } = state;

  const voting = screen === 'mapVote';
  const votes = room?.votes ?? {};
  const myVote = votes[socketId];
  const voteCount = Object.keys(votes).length;
  const secondsLeft = useVoteSecondsLeft(session, voting);

  const [tab, setTab] = useState(myVote && MAPS[myVote] ? 'maps' : myVote ? 'cups' : state.mapTab ?? 'cups');
  // the tile highlighted on each tab (it is the one described beside the tiles)
  const [shownOn, setShownOn] = useState({ cups: GRAND_PRIX[myVote] ? myVote : CUP_IDS[0], maps: MAPS[myVote] ? myVote : MAP_IDS[0] });
  const shown = shownOn[tab];
  const show = id => setShownOn(now => ({ ...now, [tab]: id }));
  const cups = tab === 'cups';

  const choose = (id) => {
    fullscreen.enterForRace();
    if (voting) session.voteMap(id);
    else if (GRAND_PRIX[id]) session.startSoloGrandPrix(id);
    else session.startSoloRace(id);
  };
  const votersFor = id => (room?.players ?? []).filter(player => votes[player.id] === id);
  const tags = (id) => {
    const voters = voting ? votersFor(id) : [];
    return voters.length > 0 && (
      <span className="zr-tile__tags" aria-hidden="true">
        {voters.map(player => <span key={player.id} style={{ background: playerColor(player) }}>{player.id === socketId ? 'You' : player.name}</span>)}
      </span>
    );
  };
  const tileClass = id => `zr-tile${shown === id ? ' zr-tile--shown' : ''}${myVote === id ? ' zr-tile--mine' : ''}`;
  const votesOn = ids => Object.values(votes).filter(id => ids.includes(id)).length;
  const voteWords = id => (voting ? ` ${votersFor(id).length} ${votersFor(id).length === 1 ? 'vote' : 'votes'}.` : '');

  const cup = GRAND_PRIX[shown], map = MAPS[shown];
  return (
    <main className="zr-screen">
      <header className="zr-screen__head">
        <Paw /><h1 className="zr-title">{voting ? 'Vote for a Map' : 'Choose a Map'}</h1><Paw />
      </header>
      {voting && (
        <div className="zr-timer" role="timer" aria-live="polite"><span>Starting in</span><strong>{secondsLeft}s</strong></div>
      )}
      {voting && <p className="zr-screen__sub">{voteCount} of {room?.players.length ?? 0} voted · most votes wins · a tie is picked at random</p>}

      <div className="zr-tabs" role="tablist" aria-label="Grand Prix or single maps">
        <button className="zr-tab" role="tab" aria-selected={cups} onClick={() => setTab('cups')}>
          <img src={`/ui/tab_gp_${cups ? 'on' : 'off'}.webp`} alt="Grand Prix" draggable="false" />
          {voting && votesOn(CUP_IDS) > 0 && <span className="zr-tab__count" aria-label={`${votesOn(CUP_IDS)} votes`}>{votesOn(CUP_IDS)}</span>}
        </button>
        <button className="zr-tab" role="tab" aria-selected={!cups} onClick={() => setTab('maps')}>
          <img src={`/ui/tab_maps_${cups ? 'off' : 'on'}.webp`} alt="Maps" draggable="false" />
          {voting && votesOn(MAP_IDS) > 0 && <span className="zr-tab__count" aria-label={`${votesOn(MAP_IDS)} votes`}>{votesOn(MAP_IDS)}</span>}
        </button>
      </div>

      <section className="zr-board" role="tabpanel">
        <aside className="zr-detail" aria-live="polite">
          {cup ? (
            <>
              <div className="zr-detail__art zr-detail__art--cup"><img src="/ui/cup.webp" alt="" draggable="false" /></div>
              <h2>{cup.name}</h2>
              <p className="zr-detail__sub">Four races · {GRAND_PRIX_POINTS.join(', ')} points</p>
              <ol className="zr-detail__races">
                {cup.maps.map((mapId, index) => (
                  <li key={mapId}>
                    <img src={icon(mapId)} alt="" draggable="false" />
                    <span>{index + 1}. {MAPS[mapId].name}<small>{lapsFor(mapId)} {lapsFor(mapId) === 1 ? 'lap' : 'laps'}</small></span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <div className="zr-detail__art"><img src={icon(shown)} alt="" draggable="false" /></div>
              <h2>{map.name}</h2>
              <ul className="zr-detail__facts">
                <li>{lapsFor(shown)} {lapsFor(shown) === 1 ? 'lap' : 'laps'}</li>
                {map.description.split(' · ').map(fact => <li key={fact}>{fact}</li>)}
              </ul>
            </>
          )}
          <button className="zr-btn zr-btn--yellow" disabled={!connected || (voting && myVote === shown)} onClick={() => choose(shown)}>
            {voting ? (myVote === shown ? 'Your vote ✓' : 'Vote') : cup ? 'Start Grand Prix' : 'Race!'}
          </button>
        </aside>

        <div className="zr-gridwrap" style={{ '--cols': 4, '--rows': Math.ceil(MAP_IDS.length / 4) }}>
          {cups ? (
            <div className="zr-grid" style={{ '--cols': 2, '--rows': 2 }} role="group" aria-label={voting ? 'Vote for a Grand Prix' : 'Choose a Grand Prix'} onKeyDown={arrowKeys(2)}>
              {CUP_IDS.map((id) => {
                const { name, maps } = GRAND_PRIX[id];
                return (
                  <button key={id} className={`${tileClass(id)} zr-tile--cup`} disabled={!connected} {...tileHandlers(id, shown, show, choose)}
                    aria-label={`${name}: four races. ${maps.map(mapId => MAPS[mapId].name).join(', ')}.${voteWords(id)}`}>
                    <span className="zr-tile__cupname" aria-hidden="true">{name}</span>
                    {maps.map(mapId => <img key={mapId} src={icon(mapId)} alt="" draggable="false" />)}
                    {tags(id)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="zr-grid" style={{ '--cols': 4, '--rows': Math.ceil(MAP_IDS.length / 4) }} role="group" aria-label={voting ? 'Vote for a map' : 'Choose a map'} onKeyDown={arrowKeys(4)}>
              {MAP_IDS.map(id => (
                <button key={id} className={tileClass(id)} disabled={!connected} {...tileHandlers(id, shown, show, choose)}
                  aria-label={`${MAPS[id].name}. ${MAPS[id].description}.${voteWords(id)}`}>
                  <img src={icon(id)} alt="" draggable="false" />
                  {tags(id)}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="zr-footer">
        <button className="zr-btn zr-btn--quiet zr-btn--small" data-pad-back="focus" onClick={session.leaveGame}>Leave Game</button>
        {/* (the vote is too late to change them: they are settled in the lobby) */}
        <BotSettings session={session} room={room} canChange={!voting && connected && room?.hostId === socketId} />
        <p>
          {!connected ? 'Disconnected. Reconnecting to the server…'
            : !voting ? 'Pick where to race'
              : myVote ? `You voted for ${(MAPS[myVote] ?? GRAND_PRIX[myVote]).name}. Choose another to change your vote.` : 'Choose a map or a Grand Prix to vote'}
        </p>
      </footer>
      {error && <p className="zr-screen__error" role="alert">{error}</p>}
    </main>
  );
}
