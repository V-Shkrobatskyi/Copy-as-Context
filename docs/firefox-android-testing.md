# Firefox Android verification

The maintainer confirmed successful manual browser checks on Desktop and Android
on 2026-10-04. Android is supported as a copy-only build for Firefox Android 142+.
Exact device/browser versions and per-scenario results were not supplied. This
records the maintainer confirmation, not a claim that every scenario below passed
on every supported version. The instructions remain available for regressions.

## Compatibility decision

The official [Android development guide](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/)
requires critical-path device testing before declaring compatibility. The current
[MDN downloads compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/downloads.json)
records removal of the downloads API from Firefox Android starting at version 79;
`saveAs` is unsupported. Changing only `saveAs` cannot provide a working Save path.

The Android production build omits the unsupported downloads permission. The popup
keeps Copy available and disables Save when the downloads API is absent, including
after an export completes. Save is outside the supported Android scope; its absence
does not block the copy-only release. Capture, formats, compression and privacy
settings use the same pipeline as Desktop.

## Separate popup layout

Desktop uses `entrypoints/popup/style.css` with the original 376px popup and 18px
range control. Only `build:firefox:android` selects `android.css`, which imports
the base styles and adds responsive sizing and touch targets. WXT chooses the CSS
at build time; Desktop does not respond to narrow-screen/touch media queries from
the Android stylesheet. Export/preferences logic stays shared.

After building both targets, an optional Desktop Gecko supporting layout probe is:

```sh
npm run check:desktop-runtime -- --targets firefox --popup-layout android
```

It uses Android built CSS in fixture iframes, not a physical Android browser.

## Device setup and probe

Install Android Platform Tools using the official Google distribution and put
`adb` in PATH. On a physical Android device, enable USB debugging, authorize this
computer, install Firefox and enable Firefox Remote debugging via USB. See the
Mozilla guide above for exact version-specific setup. Record browser version,
Android version, device model, date and build revision in a local report; device
serial numbers and exported page text are not needed in tracked reports.

```sh
adb devices
npm run build:firefox:android
```

Follow the [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
to run the temporary installation of the Android build on the connected device:

```sh
npx web-ext run --target firefox-android --source-dir .output/firefox-mv3-android --android-device YOUR_DEVICE --firefox-apk org.mozilla.firefox
```

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
stop, scroll, focus, keyboard, popup dismissal, double taps, navigation/tab closure,
app switch and reopening after background/low-memory termination. Record actual
Copy destination bytes and latency; Desktop headless results do not substitute.
Stop the server and remove the port mapping afterwards:

```sh
adb reverse --remove tcp:8765
```

## Release scope

Package with `npm run zip:firefox:android` and verify with
`npm run check:firefox-android-package` and `npm run lint:firefox:android`.
The Android manifest declares `gecko_android.strict_min_version: 142.0`.
Document Copy-only support in the store listing; Desktop also supports Save.
Store submission and signing are separate from successful manual browser checks.
Any future Android file-export implementation needs its own device verification.
