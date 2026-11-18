// The readouts the race writes straight to the page every frame (too often to go through React):
// speed, race time, the ground under the dog and the "lost" countdown.  The elements belong to the
// race screen (ui/RaceScreen.jsx).
export class RaceHud {
  constructor({ speed, timer, surface, rescue }) {
    this.speed = speed;
    this.timer = timer;
    this.surface = surface;
    this.rescue = rescue;
  }

  setSpeed(text) {
    if (this.speed) this.speed.textContent = text;
  }

  setTimer(text) {
    if (this.timer) this.timer.textContent = text;
  }

  setSurface(text, color) {
    if (!this.surface) return;
    this.surface.textContent = text;
    this.surface.style.color = color;
  }

  // text: what to show, or null to hide the countdown
  setRescue(text) {
    if (!this.rescue) return;
    this.rescue.hidden = text === null;
    if (text !== null) this.rescue.textContent = text;
  }
}
