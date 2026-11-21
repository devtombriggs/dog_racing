import { useEffect, useState } from 'react';
import { gameAudio } from '../audio/GameAudio.js';

/** Is the game's sound muted (src/audio/GameAudio.js), kept up to date */
export function useMuted() {
  const [muted, setMuted] = useState(gameAudio.muted);
  useEffect(() => gameAudio.onMutedChange(setMuted), []);
  return muted;
}
