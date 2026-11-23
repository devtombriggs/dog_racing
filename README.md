# Dog Racing (Zoomie Racers)

Choose **Wendover Woods**, **Frostpeak Alpine Circuit**, **Treat Road** or **Modbury Heights** from the main menu, then start Single Player or Host Game. Multiplayer guests use the host's map. The host can change maps in the lobby; chosen dogs stay ready.

**Wendover Woods** keeps its 1.47 km circuit, starting grid and three-lap race, with four amber-marked burrow shortcuts and three swimming crossings. Drive Ralph forward into a small burrow to travel automatically to its paired exit in 1.1 seconds, then receive a 30% boost for 1.1 seconds. Each burrow works once per lap. The server checks the approach and preceding checkpoints, credits only the bypassed checkpoints, and rejects old movement packets after the exit. Other dogs follow the main course.

Bluebell Splash, Willow Water and Otter Pond have sloping banks, submerged beds, floating dogs, paddling animations and wakes. Poppy swims at her normal top speed (never faster); Ralph and Meela swim at 45%, with the other dogs between them. Swimming counts as being on the course, so it does not trigger the off-track rescue timer. Dogs cannot jump out of deep water. The existing trot animation supplies the paddling motion. The woodland also has warm lighting, moving water, reeds, buoys and signs.

Wendover's authored features live in `shared/wendoverFeatures.json`, shared by the gameplay and `../wendover_woods/create_track.py`. Rebuild with `blender -b -t 4 -P ../wendover_woods/create_track.py -- --norender`, then copy `../wendover_woods/wendover_woods.glb` to `public/models/wendover_woods.glb`. The previous map and source are preserved in `../wendover_woods/v2/`. Tests compare the exported pool beds to gameplay heights, check the start grid and burrow clearance, and exercise Ralph's shortcuts across three laps. Restart the backend and refresh the browser after updating both the map and rules.

**Treat Road** now has 1.45 km of road per lap (half the original 2.9 km), with full-width biscuit tiles, a bone bridge and sunset scenery. Its compact 1.6 km layout has 150 m of the winding climb removed. Drive forward over the cyan **ZOOM!** pad to launch automatically through the floating rings; the 2.2-second flight lands facing the road with a 35% speed boost for 1.25 seconds. Steering resumes on landing. The server controls the flight, requires the landing checkpoint each lap, and rejects movement packets left over from the flight. Three laps still win.

Treat Road has open edges and no manual jump. Falling returns the dog to its last checkpoint after one second, with 55% top speed for 1.5 seconds. Checkpoints must be collected in order, and finish-line crossings must be forward. The server decides falls and respawns and discards movement sent before a respawn.

Enter **Your name** on the main menu so friends can recognize you, then choose **Host Game**. Friends choose **Join Game** to browse live lobbies by host name, map and player count, and click **Join** without entering a code. Everyone must connect to the same game server. Full lobbies are marked unavailable; games disappear from the list when a race starts or the last player leaves. If the host leaves, a remaining player becomes the host. Single-player games are private and never appear in the browser.

Pablo (Alaskan Klee Kai) is available in dog selection alongside Pippa, Meela, Poppy and Ralph. His editable source, renders and animation viewer are in `../pablo_klee_kai/`.

Meela uses the updated detailed model with seven clips and stride playback matched to movement speed. Her revised gallop keeps the torso supported and the head above the withers, with back flexion and two flight phases. Sprint plays at about 3.21 strides per second at the current top speed. Her editable source, research notes, previews and export validator are in `../meela_greyhound/`; previous versions are preserved in its `v1/`, `v2/` and `v3/` folders.

All dogs look forward when travelling straight and turn their neck/head with steering. This correction runs after animation blending for local and remote players and retains animated head pitch. Individual gameplay speed and acceleration tuning is still deferred.

Controls: **W / Up Arrow** accelerates through the gaits to sprint speed automatically; **S / Down Arrow** brakes, then reverses. **A / D** or **Left / Right Arrow** steer. Press **Space** or scroll the **mouse wheel down** over the race view to jump. Shift is no longer needed.

Run locally with Node 24 in two terminals:

```sh
node server/server.js
```

The backend defaults to port 3001; set `PORT` to run a separate instance and point the client's `VITE_SERVER_URL` at it.

```sh
npm run dev
```

Restart the backend after updating: both client and server need the same map definitions, including Modbury Heights. For Docker, rebuild both services with `docker compose up --build -d`.

Checks: `npm test`, `npm run lint`, and `npm run build`. Tests exercise the socket handlers in memory, live lobby listings, single-player privacy, capacity and stale joins, map-specific laps and start positions, and the Frostpeak GLB geometry/heightmap. They do not replace a browser playtest.

Map definitions live in `shared/maps.js`. `shared/frostpeak.json` is copied from `../frostpeak_alpine_circuit/frostpeak_track_config.json`; the GLB and heightmap are copied into `public/models/`. Refresh all three copies if the source map is regenerated.

Treat Road uses `shared/treatRoadData.js` for geometry and `src/tracks/treatRoad/TreatRoadTrack.js` for visuals, originally copied from `../treat_road/src/tracks/treatRoad/` and now adapted in-game for the compact catapult layout (the visual module's data import points into `shared/`). The standalone demo remains the original long circuit; do not overwrite the game copies when refreshing that demo. The scene is built on demand; no GLB or CDN is needed. `server/server.js` uses the existing lap/checkpoint system plus Treat Road's fall/respawn rules. The standalone `treatRoadRace.js` demo controller is not used by the game. Map/server tests cover the five spawns, road edges, three laps, recovery and stale movement after respawn.

Modbury Heights is a 3.12 km coastal circuit with a beach start, switchback climb, exposed clifftops, shallow-water crossing and boardwalk return. It uses the same three-lap race and server-controlled checkpoint recovery as Treat Road. Banks and dunes constrain movement; exposed cliff edges trigger falls. Water and soft shoulders slow dogs, swimming stats affect water speed, and climbs use the map's default stamina value until dogs have stamina stats. Water entry is automatic, with floating height and existing stride animations (the dogs have no separate swim clip).

Its shared data is `shared/modburyData.js`, and its on-demand scenery is `src/tracks/modburyHeights/ModburyHeightsTrack.js`, copied from `../modbury_heights/src/tracks/modburyHeights/` with the visual data import redirected to `shared/`. Refresh both when regenerating the source map. Tests cover supported spawns, terrain continuity, water, natural boundaries, cliff recovery, stale movement, and a complete three-lap multiplayer race.


## Refreshing the page, or losing the connection

A player whose connection drops keeps their seat and their dog for one minute (`SEAT_HOLD_MS` on the server). If the same browser tab comes back in that time, by a refresh or by reconnecting, it is the same player again: back in the lobby on the dog they picked, or back in the race where their dog now is.

- **While they are away in a race** their dog jogs on up the road by itself at half its top speed, steering round what is in the way and jumping what has to be jumped, and uses no items (`AWAY_DRIVER` in `server/bots.js`). It keeps going while their game reloads the map, and is theirs again when the map is on screen.
- **After a minute** they have left, as before.
- **Frozen dogs:** a player who is still connected but has gone quiet in a race for three seconds (a hidden tab, a stalled connection) has their dog driven the same way; the first move their game sends takes it back, from wherever the dog has got to. A dead connection is noticed in about ten seconds.
- **Everyone is told:** the player sees "Connection lost · Reconnecting…" until they are back; the others see "Berri lost connection: their dog is running itself" and a 📡 beside the name on the board.
- **Reconnecting** is automatic. A browser that reconnects before the server has noticed its old connection is dead takes its seat over at once.
- **How:** the tab keeps a random token for its lifetime (`sessionStorage`) and sends it on every connection (`resume`); the server knows a player by their first connection's id from then on, whatever connection they are on (`HELD SEATS` in `server/server.js`). A new tab is a new player.

## Controller

A controller works in the race beside the keyboard, laid out like an Xbox 360 pad (`src/game/PlayerInput.js`):

| Button | What it does |
|---|---|
| Right trigger | Go |
| Left trigger | Brake / reverse |
| Left stick or D-pad | Steer (the stick gives part turns) |
| A | Jump |
| X, B or either bumper | Use the item |

In the menus (`src/ui/menuPad.js`; the direction-finding is `src/ui/padNav.js`, tested in `tests/menu-pad.test.js`):

| Button | What it does |
|---|---|
| D-pad or left stick | Move the highlight to the nearest button or tile that way (held: repeats) |
| A | Choose it |
| B | Back (Back, Done, Resume). On dog select and the map screen it only moves the highlight to Leave Game |
| LB / RB | The Grand Prix and Maps tabs |
| Start | In a race: the menu |

It finds buttons by where they are on the screen, so a new screen needs nothing but, where wanted, `data-pad-first` (where the highlight starts) and `data-pad-back` (what B presses). In the race itself only Start does anything; while the race menu is open the controller works the menu and not the dog. In split screen only the controller of the player whose turn it is works dog select. Typing a name still needs a keyboard.

**On screen during the race** (`src/ui/race/HudPanel.jsx`): top right, the lap, the item held and a word when something is up (off the track, fell); bottom right, the speed. No race time, checkpoints or control hints: the controls are behind the controller button on the home screen.

## Full screen and the Esc menu

Clicking a map (or voting for one) puts the game in full screen (`src/fullscreen.js`); a browser only allows that from a click, so a player who never clicks a map stays in a window until they use the menu. **Esc** during a race opens a menu (`src/ui/race/PauseMenu.jsx`): Resume, Full screen on/off (remembered between visits), Quit to Main Menu. The race does not pause. In Chrome and Edge Esc opens the menu and the screen stays full; in browsers that keep Esc for themselves, Esc leaves full screen and the menu opens at the same moment.

## Split screen (two to four players at one computer)

Menu: **Multiplayer → Local → Split Screen**. Each player in turn presses Enter on the keyboard or A on a controller; what each pressed is what they drive with, so it needs a keyboard and a controller, or two or more controllers (four players: a keyboard and three controllers, or four controllers). Once two are in, player 1 presses theirs again to start with that many; it starts by itself when the fourth joins (`LOCAL_PLAYERS` in `shared/botLevels.js`). Two players have half the screen each, left and right. Three or four have a quarter each (player 1 top left, then top right, bottom left, bottom right); with three, the spare quarter shows the race order. They pick dogs in turn, player 1 picks the map or a Grand Prix, and computer dogs fill the places that are left.

How it works: the server sees a single-player room with up to three more seats (`local: true`; only the page that made the room has the key to them). The first player's `GameSession` makes one more for each other player (`guest: true`, in `state.local.guests`) on a connection of its own (`startLocalGame`), and the race screen is one `RaceScreen` per session (`SplitRace` in `src/App.jsx`), so each share of the screen is a whole game of its own: the map is loaded and drawn once per player. `PlayerInput` takes the player's `device`. Only the first session makes the countdown and music. A split-screen game does not survive a page refresh. Menus still need the mouse.

## Voice chat

Voice chat is **on**. Nobody's microphone comes on unless they tick the box, and single-player games have no voice chat. To take it out, build the game with `VITE_VOICE_CHAT=0` and start the server with `VOICE_CHAT=0`. On a public server, note that hosted rooms are listed for anyone to join, and everyone in a room is in its voice chat.

In a multiplayer lobby, the **Voice chat** box on the dog-select screen turns your microphone on; it stays on through the map vote and the race, and **M** mutes and unmutes during the race. Players who leave it off still hear the ones who turned it on. The option is not remembered between visits, so a microphone only comes on because the box was ticked that time.

What is sent is the microphone through a noise gate (`gateMicrophone` in `src/voiceChat.js`): rumble is filtered out, and nothing goes out unless the level has been above the room's background for 60 ms, so key clicks, mouse clicks and a noisy room are not heard between words. The numbers are in `GATE`.

While a player is connected to anyone in voice chat, their music plays at 30% of its usual volume so the voices come through (`MUSIC_UNDER_VOICES` in `src/audio/GameAudio.js`).

The players' browsers send their voices straight to each other (`src/voiceChat.js`, WebRTC); the game server only says who has a microphone on and passes their connection messages across within a room (`setVoice`, `voiceSignal` in `server/server.js`).

- Browsers only give a page the microphone on `https` or `localhost`, so a deployment on plain `http` shows "Voice chat needs a secure (https) address".
- To get through home routers the browsers ask a public address-lookup (STUN) server, by default `stun:stun.l.google.com:19302`. Set `VITE_ICE_SERVERS` (a JSON list) at build time to use your own, add a TURN relay for players whose networks block direct connections, or `[]` for none.

## Special abilities

Each dog has its own special move from a rare Treat Box item: see `../special_abilities/README.md` ("In the game"). Start the server with `ALWAYS_SPECIAL=1` to try them without waiting for the dice.

**Casper** (Patterdale terrier, built in `../casper_patterdale/`) is the eleventh dog: small (`scale: 2.15`), Pablo's stats and a little less (speed 6, acceleration 8.5, agility 9.5, swimming 4.5). His special is **Try Time** (`SPECIALS.casper`, kind `rugby`): his rugby shirt goes on (a second picture of his coat, `public/models/specials/casper_rugby_shirt.jpg`, baked by his build script: blue with an amber yoke, after the Leeds Rhinos home shirt Tom chose, without the crest or sponsors; CASPER and 7 on the back are written by `rugby.js` on a patch his model carries, material `CASPER_ShirtBack`), he turns one slow circle to show it off and gets up on his back legs with the ball in his front paws (his `RugbyRun` clip) and charges for six seconds at 1.5 times his speed, steering himself and knocking over any dog he runs into (`hitRadius`/`reach`, the same contact rule as Pablo's sled). When the time is up he dives back on to all fours and the ball flies up the road at the dog in first place: the server launches it as a Treat Box firework with `look: 'rugby'` (`endSpecial` in `server/server.js`), so it knocks over any dog it passes and bursts on the leader; `src/pickups/firework.js` draws it as a spinning ball. A fall ends the charge with no pass, and if Casper is leading the ball has nobody to go for. The shirt and the ball in his paws are `src/abilities/rugby.js`.

**Jimmy** (Chinese crested in a wheel cart, built in `../jimmy_crested/`) is the twelfth dog and the slowest: under Ralph on everything (speed 4.5, acceleration 9, agility 8.5, swimming 4). He has no back legs: his rump sits in the cart's padded saddle. Where the road drops his top speed is Meela's (`downhill: 9` in `shared/dogStats.js`; `downhillSpeed` fades it in between a 1.5% and a 9% fall, for players and computer dogs alike). His wheels turn in his clips (bones `wheel.L` / `wheel.R`), and in a skid he braces his front legs (`CART_SKID`); he has the slow dogs' drift perks. His special is the **Dragon Dance** (`SPECIALS.jimmy`, kind `dragon`): he becomes a dragon (`src/abilities/dragon.js`) at 1.6 times his speed and sends Treat Box fireworks after the leader two seconds apart. From last place that is seven seconds (about as far as Poppy's wave carries her) and five fireworks; each place nearer the front is a second and a firework less (`specialDurationMs`, `dragonFireworks`), never under three seconds or one firework. If Jimmy is leading, they turn back for the dog behind him (`launchFirework(..., { orBehind: true })` in `server/server.js`).

**Jazz** (Great Dane, built in `../jazz_great_dane/`) is the tenth dog, and the tallest by a head (`scale: 3.7`). Her stats are Pablo's and a shade better: speed 6.5, acceleration 9, agility 10, swimming 5.5. Her special is the **Earthquake** (`SPECIALS.jazz`, kind `quake`; the rules are `QUAKE` in `shared/specials.js`): she rears up and stomps, and every other dog still racing, wherever it is on the map, keeps only 25% of its speed for five seconds. Not a dog in the middle of its own special, under a golden collar's shield, or down a burrow; Jazz herself runs on as she was. The server names the dogs that are slowed (`earthquake`); each player's own game slows its dog (`LocalDog.shaken`), the computer's dogs are slowed in `server/bots.js` (`world.slowed`), and `src/abilities/quake.js` draws the stomp, the rings of dust, the cracked ground and the camera shake.

**Baz & Naz** (the pug twins, built in `../baz_naz_pugs/`) are the ninth dog: two pugs roped together who race as one racer (id `baz_naz`; stats close to Pablo's: speed 6, acceleration 8.5, agility 9.5, swimming 5). Baz is the dog's `model` and Naz its `twin` in `src/config/dogs.js`; `src/game/dogs/duo.js` loads the second pug, swings the two past each other so that each slings the other forward, and draws the rope. Their special is the **Trip Wire** (`SPECIALS.baz_naz`, kind `rope`): for six seconds, at 1.3 times their pace, they run out to the two edges of the road with the rope tight and low between them. Any dog level with them on the road is tripped, wherever it is across it (`ropeTrips`: within 1.4 m up or down the road), unless it is more than 0.9 m off the ground: the rope can be jumped. While it lasts they go straight through whatever stands on the road (`ghost`, `ghostsThrough`: obstacles do not stop them, the edges of the road still do), and like every special nothing knocks them out of it.

**Enzo** (XL bully, built in `../enzo_bully/`) is the eighth dog. His special is the **Belly Bounce** (`SPECIALS.enzo` and `bellyBounce` in `shared/specials.js`): for ten seconds he bounds up the road, 2.4 m high every 0.85 s, at 1.3 times his pace with a further burst at the start of each bounce that fades as he comes down. Any dog within 2.6 m when he is down near the ground is squashed (drawn flat for as long as it is knocked about); a dog he is sailing over is safe. Like the other specials, nothing knocks him out of it.

**Rocky** (border collie, built in `../rocky_collie/`) is the seventh dog. His special is the **Sheep Stampede** (`SHEEP` in `shared/specials.js`, `releaseSheep` and `tickSheep` in `server/server.js`, drawn by `src/abilities/sheep.js`): five sheep set off up the road from just in front of him at 27 m/s, side by side around where he is, each veering towards the nearest dog within 35 m in front of it. A sheep knocks over the first dog it reaches (never Rocky) and is gone; a dog in the middle of its own special shrugs it off but still uses the sheep up (the golden collar does not stop a sheep); any left after ten seconds vanish. They clear chew toys out of the way. Rocky himself carries on running as he was.

**Kombu** (labradoodle, built in `../kombu_labradoodle/`) is the sixth dog. Six dogs race at a time (`RACE_DOGS` in `shared/botLevels.js`): each map's grid is five in a row with the sixth behind the middle, and a Grand Prix gives 10, 8, 6, 4, 2 and 1 points. His special is the **Kelp Dive** (`KELP` in `shared/specials.js`, `kelpDive` in `server/server.js`): seaweed pulls him under for about a second and puts him down further up the road, by a distance that goes with his place (`kelpDistance` in `shared/specials.js`): from 6th, as far as Poppy's wave carries her (her top speed times the wave's 1.9, for its 5 seconds: 161.5 m; `KELP.distance` works it out, so it follows any change to her wave), and less for each place nearer the front (133, 105, 77 m), down to 48 m from 2nd. He passes whoever is in between, the leader included. He is always put down on plain road (not in a jump, a pool or a hazard: a little short of it instead), with the lap and checkpoints of that spot; on the last lap he stops 20 m short of the finish, and if the dive would gain him under 5 m he gets a golden bone's dash instead.

Nothing knocks a dog out of its special: while it lasts, anything thrown, dropped or driven at the dog bounces off, another dog's special included. A fall, a catapult or a burrow still ends it.

**Ralph's burrows** (`shared/burrows.js`): Wendover Woods has four long ones in its model, of which he may use any two a lap (2.2 seconds underground for about 100 m of road). Frostpeak, Modbury Heights, the farm and the Water Park each have two short ones (45 m of road in 1.3 seconds, then a short dash), placed automatically on wide, clear stretches; Treat Road has none. Only Ralph can use them, once a lap each. The mouths are drawn by `src/tracks/burrowMouths.js`.

Treat Boxes give one of six items (rules and odds in `shared/items.js`): tennis ball, chew toy, golden bone, red frisbee, firework and golden collar. The dog in first place only ever gets a ball or a chew toy. The **firework** flies up the road to whoever is in first place, knocks over any dog it passes close to on the way and bursts on the leader. The **golden collar** puts a golden shield round the dog for five seconds: nothing knocks it over except another dog's special. A chew toy stops a frisbee (both are gone), a tennis ball that meets one knocks it off the road (and is spent), and a dog in the middle of its special sweeps aside any toy it touches without being knocked over. Start the server with `FORCE_ITEM=firework` (or `collar`, `frisbee`, `ball`, `toy`, `bone`) to be handed that item at GO and again three seconds after each use.


## Computer-controlled dogs

A room of players always races a full grid: computer dogs take every empty place (two players race three of them), and the host chooses only how good they are, on the character select screen. Alone, a player can also have fewer, or none; a single-player game starts with four at Medium. They join when the race starts, on the dogs nobody picked, and leave when the room goes back to the lobby. The race is over when every player is home: computer dogs still running are placed in the order they were in.

The server drives them (`server/bots.js`). Each is one of the dogs the players did not pick, with that dog's own stats, special and item rules, and its moves go through the same checks as a player's. The three levels (`shared/botLevels.js`) differ in how the dog is driven, not in what it can do, and none is sped up or slowed down behind the scenes:

| | Easy | Medium | Hard |
|---|---|---|---|
| Pace (share of the dog's top speed) | 85% | 93% | 100% |
| Line through a bend | drifts about, runs wide | fairly tight | tight |
| Sees a hazard coming | 0.3 s ahead | 0.7 s | 1.2 s |
| Misjudges a broken bridge | about 1 in 8 | 1 in 25 | 1 in 200 |
| Items | used at random | used when they will do some good | aimed, and the collar kept for something coming |

Start the server with `SOLO_BOTS=0` (or any number up to 4) to change how many a single-player game starts with, and `ROOM_BOTS` for how many a room of players is filled up with.

## Course map

Every race shows a map of the course in the bottom-left corner (`src/minimap.js`): the whole lap from above, an arrow for your own dog (pointing the way it faces) and a dot for every other dog, each in its dog's colour. North is fixed. The outline is the racing line in `shared/pickupSpots.js` that the pickups and the wrong-way check already use, so a new course gets its map without extra work. Red ticks mark Modbury's broken bridges.

## Modbury Heights: ravines and broken bridges

Five ravines are cut across the clifftop trail (`CHASMS` in `shared/modburyData.js`), two of them on the exposed cliff edge where the ravine runs right through to the sea. Each is crossed by a railed plank bridge with its middle missing, 6 to 7.5 m wide.

- Run into the break and the dog falls into the ravine and goes back to its last checkpoint, with the usual fall penalty. Jump it and the dog carries over: a jump at a sprint covers about 13 m.
- The rails stop a dog leaving the bridge by the side; only the break is dangerous.
- A dog in the middle of its special cannot jump, so the special carries it over.
- Each bridge is on a straight, at least 50 m after a checkpoint, with a JUMP sign on the way in and red flagged posts at the break. Pickups keep clear of the bridges and their run-ups.

The server decides the fall (`gap` from `query()` and `rules.gapClearance`); the visuals are `buildBridges` in `src/tracks/modburyHeights/ModburyHeightsTrack.js`.

## Grand Prix

On the map screen, above the single maps, are two Grand Prix: four races in a row with the same dogs (computer dogs included), with points for each place and the scores shown after every race. In a room of players a Grand Prix can be voted for like a map.

| | Races, in order |
|---|---|
| Grand Prix 1 | Wendover Woods, Water Park, Pet Mall Mayhem, Treat Road |
| Grand Prix 2 | Muddy Paws Farm, Modbury Heights, Squelch Hollow Mud Run, Frostpeak Alpine Circuit |

- **Points:** 10, 8, 6, 4, 2 for 1st to 5th. A dog that had not finished when the race ended scores for the place it was in.
- **Between races:** the points table shows for 15 seconds (`LOBBY_RETURN_MS`), then the next race loads by itself.
- **At the end:** the winner and the final scores show for 30 seconds (`GRAND_PRIX_FINAL_MS`), or until someone presses Back to Lobby.
- **Where:** the lists and points are in `shared/grandPrix.js`; the server runs it (`endGrandPrixRace`, `nextGrandPrixRace` in `server/server.js`); the table is drawn by `src/ui/race/ResultsPanel.jsx`.

## After the race

When a race ends the whole room goes back to the dog-select lobby together, with the same players, and the next race starts from there as the first one did. Everyone keeps their dog and can change it; the room is listed again so others can join.

- Once the first dog is home the rest have one minute to finish, shown counting down at the top of the screen, so a dog left standing cannot hold everyone up. When it ends everyone keeps the place they were in; dogs still running see "Race Over".
- When the race is over the finish panel counts down 15 seconds to the lobby. **Back to Lobby** takes everyone there at once (any player can press it); **Main Menu** leaves the room as before.

`FINISH_GRACE_MS` and `LOBBY_RETURN_MS` on the server change the two waits (useful for testing). The server side is "AFTER THE RACE" in `server/server.js`.

## Muddy Paws Farm

A fifth map (`farmyard`): a 1.67 km lap round a farm, generated at runtime like Treat Road and Modbury (no model file), about 92,000 triangles.

| Part of the lap | What happens there |
| --- | --- |
| The Farmyard | Start and finish in front of the farmhouse; chickens run from the dogs |
| The Big Red Barn | The road goes straight through it, walls either side |
| Hay Bale Alley | Six round bales standing in the road to weave through |
| The Orchard | Five sheep amble across the road in file and back (a jump clears a sheep) |
| Windmill Corner | The sails sweep low over the inside of the bend; the outside is always safe |
| Tractor Lane | A tractor and trailer drive across the road and back |
| The Pig Pen | Five mud wallows (60% speed) with a pig trotting round each; the other side of the road is dry |
| The Maize Maze | A narrow path between walls of corn, with a scarecrow standing in the middle |
| Bale Hill | Round bales roll down the hill and across the road, one after another |
| The Duck Pond | A plank bridge with a 6.5 m break in the middle: jump it or fall in and go back to the checkpoint |

Anything that moves knocks a dog over like a tennis ball does (1.1 s). The farm is fenced all the way round, so the pond is the only place to fall.

- **Rules and layout:** `shared/farmData.js`. Everything that moves is a function of the time since GO (`hazardsAt`), so the server and every player agree on where things are without sending positions; the server decides who is hit (`hazardHit`, called from `updateProceduralRace`).
- **Scenery:** `src/tracks/farm/FarmTrack.js` (`createFarm`); `world.triangles()` reports the triangle count.
- **Pickups:** five box rows and six golden bones, kept clear of every hazard (`shared/pickupSpots.js`).
- **Map card:** `public/maps/farmyard.jpg`.

## Water Park

A 1.72 km lap of pools and slides, generated at runtime like the farm (about 66,000 triangles, no model file). It is Poppy's map: there are two long swims, and she is the only dog the water does not slow (she swims at exactly her land speed, never faster).

| Part | What happens there |
|---|---|
| Poolside Plaza | Start and finish on the tiles |
| Ring Lagoon | 186 m of deep water with thirteen rubber rings floating down it. Land on a ring (or swim into one) and it throws the dog up and on to the next, at the same pace for every dog. Miss, and it is a slow swim to the next ring. Poppy can simply swim |
| Beach Ball Boulevard | Three giant beach balls roll across the road and back |
| Fountain Square | Five rows of jets shoot up in turn; there is always a way through between them |
| The Lazy River | 118 m of river flowing the way the race goes: no rings, a swim for everyone |
| Slide Tower | The climb to the top of the slide, 32 m up |
| The Big Slide | A flume all the way down at 1.45 times top speed, and off the lip at the bottom |
| Splash Landing | The jump over the splash pool to the dock, with a landing boost |

A beach ball or a jet knocks a dog over like a tennis ball does (1.1 s). The park is walled all the way round: the only way off the road is the end of the slide, which fires every dog across.

- **Rules and layout:** `shared/waterParkData.js` (`query`, `speedFactor`, `ringAt`, `launchPoint`, `hazardsAt`, `hazardHit`). The slide's jump uses the same server rules as Treat Road's catapult.
- **Scenery:** `src/tracks/waterPark/WaterParkTrack.js` (`createWaterPark`); `world.triangles()` reports the triangle count.
- **The bounce:** in `LocalDog` for the player's dog and `server/bots.js` for the computer dogs, from `rules.bounce`.
- **Map card:** `public/maps/water_park.jpg`.

## Pet Mall Mayhem

A 1.33 km lap of a big pet shopping mall on the day every cage came open, generated at runtime like the farm and the Water Park (about 56,000 triangles, no model file).

| Part | What happens there |
|---|---|
| The Grand Atrium | Start and finish under the dome |
| Cat Alley | Escaped cats dash across the aisle in threes, at two places: jump them or wait |
| The Aquarium | A narrow tunnel between fish tanks, with puddles from the burst ones (65% speed) |
| Trolley Run | Three runaway shopping trolleys roll across and back, then six towers of tins to weave through |
| The Escalator | It is running: 125% of top speed up to the gallery |
| The Upper Gallery | Four hamsters in exercise balls roll from side to side: over them or round them |
| The Big Leap | Off the end of the gallery, over the atrium fountain, down on to the dog beds with a landing boost |

A cat, a trolley or a hamster ball knocks a dog over like a tennis ball does (1.1 s). There are shop fronts or glass all the way round: the only way off the road is the leap, which fires every dog across. Rabbits, tortoises, loose birds, tipped cages and spilt kibble are scenery and are out of the dogs' way.

- **Rules and layout:** `shared/petMallData.js`. The leap uses the same server rules as Treat Road's catapult.
- **Scenery:** `src/tracks/petMall/PetMallTrack.js` (`createPetMall`).
- **Map card:** `public/maps/pet_mall.jpg`.  **Tests:** `tests/pet-mall.test.js`.
- **Music:** `public/audio/pet_mall.mp3`.

## Squelch Hollow Mud Run

A 1.45 km mud run in the pouring rain, generated at runtime like the other built maps (about 43,000 triangles, no model file). It is the slippery map: everywhere is wet, so a dog slides a little wherever it turns, and a lot on the clay.

| Part | What happens there |
|---|---|
| The Paddock | Start and finish on wet grass, beside the event tents |
| The Slip ’n’ Slide | Bend after bend of wet clay: a dog carries on the way it was going, and is slow to pick up speed |
| Bog Hollow | Five patches of deep mud (55% speed) with a firm line between them, then a marshal's quad bike sliding across and back |
| Log Roll | Three logs roll down the bank and across: jump them. Then six stacks of tyres to weave through |
| Welly Hill | The long wet climb, 24 m up |
| The Mudslide | Down again at 135% of top speed, with almost no grip |
| The Mud Pit | Off the lip at the bottom, over the pit, with a landing boost |

- **Slipperiness:** `slipAt(s)` in `shared/mudParkData.js`, 0.25 everywhere, 1 on the clay, 0.85 on the slide. `rules.slip` says what full slipperiness does: a dog keeps 20% of its grip and 60% of its acceleration. `LocalDog` applies it to the player's dog; the computer dogs ease off more in wet bends.
- **Hazards:** the quad bike and the logs knock a dog over for 1.1 s; a jump clears a log, nothing clears the quad bike.
- **Scenery and rain:** `src/tracks/mudPark/MudParkTrack.js` (`createMudPark`). The rain is 1,500 streaks in a box that travels with the player's dog.
- **Map card:** `public/maps/mud_park.jpg`.  **Tests:** `tests/mud-park.test.js`.  **Music:** `public/audio/mud_park.mp3`.

## Grand Prix 3: Dune Dash, the Speed Bowl, Kombu's House, Neon Nexus

Four maps made from one shared builder, so each is a short description and its scenery:

- `shared/trackKit.js` (`makeTrack`) turns control points and a list of parts into a track with the same interface as the hand-written ones. The parts: a leap or cannon over a gap (`launchBetween`), solid `obstacles`, slow `patches`, boost `strips`, pools of `water` across the road, `dividers` (an island down the middle: the road is two roads for a while), `branches` (a second road that leaves the main one, runs beside it at a distance and a height of its own, and joins it again: Neon Nexus), `doors` (doorways: the road is narrow for a few metres: Kombu's House, the Vets), `lifts` (a step UP in the road at a control point, with a `launchBetween(..., { lift: true })` over it that carries a dog into the shaft, straight up it and out at the top: Kombu's House), `platforms` (a stretch with no road, only platforms that slide from side to side: Neon Nexus. Where they are depends on the race clock, so the server calls `setClock` before it asks where a dog is, and `query().gap` says there is nothing under it), and `hazardsAt(t)` for everything that moves. Each kit track also says where pickups and burrows must not go (`pickupHazards`), and may say exactly where its Treat Boxes and Golden Bones go (`pickups`) and how many boxes are in a row (`boxLanes`).
  - A branch never moves the lap's own line: the middle of the main road is still where checkpoints, rescues and the racing line are. `query` says which road a position is on (`lane`), holds a dog on one or the other, and gives the branch's own height; checkpoints beside a branch have a radius wide enough to be passed from either road; the computer's dogs decide once a lap whether to take each branch (`bots` in the branch, the share that do).
- `src/tracks/trackKit3d.js` (`createKitWorld`) draws what they share (sky, ground, road, walls, start arch, boost pads, patches, pools, islands, branch roads, and `addBombs` for bombs) and hands each map a `build(ctx)` for its own scenery and moving things.

| Map | Id | What is on it |
|---|---|---|
| **Dune Dash** | `desert_dunes` | Rolling dunes with soft sand (60% speed), three whirlwinds wandering Twister Flats (nothing jumps one), tumbleweed (jump it), boulders in the canyon, and a leap off the great dune |
| **The Speed Bowl** | `speed_bowl` | A 500 m kart oval, **five laps**, nothing in the way. Six rows of five Treat Boxes a lap (going into and coming out of each bend, and the middle of each straight) and a pair of Golden Bones between every two rows |
| **Kombu's House** | `kombu_house` | A way through the house, not round it (it replaced Enzo's House). Up the drive, in at the conservatory's double glass doors on the left (they slide open as the dog being followed comes up to them; the front door is scenery on the right), the living room (a red toy car driving a figure of eight: nothing jumps it), left into the pool room and round through the pool and back out of the same doorway (in on one side of its pillar, out on the other), left into the kitchen (knives and forks drop where a red shadow shows, a kettle slides about), left to the lift, which fires dogs up the shaft to the floor above, the hallway (five doors swinging both ways, hinged on alternate walls), the computer room (desks, and a man in a wheelchair going from wall to wall), out of a second pair of glass doors, left into the dog pen, over the hill past the chickens, right down the back drive (parked vans, bins), right along the main road and right into the drive. The house is built into the hill, so the floor above comes out at ground level behind it. The lap passes close beside itself at the pool room doorway: `tests/new-maps.test.js` checks that every place on the road is found on its own stretch. In the game a dog running +z has +x on its LEFT, and a positive distance across a kit road is to its RIGHT; the plan in `shared/kombuHouseData.js` is drawn as a map (east, north) and turned into x and z there |
| **Neon Nexus** | `neon_nexus` | 4.95 km above a city at night, **three laps of about two minutes**, there and back across the city four times. **Mega boost pads** (pink; 2.6 times top speed, and the boost stays with the dog for 3 seconds after the pad) wherever there is one road. Four times a second road leaves the main one and joins it again; one of each pair is the longer and has the mega pads and a trail of Golden Bones, the other has ordinary pads (blue; 1.8 times). Three platform crossings: no road, three 40 m platforms sliding from side to side with 8 m breaks to jump; a dog that drops goes back to the checkpoint just before the crossing. **Three catapults** (run on to the pad): over the second hairpin, up the ramp, and the accelerator, 260 m back to the start. A landing boost and a pad's boost do not add up. No bombs. Numbers: `MEGA`, `PAD`, `CROSSING`, `FLIGHT` in `shared/neonData.js`; `PAD_KICK` in `shared/items.js` |

Laps per map: `lapsFor(mapId)` in `shared/maps.js` (three, unless the track says otherwise). Computer dogs take the open side of a fork if they are good enough to be paying attention (`forks` in `server/bots.js`). Tests: `tests/new-maps.test.js`.

## Grand Prix 4: the Yorkshire Dales, the Boneyard, the Vets, Monkey Jungle

Four more maps from the same builder (`shared/trackKit.js`, `src/tracks/trackKit3d.js`), raced in this order.

| Map | Id | What is on it |
|---|---|---|
| **Yorkshire Dales** | `yorkshire_dales` | 2.03 km over two fells. Boost pads up both climbs (1.5 times top speed, held for 1.6 s after each pad); a descent adds up to 45% (`hills` in the track). Wheels of cheese roll down the Long Pull and two flocks of sheep cross the pasture (a jump clears either), a ford to wade, and the Scar: the lane goes into a cave in the limestone cliff, 80 m down through it, and out through a waterfall into a pool to wade. No leap |
| **The Boneyard** | `boneyard` | 1.76 km in the rain, the shape of a bone from above. 82 Golden Bones a lap, in pairs. Two puddles to wade and two bogs to swim, sticky mud, great bones rolling across (jump them), mud spouts that bubble and then go off (nothing jumps one). No leap. Slippery everywhere |
| **The Vets** | `the_vets` | 1.66 km, nearly all of it indoors, on three storeys. The start line is on a **treadmill** that runs in at the front door (a boost pad: 1.3 times top speed, railed both sides). Ground floor: reception, the waiting room (cones of shame rolling from wall to wall), the stairs up (giant pills bouncing down). First floor: the needle corridor (syringes flying down four lanes, never all four at once), the operating theatre (three vets in masks running at you: nothing jumps a vet), the top stairs (a fourth vet running down). Top floor: the kennels (wet floor), the long ward (two loose trolleys), the way out (a fifth vet), and **the window**: the road stops at the front wall 18 m up, and the dog falls into the forecourt and runs round on to the treadmill again |
| **Monkey Jungle** | `monkey_jungle` | 2.43 km, four times across a river gorge: a swaying rope bridge, four planks hung on vines to jump along, a fallen log (still, and narrow), and a narrower bridge that sways more. **None of them has sides**: step off one or miss a swing and the dog goes back to the checkpoint before it. **The Tree Stair** winds three quarters of the way round a kapok tree, 14 m up, and stops: run off the end. Four **snakes** go round and round circles in the trail (jump one, or pass behind its tail), monkeys scamper across (jump them), stone balls roll down the temple ramp (never all three lanes), coconuts are thrown from the trees (the shadow comes first), and there is a lily pond to wade |

New in the builder for these:
- **Hills in the ground:** `ctx.terrain({ height, color, ... })` in `trackKit3d.js` makes ground that follows the road and is whatever `height(x, z)` says further out (the Dales and the jungle take their road heights from the same function). `road.skirt` joins the road's edge to it.
- **Downhill speed:** `hills: { down, downMax }` in a track definition.
- **Rain:** `ctx.rain()`.
- **Drops:** `drops: [k]` in a track definition: the road stops dead at control point k and carries on at the height of the next one (the Vets' window, the end of the Tree Stair). A dog that runs off the end falls (`DROP` in `shared/handling.js`); no checkpoint, pickup or burrow is put where it is still in the air. `aloft` in `ctx.terrain` leaves the ground alone under a road on stilts.
- **Rope bridges:** a `platforms` zone with one pad from end to end. `platform: false` in a map's look means the map draws its platforms itself.
- **Pickups by rule:** `autoPickups: { rowEvery, boneEvery, apart, pairs }` lays the Treat Boxes and Golden Bones out wherever the road is clear.
- **Computer dogs** step aside from anything they cannot jump (`watchHazards` in `server/bots.js`), and read `hazardZones` in a track to know where to look.

Tests: `tests/grand-prix-4.test.js`. Map cards: `public/maps/<id>.jpg`. These four have no music of their own yet: each borrows another map's (`src/audio/GameAudio.js`).

## Menus (the Zoomie Racers look)

The home screen, dog select, map select and vote, join and split-screen join share one look (`src/ui/menu.css`): blue sky, Lilita One lettering (`public/fonts/`, SIL Open Font License) and glossy yellow and blue buttons drawn in CSS (`.zr-btn`).

- **Home** (`MenuScreen.jsx`): the picture is `public/ui/home.webp`, made from `../Zoomie Racers_ Paws in Motion.png` (logo and dogs, no buttons painted in); the name box and buttons are drawn over it, placed in parts of the picture's width (`cqw`). The round logo (`../Zoomie Racers Logo with Happy Pointer-2.png`, its painted checkerboard cut away) becomes `public/ui/logo.webp` and the tab icons `favicon-32.png`, `favicon-192.png` and `apple-touch-icon.png`. Single Player and Multiplayer only for now (the painted Grand Prix and Maps buttons are painted out too; `startSinglePlayer('maps')` still opens the map screen on the Maps tab if a button for it comes back). The gear is full screen and accessibility mode; the controller lists the controls.
- **Dog select** (`DogSelectScreen.jsx`): a box of square portraits and a Random tile; the dog highlighted is shown beside it with its stats and special (`SPECIAL_WORDS` in that file: add a line for a new dog).
- **Map screen** (`MapScreen.jsx`): two tabs. Maps is a box of the square icons (`public/maps/icons/<id>.webp`); Grand Prix is four boxes, each holding its four maps' icons. The side box describes whatever is highlighted.
- **Highlight and choose** (`tileGrid.js`): pointing with a mouse highlights and a click chooses; on a touch screen the first tap highlights and a second tap, or the button in the side box, chooses; arrow keys move, Enter chooses.
- **Pictures:** `python3 ../icons/make_web_copies.py` makes the small web copies (map icons, portraits as `.webp` beside the `.png`, the two tabs cut from Tom's sheets, the home picture, the trophy). A new map needs an entry in its `ICONS` list; a new dog only needs its portrait `.png`.

## Code layout (client)

`src/App.jsx` only connects the session and shows its current screen. Everything else is in:

| Folder | What is in it |
|---|---|
| `src/session/` | `GameSession`: the socket, the room, which screen is showing, the race clock, and every lobby action (host, join, pick a dog, vote). The screens read its state through `useSession`. |
| `src/ui/` | The menus' look is `menu.css`. One component per screen (`MenuScreen`, `JoinScreen`, `DogSelectScreen`, `MapScreen`, `RaceScreen`) and the race overlays in `ui/race/`. |
| `src/game/` | The race. `Race` builds everything, listens to the server and runs the frame loop. It owns a `RaceScene` (renderer, camera, lights), a `TrackWorld` (the map and its ground, water and obstacle checks), a `ChaseCamera`, `PlayerInput`, `RescueWatch` (lost dogs) and a `RaceHud` (the readouts written every frame). |
| `src/game/dogs/` | `DogAvatar` (model and clips), `LocalDog` (the player's dog: all the movement) and `RemoteDog` (other players' dogs, following the server). `animation.js` and `contact.js` hold the stride and bumping helpers. |
| `src/config/` | The dogs (`dogs.js`), the handling numbers (`handling.js`) and build switches (`env.js`). The dogs' ratings, the steering and jump numbers and the golden bone's boost are in `shared/` (`dogStats.js`, `handling.js`, `items.js`), because the server drives the computer dogs with them. |
| `src/audio/` | `GameAudio`: selection sounds, the countdown and map music. |

Tracks, pickups and abilities are where they were (`src/tracks`, `src/pickups`, `src/abilities`).
