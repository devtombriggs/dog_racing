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


## Voice chat (switched off for now)

Voice chat is built but **off by default**: the lobby shows no option, no microphone is asked for, no connections are made between players, and the server ignores the voice messages. To bring it back, build the game with `VITE_VOICE_CHAT=1` and start the server with `VOICE_CHAT=1`. Before doing that for a public server, note that hosted rooms are listed for anyone to join, and everyone in a room is in its voice chat.

When it is on: in a multiplayer lobby, the **Voice chat** box on the dog-select screen turns your microphone on; it stays on through the map vote and the race, and **M** mutes and unmutes during the race. Players who leave it off still hear the ones who turned it on. The option is not remembered between visits, so a microphone only comes on because the box was ticked that time.

The players' browsers send their voices straight to each other (`src/voiceChat.js`, WebRTC); the game server only says who has a microphone on and passes their connection messages across within a room (`setVoice`, `voiceSignal` in `server/server.js`).

- Browsers only give a page the microphone on `https` or `localhost`, so a deployment on plain `http` shows "Voice chat needs a secure (https) address".
- To get through home routers the browsers ask a public address-lookup (STUN) server, by default `stun:stun.l.google.com:19302`. Set `VITE_ICE_SERVERS` (a JSON list) at build time to use your own, add a TURN relay for players whose networks block direct connections, or `[]` for none.

## Special abilities

Each dog has its own special move from a rare Treat Box item: see `../special_abilities/README.md` ("In the game"). Start the server with `ALWAYS_SPECIAL=1` to try them without waiting for the dice.


## Course map

Every race shows a map of the course in the bottom-left corner (`src/minimap.js`): the whole lap from above, an arrow for your own dog (pointing the way it faces) and a dot for every other dog, each in its dog's colour. North is fixed. The outline is the racing line in `shared/pickupSpots.js` that the pickups and the wrong-way check already use, so a new course gets its map without extra work. Red ticks mark Modbury's broken bridges.

## Modbury Heights: ravines and broken bridges

Five ravines are cut across the clifftop trail (`CHASMS` in `shared/modburyData.js`), two of them on the exposed cliff edge where the ravine runs right through to the sea. Each is crossed by a railed plank bridge with its middle missing, 6 to 7.5 m wide.

- Run into the break and the dog falls into the ravine and goes back to its last checkpoint, with the usual fall penalty. Jump it and the dog carries over: a jump at a sprint covers about 13 m.
- The rails stop a dog leaving the bridge by the side; only the break is dangerous.
- A dog in the middle of its special cannot jump, so the special carries it over.
- Each bridge is on a straight, at least 50 m after a checkpoint, with a JUMP sign on the way in and red flagged posts at the break. Pickups keep clear of the bridges and their run-ups.

The server decides the fall (`gap` from `query()` and `rules.gapClearance`); the visuals are `buildBridges` in `src/tracks/modburyHeights/ModburyHeightsTrack.js`.

## After the race

When a race ends the whole room goes back to the dog-select lobby together, with the same players, and the next race starts from there as the first one did. Everyone keeps their dog and can change it; the room is listed again so others can join.

- Once the first dog is home the rest have 90 seconds to finish, so a dog left standing cannot hold everyone up. Dogs still running when it ends see "Race Over".
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

## Code layout (client)

`src/App.jsx` only connects the session and shows its current screen. Everything else is in:

| Folder | What is in it |
|---|---|
| `src/session/` | `GameSession`: the socket, the room, which screen is showing, the race clock, and every lobby action (host, join, pick a dog, vote). The screens read its state through `useSession`. |
| `src/ui/` | One component per screen (`MenuScreen`, `JoinScreen`, `DogSelectScreen`, `MapScreen`, `RaceScreen`) and the race overlays in `ui/race/`. |
| `src/game/` | The race. `Race` builds everything, listens to the server and runs the frame loop. It owns a `RaceScene` (renderer, camera, lights), a `TrackWorld` (the map and its ground, water and obstacle checks), a `ChaseCamera`, `PlayerInput`, `RescueWatch` (lost dogs) and a `RaceHud` (the readouts written every frame). |
| `src/game/dogs/` | `DogAvatar` (model and clips), `LocalDog` (the player's dog: all the movement) and `RemoteDog` (other players' dogs, following the server). `animation.js` and `contact.js` hold the stride and bumping helpers. |
| `src/config/` | The dogs and their stats (`dogs.js`), the handling numbers (`handling.js`) and build switches (`env.js`). |
| `src/audio/` | `GameAudio`: selection sounds, the countdown and map music. |

Tracks, pickups and abilities are where they were (`src/tracks`, `src/pickups`, `src/abilities`).
