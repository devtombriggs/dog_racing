// Kombu's House — a lap of the big stone house on the hill where Kombu lives.  Not a circuit round it:
// a way THROUGH it.  Up the drive, in at the glass doors of the conservatory (the front door is the one
// on the right: nobody uses it), the living room, left into the pool room and round through the pool
// and back out of the same doorway, left again into the kitchen, left to the lift, up the shaft to the
// floor above, along the hallway and its swinging doors, the computer room, out through more glass
// doors, left into the dog pen, over the hill behind the house past the chickens, right down the back
// drive, right along the main road, and right into the drive again.  The house is giant-sized (or the
// dogs are small).  Built by shared/trackKit.js; the scenery is src/tracks/kombuHouse/KombuHouseTrack.js.
//
// The house is built into the hill: the floor above comes out level with the ground behind the house.
//
// Round the lap:
//   A  The Drive          start/finish, up to the house
//   B  The Conservatory   in at the double glass doors, which open as a dog comes up to them
//   C  The Living Room    a toy car driving round it: nothing jumps it, keep out of its way
//   D  The Pool Room      in at the left of the doorway, round and through the pool, out at the right of it.  Poppy's stretch
//   E  The Living Room    (the other end of it) and left to the kitchen door
//   F  The Kitchen        knives and forks dropping out of the air (watch for the shadows), and a kettle sliding about
//   G  The Lift           run in, and it fires you up the shaft
//   H  The Hallway        doors that swing both ways across it
//   I  The Computer Room  desks, and a man in a wheelchair charging about who will have you over
//   J  The Terrace        out through the second glass doors
//   K  The Dog Pen        kennels and bowls
//   L  Chicken Hill       past the chickens in their pen
//   M  The Back Drive     downhill all the way, round the parked vans
//   N  The Main Road      along the wall, and right into the drive
import { makeTrack } from './trackKit.js';

const FLOOR = 0.6, UP = 10;             // the ground floor is a step up from the drive; the floor above is 10 m up
const DOOR = 9;                         // how wide a doorway is
export const PLAN = 0.87;               // the plan below is drawn a little large: everything on the ground is this share of it
const CAR = { period: 11, radius: 1.7, long: 17, wide: 6.2 };              // the toy car: a figure of eight the length of the living room
const CUTLERY = { period: 5.2, warn: 1.7, fall: 0.45, stuck: 1.5, radius: 0.85, from: 16 };   // warn: a shadow on the floor; fall: on its way down; stuck: standing in the floor
const KETTLE = { period: 7, pause: 0.05, radius: 1.3, wander: 9 };
const SWING = { period: 5.4, reach: 1.4, leaf: 6.0, radius: 0.9 };            // reach: how far the doors swing each way (radians)
const CHAIR = { period: 6.5, pause: 0.03, radius: 1.5, wander: 22, wanderPeriod: 17 };

// [east, north, height, width, section], as on a map: the front of the house faces south, and the drive runs north up to it.
// (In the game x is WEST: a dog running north has east, and +x's other side, on its right.)
const POINTS = [
  [0, -150, 0, 14, 'A'], [0, -100, 0, 14, 'A'], [0, -52, 0, 14, 'A'], [-6, -22, 0, 13, 'A'],
  [-8, 0, FLOOR, 12, 'B'],                                                                        // 4: the glass doors
  [-8, 20, FLOOR, 22, 'C'], [-8, 46, FLOOR, 22, 'C'], [-13, 63, FLOOR, 13, 'C'],
  [-34, 68, FLOOR, 10, 'D'],                                                                      // 8: the pool room doorway, going in
  [-60, 57, FLOOR, 16, 'D'], [-92, 44, FLOOR, 18, 'D'], [-124, 56, FLOOR, 18, 'D'], [-136, 84, FLOOR, 18, 'D'], [-122, 111, FLOOR, 18, 'D'], [-92, 120, FLOOR, 16, 'D'], [-60, 103, FLOOR, 14, 'D'],
  [-34, 88, FLOOR, 10, 'E'],                                                                      // 16: the same doorway, coming out
  [-15, 95, FLOOR, 12, 'E'],
  [-8, 114, FLOOR, 12, 'F'],                                                                      // 18: the kitchen door
  [-8, 138, FLOOR, 22, 'F'], [-8, 168, FLOOR, 22, 'F'], [-14, 190, FLOOR, 13, 'F'],
  [-34, 197, FLOOR, 11, 'G'],
  [-58, 197, FLOOR, 11, 'G'],                                                                     // 23: the lift: the floor above starts here
  [-74, 197, UP, 12, 'H'], [-100, 197, UP, 13, 'H'], [-132, 197, UP, 13, 'H'], [-160, 206, UP, 13, 'H'], [-168, 232, UP, 13, 'H'], [-160, 256, UP, 13, 'H'],
  [-138, 264, UP, 14, 'I'], [-106, 264, UP, 24, 'I'], [-74, 264, UP, 24, 'I'],
  [-50, 264, UP, 12, 'J'],                                                                        // 33: the second glass doors
  [-30, 270, UP, 13, 'J'],
  [-21, 288, UP, 12, 'K'], [-20, 312, UP, 18, 'K'], [-20, 338, UP, 18, 'K'],
  [-10, 358, UP + 0.6, 14, 'L'], [16, 366, UP + 1.6, 15, 'L'], [50, 365, UP + 1.6, 16, 'L'], [78, 355, UP + 0.6, 14, 'L'],
  [88, 328, UP - 0.6, 13, 'M'], [88, 280, 8.2, 13, 'M'], [83, 224, 6.6, 13, 'M'], [92, 166, 5, 13, 'M'], [86, 106, 3.4, 13, 'M'], [88, 44, 1.9, 13, 'M'], [88, -26, 0.7, 13, 'M'], [88, -98, 0, 13, 'M'],
  [80, -148, 0, 13, 'N'], [56, -172, 0, 14, 'N'], [26, -174, 0, 14, 'N'], [6, -166, 0, 14, 'A'],
];
const CP = { glass: 4, living: 5, poolIn: 8, poolOut: 16, kitchen: 18, lobby: 22, lift: 23, hall: 24, computer: 30, glass2: 33, pen: 35, hill: 38, backDrive: 42, road: 50 };

export const KOMBU_HOUSE = makeTrack({
  id: 'kombu_house', name: 'Kombu’s House',
  controlPoints: POINTS.map(([east, north, ...rest]) => [-east * PLAN, north * PLAN, ...rest]),
  startU: 1,
  lifts: [CP.lift],
  doors: [
    { u: CP.glass, width: 10, depth: 3, kind: 'glass' }, { u: CP.poolIn, width: DOOR, kind: 'pool' }, { u: CP.poolOut, width: DOOR, kind: 'pool' }, { u: CP.kitchen, width: DOOR, kind: 'door' },
    { u: CP.lobby - 0.25, width: DOOR, kind: 'door' }, { u: CP.computer - 0.3, width: DOOR, kind: 'door' }, { u: CP.glass2, width: 10, depth: 3, kind: 'glass' }, { u: CP.pen, width: 8, depth: 3, kind: 'gate' },
  ],
  heightSmoothing: 4,
  sections: {
    A: { name: 'The Drive', surface: 'tarmac' }, B: { name: 'The Conservatory', surface: 'tiles' }, C: { name: 'The Living Room', surface: 'rug' },
    D: { name: 'The Pool Room', surface: 'poolside' }, E: { name: 'The Living Room', surface: 'rug' }, F: { name: 'The Kitchen', surface: 'tiles' },
    G: { name: 'The Lift', surface: 'carpet' }, H: { name: 'The Hallway', surface: 'carpet' }, I: { name: 'The Computer Room', surface: 'carpet' },
    J: { name: 'The Terrace', surface: 'paving' }, K: { name: 'The Dog Pen', surface: 'lawn' }, L: { name: 'Chicken Hill', surface: 'grass' },
    M: { name: 'The Back Drive', surface: 'tarmac' }, N: { name: 'The Main Road', surface: 'tarmac' },
  },
}, ({ sAtU, pointAt, pingPong, launchBetween }) => {
  const obstacles = [];
  const stand = (id, kind, s, share, radius) => obstacles.push({ id, kind, s, lateral: share * pointAt(s).halfWidth, radius });
  /** a place in a room: metres along from s, metres across (to the dogs' right) */
  const spot = (s, across) => { const c = pointAt(s), p = pointAt(s, across); return { x: p.x, y: c.y, z: p.z, yaw: c.rotationY }; };

  // the living room: the sofa down one wall, and the toy car's run
  const living = { sStart: sAtU(CP.living + 0.08), sEnd: sAtU(CP.living + 1.7) }, carS = (living.sStart + living.sEnd) / 2, carLong = Math.min(CAR.long, (living.sEnd - living.sStart) / 2 - 2.5);
  const sofaS = sAtU(CP.living + 0.45);
  for (let k = 0; k < 3; k++) stand(`sofa-${k}`, 'sofa', sofaS + k * 4.2, 0.8, 2.0);
  // the pool: most of the way round the far end of the pool room
  const pool = { sStart: sAtU(CP.poolIn + 1.75), sEnd: sAtU(CP.poolIn + 5.5), depth: 1.4, ramp: 10 };
  // the kitchen: where the cutlery comes down (rows of three across the floor, never a whole row at once), and the kettle
  const kitchen = { sStart: sAtU(CP.kitchen + 0.35), sEnd: sAtU(CP.kitchen + 2.55) };
  const drops = [];
  for (let row = 0, s = kitchen.sStart + 7; s < kitchen.sEnd - 4; s += 9, row++) {
    const hw = pointAt(s).halfWidth - 2.2;
    [-1, 0, 1].forEach((lane, k) => drops.push({ id: `cutlery-${row}-${k}`, kind: (row + k) % 2 ? 'fork' : 'knife', s, lateral: lane * hw * 0.82 + (row % 2 ? 1.6 : -1.6), offset: ((row * 3 + k * 5) % 9) / 9 * CUTLERY.period }));
  }
  const kettleS = (kitchen.sStart + kitchen.sEnd) / 2 + 4;
  // the lift
  const launch = launchBetween(CP.lift - 0.2, CP.lift + 0.3, { lift: true, duration: 1.7, arcHeight: 0, exitSpeedMultiplier: 1.2, boostSeconds: 1.0, pad: 14, takeoff: 3, landing: 5 });
  // the hallway: five doors, hinged on one wall and then the other, each swinging right round both ways
  const hall = { sStart: sAtU(CP.hall + 0.5), sEnd: sAtU(CP.computer - 0.75) };
  const swings = [];
  for (let k = 0; k < 5; k++) {
    const s = hall.sStart + 14 + k * (hall.sEnd - hall.sStart - 24) / 4, c = pointAt(s), side = k % 2 ? -1 : 1, hinge = pointAt(s, side * (c.halfWidth - 0.1));
    swings.push({ id: `swing-${k}`, s, side, x: hinge.x, y: c.y, z: hinge.z, across: [-side * c.nx, -side * c.nz], along: [Math.sin(c.rotationY), Math.cos(c.rotationY)], offset: k * SWING.period * 0.37 });
  }
  // the computer room: desks down the walls, and the man in the wheelchair
  const computer = { sStart: sAtU(CP.computer + 0.55), sEnd: sAtU(CP.computer + 2.5) };
  [[0.75, 0.78], [1.3, -0.78], [1.85, 0.78], [2.3, -0.78]].forEach(([u, share], k) => stand(`desk-${k}`, 'desk', sAtU(CP.computer + u), share, 2.0));
  const chairS = (computer.sStart + computer.sEnd) / 2;
  // the dog pen: kennels against the fence, bowls and a ball on the grass
  [[0.75, 0.62, 2.0, 'kennel'], [1.25, -0.3, 0.9, 'bowl'], [1.7, -0.62, 2.0, 'kennel'], [2.2, 0.3, 0.9, 'ball']].forEach(([u, share, radius, kind], k) => stand(`pen-${k}`, kind, sAtU(CP.pen + u), share, radius));
  // the back drive: two vans parked on it, and the bins out by the road
  [[1.7, 0.5, 2.6, 'van'], [3.2, -0.5, 2.6, 'van'], [5.6, 0.55, 1.0, 'bin'], [5.9, -0.5, 1.0, 'bin']].forEach(([u, share, radius, kind], k) => stand(`drive-${k}`, kind, sAtU(CP.backDrive + u), share, radius));

  function hazardsAt(t) {
    const out = [];
    // the toy car: a figure of eight
    {
      const a = 2 * Math.PI * t / CAR.period, at = k => spot(carS + carLong * Math.sin(k), CAR.wide * Math.sin(2 * k)), p = at(a), q = at(a + 0.02);
      out.push({ id: 'toy-car', kind: 'toy car', x: p.x, y: p.y, z: p.z, rotationY: Math.atan2(q.x - p.x, q.z - p.z), radius: CAR.radius, height: 99, active: true, roll: t * 9 });
    }
    // knives and forks: a shadow where each will land, then down it comes and stands in the floor for a moment
    for (const d of drops) {
      const ph = (((t + d.offset) % CUTLERY.period) + CUTLERY.period) % CUTLERY.period, p = spot(d.s, d.lateral);
      const falling = clamp((ph - CUTLERY.warn) / CUTLERY.fall), landed = ph >= CUTLERY.warn + CUTLERY.fall, gone = ph >= CUTLERY.warn + CUTLERY.fall + CUTLERY.stuck;
      out.push({ id: d.id, kind: d.kind, x: p.x, y: p.y, z: p.z, rotationY: p.yaw + d.offset * 3, radius: CUTLERY.radius, height: 99,
        active: !gone && falling > 0.75, drop: gone ? -1 : CUTLERY.from * (1 - falling * falling), warning: gone ? 0 : landed ? 1 : clamp(ph / CUTLERY.warn), landed: landed && !gone });
    }
    // the kettle: from wall to wall, and up and down the kitchen as it goes
    {
      const m = pingPong(t, KETTLE.period, KETTLE.pause), s = kettleS + KETTLE.wander * Math.sin(2 * Math.PI * t / 19), reach = pointAt(s).halfWidth - 2.4, p = spot(s, -reach + 2 * reach * m.k);
      out.push({ id: 'kettle', kind: 'kettle', x: p.x, y: p.y, z: p.z, rotationY: p.yaw + (m.dir > 0 ? -1 : 1) * Math.PI / 2, radius: KETTLE.radius, height: 99, active: true, steam: t });
    }
    // the swinging doors: each is three round bits down its leaf
    for (const d of swings) {
      const angle = SWING.reach * Math.sin(2 * Math.PI * (t + d.offset) / SWING.period), cos = Math.cos(angle), sin = Math.sin(angle);
      const ux = d.across[0] * cos + d.along[0] * sin, uz = d.across[1] * cos + d.along[1] * sin;
      [0.34, 0.62, 0.9].forEach((f, k) => out.push({ id: `${d.id}-${k}`, kind: 'swinging door', x: d.x + ux * SWING.leaf * f, y: d.y, z: d.z + uz * SWING.leaf * f, rotationY: Math.atan2(ux, uz), radius: SWING.radius, height: 99, active: true,
        ...(k ? {} : { hingeX: d.x, hingeZ: d.z }) }));
    }
    // the man in the wheelchair: from wall to wall, working his way up and down the room
    {
      const m = pingPong(t + 1.5, CHAIR.period, CHAIR.pause), s = chairS + CHAIR.wander * Math.sin(2 * Math.PI * t / CHAIR.wanderPeriod), reach = pointAt(s).halfWidth - 5.2, p = spot(s, -reach + 2 * reach * m.k);
      const q = spot(chairS + CHAIR.wander * Math.sin(2 * Math.PI * (t + 0.05) / CHAIR.wanderPeriod), -reach + 2 * reach * pingPong(t + 1.55, CHAIR.period, CHAIR.pause).k);
      out.push({ id: 'wheelchair', kind: 'wheelchair', x: p.x, y: p.y, z: p.z, rotationY: Math.hypot(q.x - p.x, q.z - p.z) > 1e-4 ? Math.atan2(q.x - p.x, q.z - p.z) : p.yaw + (m.dir > 0 ? -1 : 1) * Math.PI / 2, radius: CHAIR.radius, height: 99, active: true, roll: t * 8 });
    }
    return out;
  }
  const row = u => sAtU(u), bone = (u, lateral) => [sAtU(u), lateral];
  return {
    launch, obstacles, water: [pool], hazardsAt,
    keepClear: [[living.sStart - 4, living.sEnd + 4], [kitchen.sStart - 6, kitchen.sEnd + 6], [hall.sStart, hall.sEnd + 4], [computer.sStart - 4, computer.sEnd + 4]],
    extras: {
      enclosed: 'BCDEFGHI',          // the sections with walls to the ceiling either side: the camera is kept inside them (game/ChaseCamera.js)
      pool, living, kitchen, hall, computer, floor: FLOOR, upstairs: UP, places: CP,
      carRun: { ...CAR, long: carLong, s: carS }, cutlery: CUTLERY, cutleryDrops: drops, kettleRun: { ...KETTLE, s: kettleS }, swingDoors: swings, swing: SWING, chairRun: { ...CHAIR, s: chairS },
      hazardZones: { car: [living.sStart, carS, living.sEnd], cutlery: [kitchen.sStart, kettleS, kitchen.sEnd], doors: swings.map(d => d.s), wheelchair: [computer.sStart, chairS, computer.sEnd] },
      pickups: {
        rows: [2.3, 9.15, 14.7, 17.3, 34.3, 39.6, 43.2, 46.5, 51.5].map(row),
        bones: [bone(3.2, 2.5), bone(4.75, -2), bone(16.5, 0), bone(33.5, 0), bone(38.05, 3), bone(41.2, -2.5), bone(42.6, 2.5), bone(44.55, 0), bone(45.6, -2.5), bone(47.1, 2.5), bone(48.6, -2.5), bone(50.4, 2.5), bone(52.6, -3)],
      },
    },
  };
});
function clamp(v) { return Math.min(1, Math.max(0, v)); }
export default KOMBU_HOUSE;
