import { useEffect, useState } from 'react';
import { MAPS } from '../../shared/maps.js';
import { GRAND_PRIX } from '../../shared/grandPrix.js';
import { DOGS } from '../config/dogs.js';
import { account } from '../session/account.js';
import { useAccount } from './useAccount.js';

// The leaderboards (server/db.js leaderboards): the fastest laps and races on each map, and the players with
// the most races, wins, podiums and Grand Prix, the best win rate, and which dogs are raced most.  Only
// signed-in players are on them.

const BOARDS = [
  { id: 'laps', label: 'Fastest Laps', perMap: 'fastestLaps' },
  { id: 'races', label: 'Fastest Races', perMap: 'fastestRaces' },
  { id: 'wins', label: 'Most Wins', key: 'mostWins', unit: n => (n === 1 ? 'win' : 'wins') },
  { id: 'played', label: 'Most Played', key: 'mostRaces', unit: n => (n === 1 ? 'race' : 'races') },
  { id: 'podiums', label: 'Podiums', key: 'mostPodiums', unit: n => (n === 1 ? 'podium' : 'podiums') },
  { id: 'rate', label: 'Win Rate', key: 'winRate' },
  { id: 'gp', label: 'Grand Prix', key: 'grandPrixWins', unit: () => 'won' },
  { id: 'dogs', label: 'Top Dogs' },
];
// (the maps in Grand Prix order)
const MAP_IDS = [...new Set([...Object.values(GRAND_PRIX).flatMap(gp => gp.maps), ...Object.keys(MAPS)])].filter(id => MAPS[id]);
const portrait = dogId => DOGS[dogId]?.portrait.replace(/\.png.*$/, '.webp');

/** 83.456 seconds -> "1:23.46" */
function raceClock(seconds) {
  const minutes = Math.floor(seconds / 60), rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}

function Medal({ place }) {
  return <span className={`zr-lb__place zr-lb__place--${place <= 3 ? place : 'other'}`}>{place}</span>;
}

function DogFace({ dog }) {
  if (!DOGS[dog]) return <span className="zr-lb__face" />;
  return <img className="zr-lb__face" src={portrait(dog)} alt="" title={DOGS[dog].displayName} draggable="false" />;
}

function Rows({ rows, me, value, empty }) {
  if (!rows?.length) return <p className="zr-lb__empty">{empty}</p>;
  return (
    <ol className="zr-lb__rows">
      {rows.map((row, index) => (
        <li key={`${row.userId ?? row.dog}-${index}`} className={me && row.userId === me ? 'zr-lb__me' : ''}>
          <Medal place={index + 1} />
          <DogFace dog={row.dog ?? row.favouriteDog} />
          <span className="zr-lb__who">{row.username ?? DOGS[row.dog]?.displayName ?? row.dog}{row.dog && row.username && <small>{DOGS[row.dog]?.displayName}</small>}</span>
          <span className="zr-lb__value">{value(row)}</span>
        </li>
      ))}
    </ol>
  );
}

export function LeaderboardsScreen({ session }) {
  const { user, stats } = useAccount();
  const [boards, setBoards] = useState(null);
  const [problem, setProblem] = useState('');
  const [tab, setTab] = useState('laps');
  const [mapId, setMapId] = useState(MAP_IDS[0]);

  useEffect(() => {
    let live = true;
    account.leaderboards().then(data => { if (live) setBoards(data); }, error => { if (live) setProblem(error.message); });
    account.refresh();                 // (your own numbers, up to date)
    return () => { live = false; };
  }, []);

  const board = BOARDS.find(each => each.id === tab);
  const me = user?.id;
  let body;
  if (problem) body = <p className="zr-lb__empty">Could not load the leaderboards: {problem}</p>;
  else if (!boards) body = <p className="zr-lb__empty">Loading…</p>;
  else if (board.perMap) {
    const rows = boards[board.perMap][mapId];
    body = (
      <>
        <div className="zr-lb__maps" role="tablist" aria-label="Map">
          {MAP_IDS.map(id => (
            <button key={id} role="tab" aria-selected={id === mapId} className="zr-lb__map" onClick={() => setMapId(id)} title={MAPS[id].name}>
              <img src={`/maps/icons/${id}.webp`} alt="" draggable="false" />
              <span>{MAPS[id].name}</span>
            </button>
          ))}
        </div>
        <h3 className="zr-lb__heading">{MAPS[mapId].name}{user && stats?.bestLaps?.[mapId] && board.id === 'laps' ? <small>Your best lap: {raceClock(stats.bestLaps[mapId])}</small> : null}</h3>
        <Rows rows={rows} me={me} value={row => raceClock(row.seconds)} empty={`No ${board.id === 'laps' ? 'laps' : 'races'} on ${MAPS[mapId].name} yet. Be the first!`} />
      </>
    );
  } else if (board.id === 'dogs') {
    body = <Rows rows={boards.popularDogs} value={row => `${row.races} ${row.races === 1 ? 'race' : 'races'} · ${row.wins} ${row.wins === 1 ? 'win' : 'wins'}`} empty="No races yet." />;
  } else if (board.id === 'rate') {
    body = (
      <>
        <p className="zr-lb__note">Players with at least {boards.winRateMinRaces} races</p>
        <Rows rows={boards.winRate} me={me} value={row => `${row.value}% · ${row.races} races`} empty={`Nobody has run ${boards.winRateMinRaces} races yet.`} />
      </>
    );
  } else {
    body = <Rows rows={boards[board.key]} me={me} value={row => `${row.value} ${board.unit(row.value)}`} empty="Nobody yet. Be the first!" />;
  }

  return (
    <div className="zr-page">
      <div className="zr-card zr-lb">
        <h1 className="zr-lb__title"><img src="/ui/leaderboards.webp" alt="Leaderboards" draggable="false" /></h1>
        {user && stats ? (
          <p className="zr-lb__you"><b>{user.username}</b> · {stats.races} races · {stats.wins} wins · {stats.podiums} podiums · {stats.grandPrixWins} Grand Prix won</p>
        ) : (
          <p className="zr-lb__you">Sign in on the home screen to get your races onto the leaderboards.</p>
        )}
        <div className="zr-lb__tabs" role="tablist" aria-label="Leaderboard">
          {BOARDS.map(each => (
            <button key={each.id} role="tab" aria-selected={each.id === tab} className="zr-lb__tab" data-pad-first={each.id === 'laps' ? '' : undefined} onClick={() => setTab(each.id)}>{each.label}</button>
          ))}
        </div>
        <div className="zr-lb__body">{body}</div>
        <button className="zr-btn zr-btn--quiet" data-pad-back="" onClick={session.backToMenu}>← Back</button>
      </div>
    </div>
  );
}
