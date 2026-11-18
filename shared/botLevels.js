// Computer-controlled dogs: the three levels the host can choose from.  They differ in how a dog is
// driven, not in what the dog can do: every computer dog has its own dog's stats, and none is given
// speed a player could not have.  The server drives them (server/bots.js); the lobby shows the names.

export const MAX_BOTS = 4;       // a race is five dogs: the computer dogs take the places the players leave


export const BOT_LEVELS = {
  easy: {
    name: 'Easy',
    pace: 0.85,            // share of the dog's own top speed it runs at
    line: -0.25,           // where it runs through a bend, as a share of the road: + inside, - outside
    wander: 0.4,           // how much it drifts from side to side, as a share of the road
    foresight: 0.3,        // seconds ahead it sees something coming (the tractor, a sheep, a dog)
    jumpMiss: 0.12,        // chance it misjudges a jump it has to make (a broken bridge)
    reaction: [0.5, 1.1],  // seconds after GO before it moves
    itemDelay: [2, 7],     // seconds it holds an item before thinking of using it
    itemSense: 0,          // 0: uses items at random; 1: when they will do some good; 2: aims and saves them
    pickups: 0.5,          // chance it goes for a Treat Box or a Golden Bone it could reach
    dodges: false,         // steers round chew toys
  },
  medium: {
    name: 'Medium',
    pace: 0.93, line: 0.3, wander: 0.18, foresight: 0.7, jumpMiss: 0.04, reaction: [0.25, 0.6],
    itemDelay: [1, 4], itemSense: 1, pickups: 0.8, dodges: true,
  },
  hard: {
    name: 'Hard',
    pace: 1, line: 0.7, wander: 0.05, foresight: 1.2, jumpMiss: 0.005, reaction: [0.05, 0.25],
    itemDelay: [0.3, 1.2], itemSense: 2, pickups: 1, dodges: true,
  },
};
export const BOT_LEVEL_IDS = Object.keys(BOT_LEVELS);
