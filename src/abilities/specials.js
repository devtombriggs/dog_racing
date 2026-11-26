// Special abilities in the race, as the players see them: each dog's own move (shared/specials.js).
// The server says when one starts, who it hits and when it ends; this plays the dog's special clips,
// runs the effect (fire, whirl, pheasants, wave, sled team) and tells the game what the move does to
// the dog using it.  It serves every dog in the race, your own and the others, the same way.
//
//   const specials = createSpecials({ scene, resolve });      // resolve(playerId) -> that dog's Object3D (for Pippa's birds)
//   specials.register(playerId, { dogId, group, model, mixer, animations, getAction, setAction, own });   // once its model has loaded (own: this player's own dog)
//   specials.start(playerId, { kind, durationMs, targets });  // 'specialStarted' from the server
//   specials.hit(playerId);                                   // 'specialHit': it has just knocked a dog over
//   specials.pheasantLanded(ownerId, victimId, hit);          // 'pheasantLanded'
//   specials.end(playerId, reason);                           // 'specialEnded': 'done' winds down, anything else stops dead
//   each frame: specials.update(delta);                       // after the dogs have been moved and their mixers updated
//   specials.physics(playerId)    -> the special's rules while it is in force (speed, flyHeight, steerLocked), else null
//   specials.animating(playerId)  -> true while a special clip is playing on that dog: leave its animation alone
//   specials.busy(playerId)       -> true from the start until the dog is back to normal
//   specials.unregister(playerId);   specials.dispose();
//
// group: the Object3D that is moved round the track (the dog's feet, facing +Z); model: the loaded dog
// inside it.  getAction/setAction: the game's "current animation action" for that dog, so that a special
// clip cross-fades out of the stride and the stride cross-fades back in afterwards.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SPECIALS, bellyBounce } from '../../shared/specials.js';
import { createJetPaws } from './jetpack.js';
import { createZoomiesWhirl } from './zoomies.js';
import { createPheasantFlock } from './pheasants.js';
import { createSurfWave } from './wave.js';
import { createRugbyKit } from './rugby.js';
import { createDragon } from './dragon.js';
import { createLightning, createEarCopter } from './shopDogs.js';

const FILES = {
  second_dog: { clips: '/models/specials/meela_zoomies_clips.glb' },
  gsp: { clips: '/models/specials/pippa_flush_clips.glb', bird: '/models/specials/pheasant.glb' },
  black_lab: { clips: '/models/specials/poppy_wave_clips.glb' },
  pablo: { team: '/models/specials/pablo_sled_ability.glb' },
};
// Where each dog's special clips are when another dog uses its special (Merlin, who is given any dog's: shared/specials.js
// `borrows`).  Some are in the dog's own model.  Only the turning of each bone is taken from them: every dog has the same
// bones, but not the same build, and a clip's own lengths would pull the borrower into the other dog's shape.
const BORROWED = {
  ralph: ['/models/ralph.glb'], barney: ['/models/ralph.glb'], enzo: ['/models/enzo.glb'], casper: ['/models/casper.glb'],
  second_dog: [FILES.second_dog.clips], gsp: [FILES.gsp.clips], black_lab: [FILES.black_lab.clips],
};
const SPECIAL_CLIP = /^(JetFly|BellyFlop|RugbyRun|Zoomies|Wave|PheasantFlush)/;
const turnsOnly = clip => new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter(track => track.name.endsWith('.quaternion')));
const GIANT = { grow: 0.45, shrink: 0.35 };                 // Nacho's Gigante Mode: seconds to grow, and to shrink again
const SLED = { summon: 1.6, ram: 0.8, dismiss: 1.2 };      // special_abilities/pablo_sled_clip_info.json
const ZOOMIES = { windup: 0.6, whirlFrom: 0.42, hit: 2 / 3, end: 1.5, endRate: 1.5 };
const WAVE = { flop: 0.8, waveFrom: 0.4, hit: 0.8, end: 1.6, endRate: 1.6 };
const RUGBY = { runRate: 2.2, dive: 0.5, diveRate: 1.6, spin: 1.2 };     // ...and spin: seconds of the slow turn he starts with, to show off the shirt and ball     // how fast his upright run is played; the dive back to all fours is the leap of his Jump clip
const FLASH = { rate: 1.7 };                                // Ziggy's Lightning Run: how much faster her sprint is played
const HEX_SPIN = 0.9;                                       // Merlin's flourish: seconds of one quick turn on the spot as he casts
const FLUSH = { birdsAt: 0.3 };                             // of the cue clip: the first bark

export function createSpecials({ scene, resolve }) {
  const loader = new GLTFLoader();
  const cache = new Map();
  const entries = new Map();
  let disposed = false;

  const load = url => {
    if (!cache.has(url)) cache.set(url, loader.loadAsync(url).catch(err => { console.warn(`[Specials] ${url} failed to load:`, err); return null; }));
    return cache.get(url);
  };

  // play a clip on the dog itself, taking over from (and handing back to) the game's own animation
  function playClip(e, name, { loop = false, fade = 0.12, rate = 1 } = {}) {
    const clip = e.clips[name];
    if (!clip) return false;
    const next = e.mixer.clipAction(clip), current = e.getAction();
    if (current && current !== next) { if (fade > 0) current.fadeOut(fade); else current.stop(); }
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = rate;
    if (fade > 0 && current !== next) next.fadeIn(fade);
    next.play();
    e.setAction(next);
    e.override = true;
    return true;
  }

  function release(e) {
    if (e.state?.kind === 'bounce' && e.model) e.model.rotation.x = 0;      // (level again)
    if (e.state?.kind === 'rugby') { e.rugby?.off(); if (e.model) e.model.rotation.y = 0; }      // Casper's shirt comes off (the ball has gone)
    if (e.state?.kind === 'dragon') { e.dragon?.hide(); if (e.model) e.model.visible = true; }      // Jimmy is himself again
    if (e.state?.kind === 'hex' && e.model) e.model.rotation.y = 0;
    if (e.state?.kind === 'giant' && e.model) e.model.scale.setScalar(e.size);
    if (e.own) e.spec = e.own;               // (Merlin: his own again)
    e.lightning?.setActive(false); e.copter?.setActive(false);
    e.override = false;
    e.state = null;
  }

  // Pablo's team: his two friends, the sled and a Pablo riding it, in place of the dog itself
  function showTeam(e) {
    if (e.team || !e.teamGltf) return;
    const team = cloneSkinned(e.teamGltf.scene);
    team.scale.setScalar(e.model.scale.x);
    team.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
    e.group.add(team);
    e.team = team;
    e.teamMixer = new THREE.AnimationMixer(team);
    e.teamActions = Object.fromEntries(e.teamGltf.animations.map(c => [c.name, e.teamMixer.clipAction(c)]));
    e.model.visible = false;
  }
  function teamClip(e, name, loop) {
    if (!e.teamActions?.[name]) return;
    for (const a of Object.values(e.teamActions)) a.stop();
    const a = e.teamActions[name];
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.play();
  }
  function hideTeam(e) {
    if (!e.team) return;
    e.teamMixer.stopAllAction(); e.teamMixer.uncacheRoot(e.team);
    e.team.removeFromParent();
    e.team = e.teamMixer = e.teamActions = null;
    e.model.visible = true;
  }

  function stopEffects(e) {
    e.jets?.setActive(false);
    e.whirl?.setActive(false);
    e.wave?.setActive(false);
    e.lightning?.setActive(false);
    e.copter?.setActive(false);
  }

  return {
    register(id, { dogId, group, model, mixer, animations = [], getAction, setAction, own = false }) {
      const spec = SPECIALS[dogId];
      if (!spec) return;
      const e = { id, dogId, spec, group, model, mixer, getAction, setAction, own, dragon: null, rugby: null, lightning: null, copter: null, clips: Object.fromEntries(animations.map(c => [c.name, c])),
        state: null, override: false, jets: null, whirl: null, wave: null, flock: null, team: null, teamGltf: null, birdGltf: null };
      entries.set(id, e);
      e.own = spec; e.size = model?.scale.x ?? 1;
      // (a dog that is given other dogs' specials: their clips, their birds and their team, ready before they are wanted)
      if (spec.borrows) {
        for (const urls of Object.values(BORROWED)) for (const url of urls) load(url).then(g => { if (g && entries.get(id) === e) for (const c of g.animations) if (SPECIAL_CLIP.test(c.name) && !e.clips[c.name]) e.clips[c.name] = turnsOnly(c); });
        load(FILES.gsp.bird).then(g => { if (g && entries.get(id) === e) e.birdGltf = g; });
        load(FILES.pablo.team).then(g => { if (g && entries.get(id) === e) e.teamGltf = g; });
      }
      const files = FILES[dogId] ?? {};
      if (files.clips) load(files.clips).then(g => { if (g && entries.get(id) === e) for (const c of g.animations) e.clips[c.name] = c; });
      if (files.bird) load(files.bird).then(g => { if (g && entries.get(id) === e) e.birdGltf = g; });
      if (files.team) load(files.team).then(g => { if (g && entries.get(id) === e) e.teamGltf = g; });
      if (spec.kind === 'rugby' && model) e.rugby = createRugbyKit({ scene, model, shirt: dogId === 'casper' });     // (straight away: it hides the back of his shirt until he needs it)
    },

    unregister(id) {
      const e = entries.get(id);
      if (!e) return;
      hideTeam(e);
      if (e.state) release(e);
      e.jets?.dispose(); e.whirl?.dispose(); e.wave?.dispose(); e.flock?.dispose(); e.dragon?.dispose(); e.rugby?.dispose(); e.lightning?.dispose(); e.copter?.dispose();
      entries.delete(id);
    },

    // as: the dog whose special this is, where it is not the dog's own (Merlin)
    start(id, { kind, durationMs, targets = [], as = null } = {}) {
      const e = entries.get(id);
      if (!e) return;
      if (e.state) { stopEffects(e); hideTeam(e); release(e); }
      e.spec = (as && SPECIALS[as]) || e.own;
      if (e.spec.kind !== kind) { e.spec = e.own; return; }
      e.state = { kind, t: 0, phase: 'start', active: true, duration: durationMs / 1000, hitLeft: 0, targets, birdsOut: false };
      if (kind === 'jet' && e.spec.look === 'ears') {
        // Barney: his ears are the rotors (no rocket paws); he flies in the pose Ralph does
        e.copter ??= createEarCopter({ model: e.model });
        e.copter.setActive(true);
        playClip(e, 'JetFly', { loop: true, fade: 0.2 });
      } else if (kind === 'flash') {
        // Ziggy: her own sprint, played much faster, with lightning behind her
        e.lightning ??= createLightning({ scene });
        e.lightning.setActive(true);
        playClip(e, 'Sprint', { loop: true, fade: 0.1, rate: FLASH.rate });
      } else if (kind === 'giant') {
        // Nacho: he grows (update), and runs on in his own strides
        e.state.grown = 1;
      } else if (kind === 'hex') {
        // Merlin: nothing happens to him but the flourish (a turn on the spot, in update); the server does the rest
        e.state.spun = false;
      } else if (kind === 'jet') {
        e.jets ??= createJetPaws({ dog: e.model, size: 1 });
        e.jets.setActive(true);
        playClip(e, 'JetFly', { loop: true, fade: 0.2 });
      } else if (kind === 'sled') {
        showTeam(e);
        teamClip(e, 'SledSummon', false);
      } else if (kind === 'zoomies') {
        e.whirl ??= createZoomiesWhirl({ dog: e.group, size: 1 });
        playClip(e, 'ZoomiesWindup', { fade: 0.1 });
      } else if (kind === 'wave') {
        e.wave ??= createSurfWave({ dog: e.group, size: 1 });
        playClip(e, 'WaveFlop', { fade: 0.1 });
      } else if (kind === 'bounce') {
        // Enzo: flat out with all four legs spread, for as long as he bounces (the clip is in his own model)
        playClip(e, 'BellyFlop', { loop: true, fade: 0.15 });
      } else if (kind === 'rugby') {
        // Casper: shirt on, ball in his paws, up on his back legs and away
        e.rugby ??= createRugbyKit({ scene, model: e.model, shirt: e.dogId === 'casper' });
        e.rugby.on();
        playClip(e, 'RugbyRun', { loop: true, fade: 0.15, rate: RUGBY.runRate });
      } else if (kind === 'dragon') {
        // Jimmy: the dragon in his place (his strides carry on underneath, unseen)
        e.dragon ??= createDragon({ scene });
        e.dragon.show(e.group);
        if (e.model) e.model.visible = false;
      } else if (kind === 'flush') {
        // her bark, over whichever stride she is in
        const stride = e.getAction()?.getClip().name === 'Run' ? 'PheasantFlushRun' : 'PheasantFlushSprint';
        e.state.cue = playClip(e, stride, { fade: 0.1 }) ? e.clips[stride].duration : 0.8;
      }
    },

    hit(id) {
      const e = entries.get(id), s = e?.state;
      if (!s?.active) return;
      if (s.kind === 'sled' && s.phase === 'boost') { teamClip(e, 'SledRam', false); s.phase = 'ram'; s.hitLeft = SLED.ram; }
      if (s.kind === 'zoomies' && s.phase === 'spin') { playClip(e, 'ZoomiesHit', { fade: 0.06 }); e.whirl.burst(); s.phase = 'hit'; s.hitLeft = ZOOMIES.hit; }
      if (s.kind === 'wave' && s.phase === 'surf') { playClip(e, 'WaveHit', { fade: 0.06 }); e.wave.burst(); s.phase = 'hit'; s.hitLeft = WAVE.hit; }
    },

    pheasantLanded(ownerId, victimId, hit) {
      entries.get(ownerId)?.flock?.strike(victimId, hit);
    },

    end(id, reason) {
      const e = entries.get(id), s = e?.state;
      if (!s || s.phase === 'end') return;
      if (s.kind === 'flush') return;                          // her cue plays out by itself; the birds are already away
      s.active = false;
      stopEffects(e);
      if (reason !== 'done') { hideTeam(e); release(e); return; }   // knocked over, fell, rescued: straight back to normal
      s.phase = 'end'; s.t = 0;
      if (s.kind === 'jet') release(e);                        // he drops out of the air in his flying pose and lands in stride
      else if (s.kind === 'sled') { teamClip(e, 'SledDismiss', false); s.endFor = SLED.dismiss; }
      else if (s.kind === 'zoomies') { s.endFor = playClip(e, 'ZoomiesEnd', { fade: 0.06, rate: ZOOMIES.endRate }) ? ZOOMIES.end / ZOOMIES.endRate : 0; }
      else if (s.kind === 'rugby') { e.rugby?.pass(); s.endFor = playClip(e, 'Jump', { fade: 0.1, rate: RUGBY.diveRate }) ? RUGBY.dive : 0; }      // the ball is away (the server flies it), and he dives back on to all fours
      else if (s.kind === 'giant') s.endFor = GIANT.shrink;
      else if (s.kind === 'wave') { s.endFor = playClip(e, 'WaveEnd', { fade: 0.06, rate: WAVE.endRate }) ? WAVE.end / WAVE.endRate : 0; }
    },

    update(delta) {
      for (const e of entries.values()) {
        const s = e.state;
        if (s) {
          s.t += delta;
          if (s.phase === 'end') {
            if (s.kind === 'giant' && e.model) e.model.scale.setScalar(e.size * (1 + (s.grown - 1) * Math.max(0, 1 - s.t / GIANT.shrink)));
            if (s.t >= (s.endFor ?? 0)) { hideTeam(e); release(e); }
          } else if (s.kind === 'sled') {
            if (!e.team && e.teamGltf) { showTeam(e); teamClip(e, 'SledBoost', true); s.phase = 'boost'; }   // the team loaded late
            if (s.phase === 'start' && s.t >= SLED.summon) { teamClip(e, 'SledBoost', true); s.phase = 'boost'; }
            if (s.phase === 'ram' && (s.hitLeft -= delta) <= 0) { teamClip(e, 'SledBoost', true); s.phase = 'boost'; }
          } else if (s.kind === 'zoomies') {
            if (s.t >= ZOOMIES.whirlFrom) e.whirl.setActive(true);
            if (s.phase === 'start' && s.t >= ZOOMIES.windup) { playClip(e, 'ZoomiesSpin', { loop: true, fade: 0 }); s.phase = 'spin'; }
            if (s.phase === 'hit' && (s.hitLeft -= delta) <= 0) { playClip(e, 'ZoomiesSpin', { loop: true, fade: 0 }); s.phase = 'spin'; }
          } else if (s.kind === 'wave') {
            if (s.t >= WAVE.waveFrom) e.wave.setActive(true);
            if (s.phase === 'start' && s.t >= WAVE.flop) { playClip(e, 'WaveSurf', { loop: true, fade: 0 }); s.phase = 'surf'; }
            if (s.phase === 'hit' && (s.hitLeft -= delta) <= 0) { playClip(e, 'WaveSurf', { loop: true, fade: 0 }); s.phase = 'surf'; }
          } else if (s.kind === 'bounce') {
            // Enzo: nose up on the way up, belly first on the way down (for everyone watching, not only his own player)
            if (e.model) e.model.rotation.x = -0.5 * Math.cos(bellyBounce(e.spec, s.t).phase * Math.PI);
          } else if (s.kind === 'rugby') {
            // one slow turn as he sets off, so everyone sees the shirt, the 7 on his back and the ball
            if (e.model && !s.spun) {
              const k = Math.min(1, s.t / RUGBY.spin);
              e.model.rotation.y = k < 1 ? Math.PI * 2 * (k * k * (3 - 2 * k)) : 0;
              s.spun = k >= 1;
            }
          } else if (s.kind === 'giant') {
            // up to full size in a moment, a little bounce as he gets there; and down again when it ends (below)
            const k = Math.min(1, s.t / GIANT.grow), over = 1 + 0.12 * Math.sin(Math.PI * k) * (k < 1 ? 1 : 0);
            s.grown = (1 + (e.spec.giant - 1) * k * k * (3 - 2 * k)) * over;
            if (e.model) e.model.scale.setScalar(e.size * s.grown);
          } else if (s.kind === 'hex') {
            if (e.model && !s.spun) {
              const k = Math.min(1, s.t / HEX_SPIN);
              e.model.rotation.y = k < 1 ? Math.PI * 2 * (k * k * (3 - 2 * k)) : 0;
              s.spun = k >= 1;
            }
            if (s.t >= s.duration) release(e);
          } else if (s.kind === 'dragon') {
            if (e.model) e.model.visible = false;
          } else if (s.kind === 'flush') {
            if (!s.birdsOut && s.t >= s.cue * FLUSH.birdsAt && e.birdGltf) {
              s.birdsOut = true;
              e.flock ??= createPheasantFlock({ scene, gltf: e.birdGltf, size: 1 });
              const launched = s.t;
              e.flock.launch({
                from: e.group,
                targets: s.targets.map(t => ({ id: t.id, object: resolve(t.id), arriveIn: Math.max(0.3, t.flightMs / 1000 - launched) }))
                  .filter(t => t.object),
              });
            }
            if (s.t >= s.cue) release(e);
          }
        }
        e.jets?.update(delta);            // kept running after they stop, so sparks, dust and spray finish falling
        e.whirl?.update(delta);
        e.wave?.update(delta);
        e.flock?.update(delta);
        e.teamMixer?.update(delta);
        e.dragon?.update(delta, e.group);
        e.lightning?.update(delta, e.group);
        e.copter?.update(delta);
        e.rugby?.update(e.group);
      }
    },

    physics(id) {
      const s = entries.get(id)?.state;
      return s?.active && s.kind !== 'flush' && s.kind !== 'hex' ? entries.get(id).spec : null;
    },
    animating(id) { return entries.get(id)?.override ?? false; },
    busy(id) { return Boolean(entries.get(id)?.state); },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of [...entries.keys()]) this.unregister(id);
      cache.clear();
    },
  };
}
