import * as THREE from 'three';
import { switchAction, collectBones } from './animation.js';
import { createDuo } from './duo.js';

// A dog in the race as you see it: its place in the scene, its model and the clips it plays.
// LocalDog (the player's own) and RemoteDog (everyone else's) build on this.
export class DogAvatar {
  // id: the player's socket id.  dogId: which dog (a key of DOGS).  config: that dog's entry in DOGS
  constructor({ id, dogId, config, scene }) {
    this.id = id;
    this.dogId = dogId;
    this.config = config;

    this.group = new THREE.Group();
    scene.add(this.group);

    this.model = null;
    this.bones = {};
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.animations = [];
    this.duo = null;        // the second dog and the rope, for a pair that races as one (config.twin)
  }

  get position() { return this.group.position; }

  // wanted(): false once the dog is no longer needed (the race was left, the player has gone)
  load(loader, { castShadow, wanted, onLoaded, onError }) {
    loader.load(
      this.config.model,
      (gltf) => {
        if (!wanted()) return;

        const model = gltf.scene;
        model.scale.setScalar(this.config.scale);
        if (castShadow) {
          model.traverse(object => { if (object.isMesh) object.castShadow = true; });
        }
        // (a pair that races as one: each dog is in a holder of its own, so that they can be moved about inside the group)
        const holder = this.config.twin ? new THREE.Group() : this.group;
        if (holder !== this.group) this.group.add(holder);
        holder.add(model);
        this.model = model;
        this.bones = collectBones(model);
        this.animations = gltf.animations;

        this.mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          this.actions[clip.name] = this.mixer.clipAction(clip);
        });
        for (const name of ['Jump', 'Land']) {
          this.actions[name]?.setLoop(THREE.LoopOnce, 1);
        }

        this.modelReady();
        onLoaded(this);
        if (this.config.twin) this.#loadTwin(loader, holder, { castShadow, wanted });
      },
      undefined,
      onError
    );
  }

  // The other dog of a pair (it turns up a moment after the first; the pair is one racer either way)
  #loadTwin(loader, firstHolder, { castShadow, wanted }) {
    loader.load(this.config.twin.model, (gltf) => {
      if (!wanted() || !this.model) return;
      const model = gltf.scene, holder = new THREE.Group();
      model.scale.setScalar(this.config.scale);
      if (castShadow) model.traverse(object => { if (object.isMesh) object.castShadow = true; });
      holder.add(model);
      this.group.add(holder);
      this.duo = createDuo({
        group: this.group, config: this.config,
        first: { holder: firstHolder, model: this.model, bones: this.bones },
        second: { holder, model, animations: gltf.animations },
      });
    }, undefined, error => console.warn(`[Dog] ${this.config.twin.model} failed to load:`, error));
  }

  // For subclasses: the model and its clips have just loaded
  modelReady() {}

  // Change to the clip called `name`, blending from the current one (the dog carries on as it was
  // if it has no such clip).  Returns the action now playing, or null if nothing is.
  play(name) {
    const action = switchAction(this.actions, this.currentAction, name);
    if (!action) return null;
    this.currentAction = action;
    return action;
  }

  // What the special abilities need to take over the dog's animation (abilities/specials.js)
  get specialsEntry() {
    return {
      dogId: this.dogId,
      group: this.group,
      model: this.model,
      mixer: this.mixer,
      animations: this.animations,
      getAction: () => this.currentAction,
      setAction: (action) => { this.currentAction = action; }
    };
  }
}
