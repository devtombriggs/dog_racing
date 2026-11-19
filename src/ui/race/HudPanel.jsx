import { DEFAULT_MAP, lapsFor } from '../../../shared/maps.js';
import { ITEM_NAMES } from '../../../shared/items.js';
import { SPECIALS, SPECIAL_ITEM } from '../../../shared/specials.js';

// What is on the screen during the race, kept small (Tom, 2026-11-19: "takes up too much screen on tablet"):
//   top right     the lap (and which race of a Grand Prix), the item being held, and a word when something
//                 is up (off the track, fell, an earthquake): nothing while all is well
//   bottom right  the speed
// The speed and the word are written straight to the page by the race, every frame, through the refs.
// The controls are on the home screen (the controller button) and in the README.
// device: in split screen, what this player drives with (the item's hint is for that)
export function HudPanel({ state, speedRef, surfaceRef, device = null }) {
  const { room, socketId, lap, heldItem } = state;
  const press = device?.type === 'pad' ? 'X' : device?.type === 'keyboard' ? 'Shift' : 'Shift / X';
  const item = heldItem === SPECIAL_ITEM
    ? SPECIALS[room?.players.find(player => player.id === socketId)?.dog]?.name ?? 'Special'
    : heldItem ? ITEM_NAMES[heldItem] : null;

  return (
    <>
      <div className="race-hud">
        <div className="race-hud__lap">
          LAP <strong>{lap}/{lapsFor(room?.mapId ?? DEFAULT_MAP)}</strong>
          {room?.grandPrix && <span>🏆 {room.grandPrix.round}/{room.grandPrix.of}</span>}
        </div>
        {item && (
          <div className="race-hud__item">
            {heldItem === SPECIAL_ITEM && <img src="/icons/special.png" alt="" />}
            {item}<kbd>{press}</kbd>
          </div>
        )}
        <div ref={surfaceRef} className="race-hud__word" role="status" hidden />
      </div>
      <div className="race-speed" aria-label="Speed">
        <strong ref={speedRef}>0.0</strong><span>km/h</span>
      </div>
    </>
  );
}
