# Customize redaction filters

Use synthetic data only. Build both browser packages and reload the extension.

The Desktop probe in `scripts/probe-preview.mjs` (with `--firefox` for Firefox) opens Customize from the popup, disables a built-in group, creates a literal rule, tests it, exports/imports JSON, saves the configuration, and checks it applies to a subsequent export. It also exercises the independent Preview editor. Chrome uses the production toolbar/capture path; Firefox uses its built settings UI and a synthetic export harness. The clipboard destination is intercepted. See [preview verification](preview-edit.md) for probe commands and limitations.

## Manual checks

Run on Chrome Desktop, Firefox Desktop and Firefox Android:

1. Verify the small **Customize** button is inside **Redact sensitive data**. It opens filter settings without capturing a page or changing the clipboard. **Preview & edit** is the first action beside Copy/Save.
2. On a new installation, the table contains eight enabled built-in rows. Choose **+ Add filter** and verify the new editable row appears in the same table. Built-in names, patterns and Rule type are fixed; Case sensitive is editable. On narrow screens, the table scrolls horizontally without making the entire document overflow. Existing users without stored filters retain the original defaults.
3. Add a client name and an internal domain as inline literal filter rows. Test mixed-case text, Case sensitive on/off, rule Enabled on/off, removal, overlapping rules, punctuation, Unicode and line breaks. The test covers all enabled built-in and custom filters and does not save or copy data. Leave Field label blank for plain text; enter API key with a short sample value to test Sensitive field values, then disable that filter and verify the value remains visible. Changing the field label must clear the prior result. Changing a rule or sample clears the old test result.
4. Save filters, return to a synthetic page and exercise Copy, Save (Desktop) and Preview in both formats and all compression profiles. Verify the rules apply everywhere in captured text, field values, titles and URLs, including when strings have no credential-shaped markers. Master redaction off bypasses the selected filters. Always verify password input values stay omitted.
5. Verify each built-in switch on examples isolated from other groups. For example, a long token URL parameter can also match Assigned secrets. Disabling one overlapping group does not promise the text will remain visible.
6. Click **Export** and verify it immediately downloads `copy-as-context-filters.json` without showing a JSON panel or altering the clipboard. Inspect the downloaded file: all eight built-in definitions and enabled states plus every custom rule must be present. Click **Import** and verify it opens a file picker; selecting that file must populate the table directly. Cancel the picker once and verify no changes. Unsaved edits require confirmation before replacement; **Save filters** is still required to apply imported rows. Test native download and picker behavior on each browser, including Android.
7. Try malformed JSON, unknown versions/IDs, duplicate IDs, empty text, oversized files and excessive rule counts/lengths. Saved settings must remain intact. Failures must not expose raw private values in diagnostics.
8. Change settings without saving, then Reload saved or Restore defaults. Confirm cancellation preserves edits; confirming restores the intended form. Saving defaults removes custom rules and enables built-ins without changing the popup's master switch.
9. Open two settings tabs, save in one, then attempt to save stale edits in the other. Verify the detected conflict requests Reload saved. Interrupt storage access or use malformed saved settings in an isolated profile: redacted exports should stop with an error, and explicit Restore defaults followed by Save should recover.
10. Verify keyboard navigation, labels, visible focus, live feedback, touch targets, scrolling and reaching the sticky Save bar with a mobile keyboard open. Close beside Save filters closes only the settings tab. With unsaved edits, cancelling its confirmation keeps the form; confirming closes without a second unload prompt. With saved settings, Close needs no confirmation. Closing or reloading unsaved settings using the browser may display a warning; warning support varies. No sample text should be restored from extension storage.

11. Verify there is one Rule type dropdown per row and only On/Case sensitive checkboxes. Built-in types are disabled and describe the matching engines. Add `pass / private code`, select Text, Field labels and Field labels — whole words in turn; test substring/word-boundary differences, mixed case and Save/Reload. Export/import preserves the selected type. Older literal rules retain Text — single literal behavior, and old multi-mode rules appear as separate rows.

## Verification record — 2026-10-19

- Chrome Desktop: native Customize, literal rule testing, filter file import/export, persistence and subsequent production capture passed.
- Firefox Desktop: native settings UI, literal rule testing, filter file import/export, persistence and synthetic export passed.
- Narrow Chrome layout: no horizontal document overflow; Desktop and mobile-layout screenshots visually reviewed.
- Actual filter-file downloads were verified in Chrome and Firefox temporary profiles and read back from disk. Chrome import used a filesystem file through an intercepted picker; Firefox import used native File/FileList objects and the real change handler.
- File read/download handling, limits, invalid data and storage failures have automated coverage.
- Physical Android, native Firefox toolbar/activeTab, system clipboard paste and real OS picker interactions and screen-reader checks remain manual.

### Field labels update

- Core and UI tests cover both modes, shared alternatives, case matching, disabled rules, nested field text, persistence and v3 round trips. All compression profiles and both formats are covered for custom field labels.
- The supplied v2 example was imported and round-tripped without changing its previous literal matching behavior.
- Chrome and Firefox Desktop probes passed both custom modes with `pass / private code` and verified fixed built-in checkboxes and real filter-file downloads.
- The new column exposed overflow from offscreen accessibility labels in Chrome. Positioning their scroll container fixed document overflow; the Chrome Desktop/narrow-screen probe passed and the table screenshot was reviewed.

### Unified exports and editable case sensitivity

- V4 exports use matchingRule for both filter types, with consistent field order. Tests verify v1/v2/v3 compatibility and reject ambiguous v4 custom fields.
- Case sensitive is editable for every built-in and custom row. Tests cover both modes for all built-in groups, saving/reloading overrides and restoring defaults.
- Full checks passed: 421 unit tests, 10 memory tests, both browser builds, build boundary checks and Firefox lint.
- Chrome and Firefox Desktop probes verified an edited built-in case flag, Try filters behavior, actual v4 filter downloads, import and persistence. The updated table screenshot was reviewed.

### Custom URL parameters

- Added URL parameters checkboxes and the urlParameters export/import flag in v5. Versions 1–4 remain supported without changing their prior matching behavior.
- Tests cover all built-ins disabled, repeated/empty parameters, exact names, case sensitivity, disabled rules, combined field/URL scopes, overlaps, idempotence, both formats and every compression profile. A custom list reproduces the existing Secret URL parameters detector on its supported names.
- Full checks passed: 434 unit tests, 10 memory tests, both browser builds, build boundary checks and Firefox lint.
- Chrome and Firefox Desktop probes tested the mode with every built-in off, downloaded/imported real v5 files, saved the flag and confirmed it hides a custom query value in the subsequent export. The updated table screenshot was reviewed.
- At v5, literal rules could not reproduce the other credential detectors. This limitation is addressed by the v6 detector modes below.

### Custom credential detector modes (v6)

- Duplicate each built-in, disable every original, and verify equivalent results on synthetic Authorization, JWT, GitHub, AWS, OpenAI, assignment, URL and field examples. Test both Case sensitive choices, near misses and nested field text. Whole field words reproduces the built-in field-name word boundaries.
- Change a copy's matchingRule to a new scheme, prefix or label. Test the positive example, a short near miss and mixed case; disable/re-enable the rule. Combining checked modes should apply all selected detectors. Prefixes and labels are literal; length thresholds and character sets remain fixed.
- Export must download v6 with every detector flag for all rows and the same property order. Import, Save and Reload must preserve checked modes. Versions 1–5 must retain prior literal behavior. Built-in mode changes in imported files and non-boolean custom flags must be rejected.
- Core regression coverage compares each built-in individually and all eight together against custom equivalents, both case choices, both output formats and every compression profile. UI tests cover duplication, persistence/import and repeated edits after Save for every flag.
- Verification completed: 474 unit tests and 10 memory tests passed; Chrome/Firefox builds, build boundary checks and Firefox lint passed. Desktop probes in both browsers passed custom Authorization duplication, new-prefix testing with all built-ins disabled, real v6 downloads, imports and saved detector flags. Firefox capture remains a synthetic handoff; physical Android remains manual.

### Single rule type (v7)

- One Rule type dropdown replaces all matching-mode checkboxes. Field labels and Field labels — whole words are distinct choices; Text — single literal preserves old whole-phrase behavior. Built-in types remain fixed; Duplicate produces an editable typed copy.
- Exported rows use source for builtin/custom origin and type for the detector. The availableRuleTypes catalog includes IDs, labels, descriptions and scopes from the code registry. Imported catalog text cannot add or redefine detectors; unknown types are rejected.
- V1–6 imports and stored settings migrate in memory. Combined-mode rows split into separate rows with collision-free IDs; Save persists the result. Limits accommodate all 400 rows from the former 50-rule/eight-mode maximum.
- Verify every dropdown choice after repeated Save/Reload, field-word boundaries, legacy literal whitespace/slashes, migration of combined modes, unknown/conflicting types and malformed catalogs. Use actual file download/import in both Desktop browsers, and check narrow layouts and keyboard navigation.
- Verification completed: 506 unit tests and 10 memory tests passed, along with both builds, build boundary checks and Firefox lint. Chrome and Firefox Desktop probes passed the six-column table, selected type behavior, duplication, real v7 downloads with the type catalog, imports and typed persistence. Chrome Desktop/narrow screenshots were reviewed; physical Android remains manual, and Firefox capture remains a synthetic handoff.

### Try filters: isolated tests, diagnostics and examples

- Test all checks enabled rules. Test selected runs the chosen built-in/custom rule in isolation, including off rules, without changing On or saving. Verify unrelated unfinished rows do not block a selected test, while unfinished enabled rows block Test all.
- Matched rules checks each rule independently against the original sample/label. Verify both overlapping text rules are listed for one combined replacement, and JWT is listed alongside a field rule that masks the whole value. Per-rule counts can overlap. Redacted field labels appear separately.
- Load example and Load near miss use the chosen rule's unsaved terms and type. Check every supported type, custom schemes/prefixes, field labels, and a configuration where another alternative also matches its near miss. Sample/selection/rule changes clear stale results and diagnostics.
- Closing the page clears samples, field-label results and matched-rule lists. No tester state is saved, copied or included in filter JSON. Unknown/removed selections, oversized inputs and HTML-like rule names have regression coverage.
- Desktop probes in Chrome and Firefox passed selected/all isolation, matched-rule attribution, positive/near-miss examples and field examples. Chrome Desktop and narrow tester screenshots were reviewed. Physical Android remains manual; Firefox capture uses the existing synthetic handoff.
