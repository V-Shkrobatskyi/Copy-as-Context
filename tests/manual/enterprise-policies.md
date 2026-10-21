# Enterprise policy smoke tests

Status: automated implementation checks exist; the real managed-browser rollout checks below are pending. Do not mark platform delivery as verified solely because a package builds or unit tests pass.

Use synthetic pages and rules only. Follow the [deployment guide](../../docs/enterprise-deployment.md), substitute the installed extension ID, and record OS, browser/build, delivery channel, effective policy values and observed result. Do not retain page content, real tokens or organization rule text in test reports.

## Delivery and ordinary mode

- [ ] Load Chrome Desktop build with its managed schema and confirm no manifest/schema error.
- [ ] Deliver one preset through a real management channel; verify expected keys, types and values in `chrome://policy`.
- [ ] Pilot Google Admin, Windows GPO/registry, macOS MDM and Linux templates on their actual platforms before claiming each channel supported.
- [ ] Deliver Firefox Desktop `3rdparty` policies; inspect `about:policies` and management indicators.
- [ ] Confirm Firefox without policies/native manifest keeps ordinary mode; unexpected read errors must block export.
- [ ] Confirm ordinary Chrome, Firefox Desktop and Firefox Android behavior with no policies.
- [ ] Restart the browser and test offline after policy delivery.

## Enforcement and UI

- [ ] Test recommended defaults, forced format/level and allowed sets. Try stale saved personal values.
- [ ] Verify the compression slider can reach every permitted level and does not select forbidden levels with mouse or keyboard.
- [ ] Disable files; try popup Save, picker Save, preview Save, Firefox save/selection-save, and filter configuration Export. No download should start.
- [ ] Disable clipboard independently; Save remains usable if allowed.
- [ ] Disable both destinations or provide an empty allowed list; no capture/export starts.
- [ ] Set `PreviewAllowed` to false; popup and picker cannot open preview, direct navigation cannot expose its editor, and an already open preview becomes unavailable. Direct Copy/Save remain available when permitted.
- [ ] Set `FilterSettingsAllowed` to false; Customize and direct navigation cannot expose filter settings, an already open settings page is blocked, and capture still applies required filters.
- [ ] Disable element selection; no picker injection should run.
- [ ] Force redaction on/off; UI and actual output agree. Required rules conflict with explicit user-controlled/force-off.
- [ ] Force a default-on built-in off with `DisabledBuiltinFilters` and a default-off one on with `RequiredBuiltinFilters`; verify output, read-only on/off states, import/reset/save resistance, conflict errors, and restoration after policy removal.
- [ ] Required built-ins keep original case semantics despite saved personal overrides.
- [ ] Corporate rules are read-only; personal rules can supplement them only when permitted.
- [ ] Import, restore defaults, save and demo drafts cannot remove required rules from actual exports.
- [ ] Prohibit personal customization; old saved rules remain stored but are ignored.
- [ ] Prohibit Save preferences; temporary permitted choices work, but no personal preferences/filters are persisted.
- [ ] Required-redaction preview is read-only; find/replace and reset cannot introduce unfiltered text.
- [ ] Check keyboard access, screen reader explanations and narrow screens for supported UI.

## Changes and failure recovery

- [ ] Open popup, picker and preview; update policies while they remain open. Picker closes; affected controls update; stale preview/export requires preparation again.
- [ ] Change filters during pending capture; the old result is discarded.
- [ ] Remove policies; old previews become stale and preserved personal choices return in a new popup.
- [ ] Deploy contradictory values, unsupported versions and invalid required Regex; export is blocked with a value-free error.
- [ ] Verify Chrome-dropped schema-invalid values in `chrome://policy`; do not mistake absent policies for accepted restrictions.
- [ ] Exercise a managed-storage read error and successful retry without silently disabling protection.
- [ ] Verify force-install separately if preventing extension removal/disablement is required.

## S5 source controls, data exclusions and diagnostics

- [ ] Deploy `docs/enterprise/data-controls.json` on actual supported management channels; verify policy loading, status, source counts and value-source labels without exposing internal lists.
- [ ] Check exact/subdomain/IDN/terminal-dot matches, standard/nonstandard ports, deny priority, absent/empty lists and redirects during capture. A blocked root must not be captured; a blocked iframe and its descendants must not be read or offered as missing browser permissions.
- [ ] Test opaque sandboxed documents, file/data/about/srcdoc/blob documents and synthetic demo according to the documented origin rules. Check Chrome raw AX cross-document boundaries.
- [ ] Test title/document URL/link URL/form exclusions in every compression level and both formats, with redaction on and off, popup/picker/preview/save routes and nested documents. Use synthetic canaries in values, accessible names, selected options, checked controls and inherited contenteditable descendants.
- [ ] Change personal data settings and policy while a preview, picker or save transfer is open. Old prepared content cannot export or return through Reset. Corporate exclusions keep preview read-only.
- [ ] Open diagnostics directly with Preview and Customize denied; inspect status without accessing blocked tools. Disable each export destination and confirm it also blocks diagnostic JSON while the screen remains readable.
- [ ] Test Error/Info/Debug/Off, Debug expiry/restart, concurrent operations, storage unavailable/quota failures, retention limits and Clear journal. Verify ordinary copy/save continues after journal failure.
- [ ] Inspect journal and report with synthetic secrets in page content, URLs, titles, filenames, errors, filters and policy values. None may appear. Include-log is unchecked by default and reports are never sent automatically.
- [ ] Check keyboard navigation, screen reader labels/status, light/dark themes, narrow screens and Firefox Android. File save remains unavailable on Android; clipboard follows policy.

The S5 checklist above is pending live device/management-channel verification; automated tests are not a substitute for these observations.

## Optional capture history

- [ ] History starts off. After enabling, successful page and selected-element preparations create header-only entries; failed captures, private/incognito tabs and demo do not.
- [ ] Set 1 and 365 days, 1 and 50 MiB; invalid/out-of-range values are rejected. Reducing limits removes oldest entries. Off stops new records, and Clear history removes all entries.
- [ ] Force individual history settings and the full lock; personal changes cannot override them, and removal restores preserved personal choices.
- [ ] Excluded titles/URLs and required redaction also sanitize older records. No page/element body, selector or value enters stored or exported history.
- [ ] History exports obey clipboard/file policy and stay separate from diagnostic reports. Test browser restart, storage failure and concurrent clear/capture.

- [ ] Set `CaptureHistoryClearAllowed=false` and `TechnicalLogClearAllowed=false` independently and together. Verify disabled actions and organization explanations, while viewing and permitted exports remain available. Direct clear messages from diagnostics must fail without deleting records; removing policies restores clearing. Repeat while diagnostics stays open and with a policy-read failure.
- [ ] With manual clearing blocked, verify age/size/count pruning and metadata sanitization still run. Lock history settings too if users must not reduce retention.

- [ ] In Capture sources, test default unrestricted mode, personal blocked sites, disabled-but-saved allowed list, and enabled empty allowed list. Confirm main-page and picker captures reject before reading content, and blocked embedded frames are omitted.
- [ ] Combine conflicting personal/organization allowed and blocked lists; either deny wins and both allowed lists must pass. Toggle UserPreferencesSaveAllowed; saving personal lists must fail in UI/background when prohibited. Verify open preview/save invalidation and picker closure after local site changes. Test invalid saved configuration recovery without dropping organization restrictions; personal domains must never enter diagnostics JSON.
