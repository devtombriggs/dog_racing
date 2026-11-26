// Grand Prix: four races one after another with the same dogs, points for each finishing place, and
// the most points after the fourth race wins.  Shared by the server (which runs it) and the game
// (which offers them beside the single maps, and shows the scores).

// (the cups were named by Tom's say-so, 2026-11-26: before, they were Grand Prix 1 to 4)
export const GRAND_PRIX = {
  gp1: { name: 'Puppy Cup', maps: ['wendover', 'water_park', 'pet_mall', 'treat_road'] },
  gp2: { name: 'Treat Cup', maps: ['farmyard', 'modbury_heights', 'bypass_dash', 'frostpeak'] },
  gp3: { name: 'Bone Cup', maps: ['desert_dunes', 'speed_bowl', 'kombu_house', 'neon_nexus'] },
  gp4: { name: 'Top Dog Cup', maps: ['yorkshire_dales', 'boneyard', 'the_vets', 'monkey_jungle'] },
};

// 1st gets 10 points, 2nd 8, and so on down to 2 for 5th and 1 for 6th.  A dog that had not finished when the race
// ended scores for the place it was in.
export const GRAND_PRIX_POINTS = [10, 8, 6, 4, 2, 1];

export function pointsForPlace(place) {
  return GRAND_PRIX_POINTS[place - 1] ?? 0;
}
