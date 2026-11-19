// The Speed Bowl — the classic kart oval, and the shortest lap in the game: two straights and two
// bends, five laps.  Nothing in the way: it is all Treat Boxes and Golden Bones, so the whole field is
// boosting and throwing things all the way round.  Built by shared/trackKit.js; the scenery is
// src/tracks/speedBowl/SpeedBowlTrack.js.
//
//   Treat Boxes    a row of five across the road going into and coming out of each bend, and in the
//                  middle of each straight: six rows a lap
//   Golden Bones   a pair between every two rows
import { makeTrack } from './trackKit.js';

// where round the oval (control point numbers: the bends are 3 to 5 and 9 to 11, the start line is at 0.5)
const ROWS = [1.5, 3.1, 4.9, 7, 9.1, 10.9], BONES = [2.3, 4, 6, 8, 10, 11.85];

export const SPEED_BOWL = makeTrack({
  id: 'speed_bowl', name: 'The Speed Bowl', laps: 5,
  // [x, z, height, width, section]: round the oval, the outside of it is always to the dogs' left
  controlPoints: [
    [-55, 45, 0, 20, 'A'], [0, 45, 0, 20, 'A'], [55, 45, 0, 20, 'A'],
    [87, 32, 0, 20, 'B'], [100, 0, 0, 20, 'B'], [87, -32, 0, 20, 'B'],
    [55, -45, 0, 20, 'C'], [0, -45, 0, 20, 'C'], [-55, -45, 0, 20, 'C'],
    [-87, -32, 0, 20, 'D'], [-100, 0, 0, 20, 'D'], [-87, 32, 0, 20, 'D'],
  ],
  sections: {
    A: { name: 'Home Straight', surface: 'tarmac' }, B: { name: 'Turn One', surface: 'tarmac' },
    C: { name: 'Back Straight', surface: 'tarmac' }, D: { name: 'Turn Two', surface: 'tarmac' },
  },
}, ({ sAtU, pointAt }) => ({
  boxLanes: [-0.76, -0.38, 0, 0.38, 0.76],          // five across
  extras: { pickups: { rows: ROWS.map(sAtU), bones: BONES.flatMap(u => { const s = sAtU(u), reach = pointAt(s).halfWidth * 0.5; return [[s, reach], [s, -reach]]; }) } },
}));
export default SPEED_BOWL;
