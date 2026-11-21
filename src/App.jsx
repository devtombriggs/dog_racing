import { DOGS } from './config/dogs.js';
import { useEffect, useState } from 'react';
import { GameSession } from './session/GameSession.js';
import { useSession } from './session/useSession.js';
import { startMenuPad } from './ui/menuPad.js';
import { MenuScreen } from './ui/MenuScreen.jsx';
import { JoinScreen } from './ui/JoinScreen.jsx';
import { LocalJoinScreen } from './ui/LocalJoinScreen.jsx';
import { DogSelectScreen } from './ui/DogSelectScreen.jsx';
import { MapScreen } from './ui/MapScreen.jsx';
import { RaceScreen } from './ui/RaceScreen.jsx';
import { PauseMenu } from './ui/race/PauseMenu.jsx';

const SCREENS = {
  menu: MenuScreen,
  join: JoinScreen,
  localJoin: LocalJoinScreen,
  selection: DogSelectScreen,
  mapSelect: MapScreen,
  mapVote: MapScreen,
  race: RaceScreen
};

// Split screen, one of the other players' share of it (the session the first player's made for them: see
// GameSession.startLocalGame)
function GuestRace({ guest, index, count }) {
  const state = useSession(guest);
  return state.screen === 'race' && state.room
    ? <RaceScreen key={`race-${state.raceNumber}`} session={guest} state={state} split={{ index, count }} />
    : <div className="split-race__waiting">Player {index + 1}…</div>;
}

// Split screen: two players side by side; three or four, a quarter of the screen each (player 1 top left, then
// top right, bottom left, bottom right).  With three, the spare quarter has the race order in it.
function SplitRace({ session, state }) {
  const guests = state.local.guests, count = guests.length + 1;
  const here = new Set([session, ...guests].map(each => each.socket?.id));       // (the players at this screen)
  return (
    <div className={`split-race split-race--${count === 2 ? 'halves' : 'quarters'}`}>
      <RaceScreen key={`one-${state.raceNumber}`} session={session} state={state} split={{ index: 0, count }} />
      {guests.map((guest, i) => <GuestRace key={i} guest={guest} index={i + 1} count={count} />)}
      {count === 3 && (
        <div className="split-race__spare">
          <h2>Race order</h2>
          <ol>
            {state.standings.map(entry => (
              <li key={entry.playerId} className={here.has(entry.playerId) ? 'split-race__player' : ''}>{entry.name} — {DOGS[entry.dog]?.displayName ?? 'Dog'}{entry.finished ? ' 🏁' : ''}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// The game is in session/GameSession.js (the connection, the room, which screen is showing) and
// game/Race.js (the race itself).  This only connects the session and shows its current screen.
function App() {
  const [session] = useState(() => new GameSession());
  const state = useSession(session);

  // a controller works the menus (ui/menuPad.js)
  useEffect(() => startMenuPad(), []);

  useEffect(() => {
    session.connect();
    return () => session.disconnect();
  }, [session]);

  // (split screen: the race is two race screens side by side, one for each player's session)
  const Screen = state.screen === 'race' && state.local ? SplitRace : SCREENS[state.screen] ?? RaceScreen;
  // (each race gets a new race screen, so the next race of a Grand Prix builds its own map)
  return (
    <>
      <Screen key={state.screen === 'race' ? `race-${state.raceNumber}` : state.screen} session={session} state={state} />
      {/* Esc during a race: resume, full screen, main menu */}
      {state.screen === 'race' && <PauseMenu key={`menu-${state.raceNumber}`} session={session} />}
      {/* in a room and the connection has gone: say so (the game reconnects by itself and takes the seat back) */}
      {state.room && !state.connected && (
        <div className="connection-lost" role="alert">
          <strong>Connection lost</strong>
          <span>Reconnecting… your dog is running on by itself and your place is held for a minute.</span>
        </div>
      )}
      {state.notice && <div className="connection-notice" role="status">{state.notice}</div>}
    </>
  );
}

export default App;
