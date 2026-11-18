# Dog Racing

Choose **Wendover Woods**, **Frostpeak Alpine Circuit**, **Treat Road** or **Modbury Heights** from the main menu, then start Single Player or Host Game. Multiplayer guests use the host's map. The host can change maps in the lobby; chosen dogs stay ready.

**Wendover Woods** keeps its 1.47 km circuit, starting grid and three-lap race, with four amber-marked burrow shortcuts and three swimming crossings. Drive Ralph forward into a small burrow to travel automatically to its paired exit in 1.1 seconds, then receive a 30% boost for 1.1 seconds. Each burrow works once per lap. The server checks the approach and preceding checkpoints, credits only the bypassed checkpoints, and rejects old movement packets after the exit. Other dogs follow the main course.

Bluebell Splash, Willow Water and Otter Pond have sloping banks, submerged beds, floating dogs, paddling animations and wakes. Poppy swims at 95% of her normal top speed; Ralph and Meela swim at 38%, with the other dogs between them. Swimming counts as being on the course, so it does not trigger the off-track rescue timer. Dogs cannot jump out of deep water. The existing trot animation supplies the paddling motion. The woodland also has warm lighting, moving water, reeds, buoys and signs.

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


## Voice chat

Voice chat is **on**. Nobody's microphone comes on unless they tick the box, and single-player games have no voice chat. To take it out, build the game with `VITE_VOICE_CHAT=0` and start the server with `VOICE_CHAT=0`. On a public server, note that hosted rooms are listed for anyone to join, and everyone in a room is in its voice chat.

In a multiplayer lobby, the **Voice chat** box on the dog-select screen turns your microphone on; it stays on through the map vote and the race, and **M** mutes and unmutes during the race. Players who leave it off still hear the ones who turned it on. The option is not remembered between visits, so a microphone only comes on because the box was ticked that time.

While a player is connected to anyone in voice chat, their music plays at 30% of its usual volume so the voices come through (`MUSIC_UNDER_VOICES` in `src/audio/GameAudio.js`).

The players' browsers send their voices straight to each other (`src/voiceChat.js`, WebRTC); the game server only says who has a microphone on and passes their connection messages across within a room (`setVoice`, `voiceSignal` in `server/server.js`).

- Browsers only give a page the microphone on `https` or `localhost`, so a deployment on plain `http` shows "Voice chat needs a secure (https) address".
- To get through home routers the browsers ask a public address-lookup (STUN) server, by default `stun:stun.l.google.com:19302`. Set `VITE_ICE_SERVERS` (a JSON list) at build time to use your own, add a TURN relay for players whose networks block direct connections, or `[]` for none.

## Special abilities

Each dog has its own special move from a rare Treat Box item: see `../special_abilities/README.md` ("In the game"). Start the server with `ALWAYS_SPECIAL=1` to try them without waiting for the dice.

Nothing knocks a dog out of its special: while it lasts, anything thrown, dropped or driven at the dog bounces off, another dog's special included. A fall, a catapult or a burrow still ends it.

**Ralph's burrows** (`shared/burrows.js`): Wendover Woods has four long ones in its model, of which he may use any two a lap (2.2 seconds underground for about 100 m of road). Frostpeak, Modbury Heights, the farm and the Water Park each have two short ones (45 m of road in 1.3 seconds, then a short dash), placed automatically on wide, clear stretches; Treat Road has none. Only Ralph can use them, once a lap each. The mouths are drawn by `src/tracks/burrowMouths.js`.

Treat Boxes give one of six items (rules and odds in `shared/items.js`): tennis ball, chew toy, golden bone, red frisbee, firework and golden collar. The dog in first place only ever gets a ball or a chew toy. The **firework** flies up the road to whoever is in first place, knocks over any dog it passes close to on the way and bursts on the leader. The **golden collar** puts a golden shield round the dog for five seconds: nothing knocks it over except another dog's special. A chew toy stops a frisbee (both are gone), a tennis ball that meets one knocks it off the road (and is spent), and a dog in the middle of its special sweeps aside any toy it touches without being knocked over. Start the server with `FORCE_ITEM=firework` (or `collar`, `frisbee`, `ball`, `toy`, `bone`) to be handed that item at GO and again three seconds after each use.


## Computer-controlled dogs

The host chooses how many computer dogs fill the empty places on the grid (0 to 4) and how good they are, on the character select screen; a single-player game starts with four at Medium, a room of players with none. They join when the race starts, on the dogs nobody picked, and leave when the room goes back to the lobby. The race is over when every player is home: computer dogs still running are placed in the order they were in.

The server drives them (`server/bots.js`). Each is one of the five dogs with that dog's own stats, special and item rules, and its moves go through the same checks as a player's. The three levels (`shared/botLevels.js`) differ in how the dog is driven, not in what it can do, and none is sped up or slowed down behind the scenes:

| | Easy | Medium | Hard |
|---|---|---|---|
| Pace (share of the dog's top speed) | 85% | 93% | 100% |
| Line through a bend | drifts about, runs wide | fairly tight | tight |
| Sees a hazard coming | 0.3 s ahead | 0.7 s | 1.2 s |
| Misjudges a broken bridge | about 1 in 8 | 1 in 25 | 1 in 200 |
| Items | used at random | used when they will do some good | aimed, and the collar kept for something coming |

Start the server with `SOLO_BOTS=0` (or any number up to 4) to change how many a single-player game starts with.

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

A 1.72 km lap of pools and slides, generated at runtime like the farm (about 66,000 triangles, no model file). It is Poppy's map: there are two long swims, and she is the only dog as fast in the water as on land.

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

## Code layout (client)

`src/App.jsx` only connects the session and shows its current screen. Everything else is in:

| Folder | What is in it |
|---|---|
| `src/session/` | `GameSession`: the socket, the room, which screen is showing, the race clock, and every lobby action (host, join, pick a dog, vote). The screens read its state through `useSession`. |
| `src/ui/` | One component per screen (`MenuScreen`, `JoinScreen`, `DogSelectScreen`, `MapScreen`, `RaceScreen`) and the race overlays in `ui/race/`. |
| `src/game/` | The race. `Race` builds everything, listens to the server and runs the frame loop. It owns a `RaceScene` (renderer, camera, lights), a `TrackWorld` (the map and its ground, water and obstacle checks), a `ChaseCamera`, `PlayerInput`, `RescueWatch` (lost dogs) and a `RaceHud` (the readouts written every frame). |
| `src/game/dogs/` | `DogAvatar` (model and clips), `LocalDog` (the player's dog: all the movement) and `RemoteDog` (other players' dogs, following the server). `animation.js` and `contact.js` hold the stride and bumping helpers. |
| `src/config/` | The dogs (`dogs.js`), the handling numbers (`handling.js`) and build switches (`env.js`). The dogs' ratings, the steering and jump numbers and the golden bone's boost are in `shared/` (`dogStats.js`, `handling.js`, `items.js`), because the server drives the computer dogs with them. |
| `src/audio/` | `GameAudio`: selection sounds, the countdown and map music. |

Tracks, pickups and abilities are where they were (`src/tracks`, `src/pickups`, `src/abilities`).
