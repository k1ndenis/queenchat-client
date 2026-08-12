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

## Release builds

Release APK/AAB builds require a signing configuration and keystore. Keep
keystores and signing passwords outside the repository.

Example Gradle tasks:

```bash
cd client/android
./gradlew assembleRelease
./gradlew bundleRelease
```

Do not run release signing until the debug APK has been built and tested on a
device.

## In-app APK updates

The native updater compares Android `versionCode` only. Increment it for every
distributed APK; use `versionName` only as the human-readable semantic version.

Production APKs must always use the same persistent release keystore. A debug
APK is appropriate only for local tests: it cannot safely update production
installs, and the updater deliberately does not fetch production updates from a
debuggable install. Before the first in-app release, record the signing
certificate fingerprint of the APK already distributed to users and verify that
the new release APK has the same fingerprint:

```bash
apksigner verify --print-certs path/to/queenchat-release.apk
```

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
