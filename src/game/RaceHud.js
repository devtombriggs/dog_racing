// The readouts the race writes straight to the page every frame (too often to go through React):
// speed, the "lost" countdown and the warning of a firework or frisbee closing in.  (The word about the ground under
// the dog has gone: Tom, 2026-11-24, "no need to babysit people"; setSurface is kept, and does nothing)
// (there is no race time on screen now: `timer` is null, and setTimer does nothing).  The elements belong to the
// race screen (ui/RaceScreen.jsx).
export class RaceHud {
  constructor({ speed, timer, rescue, incoming }) {
    this.speed = speed;
    this.timer = timer;
    this.rescue = rescue;
    this.incoming = incoming;
    this.incomingIcon = null;
  }

  setSpeed(text) {
    if (this.speed) this.speed.textContent = text;
  }

  setTimer(text) {
    if (this.timer) this.timer.textContent = text;
  }

  setSurface() {}

  // warning: null, or { icon, angle, label }.  angle: where it is coming from, in radians clockwise from straight
  // ahead on the screen (Math.PI: from right behind)
  setIncoming(warning) {
    const box = this.incoming;
    if (!box) return;
    box.hidden = !warning;
    if (!warning) { this.incomingIcon = null; return; }
    if (this.incomingIcon !== warning.icon) {
      this.incomingIcon = warning.icon;
      box.querySelector('img').src = warning.icon;
      box.setAttribute('aria-label', warning.label);
    }
    box.style.setProperty('--angle', `${warning.angle}rad`);
  }

  // text: what to show, or null to hide the countdown
  setRescue(text) {
    if (!this.rescue) return;
    this.rescue.hidden = text === null;
    if (text !== null) this.rescue.textContent = text;
  }
}
