import { useEffect, useRef } from 'react';
import { Race } from '../game/Race.js';
import { RaceHud } from '../game/RaceHud.js';
import { Standings } from './race/Standings.jsx';
import { HudPanel } from './race/HudPanel.jsx';
import { CountdownOverlay } from './race/CountdownOverlay.jsx';
import { ResultsPanel } from './race/ResultsPanel.jsx';

// The race: the 3D view with the course map, race order, HUD, countdown and results over it.
// The race itself is game/Race.js; this gives it somewhere to draw and shows what the session says.
export function RaceScreen({ session, state }) {
  const containerRef = useRef(null);
  const minimapRef = useRef(null);
  const speedRef = useRef(null);
  const timerRef = useRef(null);
  const surfaceRef = useRef(null);
  const rescueRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !session.socket || !session.state.room) return undefined;

    const race = new Race({
      container,
      minimapCanvas: minimapRef.current,
      session,
      hud: new RaceHud({
        speed: speedRef.current,
        timer: timerRef.current,
        surface: surfaceRef.current,
        rescue: rescueRef.current
      })
    });
    return () => race.dispose();
  }, [session]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#87ceeb'
      }}
    >
      {/* Three.js canvas container */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0
        }}
      />

      {/* Course map, bottom left: where every dog is on the lap */}
      <canvas
        ref={minimapRef}
        aria-label="Course map"
        style={{ position: 'absolute', left: 16, bottom: 16, pointerEvents: 'none' }}
      />

      <Standings standings={state.standings} socketId={state.socketId} />

      {/* Lost: off the track or the wrong way, counting down to the rescue */}
      <div ref={rescueRef} className="race-rescue" role="status" hidden />
      {state.frisbeesIncoming.length > 0 && <div className="race-incoming" role="alert">FRISBEE INCOMING!</div>}

      <HudPanel state={state} speedRef={speedRef} timerRef={timerRef} surfaceRef={surfaceRef} />
      <CountdownOverlay racePhase={state.racePhase} />
      <ResultsPanel session={session} finishTime={state.finishTime} lobbyReturnAt={state.lobbyReturnAt} />
    </div>
  );
}
