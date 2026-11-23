import { useEffect, useRef, useState } from 'react';
import { touchInput } from '../../touch.js';
import { ITEM_NAMES } from '../../../shared/items.js';
import { SPECIAL_ITEM } from '../../../shared/specials.js';

// The controls on a phone's screen during a race (touch.js):
//   left half     a stick, which appears where the thumb goes down and steers left and right (a small push for a
//                 gentle turn, as a controller's stick)
//   right side    Drift (big, held), Jump, Item (what the dog is carrying) and Brake (held: slows, then reverses)
//   top right     the race menu
// The dog runs by itself.  Every control follows its own finger, so steering and drifting go together.
const STICK = { reach: 56, dead: 0.12 };          // px the knob goes from the middle; share of that which does nothing
// Keep this finger's moves and lifting even when it slides off the control (a browser may refuse: carry on without)
const follow = (event) => { try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* not a live pointer */ } };
const ITEM_ICONS = { ball: '🎾', toy: '🧸', bone: '🦴', frisbee: '🥏', firework: '🎆', collar: '🛡️' };

function Stick() {
  const [at, setAt] = useState(null);             // { x, y, dx, dy } while a thumb is on it
  const finger = useRef(null);

  const move = (event, start) => {
    const base = start ?? at;
    let dx = event.clientX - base.x, dy = event.clientY - base.y;
    const far = Math.hypot(dx, dy);
    if (far > STICK.reach) { dx *= STICK.reach / far; dy *= STICK.reach / far; }
    const share = Math.abs(dx) / STICK.reach;
    touchInput.turn = share <= STICK.dead ? 0 : -Math.sign(dx) * (share - STICK.dead) / (1 - STICK.dead);     // (left is +)
    setAt({ x: base.x, y: base.y, dx, dy });
  };
  const down = (event) => {
    if (finger.current !== null) return;
    finger.current = event.pointerId;
    follow(event);
    move(event, { x: event.clientX, y: event.clientY });
  };
  const up = (event) => {
    if (event.pointerId !== finger.current) return;
    finger.current = null; touchInput.turn = 0; setAt(null);
  };

  return (
    <div className="touch-stick" onPointerDown={down} onPointerMove={event => { if (event.pointerId === finger.current) move(event); }}
      onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      {at ? (
        <div className="touch-stick__base" style={{ left: at.x, top: at.y }}>
          <div className="touch-stick__knob" style={{ transform: `translate(${at.dx}px, ${at.dy}px)` }} />
        </div>
      ) : <div className="touch-stick__hint" aria-hidden="true"><span>◀</span> steer <span>▶</span></div>}
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

export function TouchControls({ heldItem }) {
  useEffect(() => () => touchInput.release(), []);
  const item = heldItem === SPECIAL_ITEM ? <img src="/icons/special.png" alt="" /> : heldItem ? ITEM_ICONS[heldItem] ?? '★' : null;
  const itemName = heldItem === SPECIAL_ITEM ? 'Special' : heldItem ? ITEM_NAMES[heldItem] : 'No item';
  return (
    <div className="touch-controls">
      <Stick />
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
