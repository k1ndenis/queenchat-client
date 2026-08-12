# QueenChat Android build on Arch Linux

This project already contains a Capacitor Android project in `android/`.
The app uses Capacitor `server.url` and loads the production web app from:

```text
https://queenchat.ru
```

Current Android identifiers:

```text
appId / applicationId: ru.queenchat.app
appName: QueenChat
```

Do not put secrets, signing keys, APK/AAB files, or real Firebase credentials into Git.

## Local machine requirements

- Arch Linux
- Node.js 22
- JDK 21
- Android Studio
- Android SDK Platform 36
- Android SDK Build Tools
- Android SDK Platform Tools
- Android command-line tools, installed by Android Studio SDK Manager

Install basic system packages:

```bash
sudo pacman -S jdk21-openjdk android-tools
```

Install Android Studio and the Android SDK through Android Studio SDK Manager.
Using Android Studio is the easiest way to install SDK Platform 36, Build Tools,
Platform Tools, emulator tools, and to accept SDK licenses.

Set environment variables in your shell profile, adjusting the SDK path if needed:

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Verify:

```bash
node -v
java -version
adb version
sdkmanager --list
```

Expected major versions:

```text
Node.js: 22.x
Java: 21.x
Android SDK Platform: android-36
```

## Firebase Android config

Native Firebase Messaging requires the Android Firebase config file:

```text
client/android/app/google-services.json
```

Get it from Firebase Console for package name:

```text
ru.queenchat.app
```

Do not commit the real `google-services.json`.

Without this file the Gradle project can still be opened, but native FCM will
not be fully configured.

## Build commands

From the project root:

```bash
cd client
npm install
npm exec tsc -- -b
npm run build
npx cap sync android
npx cap open android
```

Android Studio should open the `client/android` project. Let it sync Gradle and
install any missing SDK components it asks for.

To build a debug APK from the terminal:

```bash
cd client/android
./gradlew assembleDebug
```

Expected debug APK path:

```text
client/android/app/build/outputs/apk/debug/app-debug.apk
```

## Release builds and signing

The first real QueenChat in-app update is a **release** variant with:

```text
applicationId: ru.queenchat.app
versionCode:    2
versionName:    1.1.0
debuggable:     false
```

It is intentionally signed with the same existing certificate as the APK
already installed by users. This preserves Android's update chain and app data.
The expected signer SHA-256 is:

```text
ce3c434a4a6ab09b4410639e76c19af54013295e9010b6e12a8d02c82293b4db
```

### Critical signing-key warning

The existing `~/.android/debug.keystore` is now, in practice, a **critical
QueenChat production signing key**. Do not delete, regenerate, replace, or
commit it. Make at least two encrypted backups outside the VPS and outside Git,
and retain the passwords and alias in a separate secure password manager. A new
key cannot update APKs signed by this certificate.

The build reads these local-only values in this order: Gradle property,
environment variable, then `android/keystore.properties`. The last file is
ignored by Git; start from `android/keystore.properties.example` and give it
mode `0600`.

```properties
QUEENCHAT_KEYSTORE_PATH=/absolute/path/to/your/keystore
QUEENCHAT_KEYSTORE_PASSWORD=local-only-value
QUEENCHAT_KEY_ALIAS=local-only-value
QUEENCHAT_KEY_PASSWORD=local-only-value
```

For the approved Arch migration build, use the existing
`$HOME/.android/debug.keystore` and its existing local credentials. Do not put
the credentials in repository files, shell history, or public documentation.

Build on Arch from a clean client checkout:

```bash
cd ~/queen-chat-client-build/client
npm ci
cd android
cp keystore.properties.example keystore.properties
chmod 600 keystore.properties
# Edit the ignored keystore.properties with the existing local key path,
# password, alias, and key password. For this migration the key path is:
# /home/<your-user>/.android/debug.keystore
./gradlew assembleRelease
```

If web assets or Capacitor configuration changed, run the normal web build and
sync before the final Gradle command:

```bash
cd ~/queen-chat-client-build/client
npm exec tsc -- -b
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

Expected signed APK path:

```text
client/android/app/build/outputs/apk/release/app-release.apk
```

The build fails before any release task can produce output if a signing value is
absent. It must not produce or publish `app-release-unsigned.apk`.

Verify the artifact before any upload:

```bash
apksigner verify --verbose --print-certs \
  app/build/outputs/apk/release/app-release.apk
```

The signer certificate SHA-256 must exactly match:

```text
ce3c434a4a6ab09b4410639e76c19af54013295e9010b6e12a8d02c82293b4db
```

Also verify package identity and versions (with whichever Android SDK utility
is installed):

```bash
aapt dump badging app/build/outputs/apk/release/app-release.apk \
  | grep -E "package:|versionCode|versionName"
```

Expected values are `ru.queenchat.app`, `versionCode='2'`, and
`versionName='1.1.0'`.

### Install-over test before publishing

On a physical device that already has the old QueenChat `versionCode=1` APK,
do **not** uninstall it. Install the new release over it:

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

Expected result: `Success`. Then verify that login/session, cookies and
localStorage remain intact; chats, push, WebSocket, video calls, and the native
offline screen still work. Because this is a non-debuggable release build,
`AndroidUpdateManager.isDebugBuild()` remains false and production update
checks are allowed once the API/Caddy release metadata is deployed separately.

## In-app APK updates

The native updater compares Android `versionCode` only. Increment it for every
distributed APK; use `versionName` only as the human-readable semantic version.

Every future production APK must retain the certificate above until the
existing installation base is retired. A debug *variant* remains suitable only
for development: the updater deliberately does not fetch production updates
from a debuggable install. The migration release is different: it is a
non-debuggable release variant signed by the legacy key.

To publish a release after building and verifying its signed APK:

```bash
printf '%s\n' 'Исправлены сетевые ошибки' 'Обновлён экран офлайн' > /tmp/queenchat-changelog.txt
./scripts/publish_android_release.sh path/to/queenchat-release.apk 2 1.1.0 1 false /tmp/queenchat-changelog.txt
```

The script writes an immutable versioned APK to `releases/` and atomically
updates `android_release.json`. Do not reuse a versioned filename or publish a
mandatory release until the signing chain has been verified on a device.

## What still must be tested on a device

Building an APK is only a packaging check. Test these separately:

- WebView launches and loads `https://queenchat.ru`.
- Login works.
- Cookies persist across app restarts.
- Android Back behavior is correct.
- Camera and microphone permissions are requested and granted.
- WebRTC calls work.
- WebSocket reconnects work.
- Native FCM token registration works.
- Incoming call notification appears when the app is closed.
- Notification actions "Accept" and "Decline" work.
- Deep links open the expected chat.
