// The game's sounds: a dog's call on character select, the countdown and each map's music.

// Played once when the player's pick is confirmed on character select.
// Add a dog here when its sound is ready, e.g. pablo: '/audio/pablo_selection.mp3'
const SELECTION_SOUNDS = {
  gsp: '/audio/pippa_selection.wav',
  second_dog: '/audio/meela_selection.mp3',
  black_lab: '/audio/poppy_selection.mp3',
};

// Race audio. Every map has the same "3, 2, 1, GO" countdown: the clip starts when "3" shows, from
// COUNTDOWN_OFFSET seconds into the file, so its spoken "3" lands on the 3 on screen (2, 1 and GO
// follow a second apart).  The server sends each number to everyone in the race at once, so all the
// players hear it together.  Nudge COUNTDOWN_OFFSET up if the voice is late, down if it is early.
// Every map has its own music: it starts on GO and loops until the player leaves the race.
const COUNTDOWN_OFFSET = 1.0;
const COUNTDOWN_AUDIO = '/audio/countdown.mp3';
const RACE_AUDIO = {
  treat_road: { music: '/audio/treat_road.mp3', musicVolume: 0.35 },
  // (these are instrumentals made with Suno, one to suit each map)
  wendover: { music: '/audio/wendover.mp3', musicVolume: 0.35 },                // woodland folk: guitar, flute, fiddle
  frostpeak: { music: '/audio/frostpeak.mp3', musicVolume: 0.35 },              // alpine: sleigh bells, brass, driving snare
  modbury_heights: { music: '/audio/modbury_heights.mp3', musicVolume: 0.35 },  // coastal surf: ukulele, surf and steel guitar
  farmyard: { music: '/audio/farmyard.mp3', musicVolume: 0.35 },                // bluegrass hoedown: banjo, fiddle, washboard
  water_park: { music: '/audio/water_park.mp3', musicVolume: 0.35 },            // tropical: steel drums, marimba, slap bass
  pet_mall: { music: '/audio/pet_mall.mp3', musicVolume: 0.35 },                // zany funk and disco: synth organ, xylophone, kazoo
  mud_park: { music: '/audio/mud_park.mp3', musicVolume: 0.35 },                // rowdy stomp: slide guitar, harmonica, tuba
  desert_dunes: { music: '/audio/desert_dunes.mp3', musicVolume: 0.35 },        // desert chase: oud, hand drums, surf guitar
  speed_bowl: { music: '/audio/speed_bowl.mp3', musicVolume: 0.35 },            // arcade racing rock: guitars, organ, synth lead
  kombu_house: { music: '/audio/enzo_house.mp3', musicVolume: 0.35 },           // cartoon caper: tuba, honky-tonk piano, kazoo (the tune made for the house that was here before)
  neon_nexus: { music: '/audio/neon_nexus.mp3', musicVolume: 0.35 },            // synthwave: arpeggiated bass, neon lead
  // (Grand Prix 4 has no music of its own yet: each borrows the nearest in mood)
  yorkshire_dales: { music: '/audio/wendover.mp3', musicVolume: 0.35 },
  boneyard: { music: '/audio/mud_park.mp3', musicVolume: 0.35 },
  the_vets: { music: '/audio/enzo_house.mp3', musicVolume: 0.35 },
  monkey_jungle: { music: '/audio/water_park.mp3', musicVolume: 0.35 },
};

// Voices come first: while this player is connected to anyone in voice chat, the music plays at this
// share of its usual volume.  (A voice is already as loud as a browser will play it.)
const MUSIC_UNDER_VOICES = 0.3;

// Muted: the player's mute button (remembered on this computer), or ?mute=1 in the address, which starts the game
// muted without changing what is remembered (for testing).  Voice chat is not muted by it: it has its own controls.
const MUTE_KEY = 'zoomies.muted';
const mutedByAddress = () => { try { return new URLSearchParams(window.location.search).get('mute') === '1'; } catch { return false; } };
const mutedBefore = () => { try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };

// The player's volume sliders (remembered on this computer), each 0 to 1 of the usual level: the music, and the
// effects (the countdown and the dogs' calls).
const VOLUME_KEY = 'zoomies.volume';
const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
function volumeBefore() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VOLUME_KEY) ?? '{}');
    return { music: clamp01(saved.music ?? 1), effects: clamp01(saved.effects ?? 1) };
  } catch { return { music: 1, effects: 1 }; }
}

export class GameAudio {
  #selection = {};
  #race = { countdown: null, music: null };
  #musicVolume = 0.35;      // this map's music at its usual volume
  #voices = false;         // voice chat is connected to someone
  #muted = mutedByAddress() || mutedBefore();
  #listeners = new Set();
  #volume = volumeBefore();
  #volumeListeners = new Set();

  get muted() { return this.#muted; }

  /** { music, effects }, each 0 to 1 */
  get volume() { return this.#volume; }

  /** kind: 'music' | 'effects'; level 0 to 1 */
  setVolume(kind, level) {
    if (!(kind in this.#volume)) return;
    this.#volume = { ...this.#volume, [kind]: clamp01(level) };
    try { window.localStorage.setItem(VOLUME_KEY, JSON.stringify(this.#volume)); } catch { /* private browsing */ }
    this.#applyVolumes();
    for (const listener of this.#volumeListeners) listener(this.#volume);
  }

  /** listener({ music, effects }) whenever a slider moves; returns the way to stop listening */
  onVolumeChange(listener) {
    this.#volumeListeners.add(listener);
    return () => this.#volumeListeners.delete(listener);
  }

  setMuted(muted) {
    this.#muted = Boolean(muted);
    if (!mutedByAddress()) { try { window.localStorage.setItem(MUTE_KEY, this.#muted ? '1' : '0'); } catch { /* private browsing */ } }
    for (const audio of [...Object.values(this.#selection), this.#race.countdown, this.#race.music]) {
      try { if (audio) audio.muted = this.#muted; } catch { /* no audio support */ }
    }
    for (const listener of this.#listeners) listener(this.#muted);
  }

  toggleMuted() { this.setMuted(!this.#muted); }

  /** listener(muted) whenever it changes; returns the way to stop listening */
  onMutedChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  // Turn the music down while voice chat is connected (and back up when it is not)
  setVoiceChatActive(active) {
    this.#voices = Boolean(active);
    this.#applyVolumes();
  }

  #applyVolumes() {
    try {
      if (this.#race.music) this.#race.music.volume = this.#musicVolume * this.#volume.music * (this.#voices ? MUSIC_UNDER_VOICES : 1);
      for (const audio of [...Object.values(this.#selection), this.#race.countdown]) if (audio) audio.volume = this.#volume.effects;
    } catch { /* no audio support */ }
  }

  playSelection(dogId) {
    const src = SELECTION_SOUNDS[dogId];
    if (!src) return;
    try {
      this.#selection[dogId] ??= new Audio(src);
      const audio = this.#selection[dogId];
      audio.muted = this.#muted;
      audio.volume = this.#volume.effects;
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
        audio.muted = this.#muted;
        if (key === 'music') {
          audio.loop = true;
          this.#musicVolume = config.musicVolume ?? 0.35;
        }
        this.#race[key] = audio;
      }
      this.#applyVolumes();
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

