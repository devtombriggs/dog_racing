// A box of square tiles (dogs, maps): which one is highlighted, and moving about it with the arrow keys.
//
// With a mouse, pointing at a tile highlights it and a click chooses it.  On a touch screen there is no
// pointing: the first tap highlights (so the box beside the tiles can be read) and a second tap, or the
// button in that box, chooses.  With a keyboard the arrows move the highlight and Enter chooses.
const canPoint = () => typeof matchMedia !== 'function' || matchMedia('(hover: hover)').matches;

export function tileHandlers(id, shown, show, choose) {
  return {
    'data-tile': id,
    onPointerEnter: event => { if (event.pointerType === 'mouse') show(id); },
    onFocus: event => { if (event.target.matches(':focus-visible')) show(id); },
    onClick: () => { if (canPoint() || shown === id) choose(id); else show(id); },
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
