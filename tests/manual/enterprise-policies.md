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
