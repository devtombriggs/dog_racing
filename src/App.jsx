import { useEffect, useState } from 'react';
import { GameSession } from './session/GameSession.js';
import { useSession } from './session/useSession.js';
import { MenuScreen } from './ui/MenuScreen.jsx';
import { JoinScreen } from './ui/JoinScreen.jsx';
import { DogSelectScreen } from './ui/DogSelectScreen.jsx';
import { MapScreen } from './ui/MapScreen.jsx';
import { RaceScreen } from './ui/RaceScreen.jsx';

const SCREENS = {
  menu: MenuScreen,
  join: JoinScreen,
  selection: DogSelectScreen,
  mapSelect: MapScreen,
  mapVote: MapScreen,
  race: RaceScreen
};

// The game is in session/GameSession.js (the connection, the room, which screen is showing) and
// game/Race.js (the race itself).  This only connects the session and shows its current screen.
function App() {
  const [session] = useState(() => new GameSession());
  const state = useSession(session);

  useEffect(() => {
    session.connect();
    return () => session.disconnect();
  }, [session]);

  const Screen = SCREENS[state.screen] ?? RaceScreen;
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
