// Grand Prix: four races one after another with the same dogs, points for each finishing place, and
// the most points after the fourth race wins.  Shared by the server (which runs it) and the game
// (which offers the two of them beside the single maps, and shows the scores).

export const GRAND_PRIX = {
  gp1: { name: 'Grand Prix 1', maps: ['wendover', 'water_park', 'pet_mall', 'treat_road'] },
  gp2: { name: 'Grand Prix 2', maps: ['farmyard', 'modbury_heights', 'mud_park', 'frostpeak'] },
};

// 1st gets 10 points, 2nd 8, and so on down to 2 for 5th.  A dog that had not finished when the race
// ended scores for the place it was in.
export const GRAND_PRIX_POINTS = [10, 8, 6, 4, 2];

export function pointsForPlace(place) {
  return GRAND_PRIX_POINTS[place - 1] ?? 0;
}
