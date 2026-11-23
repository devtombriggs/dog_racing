import { useEffect, useRef } from 'react';
import { Race } from '../game/Race.js';
import { RaceHud } from '../game/RaceHud.js';
import { Standings } from './race/Standings.jsx';
import { HudPanel } from './race/HudPanel.jsx';
import { CountdownOverlay } from './race/CountdownOverlay.jsx';
import { ResultsPanel } from './race/ResultsPanel.jsx';
import { TouchControls } from './race/TouchControls.jsx';
import { onTouch } from '../touch.js';

// The race: the 3D view with the course map, race order, HUD, countdown and results over it.
// The race itself is game/Race.js; this gives it somewhere to draw and shows what the session says.
// split: { index, count } when this is one player's share of a split screen (index 0 is player 1; count players
// at one computer: two have half the screen each, three or four a quarter each)
// On a phone (touch.js) there is only a small course map and the race order (Tom, 2026-11-23: "a tiny map, who's
// winning on phones, nothing else") with the stick and buttons over the race.
export function RaceScreen({ session, state, split = null }) {
  const containerRef = useRef(null);
  const minimapRef = useRef(null);
  const speedRef = useRef(null);
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
        surface: surfaceRef.current,
        rescue: rescueRef.current
      })
    });
    return () => race.dispose();
  }, [session]);

  return (
    <div
      className={split ? `race-screen race-half race-half--${split.index}${split.count > 2 ? ' race-quarter' : ''}` : 'race-screen'}
      style={{
        width: split ? '50vw' : '100vw',
        height: split && split.count > 2 ? '50dvh' : '100dvh',      // (dvh: a phone's browser bars are not under the race)
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
        className="race-minimap"
        style={{ position: 'absolute', left: 16, bottom: 16, pointerEvents: 'none' }}
      />

      <Standings standings={state.standings} socketId={state.socketId} />

      {/* Lost: off the track or the wrong way, counting down to the rescue */}
      <div ref={rescueRef} className="race-rescue" role="status" hidden />
      {state.fireworksIncoming.length > 0
        ? <div className="race-incoming" role="alert">FIREWORK INCOMING!</div>
        : state.frisbeesIncoming.length > 0 && <div className="race-incoming" role="alert">FRISBEE INCOMING!</div>}

      {split && <div className="race-half__player">PLAYER {split.index + 1}</div>}
      <HudPanel state={state} speedRef={speedRef} surfaceRef={surfaceRef} device={session.device} />
      {onTouch && !split && <TouchControls heldItem={state.heldItem} />}
      <CountdownOverlay racePhase={state.racePhase} />
      <ResultsPanel session={session} finishTime={state.finishTime} lobbyReturnAt={state.lobbyReturnAt}
        raceEndsAt={state.raceEndsAt} grandPrix={state.grandPrixResults} socketId={state.socketId} buttons={!split || split.index === 0} />
    </div>
  );
}
