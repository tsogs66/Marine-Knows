# Marine Knows — Android app

A minimal single-activity WebView wrapper around a self-hosted Marine
Knows install. It does not hard-code a server address: on first launch
(or whenever you choose "Change server…" from the menu) it asks for the
IP or hostname of your install and stores it in `SharedPreferences`, so
the same APK works against any Marine Knows deployment.

## What it does

- **First-run setup screen** — enter the server address (e.g.
  `192.168.0.220`, or a full URL). `http://` is assumed if you don't type
  a scheme, since the Proxmox installer's default deployment serves plain
  HTTP on a LAN IP (see `../install/proxmox-install.sh`).
- **WebView** with JavaScript and DOM storage enabled (the site needs
  `localStorage` for its theme switcher) and its own zoom disabled, since
  the site is already responsive and the network explorer page has its
  own pinch-to-zoom.
- Links to a **different host** than the configured server (e.g. a
  publication's "Source: imo.org" reference link) open in the system
  browser instead of trapping you inside the app; same-host navigation
  (all the app's own hash-routed pages) stays in the WebView.
- The Android **back button** navigates WebView history first, then falls
  through to closing the app.
- A **connection-error screen** with Retry / Change server actions if the
  configured host can't be reached.
- Overflow menu: **Reload** and **Change server…** (re-opens the setup
  screen, pre-filled with the current address).

## Building

This is a standard Gradle/AGP project; the Gradle wrapper is committed so
you don't need a system-wide Gradle install — you do need the **Android
SDK** (Android Studio installs one, or install `cmdline-tools` +
`platform-tools` + `platforms;android-34` + `build-tools` manually and
point `ANDROID_HOME`/`local.properties` at it).

**Android Studio:** File → Open → select the `android/` folder → let it
sync → Run.

**Command line:**

```bash
cd android
./gradlew assembleDebug
# APK at app/build/outputs/apk/debug/app-debug.apk
```

> **Note on how this was built:** this project was written and its XML
> validated (`xmllint`) in a sandboxed environment with Gradle but **no
> Android SDK and no access to the Google/Maven repositories** the
> Android Gradle Plugin needs, so a full `assembleDebug` could not be run
> here to confirm it compiles end-to-end. The Gradle wrapper itself was
> generated and verified working. The code follows standard, current
> (AGP 8.5 / Kotlin 1.9 / compileSdk 34) patterns — please run a build in
> Android Studio or CI before relying on it, and open an issue if
> anything doesn't compile as-is.

## Configuration

| Setting | Value | Why |
|---|---|---|
| `minSdk` | 26 (Android 8.0) | Lets the app ship a single adaptive launcher icon (`mipmap-anydpi-v26`) with no legacy raster fallback needed. |
| `usesCleartextTraffic` | `true` | The app is built to point at a self-hosted LAN server, typically plain HTTP (see the Proxmox installer's default `http://<container-ip>/`). |

To change the minimum API level or add HTTPS-only enforcement for your
own deployment, edit `app/build.gradle.kts` and
`app/src/main/AndroidManifest.xml` respectively.
