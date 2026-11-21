import { gameAudio } from '../audio/GameAudio.js';
import { useMuted } from './useMuted.js';

// The sound on and off (music, countdown and the dogs' calls; not voice chat).  In a race it is in the menu (Esc).
const SPEAKER = 'M6 18h8l10-8v28l-10-8H6z';
const ICONS = {
  on: <svg viewBox="0 0 48 48" aria-hidden="true"><path d={SPEAKER} /><path d="M30 17c3 2 4 4.5 4 7s-1 5-4 7M34 12c5 3 7 7.500 7 12s-2 9-7 12" fill="none" stroke="#fff" strokeWidth="3.500" strokeLinecap="round" /></svg>,
  off: <svg viewBox="0 0 48 48" aria-hidden="true"><path d={SPEAKER} /><path d="M31 18l12 12M43 18L31 30" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></svg>,
};

export function MuteButton({ className = 'zr-iconbtn', style }) {
  const muted = useMuted();
  return (
    <button className={className} style={style} aria-label={muted ? 'Sound off: turn it on' : 'Sound on: mute it'} aria-pressed={muted}
      title={muted ? 'Sound off' : 'Sound on'} onClick={() => gameAudio.toggleMuted()}>
      {muted ? ICONS.off : ICONS.on}
    </button>
  );
}
