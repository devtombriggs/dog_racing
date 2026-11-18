const CONTROL_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight'
]);

// A controller, laid out like an Xbox 360 pad (the browser's "standard" gamepad mapping):
//   right trigger  go              left trigger  brake / reverse
//   left stick or D-pad  steer     A  jump       X, B or either bumper  use the item
const PAD = {
  go: 7, brake: 6, jump: 0, item: [2, 1, 4, 5], left: 14, right: 15,
  triggerAt: 0.12,       // how far a trigger has to be pulled to count
  deadZone: 0.18,        // how far the stick has to move before it steers
};

/**
 * What a controller is asking for: { accelerate, brake, turn (1 = hard left, -1 = hard right, and
 * anything between from the stick), jump, item }.  gamepad: one of navigator.getGamepads(), or null.
 */
export function readPad(gamepad) {
  const none = { accelerate: false, brake: false, turn: 0, jump: false, item: false };
  if (!gamepad?.connected) return none;
  const pressed = index => { const b = gamepad.buttons[index]; return Boolean(b && (b.pressed || b.value > 0.5)); };
  const pulled = index => (gamepad.buttons[index]?.value ?? 0) > PAD.triggerAt || pressed(index);
  const x = gamepad.axes[0] ?? 0, tilt = Math.abs(x) <= PAD.deadZone ? 0 : Math.sign(x) * (Math.abs(x) - PAD.deadZone) / (1 - PAD.deadZone);
  const dpad = (pressed(PAD.left) ? 1 : 0) - (pressed(PAD.right) ? 1 : 0);
  return {
    accelerate: pulled(PAD.go), brake: pulled(PAD.brake),
    turn: dpad || (tilt ? Math.max(-1, Math.min(1, -tilt)) : 0),      // (stick to the left is a left turn)
    jump: pressed(PAD.jump), item: PAD.item.some(pressed),
  };
}

// The keyboard, mouse wheel and controller during a race: what is held, and when to jump or use an item
export class PlayerInput {
  // element: the race canvas (scrolling down over it jumps)
  // racing(): the race is on and this player has not finished
  // accessible(): accessibility mode is on (Up jumps, Down uses the item)
  // device: what this player drives with: { type: 'keyboard' } or { type: 'pad', index } (split screen).
  //         Left out, it is the keyboard and whichever controller is plugged in.
  constructor({ element, racing, accessible, onJump, onUseItem, device = null }) {
    this.device = device;
    this.keys = {};
    this.pad = readPad(null);        // what the controller is asking for, as of the last update()
    this.element = element;
    this.racing = racing;
    this.accessible = accessible;
    this.onJump = onJump;
    this.onUseItem = onUseItem;

    window.addEventListener('blur', this.clear);
    if (device?.type === 'pad') return;                 // (a controller's player has no keys)
    element.addEventListener('wheel', this.#onWheel, { passive: false });
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
  }

  get accelerate() { return Boolean(this.keys.KeyW || this.keys.ArrowUp || this.pad.accelerate); }
  get brake() { return Boolean(this.keys.KeyS || this.keys.ArrowDown || this.pad.brake); }
  // 1 = left, -1 = right (a controller's stick gives anything between)
  get turn() {
    const keys = (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) - (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0);
    return keys || this.pad.turn;
  }

  // Once a frame: read the controller (a browser has to be asked; it sends no events for buttons)
  update() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const mine = this.device?.type === 'keyboard' ? null
      : this.device?.type === 'pad' ? pads.find(pad => pad?.index === this.device.index) ?? null
        : pads.find(pad => pad?.connected && pad.mapping === 'standard') ?? pads.find(pad => pad?.connected) ?? null;
    const next = readPad(mine);
    const racing = this.racing();
    if (racing && next.jump && !this.pad.jump) this.onJump();
    if (racing && next.item && !this.pad.item) this.onUseItem();
    this.pad = racing ? next : { ...readPad(null), jump: next.jump, item: next.item };      // (held buttons do not fire again at GO)
  }

  clear = () => {
    Object.keys(this.keys).forEach(key => { this.keys[key] = false; });
    this.pad = { ...readPad(null), jump: this.pad.jump, item: this.pad.item };
  };

  #onKeyDown = (event) => {
    if (!CONTROL_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!this.racing()) return;

    this.keys[event.code] = true;
    const accessible = this.accessible();
    const jumpKey = event.code === 'Space' ||
      (accessible && (event.code === 'ArrowUp' || event.code === 'KeyW'));
    // Shift (or E) throws the ball, drops the chew toy or eats the golden bone;
    // in accessibility mode Down (or S) does too
    const itemKey = event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyE' ||
      (accessible && (event.code === 'ArrowDown' || event.code === 'KeyS'));
    if (jumpKey && !event.repeat) this.onJump();
    if (itemKey && !event.repeat) this.onUseItem();
  };

  #onKeyUp = (event) => {
    if (!CONTROL_KEYS.has(event.code)) return;
    event.preventDefault();
    this.keys[event.code] = false;
  };

  #onWheel = (event) => {
    if (event.deltaY <= 0 || event.ctrlKey) return;
    event.preventDefault();
    this.onJump();
  };

  dispose() {
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('blur', this.clear);
    this.element.removeEventListener('wheel', this.#onWheel);
  }
}
