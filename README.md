# Dog Racing

Choose **Wendover Woods**, **Frostpeak Alpine Circuit**, **Treat Road** or **Modbury Heights** from the main menu, then start Single Player or Host Game. Multiplayer guests use the host's map. The host can change maps in the lobby; chosen dogs stay ready.

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
