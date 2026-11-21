# Zoomies Racing on Fire TV / Android TV

A small Android app: a full-screen web view of the deployed game.  The game itself is not in the app; every
update to the server is in the app straight away, with nothing to reinstall.

## Build

    android/build.sh https://your-game.example        # (a second number, e.g. 2, for each new version you install over the old)

It makes `android/out/zoomies.apk` (about 0.5 MB).  It needs Java and the Android SDK in `~/Android/Sdk`
(`platforms;android-34`, `build-tools;34.0.0`, and the command-line tools).  No Gradle.

The first build makes `android/zoomies.keystore`, the key the app is signed with.  **Keep it** (it is kept out of git):
an update only installs over the app already on the stick if it is signed with the same key.

For a test on the home network, an `http://192.168.x.x:8080` address works too.

## Onto the Fire Stick (Downloader)

1. Put `zoomies.apk` somewhere the stick can download it, e.g. in the game's `public/` folder before building the
   Docker image, so it is at `https://your-game.example/zoomies.apk`.
2. On the stick: install **Downloader** from the Amazon app store.
3. Settings → My Fire TV → Developer options → Install unknown apps → Downloader: **On**.
   (No Developer options?  Settings → My Fire TV → About → click the stick's name seven times.)
4. In Downloader, type the address of the APK, then **Install**.  Zoomies Racing appears in Your Apps.

## On the TV

- **A controller** (Bluetooth, paired in Settings → Controllers): races and menus as on a computer.
- **The remote**: the arrows move round the menus, the middle button presses, Back goes back (in a race:
  the race menu), Menu opens the race menu.  It cannot race: it has no triggers.
- **The frame rate** shows at the top.  Under about 30 in a race is too slow.

The page knows it is in the app from its user agent (`ZoomiesTV`): `src/tv.js`.  `?tv=1` on a computer tries
the TV behaviour in a browser, and `?fps=1` shows the frame rate anywhere.
