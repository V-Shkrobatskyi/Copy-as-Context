# Firefox Desktop verification

The maintainer confirmed successful manual browser checks on Desktop and Android
on 2026-10-04. Firefox Desktop support starts at 140. Exact browser/device versions
and per-scenario results were not supplied, so this confirmation does not claim
that every minimum/ESR or lifecycle scenario below was individually verified.
The checklist remains the regression procedure for subsequent changes.
The shared 1.0.1 package and its optional download prompt require a fresh smoke
check; the earlier confirmation applies to 1.0.0.

## Automated gate

```sh
npm ci
npm run check
```

CI runs type checking, the shared and browser-specific unit suites, Chrome and shared Firefox production
builds, manifest/bundle checks and Firefox package lint. The bundle check executes
the production DOM collector in jsdom and guards against password value reads.

The independent `tests/fixtures/quality/desktop-holdout.html` contract covers forms,
tabs, collapsed details, menus, dialogs, resource tables, Unicode, mixed checkboxes,
offscreen controls, hidden referenced names and slotted open Shadow DOM. Tests
check roles, labels, states and named ancestors across all profiles, both formats
and privacy settings. SPA updates must replace values/states rather than retain
the preceding snapshot. Byte equality between browser trees is not required:
Chromium adds AX wrappers/InlineTextBox nodes and uses `DisclosureTriangle` for
native summary; the DOM adapter uses `button` with expanded state.

## Native browser probe

After building, run with installed Firefox and Chrome:

```sh
npm run check:desktop-runtime -- --report /tmp/desktop-runtime.json
```

The probe launches headless browsers in fresh temporary profiles, serves only a
synthetic localhost fixture, and removes its profiles on completion. It uses
Firefox WebDriver BiDi and Chromium CDP, with no new runtime dependencies. The
Firefox automation process permits system access for temporary add-on installation;
this does not give the extension host access. Personal browser profiles are unused.

On macOS the defaults are the applications in `/Applications`; on Linux the defaults
are `firefox` and `google-chrome`. Select another installed binary to test the minimum
or ESR independently:

```sh
npm run check:desktop-runtime -- --targets firefox --firefox-binary /absolute/path/to/firefox --report /tmp/firefox-esr.json
```

`--chrome-binary` is also supported. `FIREFOX_BINARY`, `CHROME_BINARY`,
`DESKTOP_TARGETS` and `DESKTOP_REPORT` are alternative environment settings.
The harness never downloads or installs a browser.

The native probe checks the shared semantic contract and SPA updates using the
built Firefox collector in a BiDi sandbox and the production Chrome AX normalizer.
It temporarily installs the unchanged Firefox build and checks its popup document,
denied injection without a toolbar grant, rejection of capture messages from an
extension document in a browser tab, and storage persistence after extension reload.
This popup document is a tab, so it deliberately cannot initiate a trusted toolbar
capture. No host permissions are added to make the probe pass.

The native Firefox probe also renders the built popup markup/CSS in a same-origin
376px iframe, checking the original Desktop popup width, 18px range and compact
buttons. The separate `--popup-layout android` probe checks the shared Firefox CSS in Android mode at
280/320/376px; these are Gecko layout checks, not Android touch tests. On a fresh
profile the production extension's optional downloads permission is not granted.
The harness installs a separate synthetic extension with required downloads
permission to reproduce an expired document-owned Blob URL and verify exact
UTF-8 bytes for both export formats while the save document survives closure of
a separate initiating popup.
It does not modify the production manifest or grant its optional permission.
Permission approval, denial, retry, and the real Save As picker require the toolbar
checklist below; popup unit tests cover the permission flow with mocked APIs.

Performance samples cover 20, 200 and 1,000 resource rows, five measured captures
after a warmup at each size, and all eight profile/format exports per sample. Reports
contain versions and structural metrics only: capture time, sequential total time,
node count, transport UTF-8 bytes, export lengths and reduction ratios. Export runs
in Node, so total time includes automation round trips and all eight exports; it is
not one-click popup latency. The Firefox collector must complete within its 2s
budget (with 500ms measurement tolerance), reject an oversized document without
returning a partial tree, and recover on the next small document.

Parent-process RSS samples exclude content/renderer processes and are not peak
memory or evidence that the complete browser cannot leak. For snapshot retention:

```sh
PERFORMANCE_DOM=1 PERFORMANCE_REPORT=/tmp/dom-retention.json npx vitest run --config tests/performance/vitest.config.ts
```

This separate Node/jsdom probe verifies that results and trees from 30 successful
captures and results from 30 rejected captures are collectible with exposed GC.
It records sampled heap and durations, without a fragile machine-specific heap
threshold. It does not measure Gecko heap or prove event-page cleanup.

## Toolbar smoke and release evidence

Run these on the installed current Firefox, the selected minimum/ESR, and Chrome.
Record the exact browser version, OS, hardware, build revision and test date.
Keep local reports and exported synthetic examples outside tracked source.

1. Load `.output/firefox-mv3/manifest.json` as a temporary add-on through
   `about:debugging#/runtime/this-firefox`; load `.output/chrome-mv3` unpacked in
   Chrome. Serve the repository with `python3 -m http.server 8765 --bind 127.0.0.1`.
2. Open `http://127.0.0.1:8765/tests/fixtures/quality/desktop-holdout.html`.
   Use the toolbar popup, not `popup.html` in a tab. Check Copy and Save for each
   profile and both formats with redaction on and off. Verify boundaries only for
   Copy, filename/extension, metrics, Unicode and the persisted preferences.
   On a fresh Firefox installation, decline the first Save permission prompt:
   no capture or download should start, and Copy must remain usable. Retry Save,
   grant downloads permission, and verify completion. Leave the Save As picker
   open for at least 30 seconds before choosing a destination. The separate save
   tab must stay open until completion and then close automatically. Cancel a
   save and check that the tab shows a clear error without captured text. Revoke downloads permission
   in Add-ons Manager and verify the next Save requests it again.
3. Check the critical controls and their named ancestors described above. Change
   the workspace value, switch tabs and open Advanced options. Capture again:
   live values/selected/expanded states must match, and Rotate credentials must
   appear only when details is open. Password plaintext must never appear;
   the synthetic API key and Bearer token must disappear when redaction is on.
4. Open `tests/manual/firefox-dom-quality.html` through the same server. Check
   embedded-frame/canvas warnings; frame-only and canvas-only content must be
   absent. Verify hidden/inert exclusion and open shadow/slot order.
5. Test HTTP and HTTPS pages. Treat `file:` as a separate recorded probe, not a
   general support promise. On `about:`/`chrome:` pages or restricted hosts, expect
   a controlled unsupported/permission error with no clipboard/file write.
6. Start capture and navigate/reload/close its source tab. A stale result must not
   reach a destination. Double-click must not duplicate capture. Close the popup
   during capture, reopen it and retry; check for unhandled rejections.
7. Close popup and all extension inspectors, leave the browser idle, and retry.
   Record whether the event page actually stopped; inspector sessions change its
   lifetime. A successful idle retry alone does not prove suspension/resumption.
   Reload the add-on and repeat export to check reinitialization and storage.
8. Repeat captures on the large table and observe popup response and browser memory.
   For Chrome, verify debugger release and retry after a competing debugger is
   detached. Node/native probes do not cover `chrome.debugger` permission UX.

Manual browser verification is confirmed by the maintainer. For future changes,
repeat the applicable checks and record exact versions and per-scenario results.
Store submission and signing remain separate release steps.
