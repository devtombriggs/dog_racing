import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { MAPS, DEFAULT_MAP, PROCEDURAL_TRACKS } from '../../shared/maps.js';
import { GOLDEN_BONE_SPOTS, racingLineAt } from '../../shared/pickupSpots.js';
import { BURROWS } from '../../shared/burrows.js';
import { createBurrowMouths } from '../tracks/burrowMouths.js';
import { createKelp } from '../abilities/kelp.js';
import { createSheep } from '../abilities/sheep.js';
import { createTreatBoxes } from '../pickups/treatBoxes.js';
import { createGoldenBones } from '../pickups/goldenBones.js';
import { createItems } from '../pickups/items.js';
import { createFireworks } from '../pickups/firework.js';
import { createShields } from '../pickups/collar.js';
import { createSpecials } from '../abilities/specials.js';
import { createQuake } from '../abilities/quake.js';
import { createFrogs, createPuffs } from '../abilities/shopDogs.js';
import { createMinimap } from '../minimap.js';
import { formatTime } from '../utils/format.js';
import { RaceScene } from './RaceScene.js';
import { TrackWorld } from './TrackWorld.js';
import { ChaseCamera, confineToWalls } from './ChaseCamera.js';
import { wear } from '../cosmetics/cosmetics.js';
import { phoneView, phoneZoom } from '../touch.js';
import { PlayerInput } from './PlayerInput.js';
import { RescueWatch } from './RescueWatch.js';
import { LocalDog } from './dogs/LocalDog.js';
import { RemoteDog } from './dogs/RemoteDog.js';

// how near a firework or red frisbee after me is before it shows on the screen (m: about two seconds away)
const INCOMING_WARN_M = { firework: 90, frisbee: 45 };
const INCOMING_LOOK = new THREE.Vector3();

const NETWORK_INTERVAL = 0.05;     // seconds between telling the server where the dog is

// One race, from the loading screen to leaving it: builds the 3D view, the map, the dogs and the
// pickups, listens to what the server says happens, and runs the frame loop.
//
// The parts:  stage (RaceScene)  world (TrackWorld)  local (LocalDog)  remotes (RemoteDog by player id)
//             chaseCamera  input  rescue  hud  and the pickups, items, specials and minimap.
export class Race {
  // container: the element to draw in.  minimapCanvas: the course map's canvas.
  // session: the GameSession (the socket, the room, the race clock).  hud: the RaceHud to write to.
  constructor({ container, minimapCanvas, session, hud }) {
    this.session = session;
    this.socket = session.socket;
    this.hud = hud;

    const room = session.state.room;
    const mapId = this.mapId = room.mapId ?? DEFAULT_MAP;
    const socket = this.socket;

    this.stage = new RaceScene(container, MAPS[mapId]);
    const { scene, renderer } = this.stage;
    this.loader = new GLTFLoader();

    this.burrowOverlay = document.createElement('div');
    this.burrowOverlay.className = 'burrow-overlay';
    this.burrowOverlay.hidden = true;
    this.burrowOverlay.textContent = 'BURROW BOOST';
    container.appendChild(this.burrowOverlay);

    // ---------------------------------
    // DOGS AND MAP
    // ---------------------------------

    // This player's id: the server's name for them (it outlasts a refresh, so it is not the connection's id)
    const myId = this.myId = session.state.socketId;
    // Coming back into a race that is already going (after a refresh): what the server said about it
    const resume = this.resume = session.resumeRace;
    this.localPlayer = room.players.find((p) => p.id === myId);
    if (resume && this.localPlayer) this.localPlayer.respawnRevision = resume.you.respawnRevision;
    this.local = new LocalDog(this, this.localPlayer);
    this.remotes = new Map();
    this.world = new TrackWorld({ mapId, stage: this.stage, dogId: this.local.dogId, dogSize: this.local.size });

    // ---------------------------------
    // PICKUPS, ITEMS AND SPECIALS
    // ---------------------------------

    // Pickups on every map: Treat Boxes (the server says when one is taken) and Golden Bones
    // (speed boosts, local to this player). Spots come from shared/pickupSpots.js.
    this.treatBoxes = createTreatBoxes({ scene, mapId });
    this.goldenBones = createGoldenBones({ scene, renderer, placements: GOLDEN_BONE_SPOTS[mapId] ?? [] });
    // Items from the boxes: held above heads, thrown balls, dropped chew toys (the server decides)
    this.items = createItems({ scene, renderer });
    // Fireworks in flight (the server flies them) and the golden shield round a dog wearing the collar
    this.fireworks = createFireworks({ scene });
    this.shields = createShields({ envMap: this.items.envMap });
    // The mouths of Ralph's burrows (Wendover's are part of its model)
    this.burrowMouths = createBurrowMouths({ scene, mapId });
    // Kombu's seaweed (shared/specials.js KELP)
    this.kelp = createKelp({ scene });
    // Rocky's flock (shared/specials.js SHEEP)
    this.sheep = createSheep({ scene });
    // Jazz's stomp (shared/specials.js QUAKE)
    this.quake = createQuake({ scene });
    // Merlin's frogs and puffs of magic (shared/specials.js HEX)
    this.frogs = createFrogs({ scene });
    this.puffs = createPuffs({ scene });
    // Special abilities: each dog's own move (the server decides when and who is hit; shared/specials.js)
    this.specials = createSpecials({
      scene,
      resolve: id => (id === myId ? this.local.group : this.remotes.get(id)?.group ?? null)
    });
    // The course map, bottom left: the whole lap from above with a dot for every dog (src/minimap.js)
    this.minimap = createMinimap({
      canvas: minimapCanvas, mapId,
      marks: (PROCEDURAL_TRACKS[mapId]?.chasms ?? []).map(chasm => chasm.s)    // Modbury's broken bridges
    });
    this.myItem = null;
    this.squashed = new Map();        // dogs Enzo has just landed on: player id -> when they spring back up
    if (resume) {
      // the race as it stands: boxes and bones already taken, chew toys on the road, what each dog is holding
      for (const id of resume.boxesTaken) this.treatBoxes.setVisible(id, false);
      for (const index of resume.bonesTaken) this.goldenBones.take(index);
      for (const toy of resume.toys) this.items.placeHazard(toy);
      for (const player of resume.players) if (player.item) this.items.setHeld(player.id, player.item);
      this.myItem = resume.you.item;
    }
    this.rescue = new RescueWatch({ mapId, socket, hud });

    // ---------------------------------
    // LOADING
    // ---------------------------------

    this.world.load(this.loader).then(() => {
      if (this.#disposed) return;
      this.local.standOnGround();
      this.#trackLoaded = true;
      this.#notifyLoaded();
    }).catch(error => this.#loadFailed(MAPS[mapId].name, error));

    this.local.load(this.loader, {
      castShadow: this.world.castsShadows,
      wanted: () => !this.#disposed,
      onLoaded: () => {
        // (what it wears: the Garage.  The server says, for every dog, so everyone sees the same)
        wear(this.local, room.players.find(player => player.id === myId)?.cosmetics);
        this.specials.register(myId, { ...this.local.specialsEntry, own: true });
        this.#dogLoaded = true;
        this.#notifyLoaded();
      },
      onError: error => this.#loadFailed('dog model', error)
    });

    // Spawn players already in the race
    room.players.forEach(player => this.#spawnRemote(player));

    // ---------------------------------
    // CONTROLS AND CAMERA
    // ---------------------------------

    this.#events = this.#serverEvents();
    for (const [event, handler] of Object.entries(this.#events)) socket.on(event, handler);

    this.input = new PlayerInput({
      element: renderer.domElement,
      racing: () => session.raceGo && !session.raceFinished,
      accessible: () => session.state.accessibilityMode && !session.device,
      device: session.device,
      onJump: () => this.local.tryJump(),
      onUseItem: () => { if (this.myItem) socket.emit('useItem'); }
    });

    this.chaseCamera = new ChaseCamera(this.stage.camera, this.local.group, this.local.config, () => this.local.travelYaw, phoneView(), confineToWalls(PROCEDURAL_TRACKS[mapId]));

    // ---------------------------------
    // GAME LOOP
    // ---------------------------------

    this.#timer = new THREE.Timer();
    this.#timer.connect(document);
    this.#frame();
  }

  #disposed = false;
  #trackLoaded = false;
  #dogLoaded = false;
  #remoteModelsPending = 0;
  #readySent = false;
  #events = null;
  #timer = null;
  #animationId = 0;
  #networkTimer = 0;
  #wasRacing = false;
  #goBannerCleared = false;

  // ---------------------------------
  // MODEL LOADING
  // ---------------------------------

  // Tell the server once everything is on screen: the countdown starts when every player has
  #notifyLoaded() {
    if (this.#disposed || this.#readySent || !this.#trackLoaded || !this.#dogLoaded || this.#remoteModelsPending > 0) {
      return;
    }

    this.#readySent = true;
    if (this.resume) {
      // back in a race that is going: the server has been running the dog; take it over where it now is
      this.socket.emit('backInRace', (response) => {
        if (this.#disposed || !response?.success) return;
        const { you } = response.race;
        this.local.respawned({ position: you.position, rotation: you.rotation, respawnRevision: you.respawnRevision, penaltySeconds: 0 });
        this.myItem = you.item;
        this.session.backInRace(response.race);
      });
      return;
    }
    console.log('All models loaded. Ready for countdown.');
    this.socket.emit('raceLoaded');
  }

  #loadFailed(name, error) {
    if (this.#disposed) return;       // the race was left while it loaded: nothing to report
    console.error(`Failed to load ${name}:`, error);
    this.session.set({ racePhase: `Failed to load ${name}` });
  }

  #spawnRemote(data) {
    if (data.id === this.myId || this.remotes.has(data.id)) return;

    const remote = new RemoteDog(data, this.stage.scene);
    this.remotes.set(data.id, remote);
    this.#remoteModelsPending += 1;

    remote.load(this.loader, {
      castShadow: this.world.castsShadows,
      wanted: () => !this.#disposed && this.remotes.has(data.id),
      onLoaded: () => {
        wear(remote, data.cosmetics);
        this.specials.register(data.id, remote.specialsEntry);
        this.#remoteModelsPending -= 1;
        this.#notifyLoaded();
      },
      onError: error => this.#loadFailed('remote dog', error)
    });
  }

  // ---------------------------------
  // NEWS FROM THE SERVER
  // ---------------------------------

  #serverEvents() {
    const { local, remotes, world, items, goldenBones, specials, treatBoxes, session, fireworks, shields } = this;
    const mine = id => id === this.myId;

    const playerRespawned = (data) => {
      if (!world.proceduralTrack && !data.rescued) return;
      if (mine(data.playerId)) local.respawned(data);
      else remotes.get(data.playerId)?.respawned(data);
    };

    const frisbeeEnded = ({ id, position }) => {
      items.removeFrisbee(id, position);
      session.update('frisbeesIncoming', list => list.filter(f => f !== id));
    };

    const fireworkEnded = id => session.update('fireworksIncoming', list => list.filter(f => f !== id));

    return {
      // ---------------------------------
      // OTHER PLAYERS
      // ---------------------------------

      playerMoved: (data) => {
        // (a dog in the middle of its special keeps the special's own clips)
        remotes.get(data.playerId)?.moved(data, specials.animating(data.playerId));
      },

      playerLeft: (data) => {
        const remote = remotes.get(data.playerId);
        if (!remote) return;

        this.stage.scene.remove(remote.group);
        specials.unregister(data.playerId);
        items.setHeld(data.playerId, null);
        shields.stop(data.playerId);
        remotes.delete(data.playerId);
      },

      // ---------------------------------
      // FALLS, RESCUES, THE CANNON AND THE BURROWS
      // ---------------------------------

      // Frostpeak: someone knocked down a slalom gate or a snowman (shared/slalom.js)
      slalomHit: (data) => {
        world.slalomWorld?.hit(data.index, data.downMs);
        if (mine(data.playerId)) local.slalomBump(data.kind);
      },

      playerFell: (data) => {
        if (!world.proceduralTrack || !mine(data.playerId)) return;
        local.fell(data);
      },

      playerRespawned,

      playerLaunched: (data) => {
        if (!world.launchTrack || !mine(data.playerId)) return;
        local.launched(data);
      },

      playerLanded: (data) => {
        if (!world.launchTrack) return;
        if (mine(data.playerId)) local.landed(data);
        else remotes.get(data.playerId)?.landed(data);
      },

      playerBurrowEntered: (data) => {
        if (data.kelp) this.kelp.burst(data.tunnel.entry);       // the seaweed that takes him
        if (data.spell) { this.puffs.burst(data.tunnel.entry, 1.3); this.frogs.release(data.playerId); }      // Merlin's shuffle: gone in a puff
        if (mine(data.playerId)) {
          // (one of Ralph's burrows, or Kombu's kelp, which says where it is itself)
          const tunnel = data.tunnel ?? BURROWS[this.mapId]?.find(t => t.id === data.tunnelId);
          this.burrowOverlay.textContent = data.spell ? 'HOCUS CROAKUS!' : data.kelp ? 'KELP DIVE' : 'BURROW BOOST';
          if (tunnel) local.enteredBurrow(tunnel);
        } else {
          remotes.get(data.playerId)?.hide();
        }
      },

      playerBurrowExited: (data) => {
        if (data.kelp) this.kelp.burst(data.position);            // up he comes
        if (data.spell) this.puffs.burst(data.position, 1.3);
        playerRespawned({ ...data, rescued: true, penaltySeconds: 0 });
        if (mine(data.playerId)) local.leftBurrow(data);
      },

      // ---------------------------------
      // PICKUPS
      // ---------------------------------

      treatBoxChanged: ({ id, visible }) => treatBoxes.setVisible(id, visible),

      // A golden bone on the road went: pop it here too.  If it was us and our game had not already
      // counted it (the server saw it first), boost now.
      goldenBoneTaken: ({ index, playerId }) => {
        const stillShowing = goldenBones.take(index);
        if (!mine(playerId)) { goldenBones.showBoost(playerId); return; }
        if (stillShowing) {
          goldenBones.startBoost();
          local.boneKick();
        }
      },

      goldenBoneRespawned: ({ index }) => goldenBones.respawn(index),

      // ---------------------------------
      // ITEMS
      // ---------------------------------

      // as: whose special it is, where it is not the dog's own (Merlin's: it shows that dog's picture)
      itemChanged: ({ playerId, item, as = null }) => {
        items.setHeld(playerId, item, as);
        if (mine(playerId)) { this.myItem = item; session.set({ heldItem: item, heldItemAs: as }); }
      },

      itemUsed: ({ playerId, item }) => {
        if (item !== 'bone') return;
        if (!mine(playerId)) { goldenBones.showBoost(playerId); return; }   // their golden trail
        goldenBones.startBoost();
        local.boneKick();
      },

      hazardPlaced: (data) => items.placeHazard(data),
      hazardRemoved: (data) => items.removeHazard(data.id, !!data.hitBy),
      ballThrown: (data) => items.throwBall(data),
      ballHit: (data) => items.removeBall(data.id, data.position),

      playerHit: ({ playerId, stunMs, by, item }) => {
        // landed on by Enzo: squashed flat for as long as it is knocked about
        if (item === 'special' && session.state.room?.players.find(p => p.id === by)?.dog === 'enzo') this.squashed.set(playerId, performance.now() + stunMs);
        if (!mine(playerId)) { goldenBones.stopBoost(playerId); return; }
        local.hit(stunMs);
      },

      // Red frisbee: the server flies it; we draw it, and warn the dog it is chasing
      frisbeeThrown: (data) => {
        items.throwFrisbee(data);
        if (mine(data.target)) session.update('frisbeesIncoming', list => [...list, data.id]);
      },

      frisbeesMoved: ({ frisbees }) => items.moveFrisbees(frisbees),

      // someone overtook the thrower: the frisbee is after a different dog now
      frisbeeTarget: ({ id, target }) => {
        session.update('frisbeesIncoming', list => (mine(target) ? [...new Set([...list, id])] : list.filter(f => f !== id)));
      },

      frisbeeHit: frisbeeEnded,
      frisbeeGone: frisbeeEnded,

      // Firework: the server flies it up the road to the dog in first place; we draw it, and warn that dog
      fireworkLaunched: (data) => {
        fireworks.launch(data);
        if (mine(data.target)) session.update('fireworksIncoming', list => [...list, data.id]);
      },

      fireworksMoved: (data) => fireworks.move(data.fireworks),

      // the lead changed while it was in the air: it is after the new leader now
      fireworkTarget: ({ id, target }) => {
        session.update('fireworksIncoming', list => (mine(target) ? [...new Set([...list, id])] : list.filter(f => f !== id)));
      },

      fireworkPassed: ({ position }) => fireworks.pass(position),
      fireworkExploded: ({ id, position }) => { fireworks.explode(id, position); fireworkEnded(id); },
      fireworkGone: ({ id, position }) => { fireworks.fizzle(id, position); fireworkEnded(id); },

      // Golden collar: a shield round the dog that put it on; anything that bounces off makes it flare
      shieldStarted: ({ playerId, durationMs }) => shields.start(playerId, durationMs),
      shieldEnded: ({ playerId }) => shields.stop(playerId),           // (Jazz's Earthquake shakes it off)
      hitBlocked: ({ playerId }) => shields.blocked(playerId),

      // ---------------------------------
      // SPECIAL ABILITIES: the server says when one starts, who it knocks over and when it ends
      // ---------------------------------

      // Rocky's Sheep Stampede: the server runs the flock; we draw it
      sheepReleased: ({ sheep }) => this.sheep.release(sheep),
      // Jazz has stomped: the ground shakes for everyone, and the dogs the server names can barely move
      earthquake: ({ playerId, position, slowed, secondsFor = {}, seconds, speed }) => {
        const avatarOf = id => (mine(id) ? local : remotes.get(id));
        const shaken = slowed.filter(avatarOf);
        this.quake.stomp({ position, avatar: avatarOf(playerId), slowed: shaken.map(avatarOf), slowedFor: shaken.map(id => secondsFor[id] ?? seconds), seconds });
        if (slowed.includes(this.myId)) local.shaken(secondsFor[this.myId] ?? seconds, speed);
      },
      // Merlin's spell has reached a dog: a puff, and (unless it missed) a frog for a few seconds
      hexed: ({ playerId, hit, seconds, speed }) => {
        const avatar = mine(playerId) ? local : remotes.get(playerId);
        if (!avatar) return;
        this.puffs.burst(avatar.group.position.toArray());
        if (!hit) return;
        this.frogs.frog(playerId, avatar, seconds);
        if (mine(playerId)) local.shaken(seconds, speed, 'RIBBIT! YOU’RE A FROG');
      },
      sheepMoved: ({ sheep }) => this.sheep.move(sheep),
      sheepGone: ({ id, position }) => this.sheep.gone(id, position),

      specialStarted: (data) => {
        specials.start(data.playerId, data);
        if (mine(data.playerId)) local.specialStarted(specials.physics(data.playerId));
      },

      specialHit: ({ playerId }) => specials.hit(playerId),
      specialEnded: ({ playerId, reason }) => specials.end(playerId, reason),
      pheasantLanded: ({ owner, playerId, hit }) => specials.pheasantLanded(owner, playerId, hit)
    };
  }

  // ---------------------------------
  // GAME LOOP
  // ---------------------------------

  // A firework or red frisbee after me, once it is close: a small picture on a ring round the dog, on the side
  // it is coming from as the camera sees it (Tom, 2026-11-24: smaller, only when it is near, the firework heading
  // towards you).  The nearest one counts.
  #warnIncoming(me) {
    const { fireworksIncoming, frisbeesIncoming } = this.session.state;
    let nearest = null;
    const consider = (position, icon, label, within) => {
      if (!position) return;
      const dx = position.x - me.x, dz = position.z - me.z, distance = Math.hypot(dx, dz);
      if (distance > within || (nearest && distance >= nearest.distance)) return;
      nearest = { dx, dz, distance, icon, label };
    };
    for (const id of fireworksIncoming) consider(this.fireworks.where(id), '/icons/items/firework.png', 'A firework is coming at you', INCOMING_WARN_M.firework);
    for (const id of frisbeesIncoming) consider(this.items.frisbeeAt(id), '/icons/items/frisbee.png', 'A red frisbee is coming at you', INCOMING_WARN_M.frisbee);
    if (!nearest) { this.hud.setIncoming(null); return; }
    this.stage.camera.getWorldDirection(INCOMING_LOOK);
    // (clockwise from straight up the screen: the camera's forward is up, its right is right)
    const ahead = INCOMING_LOOK.x * nearest.dx + INCOMING_LOOK.z * nearest.dz;
    const right = -INCOMING_LOOK.z * nearest.dx + INCOMING_LOOK.x * nearest.dz;
    this.hud.setIncoming({ icon: nearest.icon, label: nearest.label, angle: Math.atan2(right, ahead) });
  }

  #frame = () => {
    this.#animationId = requestAnimationFrame(this.#frame);

    const { session, socket, hud, world, local, remotes, goldenBones, specials } = this;
    const player = local.group;

    this.#timer.update();
    const delta = Math.min(this.#timer.getDelta(), 0.05);
    const seconds = performance.now() / 1000;
    const visibleRemotes = () => [...remotes.values()].filter(remote => remote.visible);

    // (the third number is the time since GO: the farm's tractor, animals and sails are placed by it,
    // exactly where the server has them)
    world.update(seconds, player.position,
      session.raceStart !== null ? (performance.now() - session.raceStart) / 1000 : 0,
      () => [player.position, ...visibleRemotes().map(remote => remote.position)]);
    this.treatBoxes.update(seconds);
    this.minimap.draw([
      { x: player.position.x, z: player.position.z, rotation: player.rotation.y, color: local.config.accent, me: true },
      ...visibleRemotes().map(remote => ({ x: remote.position.x, z: remote.position.z, color: remote.config.accent }))
    ]);
    const itemAnchors = new Map([[this.myId, local.bones.head ?? player]]);
    remotes.forEach((remote, id) => itemAnchors.set(id, remote.bones.head ?? remote.group));
    this.items.update(delta, itemAnchors, world.ballGround, world.proceduralTrack);
    this.fireworks.update(delta);
    this.#warnIncoming(player.position);
    this.kelp.update(delta);
    this.frogs.update(delta);
    this.puffs.update(delta);
    this.sheep.update(delta);
    this.shields.update(delta, id => (id === this.myId ? local : remotes.get(id)));
    local.spinIfStunned();
    // dogs Enzo has landed on: flat, then springing back up
    for (const [id, until] of this.squashed) {
      const group = id === this.myId ? local.group : remotes.get(id)?.group, left = until - performance.now();
      if (group) group.scale.set(left > 0 ? 1.25 : 1, left > 0 ? Math.max(0.3, 1 - left / 250) : 1, left > 0 ? 1.25 : 1);
      if (left <= 0) this.squashed.delete(id);
    }

    this.input.update();
    const canMove = session.raceGo && !session.raceFinished;

    // Golden Bones: running through one is the whole pickup, no button needed.  Your own boost starts
    // at once; the server tells everyone (you included) which bone went, so it vanishes for all.
    const otherDogs = new Map();
    remotes.forEach((remote, id) => otherDogs.set(id, remote.position));
    // (Ralph flying cannot take a Golden Bone: Tom, 2026-11-21.  He flies through it and leaves it for the others)
    if (goldenBones.update(delta, player.position, canMove && !local.carried && !specials.physics(local.id)?.flyHeight, otherDogs)) local.boneKick();

    // ---------------------------------
    // RACE TIMER
    // ---------------------------------

    if (session.raceStart !== null && !session.raceFinished) {
      const elapsed = (performance.now() - session.raceStart) / 1000;
      hud.setTimer(formatTime(elapsed));

      // "GO!" stays up for a second
      if (elapsed >= 1 && !this.#goBannerCleared) {
        this.#goBannerCleared = true;
        session.set({ racePhase: '' });
      }
    }

    // ---------------------------------
    // LOCK MOVEMENT BEFORE GO
    // ---------------------------------

    if (!canMove) {
      if (this.#wasRacing) this.input.clear();
      this.#wasRacing = false;

      local.hold(delta);
      remotes.forEach(remote => remote.mixer?.update(delta));
      this.stage.render();
      return;
    }

    this.#wasRacing = true;

    // (a phone: the same view through a longer lens, so the dogs are bigger)
    const zoom = phoneZoom();
    this.chaseCamera.easeFov(zoom === 1 ? local.fov : 2 * Math.atan(Math.tan(local.fov * Math.PI / 360) / zoom) * 180 / Math.PI, delta);
    local.update(delta);

    // ---------------------------------
    // NETWORK UPDATES
    // ---------------------------------

    this.#networkTimer += delta;
    if (this.#networkTimer >= NETWORK_INTERVAL) {
      this.#networkTimer = 0;
      socket.emit('playerMove', local.moveMessage);
    }

    // ---------------------------------
    // REMOTE PLAYER UPDATES
    // ---------------------------------

    remotes.forEach((remote, id) => {
      remote.update(delta, {
        swimmingAt: position => world.swimmingAt(position),
        playsOwnClips: specials.animating(id),
        runSpeed: local.runSpeed,
        sprintSpeed: local.sprintSpeed
      });
    });

    // Special abilities: their clips, effects and timing, for every dog (after the dogs have moved)
    specials.update(delta);
    // Jazz's stomp and what it does (after the dogs have been posed for this frame: it poses her itself)
    this.quake.update(delta);
    // The pug twins: the second dog and the rope (and, in their Trip Wire, out to the two edges of the road)
    for (const [avatar, speed] of [[local, local.currentSpeed], ...[...remotes.values()].map(remote => [remote, remote.speed])]) {
      if (!avatar.duo) continue;
      const rope = specials.physics(avatar.id)?.rope;
      let spread = null;
      if (rope) {
        const at = avatar.group.position, yaw = avatar.group.rotation.y, line = racingLineAt(this.mapId, at.x, at.z, avatar.roadS ?? null);
        if (line) {
          avatar.roadS = line.s;
          const across = (at.x - line.x) * Math.cos(yaw) - (at.z - line.z) * Math.sin(yaw), half = Math.max(1, line.halfWidth - rope.edge);
          spread = { left: half - across, right: -half - across };
        }
      }
      // (in a skid one twin rides the other: config.skid.stack)
      const stack = avatar.config.skid?.stack ? avatar.skid.slideWeight : 0;
      avatar.duo.update(delta, { speed, sprintSpeed: local.sprintSpeed, action: avatar.currentAction, spread, stack });
    }

    this.chaseCamera.reach = specials.physics(local.id)?.giant ? 1.6 : 1;         // (Nacho's Gigante Mode: back far enough to see all of him)
    this.chaseCamera.update(delta, Boolean(local.launchFlight));
    this.quake.shake(this.stage.camera);
    this.stage.render();
  };

  // ---------------------------------
  // CLEANUP
  // ---------------------------------

  dispose() {
    this.#disposed = true;
    cancelAnimationFrame(this.#animationId);

    for (const [event, handler] of Object.entries(this.#events)) this.socket.off(event, handler);

    this.world.dispose();
    this.burrowOverlay.remove();
    this.treatBoxes.dispose();
    this.items.dispose();
    this.fireworks.dispose();
    this.shields.dispose();
    this.burrowMouths.dispose();
    this.kelp.dispose();
    this.sheep.dispose();
    this.specials.dispose();
    this.quake.dispose();
    this.frogs.dispose();
    this.puffs.dispose();
    this.minimap.dispose();
    this.goldenBones.dispose();
    this.local.skid.dispose();
    for (const remote of this.remotes.values()) remote.skid.dispose();
    this.input.dispose();
    this.#timer.disconnect();
    this.stage.dispose();
  }
}
