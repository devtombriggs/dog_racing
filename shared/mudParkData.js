// Squelch Hollow Mud Run — a dirt-bike course in the pouring rain.  Built by shared/trackKit.js (see there for what each part
// means); the scenery is src/tracks/mudPark/MudParkTrack.js.
//
// Tom, 2026-11-21: "should be like a dirt bike racing, do loads of speed boosts with jumps, make this the kind of track where a
// jump goes over another part of the track where people can go under, basically like lots of twists".  So the lap is a figure
// of eight: the dogs run through the middle at ground level, go all the way round the east loop and up Welly Hill, and the ramp
// at the top of it fires them back over the middle, over the heads of the dogs running underneath.  Kickers (boost pads with a
// ramp: up into the air, steering all the way) and boost pads all the way round.  Everything is wet, so a dog slides a little
// everywhere, and a lot on the clay and the mudslide.
//
// Round the lap:
//   A  The Paddock          start/finish on wet grass, and through the middle, under the jump
//   B  The Slip 'n' Slide   S-bends of wet clay, kickers between them: a dog goes where it was going, not where it points
//   C  Bog Hollow           deep mud that drags a dog down to a plod, a firm line between the patches, and the marshal's quad
//                           bike sliding across the track and back
//   D  Log Roll             logs come rolling down the bank and across (jump them), then stacks of tyres to weave through
//   E  Welly Hill           the climb, boost pads up it, to the ramp at the top: the big jump, back over the middle
//   F  The Mudslide         all the way down the west loop, fast and with no grip to speak of, kickers on it
//   H  The Mud Pit          wade through it, and home
import { makeTrack } from './trackKit.js';

const BOG_SPEED = 0.55;                 // share of top speed in the deep mud
const SLIDE_SPEED = 1.35;               // share of top speed down the mudslide
// How slippery it is, 0 (dry road) to 1 (wet clay): the wetter, the more a dog carries on the way it was going when it turns,
// and the slower it picks up speed
const SLIP = { everywhere: 0.25, clay: 1, slide: 0.85 };
const PAD = { speed: 1.4, hold: 1.4 };                       // a boost pad
const KICKER = { speed: 1.35, hold: 1.2, hop: 8.6 };         // a kicker: a boost pad with a ramp that throws the dog up `hop` m/s
const QUAD = { period: 9, pause: 0.08, radius: 1.5, reach: 22 };
const LOGS = { period: 6, roll: 4, from: 22, to: -16, radius: 0.75 };

// [x, z, height, width, section, name?]: a figure of eight about (0, 0), where the lap crosses itself
const ROUTE = [
  [-156, -74, 0, 16, 'A'], [-110, -68, 0, 16, 'A'], [-74, -38, 0, 15, 'A'], [-40, -30, 0, 15, 'A'],
  [0, 0, 0, 15, 'A', 'under'],                                   // through the middle, at ground level: under the jump
  [46, 44, 0.3, 14, 'B'], [96, 84, 0.5, 14, 'B', 'clay'], [150, 66, 1, 14, 'B'], [190, 104, 1, 14, 'B'], [234, 74, 1.5, 14, 'B', 'clayEnd'],
  [258, 14, 2, 16, 'C', 'bog'], [246, -46, 2, 16, 'C', 'quad'],
  [204, -92, 2, 14, 'D', 'logs'], [150, -80, 2.5, 14, 'D'], [110, -112, 3, 14, 'D', 'tyres'], [72, -92, 4, 13, 'D'],
  [48, -58, 6.5, 12, 'E', 'hill'], [24, -24, 8.5, 12, 'E', 'ramp'],
  // (the jump: from just past the ramp to the landing, over the middle)
  [-42, 42, 7, 12, 'F', 'slide'], [-84, 94, 5, 11, 'F'], [-132, 78, 4, 11, 'F'], [-174, 110, 2, 11, 'F'], [-216, 64, 1, 12, 'F'],
  [-226, 4, 0, 15, 'H', 'pit'], [-204, -54, 0, 15, 'H'],
];
const AT = Object.fromEntries(ROUTE.map((p, k) => [p[5], k]).filter(([name]) => name));

const base = makeTrack({
  id: 'mud_park', name: 'Squelch Hollow Mud Run', crosses: true,
  controlPoints: ROUTE.map(([x, z, height, width, section]) => [x, z, height, width, section]),
  heightSmoothing: 3,
  sections: {
    A: { name: 'The Paddock', surface: 'wet grass' }, B: { name: 'The Slip ’n’ Slide', surface: 'wet clay' }, C: { name: 'Bog Hollow', surface: 'mud' },
    D: { name: 'Log Roll', surface: 'mud' }, E: { name: 'Welly Hill', surface: 'mud' }, F: { name: 'The Mudslide', surface: 'slide' }, H: { name: 'The Mud Pit', surface: 'mud' },
  },
  rules: { slip: { grip: 0.2, acceleration: 0.6 } },          // what the wet does to a dog: at slippery = 1 it keeps this share of its grip and of its acceleration
}, ({ sAtU, pointAt, pingPong, launchBetween, within }) => {
  // the big jump: off the ramp at the top of Welly Hill, over the middle (where the dogs run underneath), down on the mudslide
  const launch = launchBetween(AT.ramp + 0.2, AT.slide - 0.05, { duration: 1.9, arcHeight: 7, exitSpeedMultiplier: 1.3, boostSeconds: 1.25, pad: 22, landing: 10 });
  const clay = { sStart: sAtU(AT.clay - 0.3), sEnd: sAtU(AT.clayEnd) };
  const slide = { sStart: launch.landingS + 4, sEnd: sAtU(AT.pit - 0.3) };
  const slipAt = s => (within(s, clay) ? SLIP.clay : within(s, slide) ? SLIP.slide : SLIP.everywhere);
  // the bog: deep mud patches from side to side, a firm line between them
  const patches = [];
  const bogS = sAtU(AT.bog - 0.1);
  for (let k = 0; k < 5; k++) { const s = bogS + k * 15, hw = pointAt(s).halfWidth; patches.push({ id: `bog-${k}`, kind: 'bog', s, lateral: (k % 2 ? -1 : 1) * hw * 0.45, along: 6, across: hw * 0.5, speed: BOG_SPEED, slowName: 'DEEP MUD — SLOW GOING' }); }
  // stacks of tyres to weave through
  const obstacles = [];
  const tyresS = sAtU(AT.tyres - 0.2);
  for (let k = 0; k < 5; k++) { const s = tyresS + k * 12.5; obstacles.push({ id: `tyres-${k}`, kind: 'tyres', s, lateral: (k % 2 ? 1 : -1) * pointAt(s).halfWidth * 0.42, radius: 1.15 }); }
  // the mud pit: wade it
  const pit = { sStart: sAtU(AT.pit - 0.2), sEnd: sAtU(AT.pit + 0.6), depth: 0.45, ramp: 6 };
  // boost pads and kickers all the way round (none on the run up to the ramp, in the air, in the bog, among the tyres or in the pit)
  const strips = [];
  const strip = (s, kind, long = kind === KICKER ? 5 : 12) => strips.push({ id: `${kind === KICKER ? 'kicker' : 'pad'}-${strips.length}`, sStart: s, sEnd: s + long, ...kind });
  strip(sAtU(1.4), PAD); strip(sAtU(AT.under + 0.45), KICKER);
  for (const u of [AT.clay + 0.5, AT.clay + 1.5, AT.clay + 2.5]) strip(sAtU(u), KICKER);
  strip(sAtU(AT.quad + 0.55), PAD); strip(sAtU(AT.logs + 0.55), KICKER);
  strip(sAtU(AT.hill - 0.6), PAD); strip(sAtU(AT.hill - 0.1), PAD);
  strip(launch.landingS + 8, PAD);
  for (const u of [AT.slide + 1.4, AT.slide + 2.5]) strip(sAtU(u), KICKER);
  strip(sAtU(AT.pit + 1.4), PAD);

  const quadS = sAtU(AT.quad + 0.05), logsS = [0, 20, 40].map(d => sAtU(AT.logs - 0.05) + d);
  function hazardsAt(t) {
    const out = [];
    // the quad bike, sliding across the track and back
    {
      const m = pingPong(t, QUAD.period, QUAD.pause), lat = -QUAD.reach + 2 * QUAD.reach * m.k, c = pointAt(quadS, lat);
      out.push({ id: 'quad', kind: 'quad', x: c.x, y: c.y, z: c.z, rotationY: Math.atan2(c.nx, c.nz) + (m.dir > 0 ? 0 : Math.PI) + 0.25 * Math.sin(t * 3), radius: QUAD.radius, height: 9, active: true });
    }
    // the logs rolling down the bank and across, one after another
    logsS.forEach((s, k) => {
      const ph = (((t + k * LOGS.period / 3) % LOGS.period) + LOGS.period) % LOGS.period, rolling = ph < LOGS.roll;
      const lat = LOGS.from + (LOGS.to - LOGS.from) * (rolling ? ph / LOGS.roll : 0), c = pointAt(s, lat);
      out.push({ id: `log-${k}`, kind: 'log', x: c.x, y: c.y, z: c.z, rotationY: c.rotationY, radius: LOGS.radius, height: 1.0, active: rolling,
        spin: -lat / LOGS.radius, fade: rolling ? Math.min(1, ph * 3, (LOGS.roll - ph) * 3) : 0 });
    });
    return out;
  }
  return {
    launch, patches, obstacles, strips, water: [pit], slipAt, hazardsAt, autoPickups: { rowEvery: 220, boneEvery: 100 },
    keepClear: [[slide.sStart - 4, slide.sEnd], [bogS - 14, bogS + 4 * 15 + 12], [quadS - 20, quadS + 16], [logsS[0] - 18, logsS.at(-1) + 14], [tyresS - 16, tyresS + 5 * 12.5 + 10], ...strips.filter(each => each.hop).map(each => [each.sStart - 6, each.sEnd + 14])],
    extras: { clay, slide, pit, quadLane: { s: quadS }, logLanes: logsS, logRun: LOGS, hazardZones: { quad: quadS, logs: logsS }, under: sAtU(AT.under) },
  };
});

// the mudslide: faster than anything but the jump (the kit's own speed, and then this)
const within = (s, zone) => base.along(s, zone.sStart) >= 0 && base.along(s, zone.sEnd) <= 0;
export const MUD_PARK = {
  ...base,
  query(x, z, hint = -1, y = null) {
    const q = base.query(x, z, hint, y);
    if (within(q.s, base.slide)) { q.slide = true; if (!q.kick) q.surface = 'slide'; }
    return q;
  },
  speedFactor(q, stats = {}, airborne = false) {
    if (q.slide && !airborne) return SLIDE_SPEED * (q.boost || 1);
    return base.speedFactor(q, stats, airborne);
  },
};
export default MUD_PARK;
