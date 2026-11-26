import { useEffect, useRef, useState } from 'react';
import { touchInput } from '../../touch.js';
import { ITEM_NAMES } from '../../../shared/items.js';
import { SPECIAL_ITEM } from '../../../shared/specials.js';
import { DOGS, portraitOf } from '../../config/dogs.js';

// The controls on a phone's screen during a race (touch.js):
//   bottom left   ◀ and ▶ (Tom, 2026-11-23: the stick was too hard to turn with): held, a full turn that way, as the arrow
//                 keys.  A thumb can slide from one to the other without lifting
//   right side    Drift (big, held), Jump, Item (what the dog is carrying) and Brake (held: slows, then reverses)
//   top right     the race menu
// The dog runs by itself.  Every control follows its own finger, so steering and drifting go together.
// Keep this finger's moves and lifting even when it slides off the control (a browser may refuse: carry on without)
const follow = (event) => { try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* not a live pointer */ } };

function Arrows() {
  const fingers = useRef(new Map());              // pointerId -> 1 (left) or -1 (right): which arrow each finger is on
  const pad = useRef(null);
  const [turn, setTurn] = useState(0);
  const apply = () => {
    let sum = 0;
    for (const side of fingers.current.values()) sum += side;
    const now = Math.sign(sum);                   // (both held: straight on, as both keys)
    touchInput.turn = now; setTurn(now);
  };
  // which arrow a finger is over: the left half of the pair or the right
  const sideOf = (event) => { const box = pad.current.getBoundingClientRect(); return event.clientX < box.left + box.width / 2 ? 1 : -1; };
  const down = (event) => { follow(event); fingers.current.set(event.pointerId, sideOf(event)); apply(); };
  const move = (event) => {
    if (!fingers.current.has(event.pointerId)) return;
    const side = sideOf(event);
    if (fingers.current.get(event.pointerId) !== side) { fingers.current.set(event.pointerId, side); apply(); }
  };
  const up = (event) => { if (fingers.current.delete(event.pointerId)) apply(); };
  return (
    <div className="touch-arrows" ref={pad} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onLostPointerCapture={up} onContextMenu={event => event.preventDefault()}>
      <div className={`touch-arrow${turn > 0 ? ' touch-arrow--on' : ''}`} aria-label="Turn left">◀</div>
      <div className={`touch-arrow${turn < 0 ? ' touch-arrow--on' : ''}`} aria-label="Turn right">▶</div>
    </div>
  );
}

// A button that is on while a finger is on it (hold), or does something once when touched (tap)
function TouchButton({ className, label, hold, tap, children }) {
  const [on, setOn] = useState(false);
  const finger = useRef(null);
  const down = (event) => {
    if (finger.current !== null) return;
    finger.current = event.pointerId;
    follow(event);
    setOn(true); hold?.(true); tap?.();
  };
  const up = (event) => {
    if (event.pointerId !== finger.current) return;
    finger.current = null; setOn(false); hold?.(false);
  };
  return (
    <button type="button" className={`touch-btn ${className}${on ? ' touch-btn--on' : ''}`} aria-label={label}
      onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={event => event.preventDefault()}>
      {children}
    </button>
  );
}

// heldItemAs: the dog whose special Merlin is holding (its picture is shown in place of the badge)
export function TouchControls({ heldItem, heldItemAs = null }) {
  useEffect(() => () => touchInput.release(), []);
  // the item itself (pictures of the game's own models: public/icons/items), or the dog's special badge
  const item = heldItem === SPECIAL_ITEM ? <img src={heldItemAs ? portraitOf(heldItemAs) : '/icons/special.png'} alt="" draggable="false" style={heldItemAs ? { borderRadius: '22%' } : undefined} />
    : heldItem ? <img src={`/icons/items/${heldItem}.png`} alt="" draggable="false" /> : null;
  const itemName = heldItem === SPECIAL_ITEM ? (heldItemAs ? `${DOGS[heldItemAs]?.displayName}’s special` : 'Special') : heldItem ? ITEM_NAMES[heldItem] : 'No item';
  return (
    <div className="touch-controls">
      <Arrows />
      <TouchButton className="touch-btn--drift" label="Drift (hold)" hold={on => { touchInput.drift = on; }}>DRIFT</TouchButton>
      <TouchButton className="touch-btn--jump" label="Jump" tap={() => touchInput.jump()}>JUMP</TouchButton>
      <TouchButton className={`touch-btn--item${item ? '' : ' touch-btn--empty'}`} label={`Use item: ${itemName}`} tap={() => touchInput.useItem()}>
        {item ?? 'ITEM'}
      </TouchButton>
      <TouchButton className="touch-btn--brake" label="Brake (hold)" hold={on => { touchInput.brake = on; }}>BRAKE</TouchButton>
      <button type="button" className="touch-pause" aria-label="Menu" onClick={() => window.dispatchEvent(new Event('zr-menu'))}>
        <span /><span /><span />
      </button>
    </div>
  );
}
