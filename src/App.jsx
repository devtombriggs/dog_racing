import { useEffect, useState } from 'react';
import { GameSession } from './session/GameSession.js';
import { useSession } from './session/useSession.js';
import { MenuScreen } from './ui/MenuScreen.jsx';
import { JoinScreen } from './ui/JoinScreen.jsx';
import { LocalJoinScreen } from './ui/LocalJoinScreen.jsx';
import { DogSelectScreen } from './ui/DogSelectScreen.jsx';
import { MapScreen } from './ui/MapScreen.jsx';
import { RaceScreen } from './ui/RaceScreen.jsx';

const SCREENS = {
  menu: MenuScreen,
  join: JoinScreen,
  localJoin: LocalJoinScreen,
  selection: DogSelectScreen,
  mapSelect: MapScreen,
  mapVote: MapScreen,
  race: RaceScreen
};

// Split screen: player 1's race on the left (their session is the game's own), player 2's on the right
// (the session the first made for them: see GameSession.startLocalGame)
function SplitRace({ session, state }) {
  const guest = state.local.guest;
  const guestState = useSession(guest);
  return (
    <div className="split-race">
      <RaceScreen key={`one-${state.raceNumber}`} session={session} state={state} split="left" />
      {guestState.screen === 'race' && guestState.room
        ? <RaceScreen key={`two-${guestState.raceNumber}`} session={guest} state={guestState} split="right" />
        : <div className="split-race__waiting">Player 2…</div>}
    </div>
  );
}

// The game is in session/GameSession.js (the connection, the room, which screen is showing) and
// game/Race.js (the race itself).  This only connects the session and shows its current screen.
function App() {
  const [session] = useState(() => new GameSession());
  const state = useSession(session);

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
