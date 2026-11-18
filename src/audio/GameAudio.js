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
// Every map has its own music: it starts on GO and loops until the player leaves the race.
const COUNTDOWN_OFFSET = 1.0;
const COUNTDOWN_AUDIO = '/audio/countdown.mp3';
const RACE_AUDIO = {
  treat_road: { music: '/audio/treat_road.mp3', musicVolume: 0.5 },
  // (these are instrumentals made with Suno, one to suit each map)
  wendover: { music: '/audio/wendover.mp3', musicVolume: 0.5 },                // woodland folk: guitar, flute, fiddle
  frostpeak: { music: '/audio/frostpeak.mp3', musicVolume: 0.5 },              // alpine: sleigh bells, brass, driving snare
  modbury_heights: { music: '/audio/modbury_heights.mp3', musicVolume: 0.5 },  // coastal surf: ukulele, surf and steel guitar
  farmyard: { music: '/audio/farmyard.mp3', musicVolume: 0.5 },                // bluegrass hoedown: banjo, fiddle, washboard
  water_park: { music: '/audio/water_park.mp3', musicVolume: 0.5 },            // tropical: steel drums, marimba, slap bass
  pet_mall: { music: '/audio/pet_mall.mp3', musicVolume: 0.5 },                // zany funk and disco: synth organ, xylophone, kazoo
  mud_park: { music: '/audio/mud_park.mp3', musicVolume: 0.5 },                // rowdy stomp: slide guitar, harmonica, tuba
};

// Voices come first: while this player is connected to anyone in voice chat, the music plays at this
// share of its usual volume.  (A voice is already as loud as a browser will play it.)
const MUSIC_UNDER_VOICES = 0.3;

export class GameAudio {
  #selection = {};
  #race = { countdown: null, music: null };
  #musicVolume = 0.5;      // this map's music at its usual volume
  #voices = false;         // voice chat is connected to someone

  // Turn the music down while voice chat is connected (and back up when it is not)
  setVoiceChatActive(active) {
    this.#voices = Boolean(active);
    this.#applyMusicVolume();
  }

  #applyMusicVolume() {
    try { if (this.#race.music) this.#race.music.volume = this.#musicVolume * (this.#voices ? MUSIC_UNDER_VOICES : 1); } catch { /* no audio support */ }
  }

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
          this.#musicVolume = config.musicVolume ?? 0.5;
        }
        this.#race[key] = audio;
      }
      this.#applyMusicVolume();
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
