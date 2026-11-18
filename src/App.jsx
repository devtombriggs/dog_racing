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
  return <Screen session={session} state={state} />;
}

export default App;
