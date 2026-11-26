// Coins, the Shop and the Garage (Tom, 2026-11-26): "the coins for currency, you gain these for coming in different positions.
// You have a shop where you can purchase new skins, characters for this currency, skins and characters should be harder and cost
// more, silly stuff like santa hat and a dog coat should be cheaper... a dog garage where you can equip what you've just bought."
//
// Pure JavaScript, no dependencies: the SAME file runs in the game and on the server.  The server decides everything that
// matters (what a race pays, what is owned, what is worn); the game only shows it.
//
// What things cost, against what a race pays.  A race pays 15 to 100 coins (about 55 for a middling result), so:
//   an accessory (a hat, a coat)   300 to 500     five to ten races
//   a skin                         2,000          about forty races
//   a character                    5,000          about ninety races
// That is the shape other racing games use: Mario Kart Tour sold ordinary pieces at 500 to 800 coins and its best at 10,000 to
// 12,000, with a few hundred coins to be had from a good race.  The numbers are all here, to be changed in one place.

/** Coins for each finishing place, 1st to 6th.  A dog that had not finished when the race ended gets DID_NOT_FINISH. */
export const PLACE_COINS = [100, 70, 50, 35, 25, 15];
export const DID_NOT_FINISH = 5;
/** Against the computer's dogs alone a race pays this share, by how good they are (so that Easy is not the way to get rich);
 *  a race between two or more people always pays in full. */
export const BOT_LEVEL_SHARE = { easy: 0.5, medium: 0.75, hard: 1 };
/** ...and winning a whole Grand Prix pays this on top */
export const GRAND_PRIX_COINS = [150, 75, 40];

/**
 * What one race pays one player.  place: 1 for the winner.  finished: it crossed the line.  racers: how many dogs were in it
 * (computer dogs counted).  humans: how many people.  botLevel: how good the computer dogs were ('easy' | 'medium' | 'hard').
 */
export function coinsForRace({ place, finished, racers = 6, humans = 1, botLevel = 'hard' }) {
  if (!finished) return DID_NOT_FINISH;
  if (!(place >= 1)) return 0;
  // (a race with nobody to beat pays as last place: alone on the road is not a win)
  const base = racers < 2 ? PLACE_COINS.at(-1) : PLACE_COINS[Math.min(place, PLACE_COINS.length) - 1];
  const share = humans >= 2 ? 1 : BOT_LEVEL_SHARE[botLevel] ?? 1;
  return Math.max(DID_NOT_FINISH, Math.round(base * share / 5) * 5);
}
export const coinsForGrandPrix = place => GRAND_PRIX_COINS[place - 1] ?? 0;

/** Where on a dog something is worn: one thing in each place at a time */
export const SLOTS = { head: 'Head', body: 'Body' };

/**
 * Everything in the shop.
 *   kind       'accessory' (worn: it has a `slot`), 'skin' (none yet) or 'character' (a dog to race as: `dog`)
 *   dogs       the dogs that can wear it (left out: every dog)
 *   price      in coins
 */
export const SHOP_ITEMS = [
  { id: 'hat_santa', kind: 'accessory', slot: 'head', name: 'Santa Hat', blurb: 'Red, fluffy, and it stays on round every corner.', price: 300 },
  { id: 'coat_pippa', kind: 'accessory', slot: 'body', dogs: ['gsp'], name: 'Pippa’s Winter Coat', blurb: 'A quilted red coat, made to measure for Pippa.', price: 500 },
  { id: 'dog_jimmy', kind: 'character', dog: 'jimmy', name: 'Jimmy', blurb: 'The Chinese Crested on wheels. Unlocks him for every race.', price: 5000 },
];
export const SHOP_ITEM = Object.fromEntries(SHOP_ITEMS.map(item => [item.id, item]));

/** The dogs that have to be bought before they can be raced: { dog: item id } */
export const LOCKED_DOGS = Object.fromEntries(SHOP_ITEMS.filter(item => item.kind === 'character').map(item => [item.dog, item.id]));
/** May a player who owns these item ids race as this dog? */
export const dogUnlocked = (dog, owned = []) => !LOCKED_DOGS[dog] || owned.includes(LOCKED_DOGS[dog]);
/** Can this dog wear this thing? */
export const fitsDog = (item, dog) => item?.kind === 'accessory' && (!item.dogs || item.dogs.includes(dog));

/**
 * What a dog is wearing, from what its player has put on it: { head: 'hat_santa', ... } with nothing in it that is not owned,
 * does not exist or does not fit.  equipped: { dog: { slot: item id } }
 */
export function cosmeticsFor(dog, owned = [], equipped = {}) {
  const out = {};
  for (const [slot, id] of Object.entries(equipped?.[dog] ?? {})) {
    const item = SHOP_ITEM[id];
    if (item && item.slot === slot && SLOTS[slot] && owned.includes(id) && fitsDog(item, dog)) out[slot] = id;
  }
  return out;
}
