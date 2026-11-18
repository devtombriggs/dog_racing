// The game's sounds: a dog's call on character select, the countdown and each map's music.

// Played once when the player's pick is confirmed on character select.
// Add a dog here when its sound is ready, e.g. greyhound: '/audio/meela_selection.wav'
const SELECTION_SOUNDS = {
  gsp: '/audio/pippa_selection.wav',
};

// Race audio. Every map has the same "3, 2, 1, GO" countdown: the clip starts when "3" shows, from
// COUNTDOWN_OFFSET seconds into the file, so its spoken "3" lands on the 3 on screen (2, 1 and GO
// follow a second apart).  The server sends each number to everyone in the race at once, so all the
// players hear it together.  Nudge COUNTDOWN_OFFSET up if the voice is late, down if it is early.
// Music is per map (only Treat Road has any so far): it starts on GO and loops until the player leaves the race.
const COUNTDOWN_OFFSET = 1.0;
const COUNTDOWN_AUDIO = '/audio/countdown.mp3';
const RACE_AUDIO = {
  treat_road: { music: '/audio/treat_road.mp3', musicVolume: 0.5 },
};

export class GameAudio {
  #selection = {};
  #race = { countdown: null, music: null };

  playSelection(dogId) {
    const src = SELECTION_SOUNDS[dogId];
    if (!src) return;
    try {
      this.#selection[dogId] ??= new Audio(src);
      const audio = this.#selection[dogId];
      audio.currentTime = 0;
      audio.play().catch(() => { /* autoplay blocked or file missing: stay silent */ });
    } catch { /* no audio support */ }
  }

  stopRace() {
    for (const key of ['countdown', 'music']) {
      try { this.#race[key]?.pause(); } catch { /* no audio support */ }
      this.#race[key] = null;
    }
  }

  // Called while the race loads, so the countdown is ready the moment "3" shows
  loadRace(mapId) {
    this.stopRace();
    const config = { countdown: COUNTDOWN_AUDIO, ...RACE_AUDIO[mapId] };
    try {
      for (const key of ['countdown', 'music']) {
        if (!config[key]) continue;
        const audio = new Audio(config[key]);
        audio.preload = 'auto';
        if (key === 'music') {
          audio.loop = true;
          audio.volume = config.musicVolume ?? 0.5;
        }
        this.#race[key] = audio;
      }
    } catch { /* no audio support */ }
  }

  // kind: 'countdown' | 'music'
  playRace(kind) {
    const audio = this.#race[kind];
    if (!audio) return;
    try {
      audio.currentTime = kind === 'countdown' ? COUNTDOWN_OFFSET : 0;
      audio.play().catch(() => { /* autoplay blocked or file missing: stay silent */ });
    } catch { /* no audio support */ }
  }
}

// One set of speakers: everything in the game plays through this
export const gameAudio = new GameAudio();
