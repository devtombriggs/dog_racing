import { io } from 'socket.io-client';
import { MAPS, DEFAULT_MAP } from '../../shared/maps.js';
import { LOCAL_PLAYERS } from '../../shared/botLevels.js';
import { SERVER_URL, VOICE_CHAT } from '../config/env.js';
import { gameAudio } from '../audio/GameAudio.js';
import { createVoiceChat } from '../voiceChat.js';
import { account } from './account.js';
import { createConnectionWatch } from './connectionWatch.js';

const ACCESSIBILITY_KEY = 'dogRacing.accessibilityMode.v2';

// What a race in progress shows; put back to this whenever a race starts, ends or is left
const NO_RACE = {
  racePhase: '',
  finishTime: null,
  lobbyReturnAt: null,
  standings: [],
  frisbeesIncoming: [],
  fireworksIncoming: [],
  heldItem: null,
  heldItemAs: null,          // (Merlin: the dog whose special he is holding)
  // the first dog is home: when the race ends for everyone else (performance clock)
  raceEndsAt: null,
  // a Grand Prix race is over: the points table the server sent ({ round, of, final, table, nextMapId })
  grandPrixResults: null,
  // what this race paid (a signed-in player): { race, grandPrix, total } coins (shared/shop.js), or null
  coinsEarned: null,
  // home, and watching another dog run: its player id (null: this player's own dog)
  spectating: null
};

// The secret this browser tab proves itself with after a refresh (kept for the tab's life only, so two
// tabs are two players)
function seatToken() {
  try {
    let token = sessionStorage.getItem('dog-racing-seat');
    if (!token) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('dog-racing-seat', token);
    }
    return token;
  } catch { return null; }          // storage blocked: no coming back after a refresh
}

// One player's visit to the game: the connection to the server, the room they are in, which screen
// they are on and how their race is going.  The screens read `state` (through useSession) and call
// the methods here; the race (game/Race.js) reads the race clock and reports back through `set`.
// Which browser this is, for a host's ban of a guest (kept by the browser, so a new tab or a new name is the same player)
function deviceId() {
  try {
    let id = localStorage.getItem('dogRacing.device');
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('dogRacing.device', id);
    }
    return id;
  } catch { return null; }
}

// The microphone option, kept for this tab only (so a refresh in the middle of a game keeps you talking)
const VOICE_KEY = 'dogRacing.voice';
function rememberedVoice() {
  try { return sessionStorage.getItem(VOICE_KEY) === '1'; } catch { return false; }
}

export class GameSession {
  socket = null;
  voice = null;
  // Split screen: the second player on this computer has a session of their own (`guest: true`), made
  // and run by the first player's.  It makes no sound of its own, has no voice chat and no seat to come
  // back to.  `device` is what this player drives with: { type: 'keyboard' } or { type: 'pad', index }
  // (null: any, as when playing alone).
  guest = false;
  device = null;

  // The race clock, read every frame by the race: not part of `state`, so changing it redraws nothing
  raceGo = false;
  raceFinished = false;
  raceStart = null;          // performance clock at GO
  voteDeadline = 0;          // performance clock when the map vote closes
  singlePlayer = false;

  state = {
    garageDog: null,         // the dog the Garage is showing
    screen: 'menu',          // 'shop' | 'garage' | 'menu' | 'leaderboards' | 'join' | 'localJoin' | 'selection' | 'mapSelect' | 'mapVote' | 'race'
    raceNumber: 0,           // counts the races this visit: each one gets a fresh race screen
    notice: '',              // a passing word about someone else ("Berri lost connection"), shown for a few seconds
    room: null,
    availableLobbies: null,
    lobbyListError: '',
    joiningRoom: null,
    passwordFor: null,       // the code of the game in the list that has asked for its password
    // friends (a signed-in player): { friends: [{ id, username, online, playing, room }], incoming, outgoing } as the server
    // last said, or null before it has; and what went wrong with the last thing asked
    friends: null,
    friendsError: '',
    roomPassword: null,      // the password this player (the host) gave their room, to read out to friends
    socketId: null,
    error: '',
    hoveredDog: null,
    mapTab: 'maps',          // the map screen's tab to open on: 'maps' | 'cups' (Grand Prix)
    // split screen: the other players' sessions, while a local game is on: { guests: [GameSession] } (see startLocalGame)
    local: null,
    connected: false,
    lap: 1,
    checkpoint: 0,
    totalCheckpoints: 5,
    // racePhase: the big words mid-screen ('Loading...', '3', 'GO!', 'FINISHED!')
    // lobbyReturnAt: the race is over for everyone; when the room goes back to the lobby (performance clock)
    // standings: race order for the board at the top left: [{ playerId, name, dog, place, finished }]
    // frisbeesIncoming: red frisbees chasing me (ids)
    // fireworksIncoming: fireworks on their way to me, the leader (ids)
    // heldItem: the item this player is holding from a Treat Box (an id from shared/items.js, 'special', or null)
    ...NO_RACE,
    // Accessibility mode: the dog runs by itself, Up jumps and Down uses the item
    accessibilityMode: false,
    // Voice chat: the microphone option in the lobby, which stays on through the race.  Not remembered
    // between visits: a microphone should only ever come on because you ticked the box this time.
    // (It is remembered through a refresh of the page, like the player's seat.)
    voiceEnabled: rememberedVoice(),
    voiceStatus: { enabled: false, muted: false, error: null, connected: 0 },
    voiceMap: {}             // "room:playerId" -> has a microphone on (as the server tells it)
  };

  #resume = null;
  #where = 'lobby';
  #noticeTimer = null;
  #listeners = new Set();
  #joinRequest = 0;
  #events = null;
  #watch = null;
  #muteKeyOn = false;
  // the race connection has been told who is signed in (src/session/account.js): hosting and joining wait for it
  #accountTold = Promise.resolve();
  #stopAccount = null;

  constructor({ guest = false } = {}) {
    this.guest = guest;
    // Off unless the player turns it on.  (The key was renamed so that browsers which had remembered it
    // as on start with it off again.)
    try { this.state.accessibilityMode = localStorage.getItem(ACCESSIBILITY_KEY) === '1'; } catch { /* storage blocked */ }
  }

  // ---------------------------------
  // STATE
  // ---------------------------------

  subscribe = (listener) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getState = () => this.state;

  set(patch) {
    const previous = this.state;
    if (Object.keys(patch).every(key => Object.is(previous[key], patch[key]))) return;
    this.state = { ...previous, ...patch };
    this.#afterChange(previous);
    for (const listener of [...this.#listeners]) listener();
  }

  // Change one value from what it is now, e.g. update('frisbeesIncoming', list => [...list, id])
  update(key, change) {
    this.set({ [key]: change(this.state[key]) });
  }

  get #inVoiceRoom() {
    const { room, connected } = this.state;
    return Boolean(VOICE_CHAT && room && !room.singlePlayer && connected);
  }

  // Things that follow from a change of state, whoever made it
  #afterChange(previous) {
    const now = this.state;

    // Countdown and music stop as soon as the player leaves the race screen
    if (now.screen !== previous.screen && now.screen !== 'race' && !this.guest) gameAudio.stopRace();

    // In a room, outside a race: the others see which screen this player is on ("in garage")
    if (now.room && !this.guest && (now.screen !== previous.screen || now.room?.code !== previous.room?.code)) {
      const where = now.screen === 'garage' || now.screen === 'shop' ? now.screen : 'lobby';
      if (where !== this.#where || now.room?.code !== previous.room?.code) { this.#where = where; this.socket?.emit('setWhere', { where }); }
    }

    if (!this.voice) return;
    const inVoiceRoom = this.#inVoiceRoom;
    const wasInVoiceRoom = Boolean(VOICE_CHAT && previous.room && !previous.room.singlePlayer && previous.connected);
    const code = now.room?.code ?? null;
    const previousCode = previous.room?.code ?? null;

    if (now.voiceEnabled !== previous.voiceEnabled || inVoiceRoom !== wasInVoiceRoom || code !== previousCode) {
      this.voice.setEnabled(now.voiceEnabled && inVoiceRoom);
    }
    // connect to everyone in the room who is talking (or to everyone, if we are)
    if (inVoiceRoom !== wasInVoiceRoom || now.room !== previous.room || code !== previousCode ||
        now.voiceMap !== previous.voiceMap || now.voiceStatus.enabled !== previous.voiceStatus.enabled) {
      const players = inVoiceRoom ? this.state.room.players : [];
      this.voice.sync(players.map(p => p.id),
        id => this.state.voiceMap[`${code}:${id}`] ?? players.find(p => p.id === id)?.voice ?? false);
    }
    this.#listenForMuteKey(this.state.screen === 'race' && this.state.voiceStatus.enabled);
  }

  // M mutes and unmutes during the race
  #onMuteKey = (event) => {
    if (event.code === 'KeyM' && !event.repeat) this.voice?.setMuted(!this.voice.isMuted());
  };

  #listenForMuteKey(on) {
    if (on === this.#muteKeyOn) return;
    this.#muteKeyOn = on;
    if (on) window.addEventListener('keydown', this.#onMuteKey);
    else window.removeEventListener('keydown', this.#onMuteKey);
  }

  // The server's answer to 'resume'
  #resumed(response) {
    if (!response?.success) {
      // nothing held: if this game thought it was in a room (the connection dropped for too long), it is not any more
      if (this.state.room) { this.#endLocal(); this.set({ ...NO_RACE, room: null, screen: 'menu', error: 'Connection lost: you were away too long to rejoin' }); }
      return;
    }
    const { room, race, playerId } = response;
    // (a split-screen game does not outlast a refresh: the other half's player is gone)
    if (room.local) { this.socket.emit('leaveGame'); this.#endLocal(); this.set({ ...NO_RACE, room: null, screen: 'menu' }); return; }
    this.singlePlayer = room.singlePlayer === true;
    this.#resetRaceClock();
    if (!race) {
      // back in the lobby (or the map vote), same seat, same dog
      if (room.voteMsLeft != null) this.voteDeadline = performance.now() + room.voteMsLeft;
      const myDog = room.players.find(player => player.id === playerId)?.dog;
      this.set({ ...NO_RACE, socketId: playerId, room, error: '',
        screen: room.status === 'voting' ? 'mapVote' : this.singlePlayer && myDog ? 'mapSelect' : 'selection' });
      return;
    }
    this.#intoRace(room, race, playerId);
  }

  // Into a race that is already going (after a refresh, or back from the lobby): the race screen loads the map, then takes
  // the dog over from the server (backInRace)
  #intoRace(room, race, playerId) {
    gameAudio.loadRace(race.mapId);
    this.#resetRaceClock();
    this.#resume = race;                 // (after the clock was reset, which clears it)
    this.set({
      ...NO_RACE, socketId: playerId, error: '',
      racePhase: 'Rejoining...',
      totalCheckpoints: race.totalCheckpoints, lap: race.you.lap, checkpoint: race.you.checkpoint, heldItem: race.you.item,
      room: { ...room, mapId: race.mapId, players: race.players, grandPrix: race.grandPrix },
      raceNumber: this.state.raceNumber + 1,
      screen: 'race'
    });
  }

  // For the race being built: what the server said about the race this player is coming back into
  // (null for a race joined at its start).  It stands until the dog is theirs again: the race screen can
  // be built more than once on the way.
  get resumeRace() { return this.#resume; }

  // The map is loaded and the dog is this player's again: start the clock from where the race is
  backInRace = (race) => {
    this.#resume = null;
    if (race.you.finished) {
      this.raceFinished = true;
      this.set({ finishTime: race.you.finishTime, racePhase: 'FINISHED!', lap: race.you.lap, checkpoint: race.you.checkpoint });
      return;
    }
    if (race.status === 'racing') {
      this.raceStart = performance.now() - (race.raceMs ?? 0);
      this.raceGo = true;
      gameAudio.playRace('music');
    }
    // (still loading or counting down: the countdown and GO arrive as they would have)
    this.set({ racePhase: race.status === 'finished' ? '' : race.status === 'racing' ? '' : 'Loading...', lap: race.you.lap, checkpoint: race.you.checkpoint, heldItem: race.you.item });
  };

  // A few seconds of words at the top of the screen
  #say(notice) {
    clearTimeout(this.#noticeTimer);
    this.set({ notice });
    this.#noticeTimer = setTimeout(() => this.set({ notice: '' }), 4000);
  }

  #resetRaceClock() {
    this.#resume = null;
    this.raceGo = false;
    this.raceFinished = false;
    this.raceStart = null;
  }

  // ---------------------------------
  // SOCKET CONNECTION
  // ---------------------------------

  // Tells the server who is signed in on this page (a guest: nobody), on connecting and after every sign in or out
  #tellAccount() {
    const socket = this.socket;
    this.#accountTold = account.ticket().then(ticket => new Promise((resolve) => {
      if (!socket?.connected) return resolve();
      const timer = setTimeout(resolve, 3000);           // (an older server says nothing back)
      socket.emit('account', { ticket }, () => { clearTimeout(timer); resolve(); });
    })).catch(() => {});
    return this.#accountTold;
  }

  connect() {
    const socket = io(SERVER_URL);
    this.socket = socket;
    // (what the browser was doing when a connection dropped: told to the server, for its log, once back)
    this.#watch?.dispose();
    const watch = this.#watch = createConnectionWatch();
    if (!this.guest) { this.#stopAccount?.(); this.#stopAccount = account.onChange(() => this.#tellAccount()); }

    // Voice chat (src/voiceChat.js): the browsers talk to each other; the server passes their messages on
    const voice = VOICE_CHAT && !this.guest ? createVoiceChat({
      socket,
      selfId: () => this.state.socketId ?? socket.id,
      onChange: (voiceStatus) => {
        this.set({ voiceStatus });
        gameAudio.setVoiceChatActive(voiceStatus.connected > 0);      // voices over the music
      }
    }) : null;
    this.voice = voice;

    // (a player who has gone back to the lobby still hears the race: it is not theirs to show)
    const inRace = () => this.state.screen === 'race';
    const inLobby = players => players?.find(player => player.id === (this.state.socketId ?? socket.id))?.inLobby === true;

    this.#events = {
      connect: () => {
        console.log('Connected:', socket.id);
        // (socketId is this player's id: the connection's own, unless the server gives back an earlier seat)
        this.set({ connected: true, socketId: socket.id });
        const report = watch.report();
        if (report) socket.emit('connectionReport', report);
        // Say who this browser is.  After a refresh, or a dropped connection, the server may still be
        // holding this player's seat: then they are straight back in their room, on the same dog.
        if (!this.guest) socket.emit('resume', { token: seatToken() }, response => this.#resumed(response));
        if (!this.guest) this.#tellAccount();
      },

      disconnect: (reason) => {
        watch.dropped(reason, this.state.screen);
        this.#joinRequest += 1;
        this.set({ connected: false, socketId: null, availableLobbies: null, lobbyListError: '', joiningRoom: null });
      },

      voiceSignal: message => voice?.handleSignal(message),

      // someone dropped or came back on a new connection: drop the dead line, and make a new one
      voiceReset: ({ playerId }) => {
        if (playerId === this.state.socketId) return;
        voice?.reset(playerId);
        this.update('voiceMap', map => ({ ...map }));            // (connects again, if either of us is talking)
      },

      voiceChanged: ({ playerId, enabled }) => {
        const key = `${this.state.room?.code ?? null}:${playerId}`;
        this.update('voiceMap', map => ({ ...map, [key]: enabled }));
      },

      lobbyUpdated: (updatedRoom) => {
        this.set({ room: updatedRoom });
        // Everyone has a dog (or the host pressed Next): on to the map vote
        if (updatedRoom.status === 'voting') {
          if (updatedRoom.voteMsLeft != null) this.voteDeadline = performance.now() + updatedRoom.voteMsLeft;
          if (['selection', 'garage', 'shop'].includes(this.state.screen)) this.set({ screen: 'mapVote' });
        }
      },

      raceStarted: (data) => {
        console.log('Race loading:', data);
        const mapId = data.mapId ?? DEFAULT_MAP;
        // (still in the lobby from the race before, in a Grand Prix: this race starts without them)
        if (inLobby(data.players)) { this.set({ room: { ...this.state.room, status: 'loading', mapId, players: data.players, grandPrix: data.grandPrix ?? null } }); return; }
        if (!this.guest) gameAudio.loadRace(mapId);
        this.#resetRaceClock();

        this.set({
          ...NO_RACE,
          racePhase: 'Loading...',
          totalCheckpoints: data.totalCheckpoints ?? MAPS[mapId].checkpoints.length,
          lap: 1,
          checkpoint: 0,
          room: { ...this.state.room, status: 'loading', mapId, players: data.players, grandPrix: data.grandPrix ?? null },
          // (a new race, even straight after another in a Grand Prix: the race screen starts afresh)
          raceNumber: this.state.raceNumber + 1,
          screen: 'race'
        });
      },

      raceCountdown: (data) => {
        if (!inRace()) return;
        console.log('Countdown:', data.number);
        if (data.number === 3 && !this.guest) gameAudio.playRace('countdown');
        this.set({ racePhase: String(data.number) });
      },

      raceGo: () => {
        if (!inRace()) return;
        console.log('GO!');
        this.raceStart = performance.now();
        this.raceGo = true;
        if (!this.guest) gameAudio.playRace('music');
        this.set({ racePhase: 'GO!' });
      },

      raceProgress: (data) => {
        if (data.playerId !== this.state.socketId || !inRace()) return;

        this.set({ lap: data.lap, checkpoint: data.checkpoint });
        if (data.totalCheckpoints !== undefined) this.set({ totalCheckpoints: data.totalCheckpoints });

        if (data.finished) {
          this.raceFinished = true;
          this.raceGo = false;
          this.set({ finishTime: data.finishTime, racePhase: 'FINISHED!' });
        }
      },

      raceStandings: (data) => {
        if (!Array.isArray(data?.standings)) return;
        this.set({ standings: data.standings });
        // (the dog being watched is home: on to the next one still running, if there is one)
        const watching = this.state.spectating;
        if (watching && data.standings.find(entry => entry.playerId === watching)?.finished !== false) this.spectate(1);
      },

      // Everyone is home (or the time allowed after the winner ran out): the race is over for all,
      // and the room goes back to the lobby shortly
      // The first dog is home: everyone else has this long before the race ends as it stands
      finishGrace: (data) => { if (inRace()) this.set({ raceEndsAt: performance.now() + (data?.ms ?? 0) }); },

      grandPrixStandings: (data) => { if (inRace()) this.set({ grandPrixResults: data }); },

      // Another player's connection has dropped or gone quiet (their dog runs itself), or they are back
      playerAway: ({ playerId, away, lobby }) => {
        if (playerId === this.state.socketId) return;
        const name = this.state.room?.players.find(player => player.id === playerId)?.name ?? 'A player';
        this.#say(lobby ? `${name} went back to the lobby: their dog is running itself` : away ? `${name} lost connection: their dog is running itself` : `${name} is back`);
      },

      // the race has paid out (signed-in players): this player's share, shown on the results and added to the purse
      coinsEarned: (paid) => {
        const mine = paid?.[this.state.socketId ?? this.socket?.id];
        if (!mine) return;
        const now = this.state.coinsEarned ?? { race: 0, grandPrix: 0, total: 0 };
        this.set({ coinsEarned: { ...now, [mine.why === 'grandPrix' ? 'grandPrix' : 'race']: mine.coins, total: mine.total } });
        if (!this.guest) account.setCoins(mine.total);
      },

      raceEnded: (data) => {
        if (!inRace()) return;
        this.raceFinished = true;
        this.raceGo = false;
        this.set({ racePhase: '', raceEndsAt: null, spectating: null, lobbyReturnAt: performance.now() + (data?.returnMs ?? 0) });
      },

      // Someone has joined a race that is going by taking over one of its computer dogs
      playerReplaced: ({ oldId, player }) => {
        const room = this.state.room;
        if (!room || !player) return;
        this.set({ room: { ...room, players: room.players.map(each => (each.id === oldId ? player : each)) } });
        if (player.id !== this.state.socketId) this.#say(`${player.name} joined: they have the computer’s dog`);
      },

      // Removed from the room by its host (kicked: free to come back; banned: not until the host says)
      kicked: (data) => {
        if (data?.roomCode !== this.state.room?.code) return;
        this.#endLocal();
        this.singlePlayer = false;
        this.#resetRaceClock();
        this.set({ ...NO_RACE, room: null, roomPassword: null, screen: 'menu',
          error: data.banned ? `${data.hostName} banned you from their game` : `${data.hostName} removed you from their game` });
      },

      // Back to character select with the same players: the next race starts from there as the first did
      returnedToLobby: () => {
        this.#resetRaceClock();
        this.set({ ...NO_RACE, error: '' });
        if (this.state.screen === 'race') this.set({ screen: 'selection' });
      },

      playerFinished: (data) => {
        if (data.playerId === this.state.socketId) console.log('Your finish time:', data.finishTime);
        else console.log(`${data.name} finished in ${data.finishTime}s`);
      }
    };

    for (const [event, handler] of Object.entries(this.#events)) socket.on(event, handler);
  }

  disconnect() {
    const socket = this.socket;
    if (!socket) return;
    for (const [event, handler] of Object.entries(this.#events)) socket.off(event, handler);
    this.#watch?.dispose(); this.#watch = null;
    this.voice?.dispose();
    this.voice = null;
    this.#listenForMuteKey(false);
    this.#stopAccount?.(); this.#stopAccount = null;
    if (!this.guest) gameAudio.stopRace();
    this.#endLocal();
    socket.disconnect();
    this.socket = null;
  }

  // The list of games waiting for players, kept up to date while the join screen is open.
  // Returns a function that stops watching.
  watchLobbies() {
    const socket = this.socket;
    const timer = setTimeout(() => {
      this.set({ lobbyListError: 'Could not load games. Go back and try again.' });
    }, 8000);
    const handleLobbiesUpdated = (lobbies) => {
      clearTimeout(timer);
      this.set({ availableLobbies: lobbies, lobbyListError: '' });
    };
    socket.on('lobbiesUpdated', handleLobbiesUpdated);
    socket.emit('watchLobbies');
    return () => {
      clearTimeout(timer);
      socket.off('lobbiesUpdated', handleLobbiesUpdated);
      if (socket.connected) socket.emit('unwatchLobbies');
    };
  }

  // ---------------------------------
  // FRIENDS (ui/FriendsPanel.jsx)
  // ---------------------------------

  #friends(event, data = {}) {
    this.socket?.emit(event, data, (response) => {
      if (!response?.success) { this.set({ friendsError: response?.error || 'Could not reach your friends list' }); return; }
      this.set({ friends: { friends: response.friends, incoming: response.incoming, outgoing: response.outgoing }, friendsError: event === 'friends' ? this.state.friendsError : '' });
    });
  }
  // The list, kept up to date while a screen shows it: asked for now, every few seconds (who is online), and whenever the
  // server says someone has asked or answered.  Returns a function that stops
  watchFriends() {
    const socket = this.socket, load = () => this.#accountTold.then(() => this.#friends('friends'));
    this.set({ friendsError: '' });
    load();
    const timer = setInterval(load, 6000);
    socket.on('friendsChanged', load);
    return () => { clearInterval(timer); socket.off('friendsChanged', load); };
  }
  askFriend = username => this.#friends('friendAsk', { username });
  acceptFriend = userId => this.#friends('friendAccept', { userId });
  removeFriend = userId => this.#friends('friendRemove', { userId });

  // ---------------------------------
  // MENU
  // ---------------------------------


  setAccessibilityMode = (accessibilityMode) => {
    this.set({ accessibilityMode });
    try { localStorage.setItem(ACCESSIBILITY_KEY, accessibilityMode ? '1' : '0'); } catch { /* storage blocked */ }
  };

  setVoiceEnabled = (voiceEnabled) => {
    this.set({ voiceEnabled });
    try { sessionStorage.setItem(VOICE_KEY, voiceEnabled ? '1' : '0'); } catch { /* storage blocked */ }
  };

  openLocalJoinScreen = () => {
    this.set({ error: '', screen: 'localJoin' });
  };

  // Create Game: whether it has a password, before the room is made (ui/HostScreen.jsx)
  openHostScreen = () => {
    this.set({ error: '', screen: 'host' });
  };

  openJoinScreen = () => {
    this.set({ error: '', availableLobbies: null, lobbyListError: '', passwordFor: null, screen: 'join' });
  };

  openLeaderboards = () => {
    this.set({ error: '', screen: 'leaderboards' });
  };

  // (from the Garage or the Shop opened in a room's lobby, back is the lobby)
  backToMenu = () => {
    this.set({ error: '', screen: this.state.room ? 'selection' : 'menu' });
  };

  // The Shop (spend coins) and the Garage (put on what has been bought): shared/shop.js, ui/ShopScreen.jsx, ui/GarageScreen.jsx
  openShop = () => { this.set({ error: '', screen: 'shop' }); };
  // (dog: the dog to open the garage on, or nothing for the last one looked at)
  openGarage = (dog = null) => { this.set({ error: '', screen: 'garage', garageDog: typeof dog === 'string' ? dog : this.state.garageDog ?? null }); };

  // ---------------------------------
  // HOST GAME
  // ---------------------------------

  // (password: from the Create Game screen's Password protected box; null for a game anyone can join)
  hostGame = (password = null) => {
    this.singlePlayer = false;
    this.set({ error: '' });
    const secret = typeof password === 'string' && password.trim() ? password.trim().slice(0, 32) : null;

    this.#accountTold.then(() => this.socket.emit('hostGame', { name: account.name, device: deviceId(), password: secret }, (response) => {
      if (!response?.success) {
        this.set({ error: response?.error || 'Failed to host game' });
        return;
      }
      this.set({ room: response.room, roomPassword: response.room.locked ? secret : null, screen: 'selection' });
    }));
  };

  // Host only: the room's password ('' for none: open to anyone), and removing a player (ban: and keeping them out) or
  // letting a banned one back in
  setPassword = (password) => {
    this.set({ error: '' });
    this.socket?.emit('setPassword', { password }, (response) => {
      if (!response?.success) { this.set({ error: response?.error || 'Could not set the password' }); return; }
      this.set({ roomPassword: response.locked ? String(password).trim().slice(0, 32) : null });
    });
  };
  kickPlayer = (playerId, ban = false) => {
    this.set({ error: '' });
    this.socket?.emit('kickPlayer', { playerId, ban }, (response) => {
      if (!response?.success) this.set({ error: response?.error || 'Could not remove that player' });
    });
  };
  unbanPlayer = (id) => {
    this.socket?.emit('unbanPlayer', { id }, (response) => {
      if (!response?.success) this.set({ error: response?.error || 'Could not do that' });
    });
  };

  // ---------------------------------
  // SINGLE PLAYER
  // ---------------------------------

  // (tab: which side of the map screen opens after the dog is picked: 'cups' for the Grand Prix, or 'maps')
  startSinglePlayer = (tab) => {
    this.set({ error: '', mapTab: tab === 'cups' ? 'cups' : 'maps' });

    if (!this.socket?.connected) {
      this.set({ error: 'Not connected to server' });
      return;
    }

    this.singlePlayer = true;

    this.#accountTold.then(() => this.socket.emit('hostGame', { name: account.name, singlePlayer: true }, (response) => {
      if (!response?.success) {
        this.singlePlayer = false;
        this.set({ error: response?.error || 'Failed to create single-player game' });
        return;
      }
      this.set({ room: response.room, screen: 'selection' });
    }));
  };

  // ---------------------------------
  // SPLIT SCREEN: two players at this computer, each with half the screen and their own controls
  // ---------------------------------
  // The server sees an ordinary private game with two players: this session is the first, and it makes
  // a second session (the guest) on a connection of its own for the other.  The first player's session
  // runs the menus; each half of the race screen is drawn from its own session.
  //   devices: [player 1's, player 2's], each { type: 'keyboard' } or { type: 'pad', index }

  startLocalGame = (devices) => {
    this.set({ error: '' });
    if (!this.socket?.connected) { this.set({ error: 'Not connected to server' }); return; }
    const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    this.singlePlayer = true;
    this.socket.emit('hostGame', { name: account.name || 'Player 1', local: true, localKey: key }, (response) => {
      if (!response?.success) {
        this.singlePlayer = false;
        this.set({ error: response?.error || 'Failed to create the game' });
        return;
      }
      // one more session for each of the other players, each on a connection of its own
      const guests = devices.slice(1, LOCAL_PLAYERS).map((device) => {
        const guest = new GameSession({ guest: true });
        guest.singlePlayer = true;
        guest.device = device;
        return guest;
      });
      const local = { guests };
      this.device = devices[0];
      this.set({ room: response.room, local });
      const failed = (error) => { clearTimeout(timer); if (this.state.local === local) { this.leaveGame(); this.set({ error }); } };
      const timer = setTimeout(() => failed('Could not connect every player'), 8000);
      let joinedSoFar = 0;
      guests.forEach((guest, i) => {
        guest.connect();
        guest.socket.once('connect', () => {
          guest.socket.emit('joinGame', { roomCode: response.room.code, name: `Player ${i + 2}`, localKey: key }, (joined) => {
            if (this.state.local !== local) return;          // (left in the meantime)
            if (!joined?.success) { failed(joined?.error || `Could not add player ${i + 2}`); return; }
            guest.set({ room: joined.room });
            if (++joinedSoFar === guests.length) { clearTimeout(timer); this.set({ screen: 'selection' }); }
          });
        });
      });
    });
  };

  /** Split screen: every player's session, player 1's (this one) first */
  get localSessions() { return this.state.local ? [this, ...this.state.local.guests] : [this]; }

  // Split screen, character select: player `index` (0 is player 1) takes a dog.  When the last has, on to the map.
  pickLocalDog = (index, dogId, picked) => {
    const sessions = this.localSessions, socket = sessions[index]?.socket;
    this.set({ error: '', hoveredDog: null });
    if (!socket?.connected) { this.set({ error: 'Not connected to server' }); return; }
    socket.emit('selectDog', { dog: dogId }, (response) => {
      if (!response?.success) { this.set({ error: response?.error || 'Failed to select dog' }); return; }
      gameAudio.playSelection(dogId);
      socket.emit('setReady', { ready: true }, (ready) => {
        if (!ready?.success) { this.set({ error: ready?.error || 'Failed to ready up' }); return; }
        picked?.();
        if (index === sessions.length - 1) this.set({ screen: 'mapSelect' });
      });
    });
  };

  // Split screen, back at character select: every dog goes back, to be picked again in turn
  freeLocalDogs = () => {
    for (const session of this.localSessions) session.socket?.emit('changeDog');
  };

  // The local game is over (left, or the connection went): the second player's session goes with it
  #endLocal() {
    const guests = this.state.local?.guests;
    this.device = null;
    if (!guests) return;
    this.state = { ...this.state, local: null };
    for (const guest of guests) { guest.socket?.emit('leaveGame'); guest.disconnect(); }
  }

  // ---------------------------------
  // JOIN GAME
  // ---------------------------------

  // (password: for a game that is locked; the list asks for it when the server says it is needed)
  // jumpIn: a game that is racing, straight into the race on one of its computer dogs (otherwise into its lobby, with the dog
  // running itself until the race is over or this player takes it)
  joinGame = (roomCode, password = null, jumpIn = false) => {
    if (!this.socket?.connected || this.state.joiningRoom) return;
    this.singlePlayer = false;
    this.set({ error: '', joiningRoom: roomCode });
    const requestId = ++this.#joinRequest;

    this.#accountTold.then(() => this.socket.timeout(8000).emit('joinGame', { roomCode, name: account.name, device: deviceId(), password, jumpIn }, (timeoutError, response) => {
      if (requestId !== this.#joinRequest) return;
      this.set({ joiningRoom: null });
      if (timeoutError) {
        this.set({ error: 'Joining timed out. Please try again.' });
        return;
      }
      if (!response?.success) {
        this.set({ error: response?.error || 'Failed to join game', passwordFor: response?.needsPassword ? roomCode : null });
        return;
      }
      this.set({ room: response.room, roomPassword: null, passwordFor: null, screen: 'selection' });
      if (response.race) this.#intoRace(response.room, response.race, this.state.socketId ?? this.socket.id);
    }));
  };

  // ---------------------------------
  // MAP AND DOG SELECTION
  // ---------------------------------

  selectDog = (dogId) => {
    this.set({ error: '', hoveredDog: null });

    const socket = this.socket;
    if (!socket?.connected) {
      this.set({ error: 'Not connected to server' });
      return;
    }

    socket.emit('selectDog', { dog: dogId }, (response) => {
      if (!response?.success) {
        this.set({ error: response?.error || 'Failed to select dog' });
        return;
      }

      gameAudio.playSelection(dogId);

      // Multiplayer: stay on character select (the dog can still be changed) until
      // everyone has picked or the host presses Next; then the map vote takes over
      if (!this.singlePlayer) return;

      // Single player: ready up, then choose the map
      socket.emit('setReady', { ready: true }, (readyResponse) => {
        if (!readyResponse?.success) {
          this.set({ error: readyResponse?.error || 'Failed to ready up' });
          return;
        }
        this.set({ screen: 'mapSelect' });
      });
    });
  };

  // Host only: how many computer-controlled dogs fill the empty places, and how good they are
  // ({ count } or { level }: shared/botLevels.js)
  setBots = (change) => {
    this.set({ error: '' });
    this.socket?.emit('setBots', change, (response) => {
      if (!response?.success) this.set({ error: response?.error || 'Could not change the computer dogs' });
    });
  };

  // Tell the other players which dog this one is looking at
  hoverDog = (dogId) => {
    this.set({ hoveredDog: dogId });
    if (!this.singlePlayer) this.socket?.emit('hoverDog', { dog: dogId });
  };

  // ---------------------------------
  // MAP SELECT / VOTE
  // ---------------------------------

  // Host only: go to the map vote now (anyone without a dog is given one)
  skipToMapVote = () => {
    this.set({ error: '' });
    this.socket?.emit('skipToMapVote', (response) => {
      if (!response?.success) this.set({ error: response?.error || 'Could not move on to the map vote' });
    });
  };

  voteMap = (mapId) => {
    this.set({ error: '' });
    this.socket?.emit('voteMap', { mapId }, (response) => {
      if (!response?.success) this.set({ error: response?.error || 'Vote not counted' });
    });
  };

  // Host only: close the vote now and race on whatever is winning
  endMapVote = () => {
    this.set({ error: '' });
    this.socket?.emit('endMapVote', (response) => {
      if (!response?.success) this.set({ error: response?.error || 'Could not start the race' });
    });
  };

  // Single player: clicking a map starts the race on it
  startSoloRace = (mapId) => {
    this.set({ error: '' });
    const socket = this.socket;
    socket?.emit('selectMap', { mapId }, (response) => {
      if (!response?.success) { this.set({ error: response?.error || 'Failed to select map' }); return; }
      socket.emit('startRace', (startResponse) => {
        if (!startResponse?.success) this.set({ error: startResponse?.error || 'Failed to start race' });
      });
    });
  };

  // Single player: clicking a Grand Prix starts its four races (shared/grandPrix.js)
  startSoloGrandPrix = (id) => {
    this.set({ error: '' });
    this.socket?.emit('startGrandPrix', { id }, (response) => {
      if (!response?.success) this.set({ error: response?.error || 'Failed to start the Grand Prix' });
    });
  };

  // ---------------------------------
  // LEAVING
  // ---------------------------------

  // Back to the lobby, at any time (Tom, 2026-11-27).  While the race is still going this player's dog runs on by itself,
  // for the others' sake, and the race no longer counts for this player; once it is over, the whole room goes back
  backToLobby = () => {
    this.socket?.emit('toLobby', (response) => {
      if (!response?.success || this.state.screen !== 'race') return;       // (the whole room went back: returnedToLobby did it)
      this.#resetRaceClock();
      this.set({ ...NO_RACE, error: '', screen: 'selection' });
    });
  };
  returnToLobby = this.backToLobby;

  // ...and back into the race that is still going, from the lobby: the dog is this player's again
  rejoinRace = () => {
    this.set({ error: '' });
    this.socket?.emit('rejoinRace', (response) => {
      if (!response?.success) { this.set({ error: response?.error || 'Could not go back into the race' }); return; }
      this.#intoRace(response.room, response.race, response.playerId);
    });
  };

  // Home, with others still running: watch the next (1) or the last (-1) of them, or (0) this player's own dog again
  spectate = (step) => {
    const running = this.state.standings.filter(entry => !entry.finished && entry.playerId !== this.state.socketId).map(entry => entry.playerId);
    if (!step || !running.length) { this.set({ spectating: null }); return; }
    const at = running.indexOf(this.state.spectating);
    // (and the big FINISHED! goes: it is in the middle of the picture, where the dog being watched is)
    this.set({ racePhase: '', spectating: running[at < 0 ? (step > 0 ? 0 : running.length - 1) : (at + step + running.length) % running.length] });
  };

  leaveGame = () => {
    this.#endLocal();
    this.singlePlayer = false;
    this.#resetRaceClock();
    this.socket?.emit('leaveGame');
    this.set({ ...NO_RACE, room: null, roomPassword: null, error: '', screen: 'menu' });
  };
}
