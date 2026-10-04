# Firefox Android research gate

Android support is deferred. The development machine has no ADB binary, Android
SDK or available ADB server/device. No emulator result is represented as physical
device evidence. The default package is prepared for Desktop; its manifest omits
the Android availability declaration.

## Compatibility decision

The official [Android development guide](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/)
requires critical-path device testing before declaring compatibility. The current
[MDN downloads compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/downloads.json)
records removal of the downloads API from Firefox Android starting at version 79;
`saveAs` is unsupported. Changing only `saveAs` cannot provide a working Save path.

| Capability | Documentation/build evidence | Device status |
| --- | --- | --- |
| Action popup and activeTab | Separate Android 142+ probe manifest | Pending real action-menu grant |
| scripting.executeScript, isolated top frame | Same bounded Firefox collector; package lint passes | Pending device injection and restricted pages |
| Clipboard text | clipboardWrite requested; async capture stays local | Pending Copy after async capture/app switch |
| Preferences | storage permission | Pending reload/restart/low-memory persistence |
| downloads.download / Save As | Removed/unsupported according to MDN | Save unavailable; full Android export gate blocked |
| Responsive UI | Viewport meta, bounded width and 44px narrow/touch controls | Desktop Gecko layout is only supporting evidence |
| Background lifecycle | Event-page manifest, bounded requests | Pending actual Android suspension/recovery |

The copy-only research build omits the unsupported downloads permission. The popup
disables Save when the downloads API is absent, retains Copy, and keeps Save
disabled after pending actions finish. It does not use external uploads, persistent
host access, native messaging, a guessed file-picker fallback or a different MV2
implementation to claim that the gate passed.

## Separate popup layout

Desktop uses `entrypoints/popup/style.css` with the original 376px popup and 18px
range control. Only `build:firefox:android-test` selects `android.css`, which imports
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
npm run build:firefox:android-test
```

Follow the [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
to run the temporary research build on the connected device:

```sh
npx web-ext run --target firefox-android --source-dir .output/firefox-mv3-android-test --android-device YOUR_DEVICE --firefox-apk org.mozilla.firefox
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

## Exit decision

Keep the production package Desktop-only until critical Copy behavior and a
supported Android Save design pass physical-device tests. A copy-only supported
product would require an explicit product decision and corresponding store/UI
scope; the research build does not make that decision. If later device evidence
requires an alternative manifest version or export destination, make that a
separate reviewed change and rerun Desktop/Chrome regressions.
