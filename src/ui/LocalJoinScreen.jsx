import { useEffect, useRef, useState } from 'react';
import { LOCAL_PLAYERS } from '../../shared/botLevels.js';

// Split screen: who is playing, and with what.  Each player in turn presses Enter on the keyboard or A on a
// controller: whatever they pressed is what they drive with.  Two, three or four can play (LOCAL_PLAYERS): once
// two are in, player 1 pressing theirs again starts the game, and it starts by itself when the last place is taken.
// Two players have half the screen each; three or four have a quarter each.
const describe = device => (device.type === 'keyboard' ? 'Keyboard' : `Controller ${device.index + 1}`);
const same = (a, b) => a.type === b.type && a.index === b.index;

export function LocalJoinScreen({ session, state }) {
  const [devices, setDevices] = useState([]);
  const [pads, setPads] = useState(0);            // controllers the browser can see (it sees one once a button is pressed)
  const [clash, setClash] = useState(false);      // the same device pressed again
  const [go, setGo] = useState(false);            // player 1 has said that is everyone
  const joined = useRef([]);
  const started = useRef(false);

  useEffect(() => {
    document.activeElement?.blur?.();
    const join = (device) => {
      if (started.current) return;
      // (player 1 again, with two or more in: that is everyone)
      if (joined.current.length >= 2 && same(joined.current[0], device)) { setGo(true); return; }
      if (joined.current.length >= LOCAL_PLAYERS) return;
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

  // everyone in (every place taken, or player 1 has said so): a moment to see it, then on to choosing dogs
  const ready = devices.length >= 2 && (go || devices.length >= LOCAL_PLAYERS);
  useEffect(() => {
    if (!ready || started.current) return undefined;
    const timer = setTimeout(() => { started.current = true; session.startLocalGame(devices); }, 900);
    return () => clearTimeout(timer);
  }, [ready, devices, session]);

  // (where each will race: halves for two, quarters for more.  Until it is known how many, both are said)
  const WHERE = ['LEFT · TOP LEFT', 'RIGHT · TOP RIGHT', 'BOTTOM LEFT', 'BOTTOM RIGHT'];
  const slot = (index) => {
    const device = devices[index], waiting = devices.length === index && !ready;
    return (
      <div key={index} className={`zr-row${device ? ' zr-row--on' : waiting ? ' zr-row--next' : ''}`} style={{ display: 'block', margin: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 13, letterSpacing: 1, color: '#c4d3f5' }}>PLAYER {index + 1} · {WHERE[index]}</div>
        <div style={{ fontSize: 20, fontWeight: 'bold', margin: '10px 0 4px' }}>{device ? `${describe(device)} ✓` : waiting ? 'Press to join' : index < 2 ? 'Waiting' : 'Free'}</div>
        <div style={{ fontSize: 13, color: '#c4d3f5', minHeight: 32 }}>
          {device ? (index === 0 && devices.length >= 2 && !ready ? 'Press again to start' : 'Ready')
            : waiting ? 'Enter on the keyboard, or A on a controller' : index < 2 ? `After player ${index}` : 'For a third or fourth player'}
        </div>
      </div>
    );
  };

  return (
    <div className="zr-page" data-pad-off="">
      <div className="zr-card" style={{ width: 'min(640px, 92vw)' }}>
        <h1>Split Screen</h1>
        <p style={{ color: '#c4d3f5' }}>Two to four players on this screen, each with their own controls. Computer dogs fill the rest of the grid.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '18px 0' }}>{Array.from({ length: LOCAL_PLAYERS }, (_, index) => slot(index))}</div>
        <p role="status" style={{ minHeight: 22, color: clash ? '#ffd257' : '#b4c9b5' }}>
          {ready ? `${devices.length} players in! Starting…`
            : clash ? 'That one is already taken: the next player needs a different keyboard or controller'
              : devices.length >= 2 ? `Player 1: press yours again to start with ${devices.length}, or the next player presses to join`
                : pads === 0 ? 'No controller found yet: plug one in and press any button on it'
                  : `${pads} ${pads === 1 ? 'controller' : 'controllers'} connected`}
        </p>
        {state.error && <p className="zr-error">{state.error}</p>}
        <button className="zr-btn zr-btn--quiet" data-pad-back="" onClick={session.backToMenu}>← Back</button>
        {devices.length > 0 && !ready && (
          <button className="zr-btn zr-btn--quiet" onClick={() => { joined.current = []; setDevices([]); setClash(false); setGo(false); }}>Start again</button>
        )}
      </div>
    </div>
  );
}
