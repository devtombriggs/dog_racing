// On a TV, in the Fire TV / Android TV app (android/: a full-screen web view of this page, whose user agent says
// "ZoomiesTV").  The app sends the remote's Back and Menu buttons here (window.zoomiesTv); the remote's arrows move
// round the menus as a controller's D-pad does (ui/menuPad.js), and the middle button presses what is highlighted.
// The frame rate shows at the top (also anywhere with ?fps=1 in the address).  ?tv=1 tries all this on a computer.
import { menuMove } from './ui/menuPad.js';

const asked = name => typeof location !== 'undefined' && new URLSearchParams(location.search).get(name) === '1';
/** in the TV app (or trying it out on a computer: ?tv=1) */
export const onTv = (typeof navigator !== 'undefined' && /ZoomiesTV/.test(navigator.userAgent)) || asked('tv');
const showFps = onTv || asked('fps');

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const openRaceMenu = () => window.dispatchEvent(new Event('zr-menu'));        // (ui/race/PauseMenu.jsx: opens or closes it)

/** Back on the remote: true if the game went back, false on the home screen (the app then leaves) */
function back() {
  if (document.querySelector('.pause-menu') || (document.querySelector('.race-screen') && !document.querySelector('.race-results'))) {
    openRaceMenu();
    return true;
  }
  const within = document.querySelector('.zr-sheet') ?? document.querySelector('.race-results') ?? document;
  const button = within.querySelector('[data-pad-back]');
  if (button && !button.disabled) {
    if (button.dataset.padBack === 'focus') button.focus(); else button.click();
    return true;
  }
  if (within !== document) { within.click?.(); return true; }      // (a pop-up with no back button: a click outside closes it)
  return false;
}

function startFps() {
  const label = document.createElement('div');
  label.className = 'zr-fps';
  label.setAttribute('aria-hidden', 'true');
  document.body.append(label);
  let frames = 0, since = performance.now();
  const tick = (now) => {
    frames += 1;
    if (now - since >= 500) {
      label.textContent = `${Math.round(frames * 1000 / (now - since))} fps`;
      frames = 0; since = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function startTv() {
  if (showFps) startFps();
  if (!onTv) return;
  document.documentElement.dataset.tv = '';
  window.zoomiesTv = { back, menu: () => { if (document.querySelector('.race-screen')) openRaceMenu(); } };
  window.addEventListener('keydown', (event) => {
    const direction = ARROWS[event.key];
    if (!direction) return;
    const typing = event.target instanceof HTMLInputElement && event.target.type !== 'range' && event.target.type !== 'checkbox';
    if (typing && (direction === 'left' || direction === 'right')) return;        // (moving along the text)
    if (menuMove(direction)) { event.preventDefault(); event.stopPropagation(); }     // (stopped: a key press would hide the highlight)
  }, true);
}
