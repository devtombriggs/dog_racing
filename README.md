# Dog Racing

Choose **Wendover Woods** or **Frostpeak Alpine Circuit** from the main menu, then start Single Player or Host Game. Multiplayer guests use the host's map. The host can change maps in the lobby; changing the course clears everyone's ready status.

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

Restart the backend after updating: both client and server need the lobby browser and map selection support. For Docker, rebuild both services with `docker compose up --build -d`.

Checks: `npm test`, `npm run lint`, and `npm run build`. Tests exercise the socket handlers in memory, live lobby listings, single-player privacy, capacity and stale joins, map-specific laps and start positions, and the Frostpeak GLB geometry/heightmap. They do not replace a browser playtest.

Map definitions live in `shared/maps.js`. `shared/frostpeak.json` is copied from `../frostpeak_alpine_circuit/frostpeak_track_config.json`; the GLB and heightmap are copied into `public/models/`. Refresh all three copies if the source map is regenerated.
