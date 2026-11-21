// Monkey Jungle — a lap through the rainforest, back and forth across a river gorge four times and never
// the same way twice: a swaying rope bridge, a row of vine swings to jump along, a fallen log, and
// another rope bridge.  None of them has a side to it.  Between them: monkeys scampering across the
// trail, the ruined temple with stone balls rolling out of it, a grove where the monkeys throw coconuts,
// the stair that winds up round the great kapok tree (run off the end of it), and snakes going round and
// round in the trail.  Built by shared/trackKit.js; the scenery is src/tracks/jungle/JungleTrack.js.
//
// Round the lap:
//   A  Base Camp          start/finish
//   B  Monkey Trail       a snake, then monkeys scampering across (jump them)
//   C  The Rope Bridge    planks over the gorge, swaying, and no ropes to hold you on: step off the side and you start it again
//   D  The Lost Temple    up the ramp, with stone balls rolling down it at you: nothing jumps one, keep out of its lane
//   E  The Swings         no bridge: four planks hung on vines, swinging from side to side.  Jump from one to the next
//   F  Coconut Grove      the monkeys in the trees throw coconuts: keep off the shadows
//   G  The Tree Stair     round and up the kapok tree, three quarters of a circle and 14 m, and off the end of it
//   K  The Fallen Log     a tree trunk across the gorge: it does not move, and it is not wide
//   H  The Fig Tree       round the giant fig
//   I  The Old Bridge     the second rope bridge: narrower, and it sways more
//   J  The Long Way Home  the lily pond (wade it), three more snakes, and back to camp
import { makeTrack } from './trackKit.js';

const K = 0.85;                                       // the plan below is drawn a little large
const PLATEAU = 16, GORGE = { depth: 15, wide: 21 };  // the forest floor is 16 m up; the river is at the bottom of a gorge down the line x = 0
/** the forest floor at (x, z) with no gorge in it: what the trail's own height is taken from */
export const junglePlateau = (x, z) => PLATEAU + 2.2 * Math.sin(x / 58 + 1) * Math.cos(z / 49) + 1.2 * Math.sin((x + z) / 31);
/** how high the ground is at (x, z), before the trail is laid on it */
export const jungleHill = (x, z) => junglePlateau(x, z) - GORGE.depth * Math.exp(-((x + 6 * Math.sin(z / 60)) ** 2) / (2 * GORGE.wide * GORGE.wide));
export const RIVER_Y = PLATEAU - GORGE.depth + 2.2;

// a snake goes round and round a circle in the trail, head first: jump it, or go through behind its tail
const SNAKE = { circle: 4.0, period: 4.6, links: 9, apart: 0.95, radius: 0.55, height: 0.8 };
const STAIR = { rise: 14, width: 12 };
const MONKEY = { period: 6.5, pause: 0.07, radius: 0.8 };
const BALL = { period: 13.5, roll: 9, radius: 1.7, lanes: [-3.6, 0, 3.6] };
const COCONUT = { period: 4.6, warn: 1.5, hit: 0.4, radius: 1.5 };
const BRIDGE = { length: 60, half: 2.7, reach: 0.9, period: 6 };
const OLD_BRIDGE = { length: 60, half: 2.2, reach: 1.5, period: 5 };
const SWING = { gap: 5, pad: 13, pads: 4, half: 3.0, reach: 3.4, period: 7.5, step: 0.1 };
const LOG = { length: 60, half: 2.1, reach: 0, period: 6 };
// Off a bridge, the swings or the log (Tom, 2026-11-21: "if you fall from the moving bridges you land on another level not
// die"): into the river at the bottom of the gorge.  Wade along the river bed under the bridge (slow, unless you swim well),
// and a vine lift at the far bank hauls you back up to the trail.  `wade`: how deep the water is over the bed
const RIVER_BED = { y: RIVER_Y - 0.4, wade: 0.45, run: 10, after: 4 };          // (after: the lift starts just under the far end of the crossing)
const VINE_LIFT = { duration: 2.4, landing: 16, exitSpeedMultiplier: 1.1, boostSeconds: 0.8 };

const at = (x, z, width, section, lift = 0) => [x * K, z * K, junglePlateau(x * K, z * K) + lift, width, section];
const level = (x, z, width, section) => [x * K, z * K, PLATEAU, width, section];        // (a bridge is level from end to end)
// The Tree Stair, in metres: in along the foot of it, sharp left, three quarters of the way round the tree climbing all
// the way, sharp left again at the top, and off the end: [x, z, share of the climb done]
const STAIR_FOOT = [-176, 78], STAIR_LINE = [[-166, 78, 0], [-154.7, 73.3, 0.07], [-150, 62, 0.14], [-154.7, 50.7, 0.21], [-163.2, 34.8, 0.3], [-161.4, 16.9, 0.4], [-150, 3, 0.5], [-132.8, -2.2, 0.6], [-115.5, 3, 0.7], [-104.1, 16.9, 0.8], [-102.4, 34.8, 0.9], [-110.8, 50.7, 1], [-115.5, 62, 1], [-110.8, 73.3, 1], [-99.5, 78, 1], [-91.5, 78, 1]];
export const STAIR_TREE = [-132.8, 28.8];              // the middle of the tree it goes round
const stairBase = junglePlateau(...STAIR_FOOT);
const POINTS = [
  at(-270, -290, 15, 'A'), at(-200, -300, 15, 'A'),
  at(-130, -285, 14, 'B'), at(-85, -250, 14, 'B'),
  level(-45, -240, 12, 'C'), level(0, -240, 12, 'C'), level(45, -240, 12, 'C'),
  at(100, -235, 14, 'D'), at(170, -200, 14, 'D', 3), at(200, -140, 14, 'D', 7), at(170, -90, 14, 'D', 3),
  level(100, -80, 13, 'E'), level(45, -80, 13, 'E'), level(0, -80, 13, 'E'), level(-45, -80, 13, 'E'),
  at(-100, -78, 16, 'F'), at(-176, -70, 16, 'F'), at(-241, -35, 16, 'F'), at(-265, 24, 16, 'F'), at(-250, 70, 16, 'F'),
  [STAIR_FOOT[0] - 22, STAIR_FOOT[1] - 1, junglePlateau(STAIR_FOOT[0] - 22, STAIR_FOOT[1] - 1), 14, 'G'], [...STAIR_FOOT, stairBase, 13, 'G'],
  ...STAIR_LINE.map(([x, z, climbed]) => [x, z, stairBase + (PLATEAU + STAIR.rise - stairBase) * climbed, STAIR.width, 'G']),
  [-64, 78, PLATEAU, 14, 'K'], level(-45, 78 / K, 12, 'K'), level(0, 78 / K, 12, 'K'), level(45, 78 / K, 12, 'K'),
  at(100, 94, 14, 'H'), at(170, 112, 14, 'H'), at(200, 170, 14, 'H'), at(170, 225, 14, 'H'),
  level(100, 240, 12, 'I'), level(45, 240, 12, 'I'), level(0, 240, 12, 'I'), level(-45, 240, 12, 'I'),
  at(-110, 240, 14, 'J'), at(-200, 225, 14, 'J'), at(-285, 180, 14, 'J'), at(-330, 100, 15, 'J'), at(-345, 0, 15, 'J'), at(-345, -100, 14, 'J'), at(-335, -200, 14, 'J'), at(-310, -262, 15, 'A'),
];
const firstOf = section => POINTS.findIndex(point => point[4] === section);
const STAIR_END = firstOf('K') - 1;                    // the control point the stair stops at
export const JUNGLE = makeTrack({
  id: 'monkey_jungle', name: 'Monkey Jungle',
  controlPoints: POINTS,
  drops: [STAIR_END],
  heightSmoothing: 4,
  sections: {
    A: { name: 'Base Camp', surface: 'earth' }, B: { name: 'Monkey Trail', surface: 'earth' }, C: { name: 'The Rope Bridge', surface: 'planks' }, D: { name: 'The Lost Temple', surface: 'stone' },
    E: { name: 'The Swings', surface: 'planks' }, F: { name: 'Coconut Grove', surface: 'earth' }, G: { name: 'The Tree Stair', surface: 'steps' }, K: { name: 'The Fallen Log', surface: 'bark' }, H: { name: 'The Fig Tree', surface: 'earth' },
    I: { name: 'The Old Bridge', surface: 'planks' }, J: { name: 'The Long Way Home', surface: 'earth' },
  },
}, ({ sAtU, pointAt, pingPong }) => {
  const C = firstOf('C'), D = firstOf('D'), E = firstOf('E'), F = firstOf('F'), G = firstOf('G'), LOGS = firstOf('K'), H = firstOf('H'), I = firstOf('I'), J = firstOf('J');
  // a rope bridge is one long platform that sways (the log is one that does not); the swings are four short ones a long way apart
  const bridge = (id, u, shape, kind = 'bridge') => { const mid = sAtU(u), sStart = mid - shape.length / 2, sEnd = mid + shape.length / 2; return { id, sStart, sEnd, kind, pads: [{ s0: sStart, s1: sEnd, half: shape.half, reach: shape.reach, period: shape.period, phase: 0 }] }; };
  const swingsAt = sAtU(E + 2) - (SWING.gap + SWING.pads * (SWING.pad + SWING.gap)) / 2, swingPads = [];
  for (let k = 0; k < SWING.pads; k++) { const s0 = swingsAt + SWING.gap + k * (SWING.pad + SWING.gap); swingPads.push({ s0, s1: s0 + SWING.pad, half: SWING.half, reach: SWING.reach, period: SWING.period, phase: k * SWING.step }); }
  const swings = { id: 'swings', kind: 'swings', sStart: swingsAt, sEnd: swingPads.at(-1).s1 + SWING.gap, pads: swingPads };
  const platforms = [bridge('rope-bridge', C + 1, BRIDGE), swings, bridge('fallen-log', LOGS + 2, LOG, 'log'), bridge('old-bridge', I + 2, OLD_BRIDGE)];
  const stair = { sStart: sAtU(G + 2), sEnd: sAtU(STAIR_END), turnS: sAtU(STAIR_END - 4) };       // (turnS: where the climb ends and the turn at the top begins)

  const snakes = [sAtU(2.2), sAtU(J + 0.75), sAtU(J + 2.3), sAtU(J + 5.4)];
  const monkeys = [sAtU(2.75), sAtU(3.15), sAtU(3.5)];
  const temple = { sStart: sAtU(D + 0.5), sEnd: sAtU(D + 2) };
  const obstacles = [];
  [[D + 2.5, 0.45, 'idol', 1.5], [D + 3.1, -0.45, 'idol', 1.5], [H + 1.1, 0.5, 'root', 1.3], [H + 1.9, -0.5, 'root', 1.3], [H + 2.7, 0.45, 'root', 1.3]].forEach(([u, share, kind, radius], k) => { const s = sAtU(u); obstacles.push({ id: `${kind}-${k}`, kind, s, lateral: share * pointAt(s).halfWidth, radius }); });
  const grove = { sStart: sAtU(F + 0.3), sEnd: sAtU(F + 4.2) };
  const targets = [0.6, 1.2, 1.8, 2.4, 3.0, 3.6].map(u => F + u).map((u, k) => ({ s: sAtU(u), lateral: [0.5, -0.45, 0, 0.5, -0.5, 0.1][k] * pointAt(sAtU(u)).halfWidth }));
  const pond = { sStart: sAtU(J + 3.6), sEnd: sAtU(J + 4.4), depth: 0.42, ramp: 7 };

  function hazardsAt(t) {
    const out = [];
    snakes.forEach((s0, k) => {
      const ring = Math.min(SNAKE.circle, pointAt(s0).halfWidth - 2.6), turn = (k % 2 ? -1 : 1) * 2 * Math.PI * (t / SNAKE.period + k * 0.37);
      for (let n = 0; n < SNAKE.links; n++) {
        const angle = turn - (k % 2 ? -1 : 1) * n * SNAKE.apart / ring, c = pointAt(s0 + ring * Math.cos(angle)), p = pointAt(s0 + ring * Math.cos(angle), ring * Math.sin(angle));
        // (it faces the way it is going: round the circle)
        out.push({ id: `snake-${k}-${n}`, kind: 'snake', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY + Math.atan2((k % 2 ? -1 : 1) * Math.cos(angle), -(k % 2 ? -1 : 1) * Math.sin(angle)), radius: SNAKE.radius, height: SNAKE.height, active: true, link: n, slither: t * 7 - n * 0.9 });
      }
    });
    monkeys.forEach((s, k) => {
      const m = pingPong(t + k * 2.3, MONKEY.period, MONKEY.pause), c = pointAt(s), reach = c.halfWidth - 1.4, p = pointAt(s, (-reach + 2 * reach * m.k) * (k % 2 ? -1 : 1));
      out.push({ id: `monkey-${k}`, kind: 'monkey', x: p.x, y: p.y, z: p.z, rotationY: c.rotationY + (m.dir * (k % 2 ? -1 : 1) > 0 ? Math.PI / 2 : -Math.PI / 2), radius: MONKEY.radius, height: 1.1, active: true, hop: t * 10 + k });
    });
    BALL.lanes.forEach((lateral, k) => {
      const ph = (((t + [0, 2, 1][k] * BALL.period / 3) % BALL.period) + BALL.period) % BALL.period, rolling = ph < BALL.roll;
      const f = rolling ? ph / BALL.roll : 0, s = temple.sEnd + (temple.sStart - temple.sEnd) * f, c = pointAt(s, lateral);
      out.push({ id: `stone-${k}`, kind: 'stone ball', x: c.x, y: c.y, z: c.z, rotationY: c.rotationY, radius: BALL.radius, height: 99, active: rolling, spin: (temple.sEnd - s) / BALL.radius, fade: rolling ? Math.min(1, ph * 3, (BALL.roll - ph) * 3) : 0 });
    });
    targets.forEach((target, k) => {
      const ph = (((t + k * 1.7) % COCONUT.period) + COCONUT.period) % COCONUT.period, p = pointAt(target.s, target.lateral);
      const warn = ph < COCONUT.warn, hit = !warn && ph < COCONUT.warn + COCONUT.hit;
      // (fall: 1 when it leaves the monkey's hand, 0 as it lands; -1 when there is no coconut in the air)
      out.push({ id: `coconut-${k}`, kind: 'coconut', x: p.x, y: p.y, z: p.z, rotationY: 0, radius: COCONUT.radius, height: 99, active: hit, fall: warn ? 1 - ph / COCONUT.warn : hit ? 0 : -1, burst: hit ? (ph - COCONUT.warn) / COCONUT.hit : -1 });
    });
    return out;
  }
  // the river under each crossing, and its vine lift up the far bank
  const undercity = platforms.map(zone => ({ id: `river-${zone.id}`, under: zone.id, sStart: zone.sStart - 2, sEnd: zone.sEnd + RIVER_BED.after, depth: PLATEAU - RIVER_BED.y, wade: RIVER_BED.wade, surface: 'water' }));
  const launches = undercity.map(u => {
    const takeoffS = u.sEnd - 8;
    return { id: `vine-lift-${u.under}`, lift: true, under: u.id, padStart: takeoffS - RIVER_BED.run, takeoffS, gapStart: takeoffS, gapEnd: takeoffS + 4, landingS: takeoffS + VINE_LIFT.landing,
      gapStartIndex: -1, gapEndIndex: -1, duration: VINE_LIFT.duration, arcHeight: 0, exitSpeedMultiplier: VINE_LIFT.exitSpeedMultiplier, boostSeconds: VINE_LIFT.boostSeconds };
  });
  return {
    platforms, undercity, launches, obstacles, water: [pond], hazardsAt, autoPickups: { rowEvery: 250, boneEvery: 105 },
    keepClear: [[monkeys[0] - 12, monkeys[2] + 12], [temple.sStart - 8, temple.sEnd + 8], [grove.sStart - 4, grove.sEnd + 4], ...snakes.map(s => [s - 12, s + 12]), [stair.turnS - 6, stair.sEnd]],
    extras: { monkeys, temple, ballRun: BALL, grove, targets, coconut: COCONUT, pond, swing: SWING, snakes, snake: SNAKE, stair, stairRise: STAIR.rise,
      hazardZones: { snakes, monkeys, stones: [temple.sStart, (temple.sStart + temple.sEnd) / 2, temple.sEnd], coconuts: targets.map(target => target.s) } },
  };
});
export default JUNGLE;
