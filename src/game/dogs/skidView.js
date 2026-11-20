import * as THREE from 'three';
import { DRIFT } from '../../../shared/drift.js';
import { applyTurnPose, applySkidPose, skidSway, lowestPaw, pawStance } from './animation.js';
import { createDriftEffects } from './driftEffects.js';
import { createSkateboard } from './skateboard.js';

// How a skid looks, for any dog in the race: the player's own (LocalDog) and everyone else's (RemoteDog,
// which is told by the server that the dog is skidding).  What each dog does in one is its `skid` in
// src/config/dogs.js: a hop, then the crouch, Enzo on his belly, Ralph on his skateboard, or one pug twin
// on the other (the twins' part of it is in duo.js, from `slideWeight` here).
//
//   const view = new SkidView(avatar, scene);     // avatar: a DogAvatar
//   view.ready();                                 // once its model has loaded
//   each frame, in this order:
//     const held = view.clips(delta, skid);       // skid: { side: 1 left / -1 right, startedAt (performance.now()) } or null.
//                                                 // true while the skid has the dog's clips: leave its stride alone
//     avatar.mixer.update(delta);
//     view.pose(delta, { steer, effort, tier, speed, spinning });
//     view.settle(delta, { pitch, speed, grounded });   // pitch: the tilt the dog has anyway (the slope it is on)
//   view.dispose();
export class SkidView {
  constructor(avatar, scene) {
    this.avatar = avatar;
    this.scene = scene;
    this.phase = null;        // where it is in the skid's own animation: 'hop' or 'slide'
    this.slideWeight = 0;     // how far its legs are folded into the slide: 0 running, 1 right down
    this.turned = 0;          // how far into the skid's stance it is: -1 (right) to 1 (left), eased
    this.hop = 1;             // how far through the hop that starts a skid (1 and over: done)
    this.skid = null;
    this.stance = null;       // where its paws are, standing (animation.js pawStance)
    this.board = null;        // Ralph's skateboard
    this.effects = null;      // dust and sparks (made the first time it skids)
    this.posed = false;       // it has moved the model about, and has to put it back
    this.settled = false;
  }

  // The model is in: where its paws are when it stands, and (Ralph) a skateboard long enough to stand on
  ready() {
    const { avatar } = this, { config } = avatar;
    if (!config.skid || !avatar.model) return;
    avatar.mixer?.update(0);
    this.stance = pawStance(avatar.group, avatar.bones);
    const board = config.skid.board;
    if (board && !this.board) {
      const { front, back, side } = this.stance;
      this.board = createSkateboard({ length: front - back + 0.2 * config.scale, width: Math.max(side * 2 + 0.07 * config.scale, 0.12 * config.scale), colour: board.colour, size: board.size });
      this.board.object.position.z = (front + back) / 2;
      this.board.holder = new THREE.Group();          // (turned and leant with the dog)
      this.board.holder.add(this.board.object);
      this.board.holder.visible = false;
      avatar.group.add(this.board.holder);
    }
  }

  // In a skid the legs stop: a hop to start it, then a held slide.  Out of it, straight back into the stride
  clips(delta, skid) {
    const { avatar } = this, config = avatar.config.skid;
    this.skid = config && avatar.model ? skid : null;
    this.hop = this.skid ? (performance.now() - this.skid.startedAt) / 1000 / DRIFT.hopSeconds : 1;
    const sliding = Boolean(this.skid) && this.hop >= 1;
    if (this.skid) {
      const phase = sliding ? 'slide' : 'hop';
      if (this.phase !== phase) {
        if (sliding) {
          if (avatar.actions[config.hop[0]]) avatar.actions[config.hop[0]].paused = false;
          if (avatar.play(config.slide)) avatar.currentAction.timeScale = config.slideRate ?? 1;
        } else if (avatar.play(config.hop[0])) {
          avatar.currentAction.paused = true;
          avatar.currentAction.time = config.hop[1];
        }
        this.phase = phase;
      }
    } else if (this.phase) {
      const hop = avatar.actions[config.hop[0]];
      if (hop) hop.paused = false;
      this.phase = null;
    }
    this.slideWeight += ((sliding ? 1 : 0) - this.slideWeight) * (1 - Math.exp(-DRIFT.poseIn * delta));
    if (this.slideWeight < 0.004) this.slideWeight = 0;
    return Boolean(this.skid);
  }

  // After the mixer: the lean into the turn (any turn), and in a skid the dog turned further into the corner than
  // it is heading, its legs folded, its tail and head moving, the hop, and the dust and sparks.
  // steer: -1 (right) to 1 (left).  effort: 0 to 1.  tier: its sparks (0 none yet).  spinning: it has been
  // knocked over and is being spun: leave its heading alone
  pose(delta, { steer, effort, tier = 0, speed = 0, spinning = false }) {
    const { avatar, skid } = this, { model, bones } = avatar, config = avatar.config.skid;
    if (!model) return;
    this.turned += ((skid?.side ?? 0) - this.turned) * (1 - Math.exp(-9 * delta));
    if (Math.abs(this.turned) < 0.002 && !skid) this.turned = 0;
    const stance = Math.abs(this.turned);
    // (in the slide its tail wags and its head moves: it is skidding, not frozen)
    const sway = config?.life && this.slideWeight > 0 ? skidSway(performance.now() / 1000, this.slideWeight, config.life) : null;
    applyTurnPose(model, bones, steer * (1 + (DRIFT.lean - 1) * stance), effort, sway);
    if (config?.bend) applySkidPose(bones, config.bend, this.slideWeight);
    const moved = this.turned !== 0 || this.hop < 1;
    if (!spinning && (moved || this.posed)) {
      model.rotation.y = this.turned * DRIFT.swing;
      // (the hop is for show: it is on the ground as far as the race is concerned)
      model.position.y = this.hop < 1 ? 4 * this.hop * (1 - this.hop) * DRIFT.hopHeight * avatar.config.scale : 0;
      this.posed = moved;
    }
    if (skid) {
      this.effects ??= createDriftEffects(this.scene);
      this.effects.skid(delta, { group: avatar.group, side: skid.side, size: avatar.config.scale, tier, pace: speed });
    }
    this.effects?.update(delta);
  }

  // Letting go into a boost: a burst of sparks
  burst(tier) {
    this.effects ??= createDriftEffects(this.scene);
    this.effects.burst({ group: this.avatar.group, size: this.avatar.config.scale, tier });
  }

  // In the slide: sat back a little, and let down until its paws are on the ground (folded legs are shorter),
  // or on to its belly, or stood on its board
  settle(delta, { pitch = 0, speed = 0, grounded = true } = {}) {
    const { avatar, board } = this, { model } = avatar, config = avatar.config.skid;
    if (!model || !config) return;
    const weight = grounded ? this.slideWeight : 0;
    if (weight > 0 || this.settled) {
      model.rotation.x = pitch + (config.pitch ?? 0) * weight;
      this.settled = weight > 0;
    }
    if (weight > 0) {
      if (config.drop) {
        model.position.y -= config.drop * avatar.config.scale * weight;      // (on to its belly)
      } else {
        const paws = lowestPaw(avatar.group, avatar.bones);
        if (Number.isFinite(paws)) model.position.y += (avatar.group.position.y + (this.stance?.rest ?? 0) - paws) * weight;
      }
      if (board) model.position.y += board.deckTop * weight;              // (standing on the board, not the road)
    }
    if (board) {
      // the board is under him for as long as he is in the slide: it comes with the hop and goes as he runs off it
      board.holder.visible = weight > 0.02 && model.visible && avatar.group.visible;
      board.holder.scale.setScalar(Math.min(1, weight * 1.4));
      board.holder.rotation.set(pitch, model.rotation.y, model.rotation.z);
      board.update(delta, speed);
    }
  }

  dispose() {
    this.effects?.dispose();
    this.board?.dispose();
    this.effects = this.board = null;
  }
}
