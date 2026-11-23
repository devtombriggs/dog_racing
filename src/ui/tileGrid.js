// A box of square tiles (dogs, maps): which one is highlighted, and moving about it with the arrow keys.
//
// With a mouse, pointing at a tile highlights it and a click chooses it.  On a touch screen there is no
// pointing: the first tap highlights (so the box beside the tiles can be read) and a second tap, or the
// button in that box, chooses.  With a keyboard the arrows move the highlight and Enter chooses.
import { padInUse } from './menuPad.js';

const canPoint = () => typeof matchMedia !== 'function' || matchMedia('(hover: hover)').matches;
// What pressed the tile last: a finger is a tap however the screen describes itself (some Android phones say
// they can hover, which made one tap choose straight away)
let pressedWith = 'mouse';

export function tileHandlers(id, shown, show, choose) {
  return {
    'data-tile': id,
    'data-pad-first': shown === id ? '' : undefined,          // (a controller's highlight starts here: menuPad.js)
    onPointerEnter: event => { if (event.pointerType === 'mouse') show(id); },
    onPointerDown: event => { pressedWith = event.pointerType || 'mouse'; },
    onFocus: event => { if (event.target.matches(':focus-visible') || padInUse()) show(id); },
    onClick: (event) => {
      const tapped = pressedWith === 'touch' || pressedWith === 'pen' || !canPoint();
      pressedWith = 'mouse';                         // (a key press next time is not a tap)
      if (event.detail === 0 || padInUse() || shown === id || !tapped) choose(id); else show(id);
    },
  };
}

// (on the element holding the tiles: `cols` is how many tiles a row has)
export function arrowKeys(cols) {
  return (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[event.key];
    if (!step) return;
    const tiles = [...event.currentTarget.querySelectorAll('[data-tile]')];
    const at = tiles.indexOf(document.activeElement);
    const next = tiles[at < 0 ? 0 : at + step];
    if (!next) return;
    event.preventDefault();
    next.focus({ focusVisible: true });
  };
}
