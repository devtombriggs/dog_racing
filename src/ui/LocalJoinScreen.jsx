import { useEffect, useRef, useState } from 'react';

// Split screen: who is playing, and with what.  Player 1 presses Enter on the keyboard or A on a
// controller, then player 2 does the same on a different one.  Whatever each pressed is what they drive
// with (left half of the screen: player 1; right half: player 2).  The game starts once both are in, so
// it cannot be started with only one thing to play on.
const describe = device => (device.type === 'keyboard' ? 'Keyboard' : `Controller ${device.index + 1}`);
const same = (a, b) => a.type === b.type && a.index === b.index;

export function LocalJoinScreen({ session, state }) {
  const [devices, setDevices] = useState([]);
  const [pads, setPads] = useState(0);            // controllers the browser can see (it sees one once a button is pressed)
  const [clash, setClash] = useState(false);      // the same device pressed again
  const joined = useRef([]);
  const started = useRef(false);

  useEffect(() => {
    document.activeElement?.blur?.();
    const join = (device) => {
      if (started.current || joined.current.length >= 2) return;
      if (joined.current.some(other => same(other, device))) { setClash(true); return; }
      setClash(false);
      joined.current = [...joined.current, device];
      setDevices(joined.current);
    };
    const onKey = (event) => {
      if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
      event.preventDefault();
      if (!event.repeat) join({ type: 'keyboard' });
    };
    window.addEventListener('keydown', onKey);
    // controllers send no events for buttons: look at them every frame
    const held = new Set();
    let frame = 0;
    const poll = () => {
      frame = requestAnimationFrame(poll);
      const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(pad => pad?.connected) : [];
      setPads(list.length);
      for (const pad of list) {
        const down = Boolean(pad.buttons[0]?.pressed);
        if (down && !held.has(pad.index)) join({ type: 'pad', index: pad.index });
        if (down) held.add(pad.index); else held.delete(pad.index);
      }
    };
    poll();
    return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(frame); };
  }, []);

  // both in: a moment to see it, then on to choosing dogs
  useEffect(() => {
    if (devices.length < 2 || started.current) return undefined;
    const timer = setTimeout(() => { started.current = true; session.startLocalGame(devices); }, 900);
    return () => clearTimeout(timer);
  }, [devices, session]);

  const slot = (index) => {
    const device = devices[index], waiting = devices.length === index;
    return (
      <div className={`zr-row${device ? ' zr-row--on' : waiting ? ' zr-row--next' : ''}`} style={{ flex: 1, display: 'block', margin: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 13, letterSpacing: 1, color: '#c4d3f5' }}>PLAYER {index + 1} · {index === 0 ? 'LEFT' : 'RIGHT'} HALF</div>
        <div style={{ fontSize: 20, fontWeight: 'bold', margin: '10px 0 4px' }}>{device ? `${describe(device)} ✓` : waiting ? 'Press to join' : 'Waiting'}</div>
        <div style={{ fontSize: 13, color: '#c4d3f5', minHeight: 32 }}>
          {device ? 'Ready' : waiting ? 'Enter on the keyboard, or A on a controller' : 'After player 1'}
        </div>
      </div>
    );
  };

  return (
    <div className="zr-page" data-pad-off="">
      <div className="zr-card" style={{ width: 'min(600px, 92vw)' }}>
        <h1>Split Screen</h1>
        <p style={{ color: '#c4d3f5' }}>Two players on this screen, each with their own controls. Computer dogs fill the rest of the grid.</p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0' }}>{slot(0)}{slot(1)}</div>
        <p role="status" style={{ minHeight: 22, color: clash ? '#ffd257' : '#b4c9b5' }}>
          {devices.length === 2 ? 'Both in! Starting…'
            : clash ? 'That one is already taken: player 2 needs a different keyboard or controller'
              : pads === 0 ? 'No controller found yet: plug one in and press any button on it'
                : `${pads} ${pads === 1 ? 'controller' : 'controllers'} connected`}
        </p>
        {state.error && <p className="zr-error">{state.error}</p>}
        <button className="zr-btn zr-btn--quiet" data-pad-back="" onClick={session.backToMenu}>← Back</button>
        {devices.length > 0 && devices.length < 2 && (
          <button className="zr-btn zr-btn--quiet" onClick={() => { joined.current = []; setDevices([]); setClash(false); }}>Start again</button>
        )}
      </div>
    </div>
  );
}
