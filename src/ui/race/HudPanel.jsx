import { DEFAULT_MAP, lapsFor } from '../../../shared/maps.js';

// What is on the screen during the race, kept small (Tom, 2026-11-19: "takes up too much screen on tablet"):
//   top right     the lap (and which race of a Grand Prix).  Not the item: it is above your dog's head (and on a
//                 phone on the Item button): Tom, 2026-11-24
//   bottom right  the speed (not on a phone)
// No running commentary (drifting, boosts, off track...): Tom, 2026-11-24, "no need to babysit people".
// The speed is written straight to the page by the race, every frame, through the ref.
export function HudPanel({ state, speedRef }) {
  const { room, lap } = state;

  return (
    <>
      <div className="race-hud">
        <div className="race-hud__lap">
          LAP <strong>{lap}/{lapsFor(room?.mapId ?? DEFAULT_MAP)}</strong>
          {room?.grandPrix && <span>🏆 {room.grandPrix.round}/{room.grandPrix.of}</span>}
        </div>
      </div>
      <div className="race-speed" aria-label="Speed">
        <strong ref={speedRef}>0.0</strong><span>km/h</span>
      </div>
    </>
  );
}
