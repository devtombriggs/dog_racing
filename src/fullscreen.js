// Full screen: the whole game over the whole screen (the browser's Fullscreen API).
//
//   fullscreen.available        this browser can do it
//   fullscreen.isOn()
//   fullscreen.enter()          (only works from a click or a key press: browsers insist)
//   fullscreen.exit()           fullscreen.toggle()
//   fullscreen.enterForRace()   called when a map is clicked: goes full screen unless the player has turned it off
//   fullscreen.onChange(fn)     fn(isOn) whenever it changes; returns a function that stops listening
//
// The player's choice (the Full screen option in the Esc menu) is remembered between visits.
//
// Esc: a browser takes Esc for itself to leave full screen.  Where the browser lets a page keep the key
// (Chrome and Edge: the Keyboard Lock API) the game does, so Esc opens the game's menu and the screen
// stays full; elsewhere Esc leaves full screen, and the menu opens then (see ui/race/PauseMenu.jsx).
import { onTv } from './tv.js';
const KEY = 'dogRacing.fullscreen';
const root = () => document.documentElement;
const wanted = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
const remember = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ } };

export const fullscreen = {
  available: typeof document !== 'undefined' && !onTv && Boolean(document.fullscreenEnabled && root().requestFullscreen),     // (the TV app is full screen already)
  isOn: () => Boolean(document.fullscreenElement),
  // true if Esc reaches the game while the screen is full (the key is locked to the page)
  keepsEscape: false,

  async enter() {
    if (!fullscreen.available || fullscreen.isOn()) return;
    try {
      await root().requestFullscreen({ navigationUI: 'hide' });
      try { await navigator.keyboard?.lock?.(['Escape']); fullscreen.keepsEscape = Boolean(navigator.keyboard?.lock); } catch { fullscreen.keepsEscape = false; }
    } catch { /* refused (no click behind it, or not allowed): the game carries on in its window */ }
  },

  async exit() {
    if (!fullscreen.isOn()) return;
    try { navigator.keyboard?.unlock?.(); await document.exitFullscreen(); } catch { /* already out */ }
  },

  // The player's own choice: remembered
  toggle() {
    const on = !fullscreen.isOn();
    remember(on);
    return on ? fullscreen.enter() : fullscreen.exit();
  },

  enterForRace() { return wanted() ? fullscreen.enter() : Promise.resolve(); },

  onChange(listener) {
    const changed = () => listener(fullscreen.isOn());
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  },
};
