#!/usr/bin/env bash
# Builds the Fire TV / Android TV app (android/README.md) without Gradle: the Android SDK's own tools, straight.
#
#   android/build.sh https://your-game.example [version]
#
# Makes android/out/zoomies.apk, signed with android/zoomies.keystore (made the first time: keep it, an update
# only installs over the old app when it is signed with the same key).  Needs Java 17+ and, in $ANDROID_HOME
# (default ~/Android/Sdk), platforms;android-34 and build-tools;34.0.0.
set -euo pipefail

[ $# -ge 1 ] || { echo "Give the address of the game, e.g. android/build.sh https://zoomies.example" >&2; exit 1; }
URL="$1"
VERSION="${2:-1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
TOOLS="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="$HERE/out"
WORK="$OUT/work"
KEYSTORE="${ZOOMIES_KEYSTORE:-$HERE/zoomies.keystore}"
# (the d8 in build-tools 34 crashes on classes from a newer javac: the one with the command-line tools does not)
D8="$SDK/cmdline-tools/latest/bin/d8"; [ -x "$D8" ] || D8="$TOOLS/d8"

case "$URL" in http://*|https://*) ;; *) echo "The address must start with https:// (or http:// for testing at home)" >&2; exit 1 ;; esac
[ -f "$PLATFORM" ] || { echo "No Android SDK platform 34 in $SDK" >&2; exit 1; }

rm -rf "$WORK" && mkdir -p "$WORK/res/values" "$WORK/gen" "$WORK/classes" "$WORK/src/uk/zoomies/racing"

# the address and the version go into the app as a string and a constant
xml_url=$(printf '%s' "$URL" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e "s/'/\\\\'/g")
cat > "$WORK/res/values/strings.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Zoomies Racing</string>
    <string name="game_url" translatable="false">$xml_url</string>
</resources>
EOF
cat > "$WORK/src/uk/zoomies/racing/BuildInfo.java" <<EOF
package uk.zoomies.racing;
final class BuildInfo { static final String VERSION = "$VERSION"; private BuildInfo() {} }
EOF

echo "Resources..."
"$TOOLS/aapt2" compile --dir "$HERE/res" -o "$WORK/res-app.zip"
"$TOOLS/aapt2" compile --dir "$WORK/res" -o "$WORK/res-made.zip"
"$TOOLS/aapt2" link -o "$WORK/unsigned.apk" -I "$PLATFORM" --manifest "$HERE/AndroidManifest.xml" \
  --java "$WORK/gen" --min-sdk-version 22 --target-sdk-version 34 --version-code "$VERSION" --version-name "$VERSION" \
  "$WORK/res-app.zip" "$WORK/res-made.zip"

echo "Java..."
javac -g -nowarn -source 8 -target 8 -bootclasspath "$PLATFORM" -classpath "$PLATFORM" -d "$WORK/classes" \
  $(find "$HERE/src" "$WORK/src" "$WORK/gen" -name '*.java') 2>&1 | grep -v -E 'bootstrap class path|source value 8|target value 8|To suppress warnings|^[0-9]+ warnings?$' || true
[ -n "$(find "$WORK/classes" -name '*.class')" ] || { echo "The Java did not compile" >&2; exit 1; }
(cd "$WORK/classes" && jar cf "$WORK/classes.jar" .)
"$D8" --release --min-api 22 --lib "$PLATFORM" --output "$WORK" "$WORK/classes.jar"
(cd "$WORK" && zip -q -u unsigned.apk classes.dex)

echo "Signing..."
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias zoomies -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass zoomies -keypass zoomies -dname "CN=Zoomies Racing" > /dev/null 2>&1
  echo "  made $KEYSTORE: keep it (and out of git)"
fi
"$TOOLS/zipalign" -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"
"$TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-key-alias zoomies --ks-pass pass:zoomies --key-pass pass:zoomies \
  --out "$OUT/zoomies.apk" "$WORK/aligned.apk"
rm -rf "$WORK"
echo "Made $OUT/zoomies.apk ($(du -h "$OUT/zoomies.apk" | cut -f1)), version $VERSION, opening $URL"
