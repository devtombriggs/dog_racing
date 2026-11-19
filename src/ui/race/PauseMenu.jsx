import { useEffect, useRef, useState } from 'react';
import { fullscreen } from '../../fullscreen.js';
import { buttonStyle } from '../styles.js';

// The menu over the race: Esc opens and closes it.  Resume, full screen on or off, back to the main menu.
// The race does not stop while it is open (the other dogs are still running).
//
// A browser may take Esc for itself to leave full screen without telling the game: so leaving full
// screen during a race, other than by this menu's own button, opens the menu too.
export function PauseMenu({ session }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(fullscreen.isOn());
  const ours = useRef(false);            // full screen is being changed by this menu's button

  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'Escape' || event.repeat) return;
      event.preventDefault();
      setOpen(was => !was);
    };
    window.addEventListener('keydown', onKey);
    const onPad = () => setOpen(was => !was);            // Start on a controller (ui/menuPad.js)
    window.addEventListener('zr-menu', onPad);
    const stop = fullscreen.onChange((on) => {
      setFull(on);
      if (!on && !ours.current) setOpen(true);
      ours.current = false;
    });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('zr-menu', onPad); stop(); };
  }, []);

  if (!open) return null;
  const quiet = { ...buttonStyle, background: '#3d5a45', color: 'white' };
  return (
    <div className="pause-menu" role="dialog" aria-modal="true" aria-label="Game menu">
      <div className="pause-menu__panel">
        <h2>Menu</h2>
        <p>The race carries on while this is open</p>
        <button style={buttonStyle} autoFocus data-pad-first="" data-pad-back="" onClick={() => setOpen(false)}>Resume</button>
        {fullscreen.available && (
          <button style={quiet} onClick={() => { ours.current = true; fullscreen.toggle(); }}>
            Full screen: {full ? 'on' : 'off'}
          </button>
        )}
        <button style={quiet} onClick={session.leaveGame}>Quit to Main Menu</button>
        <small>Esc or Start closes this menu</small>
      </div>
    </div>
  );
}
