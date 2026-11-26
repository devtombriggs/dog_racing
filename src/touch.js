// Phones and tablets (Tom, 2026-11-23): the game is played sideways, with ◀ ▶ and buttons drawn on the screen
// (ui/race/TouchControls.jsx) instead of keys.  The dog runs by itself; Brake slows it and, held, reverses.
//
//   onTouch        this is a touch screen with no mouse (or ?touch=1 in the address, to try it on a computer)
//   touchInput     what the on-screen controls are asking for, read by game/PlayerInput.js every frame:
//                  { turn (1 hard left to -1 hard right), drift, brake } and jump() / useItem() for a tap
//
// A phone held upright gets a "turn your phone" screen over everything (index.css .rotate-prompt).  Android also
// goes full screen and locks sideways at the first tap; an iPhone allows neither from a web page, so there the
// player turns it (or adds the game to the home screen, which opens it full screen: public/manifest.webmanifest).
import { fullscreen } from './fullscreen.js';

const asked = typeof location !== 'undefined' && new URLSearchParams(location.search).get('touch') === '1';
export const onTouch = asked || (typeof window !== 'undefined' && typeof navigator !== 'undefined'
  && navigator.maxTouchPoints > 0 && (window.matchMedia?.('(pointer: coarse)').matches === true || window.matchMedia?.('(any-pointer: coarse)').matches === true
    && window.matchMedia?.('(any-pointer: fine)').matches !== true));

// A dog turns this much sharper on a phone (Tom, 2026-11-23: "too hard on mobile to turn"), steering with the ◀ ▶ buttons
export const TOUCH_TURN = 1.25;

// On a phone on its side the picture is short, and the dogs in it small (Tom's iPhone 13, 2026-11-26: "the dogs are almost
// too small"): the camera looks through a longer lens there, which draws everything this much bigger.  A tablet is left alone
export const PHONE_ZOOM = 1.3;
export const phoneZoom = () => (onTouch && typeof window !== 'undefined' && window.innerHeight <= 480 ? PHONE_ZOOM : 1);

export const touchInput = {
  turn: 0, drift: false, brake: false,
  jump: () => {}, useItem: () => {},       // (set by the race's PlayerInput while it is on)
  release() { this.turn = 0; this.drift = false; this.brake = false; },
};

if (onTouch && typeof document !== 'undefined') {
  document.documentElement.classList.add('touch');
  // A tap: full screen and sideways, where the browser allows it (it has to come from a tap), unless the player
  // has turned full screen off in the race menu
  const sideways = async () => {
    await fullscreen.enterForRace();
    try { await screen.orientation?.lock?.('landscape'); } catch { /* not allowed here (an iPhone, or not full screen) */ }
  };
  document.addEventListener('pointerup', () => { if (!fullscreen.isOn()) sideways(); });
  // (no pinching the page bigger, which leaves the controls off the screen: iPhones ignore the viewport's say-so)
  document.addEventListener('gesturestart', event => event.preventDefault());
}
