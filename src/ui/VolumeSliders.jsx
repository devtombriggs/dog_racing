import { useEffect, useState } from 'react';
import { gameAudio } from '../audio/GameAudio.js';

// The music and effects volume (src/audio/GameAudio.js), in the home screen's Settings and the race menu.
// A controller moves a highlighted slider with left and right (ui/menuPad.js).
const SLIDERS = [
  { kind: 'music', label: 'Music' },
  { kind: 'effects', label: 'Sound effects', hint: 'Countdown and the dogs' },
];

export function VolumeSliders({ className = 'zr-volume' }) {
  const [volume, setVolume] = useState(gameAudio.volume);
  useEffect(() => gameAudio.onVolumeChange(setVolume), []);
  return (
    <div className={className}>
      {SLIDERS.map(({ kind, label, hint }) => {
        const percent = Math.round(volume[kind] * 100);
        return (
          <label key={kind} className={`${className}__row`}>
            <span>{label}{hint && <small>{hint}</small>}</span>
            <input type="range" min="0" max="100" step="5" value={percent} aria-label={`${label} volume`}
              onChange={event => gameAudio.setVolume(kind, Number(event.target.value) / 100)} />
            <b>{percent}%</b>
          </label>
        );
      })}
    </div>
  );
}
