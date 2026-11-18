import { racingLineAt } from '../../shared/pickupSpots.js';

// Lost dogs: off the track or running the wrong way for this many seconds goes back to the last checkpoint
const RESCUE_AFTER = 5;

// Watches the player's dog for being lost, counts down on the HUD and asks the server for a rescue
export class RescueWatch {
  offTrackFor = 0;
  wrongWayFor = 0;
  pending = false;         // a rescue is on its way
  wrongWayNow = false;
  lineS = null;            // how far round the lap the dog is (also used to follow the road)
  #lineCheckTimer = 0;

  constructor({ mapId, socket, hud }) {
    this.mapId = mapId;
    this.socket = socket;
    this.hud = hud;
  }

  // The dog has been put back on the track
  reset() {
    this.offTrackFor = this.wrongWayFor = 0;
    this.pending = false;
    this.wrongWayNow = false;
    this.lineS = null;
    this.hud.setRescue(null);
  }

  update(delta, { position, currentSpeed, travelYaw, offTrack }) {
    this.#lineCheckTimer -= delta;
    if (this.#lineCheckTimer <= 0) {
      this.#lineCheckTimer = 0.1;
      const line = racingLineAt(this.mapId, position.x, position.z, this.lineS);
      this.lineS = line?.s ?? null;
      // which way the dog is actually moving (reversing counts), against the way the race goes
      const moving = Math.abs(currentSpeed) > 2;   // reversing (up to 2.5 m/s) counts too
      const along = Math.cos(travelYaw - (line?.rotationY ?? travelYaw)) * Math.sign(currentSpeed);
      this.wrongWayNow = Boolean(line) && moving && along < -0.4;
    }
    this.offTrackFor = offTrack ? this.offTrackFor + delta : 0;      // (hopping about off the road counts as lost too)
    this.wrongWayFor = this.wrongWayNow ? this.wrongWayFor + delta : 0;
    const lostFor = Math.max(this.offTrackFor, this.wrongWayFor);
    if (lostFor >= RESCUE_AFTER && !this.pending) {
      this.pending = true;
      this.socket.emit('requestRescue', response => {
        if (!response?.success) { this.pending = false; this.offTrackFor = this.wrongWayFor = 0; }
      });
    }
    const show = lostFor > 1.5 && !this.pending;
    this.hud.setRescue(show
      ? `${this.wrongWayFor >= this.offTrackFor ? 'WRONG WAY' : 'OFF TRACK'} — back to your checkpoint in ${Math.ceil(RESCUE_AFTER - lostFor)}`
      : null);
  }
}
