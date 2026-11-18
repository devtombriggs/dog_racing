const CONTROL_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight'
]);

// The keyboard and mouse wheel during a race: which keys are held, and when to jump or use an item
export class PlayerInput {
  // element: the race canvas (scrolling down over it jumps)
  // racing(): the race is on and this player has not finished
  // accessible(): accessibility mode is on (Up jumps, Down uses the item)
  constructor({ element, racing, accessible, onJump, onUseItem }) {
    this.keys = {};
    this.element = element;
    this.racing = racing;
    this.accessible = accessible;
    this.onJump = onJump;
    this.onUseItem = onUseItem;

    element.addEventListener('wheel', this.#onWheel, { passive: false });
    window.addEventListener('blur', this.clear);
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
  }

  get accelerate() { return Boolean(this.keys.KeyW || this.keys.ArrowUp); }
  get brake() { return Boolean(this.keys.KeyS || this.keys.ArrowDown); }
  // 1 = left, -1 = right
  get turn() {
    return (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) - (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0);
  }

  clear = () => {
    Object.keys(this.keys).forEach(key => { this.keys[key] = false; });
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
