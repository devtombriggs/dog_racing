// Where the game server is, and which optional features this build has

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  window.location.origin;

// Voice chat is switched off for now: no option in the lobby, no microphone, no connections between
// players.  Build with VITE_VOICE_CHAT=1 (and start the server with VOICE_CHAT=1) to bring it back.
export const VOICE_CHAT = import.meta.env.VITE_VOICE_CHAT === '1';
