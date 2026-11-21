// A controller in the menus (Xbox layout; the race itself reads the controller in game/PlayerInput.js):
//
//   D-pad or left stick   move the highlight to the nearest button or tile that way (on a slider,
//                         left and right move the slider)
//   A                     choose it
//   B                     back: presses the button marked data-pad-back (or, where that is
//                         data-pad-back="focus", only moves the highlight to it: Leave Game is never one press)
//   LB / RB               the tab to the left / right (Grand Prix, Maps)
//   Start                 in a race: the menu (ui/race/PauseMenu.jsx)
//
// It works on whatever is on the page: any button, text box or tab that can be seen, inside the topmost
// thing showing (a pop-up, the race menu, the results; otherwise the whole screen).  During the race
// itself nothing but Start does anything, so driving and the menus never mix.
//
//   data-pad-first   on the thing to highlight when a screen opens
//   data-pad-off     on a screen that reads the controller itself (split-screen join): only B works there
//
// While the controller is the last thing used, <html data-pad> is set: the highlight is drawn (menu.css)
// and tiles count a highlight as being pointed at (tileGrid.js).  A mouse or a key takes it off again.
import { pickInDirection, padDirection, REPEAT } from './padNav.js';

const A = 0, B = 1, LB = 4, RB = 5, START = 9;
const root = () => document.documentElement;
export const padInUse = () => typeof document !== 'undefined' && root().dataset.pad !== undefined;

// Only this controller may use the menus (split screen: the player whose turn it is).  null: any.  -1: none.
let only = null;
export function restrictMenuPad(index) { only = index; }

function scope() {
  const over = document.querySelector('.zr-sheet') ?? document.querySelector('.pause-menu');
  if (over) return over;
  if (document.querySelector('.race-screen')) return document.querySelector('.race-results');     // (null in the race itself)
  return document.body;
}

function things(within) {
  return [...within.querySelectorAll('button, input, [role="tab"]')].filter((element) => {
    if (element.disabled || element.getAttribute('aria-hidden') === 'true') return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
}

function highlight(element) {
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// A slider (the volume): left and right move it a step, as the arrow keys do
function nudge(slider, by) {
  const step = Number(slider.step) || 1, min = Number(slider.min || 0), max = Number(slider.max || 100);
  const next = Math.min(max, Math.max(min, Number(slider.value) + by * step));
  if (next === Number(slider.value)) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, String(next));     // (so React sees it)
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

function act(within, pressed, direction) {
  const all = things(within);
  const current = all.includes(document.activeElement) ? document.activeElement : null;
  const first = () => all.find(element => element.hasAttribute('data-pad-first')) ?? all[0];
  const off = Boolean(document.querySelector('[data-pad-off]')) && within === document.body;

  if (pressed(B)) {
    const back = within.querySelector('[data-pad-back]');
    if (back && !back.disabled) { if (back.dataset.padBack === 'focus') highlight(back); else back.click(); }
    return;
  }
  if (off) return;
  if (pressed(LB) || pressed(RB)) {
    const tabs = all.filter(element => element.getAttribute('role') === 'tab');
    const at = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    const next = tabs[at + (pressed(RB) ? 1 : -1)];
    if (next) next.click();
    return;
  }
  if (!current) { highlight(first()); return; }              // (the first press only shows where the highlight is)
  if (pressed(A)) { current.click(); return; }
  if (current.type === 'range' && (direction === 'left' || direction === 'right')) { nudge(current, direction === 'right' ? 1 : -1); return; }
  if (direction) {
    const others = all.filter(element => element !== current);
    const index = pickInDirection(current.getBoundingClientRect(), others.map(element => element.getBoundingClientRect()), direction);
    if (index >= 0) highlight(others[index]);
  }
}

export function startMenuPad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return () => {};
  const held = new Map();          // controller -> { buttons: Set, direction, nextAt }
  let frame = 0, lastScope = null;

  const leave = () => { delete root().dataset.pad; };
  const onMove = (event) => { if (event.movementX || event.movementY) leave(); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('pointerdown', leave);
  window.addEventListener('keydown', leave);

  const poll = () => {
    frame = requestAnimationFrame(poll);
    const now = performance.now();
    const within = scope();
    for (const pad of navigator.getGamepads()) {
      if (!pad?.connected) continue;
      const was = held.get(pad.index) ?? { buttons: new Set(), direction: null, nextAt: 0 };
      const buttons = new Set([A, B, LB, RB, START].filter(index => pad.buttons[index]?.pressed));
      const pressed = index => buttons.has(index) && !was.buttons.has(index);
      let direction = padDirection(pad), go = null;
      if (direction && (direction !== was.direction || now >= was.nextAt)) go = direction;
      held.set(pad.index, { buttons, direction, nextAt: !direction ? 0 : go ? now + (direction === was.direction ? REPEAT.thenMs : REPEAT.firstMs) : was.nextAt });
      if (only !== null && pad.index !== only) continue;

      const any = go || [A, B, LB, RB, START].some(pressed);
      if (!any) continue;
      if (pressed(START) && document.querySelector('.race-screen')) { window.dispatchEvent(new Event('zr-menu')); continue; }
      if (!within) continue;                                  // the race itself: the controller is for driving
      root().dataset.pad = '';
      act(within, pressed, go);
    }
    // a new screen, or a pop-up opening or closing: the highlight goes to its first thing
    if (padInUse() && within && within !== lastScope || (padInUse() && within && !within.contains(document.activeElement))) {
      const all = things(within);
      if (all.length && !all.includes(document.activeElement) && !(within === document.body && document.querySelector('[data-pad-off]'))) {
        highlight(all.find(element => element.hasAttribute('data-pad-first')) ?? all[0]);
      }
    }
    lastScope = within;
  };
  poll();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('pointerdown', leave);
    window.removeEventListener('keydown', leave);
  };
}
