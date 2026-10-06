# Firefox Android verification

The maintainer confirmed manual smoke checks of the shared 1.0.1 package on
2026-10-05, including Copy, saved preferences and immediate button feedback after
Compression changes. The supplied capture identifies Firefox Android 157.0.
Device model, Android version and a complete per-scenario report were not supplied.
The earlier separate 1.0.0 builds were checked on 2026-10-04. These confirmations
do not certify every minimum-version or lifecycle scenario below; keep this
checklist for regressions and verify any remaining submission scenarios.

## Compatibility decision

The official [Android development guide](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/)
requires critical-path device testing before declaring compatibility. The current
[MDN downloads compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/downloads.json)
records removal of the downloads API from Firefox Android starting at version 79;
`saveAs` is unsupported. Changing only `saveAs` cannot provide a working Save path.

The shared Firefox package lists downloads only as an optional permission for
Desktop Save. Android never requests that permission or calls downloads APIs.
The popup explicitly detects Android and keeps Save unavailable even if a
browser exposes a downloads stub. Copy, formats, compression and privacy settings
use the same pipeline as Desktop.

## Shared popup layout

The Firefox package uses `entrypoints/popup/firefox.css`, which imports the base
styles. Local platform detection adds `data-platform="android"` to the popup body
on Android. Only that platform gets responsive width, wrapped feedback, and 44px
touch targets; Desktop retains its original 376px popup and 18px range control.
Hover styles apply only to fine pointers with hover support. Android Save
preferences uses explicit touch press/release feedback, without a post-click
timer, to avoid suppressed native active styling after slider changes.

An optional Desktop Gecko supporting layout probe is:

```sh
npm run check:desktop-runtime -- --targets firefox --popup-layout android
```

It uses shared Firefox CSS in Android mode inside fixture iframes, not a physical
Android browser. Device testing remains necessary.

## Device setup and probe

Install Android Platform Tools using the official Google distribution and put
`adb` in PATH. On a physical Android device, enable USB debugging, authorize this
computer, install Firefox and enable Firefox Remote debugging via USB. See the
Mozilla guide above for exact version-specific setup. Record browser version,
Android version, device model, date and build revision in a local report; device
serial numbers and exported page text are not needed in tracked reports.

```sh
adb devices
npm run build:firefox
```

Follow the [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
to run the temporary installation of the Android build on the connected device:

```sh
npx --no-install web-ext run --target firefox-android --source-dir .output/firefox-mv3 --android-device YOUR_DEVICE --firefox-apk org.mozilla.firefox
```

If ADB is downloaded but not in PATH, pass its executable explicitly, for example
`--adb-bin "$HOME/Downloads/platform-tools/adb"`. Replace that path with the actual
location. After code or style changes, rebuild with `npm run build:firefox`;
web-ext watches the built directory. Reopen the popup, or restart web-ext if the
installed extension has not refreshed.

Use `org.mozilla.firefox_beta` or `org.mozilla.fenix` only when testing the installed
Beta or Nightly application respectively. Confirm the actual installed package
with ADB. This command starts/reloads a development extension and requires an
authorized connected device; it does not sign or publish an add-on.

Serve the synthetic fixtures on the computer and forward the port:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
adb reverse tcp:8765 tcp:8765
```

On the device, open `http://127.0.0.1:8765/tests/fixtures/quality/desktop-holdout.html`
and `http://127.0.0.1:8765/tests/manual/firefox-dom-quality.html`. Use the extension
from Firefox's action menu. Run all four profiles and both formats with privacy on
and off, pasting into a local text editor. Check live states, Unicode, mixed
checkboxes, tabs/details, password omission, API-key/Bearer redaction, open shadow
slots, scope warnings and clear errors on restricted pages. Save must be shown as
unavailable rather than reporting a nonexistent saved file.

Test portrait/landscape, large system fonts, touch selection of every Compression
stop, then immediately press Save preferences. Check that feedback begins on
contact and ends on release without sticking or a delayed flash. Also check
scroll, focus, keyboard, popup dismissal, double taps, navigation/tab closure,
app switch and reopening after background/low-memory termination. Record actual
Copy destination bytes and latency; Desktop headless results do not substitute.
Stop the server and remove the port mapping afterwards:

```sh
adb reverse --remove tcp:8765
```

## Release scope

Package once with `npm run zip:firefox` and verify with
`npm run check:firefox-package` and `npm run lint:firefox`.
The manifest declares `gecko_android.strict_min_version: 142.0`.
Submit the same Firefox ZIP and matching source ZIP for Desktop and Android on
one AMO listing. Document Copy-only Android support; Desktop supports Save after
optional permission approval. Android must never show a download permission
prompt, including after Copy, reopening the popup, and changing settings.
Store submission and signing are separate from successful manual browser checks.
Any future Android file-export implementation needs its own device verification.
