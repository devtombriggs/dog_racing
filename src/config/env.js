// Where the game server is, and which optional features this build has

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  window.location.origin;

// Voice chat is on: a multiplayer lobby has a Voice chat box, and nobody's microphone comes on unless
// they tick it.  Build with VITE_VOICE_CHAT=0 (and start the server with VOICE_CHAT=0) to take it out.
export const VOICE_CHAT = import.meta.env.VITE_VOICE_CHAT !== '0';
