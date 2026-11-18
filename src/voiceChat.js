// Voice chat between the players in a room: each browser sends its microphone straight to the
// others' (WebRTC), from the lobby through to the end of the race.  The game server only passes the
// set-up messages across ('voiceSignal') and says who has a microphone on ('voiceChanged').
//
//   const voice = createVoiceChat({ socket, selfId, onChange });   // selfId(): this player's id; onChange({ enabled, muted, error, connected })
//   voice.setEnabled(true);        // asks for the microphone (the browser prompts once) and tells the room
//   voice.setMuted(true);          // keep the connection, send silence
//   voice.sync(ids, hasVoice);     // ids: everyone in the room; hasVoice(id): that player has a microphone on.
//                                  // Connects to each of them if either end has a microphone on, drops the rest
//   voice.handleSignal(message);   // 'voiceSignal' from the server
//   voice.reset(id);               // 'voiceReset' from the server: that player reconnected, start again with them
//   voice.dispose();
//
// Hearing someone needs no microphone of your own, so a player who leaves the option off still hears
// the ones who turned it on.  Each connection carries one one-way line each way; turning the microphone
// on or off just starts or stops sending on ours, with nothing to set up again.
//
// Browsers only give a page the microphone on https or localhost.  To find a way through home routers the
// browsers ask a public address-lookup (STUN) server; set VITE_ICE_SERVERS (JSON) to use your own, or
// "[]" for none (voice then only works on one network).
const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function iceServers() {
  try {
    const custom = import.meta.env?.VITE_ICE_SERVERS;
    if (custom) return JSON.parse(custom);
  } catch { /* not JSON: use the default */ }
  return DEFAULT_ICE_SERVERS;
}

// ---------------------------------
// CLEANING UP THE MICROPHONE
// ---------------------------------
// The browser's own noise suppression (asked for below) takes the edge off a steady hum, but key
// clicks, mouse clicks and a noisy room still come through between words.  So what is sent is the
// microphone through a gate: shut unless someone is actually talking.
//   - a high-pass filter takes out rumble and desk thumps
//   - the gate opens only when the level has been over the threshold for OPEN_AFTER_MS (a click is over
//     in a few milliseconds and never gets that far), and the sound itself is held back by the same
//     time, so the start of a word is not cut off
//   - it stays open HOLD_MS after the last loud moment, so gaps between words do not chop
//   - the threshold follows the room: a few times its background level, and never under MIN_LEVEL
const GATE = { highPassHz: 120, tickMs: 20, openAfterMs: 60, holdMs: 380, minLevel: 0.018, overRoom: 3.2, closeShare: 0.6 };

/** raw: the microphone's MediaStream.  Returns { stream (what to send), dispose() }, or null if this browser cannot do it. */
function gateMicrophone(raw) {
  const Context = window.AudioContext ?? window.webkitAudioContext;
  if (!Context) return null;
  try {
    const context = new Context();
    context.resume?.().catch(() => {});
    const source = context.createMediaStreamSource(raw);
    const highPass = context.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = GATE.highPassHz;
    const analyser = context.createAnalyser(); analyser.fftSize = 1024;
    const delay = context.createDelay(0.5); delay.delayTime.value = GATE.openAfterMs / 1000;
    const gain = context.createGain(); gain.gain.value = 0;
    const out = context.createMediaStreamDestination();
    source.connect(highPass); highPass.connect(analyser); highPass.connect(delay); delay.connect(gain); gain.connect(out);
    const samples = new Float32Array(analyser.fftSize);
    let room = GATE.minLevel / GATE.overRoom, loudFor = 0, quietFor = Infinity, open = false;
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0; for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const level = Math.sqrt(sum / samples.length), threshold = Math.max(GATE.minLevel, room * GATE.overRoom);
      if (level > threshold) { loudFor += GATE.tickMs; quietFor = 0; }
      else {
        loudFor = 0;
        if (level < threshold * GATE.closeShare) quietFor += GATE.tickMs;
        if (!open) room += (level - room) * 0.05;               // learn the room while nobody is talking
      }
      const want = open ? quietFor < GATE.holdMs : loudFor >= GATE.openAfterMs;
      if (want !== open) { open = want; gain.gain.setTargetAtTime(open ? 1 : 0, context.currentTime, open ? 0.008 : 0.06); }
    }, GATE.tickMs);
    return {
      stream: out.stream,
      dispose() { clearInterval(timer); try { source.disconnect(); context.close(); } catch { /* already closed */ } },
    };
  } catch { return null; }
}

export function createVoiceChat({ socket, selfId = () => socket.id, onChange }) {
  const peers = new Map();              // playerId -> { pc, audio, sender, polite, makingOffer, ignoreOffer }
  let enabled = false, muted = false, stream = null, error = null, wanted = false, disposed = false;
  // the microphone itself, and the gate it is sent through (`stream` is what is sent)
  let microphone = null, gate = null;
  const closeMicrophone = () => {
    gate?.dispose(); gate = null;
    for (const t of microphone?.getTracks() ?? []) t.stop();
    microphone = stream = null;
  };

  const report = () => onChange?.({
    enabled, muted, error,
    connected: [...peers.values()].filter(p => p.pc.connectionState === 'connected').length,
  });
  const track = () => stream?.getAudioTracks()[0] ?? null;
  const signal = (to, data) => socket.emit('voiceSignal', { to, signal: data });

  function connect(id) {
    if (peers.has(id) || typeof RTCPeerConnection === 'undefined') return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const audio = new Audio();
    audio.autoplay = true;
    // of the two of us, the one with the later id gives way when both start talking terms at once
    const peer = { pc, audio, sender: null, polite: selfId() > id, makingOffer: false, ignoreOffer: false };
    peers.set(id, peer);
    peer.sender = pc.addTransceiver('audio', { direction: 'sendonly' }).sender;     // our voice, when the microphone is on
    if (track()) peer.sender.replaceTrack(track());
    pc.ontrack = event => {
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      audio.play().catch(() => { /* the browser wants a click first: it starts on the next one */ });
    };
    pc.onicecandidate = event => { if (event.candidate) signal(id, { candidate: event.candidate }); };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        signal(id, { description: pc.localDescription });
      } catch (err) {
        console.warn('[Voice] could not start a connection:', err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      report();
    };
    return peer;
  }

  function disconnect(id) {
    const peer = peers.get(id);
    if (!peer) return;
    peer.pc.close();
    peer.audio.srcObject = null;
    peers.delete(id);
  }

  return {
    async setEnabled(on) {
      wanted = on;
      if (!on) {
        closeMicrophone();
        for (const peer of peers.values()) peer.sender.replaceTrack(null);
        if (enabled) socket.emit('setVoice', { enabled: false });
        enabled = false; error = null;
        report();
        return;
      }
      if (!stream) {
        try {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('needs https');
          const got = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          if (!wanted || disposed) { for (const t of got.getTracks()) t.stop(); return; }   // switched off while the browser was asking
          microphone = got;
          gate = gateMicrophone(got);                       // (the bare microphone, if this browser cannot gate it)
          stream = gate?.stream ?? got;
        } catch (err) {
          enabled = false;
          error = err?.name === 'NotAllowedError' ? 'Microphone blocked: allow it in the browser to talk'
            : err?.name === 'NotFoundError' ? 'No microphone found'
            : navigator.mediaDevices?.getUserMedia ? 'Microphone unavailable' : 'Voice chat needs a secure (https) address';
          report();
          return;
        }
      }
      track().enabled = !muted;
      for (const peer of peers.values()) peer.sender.replaceTrack(track());
      enabled = true; error = null;
      socket.emit('setVoice', { enabled: true });          // (said again in each new room)
      report();
    },

    setMuted(on) {
      muted = on;
      if (track()) track().enabled = !muted;
      report();
    },
    isMuted() { return muted; },

    sync(ids, hasVoice) {
      const keep = new Set(ids.filter(id => id !== selfId() && (enabled || hasVoice(id))));
      for (const id of [...peers.keys()]) if (!keep.has(id)) disconnect(id);
      for (const id of keep) connect(id);
      report();
    },

    // That player is on a new connection (they refreshed, or dropped and came back): the line to the old
    // one is dead.  Drop it; the next sync() makes a new one.
    reset(id) { disconnect(id); report(); },

    // the standard "perfect negotiation": either end may propose, and a clash is settled by who is polite
    async handleSignal({ from, signal: message } = {}) {
      if (disposed || !from || !message) return;
      const peer = connect(from);
      if (!peer) return;
      const { pc } = peer;
      try {
        if (message.description) {
          const clash = message.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
          peer.ignoreOffer = !peer.polite && clash;
          if (peer.ignoreOffer) return;
          await pc.setRemoteDescription(message.description);
          if (message.description.type === 'offer') {
            await pc.setLocalDescription();
            signal(from, { description: pc.localDescription });
          }
        } else if (message.candidate) {
          try { await pc.addIceCandidate(message.candidate); } catch (err) { if (!peer.ignoreOffer) throw err; }
        }
      } catch (err) {
        console.warn('[Voice] connection message failed:', err);
      }
    },

    dispose() {
      disposed = true; wanted = false;
      closeMicrophone();
      for (const id of [...peers.keys()]) disconnect(id);
    },
  };
}
