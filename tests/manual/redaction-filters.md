# Customize redaction filters

Use synthetic data only. Build both browser packages and reload the extension.

The Desktop probe in `scripts/probe-preview.mjs` (with `--firefox` for Firefox) opens Customize from the popup, disables a built-in group, creates a literal rule, tests it, exports/imports JSON, saves the configuration, and checks it applies to a subsequent export. It also exercises the independent Preview editor. Chrome uses the production toolbar/capture path; Firefox uses its built settings UI and a synthetic export harness. The clipboard destination is intercepted. See [preview verification](preview-edit.md) for probe commands and limitations.

## Manual checks

Run on Chrome Desktop, Firefox Desktop and Firefox Android:

1. Verify the small **Customize** button is inside **Redact sensitive data**. It opens filter settings in an active tab and dismisses the popup only after that tab is created, without capturing a page or changing the clipboard. On Firefox Android, verify Customize retains its compact height and the settings page is immediately visible without pressing Back. If opening fails, the popup must remain open with an error. **Preview & edit** is the first action beside Copy/Save. On Firefox Android, verify Preview dismisses the popup only after the editor receives its content and becomes active; failed capture or transfer must leave the popup open with an error.
2. On a new installation, the table contains sixteen built-in rows: the original eight, email/domain masking, phone and English personal-field masking, payment-card hiding and IBAN hiding are on; full email hiding, phone hiding and Hide personal field values (English labels) are off. Choose **+ Add filter** and verify the new editable row appears in the same table. Built-in names, patterns and Rule type are fixed; Case sensitive is editable except for automatic detection types. Above 1088px, verify the original table layout. At 1088px and below (including 320px and 390px portrait widths), verify each row stacks into an enabled/name header, wrapping matching rule, full-width Rule type, and a Case sensitive/action footer, without horizontal scrolling. Check long unbroken matching rules, custom name/text editing, type selection, toggles, Duplicate and Remove in both light and dark modes. Resize with unsaved edits and verify values and focus are preserved. Check Firefox Android with the keyboard open and confirm touch controls remain usable. Existing settings retain their saved switches; new rules are added with their default states.
3. Add a client name and an internal domain as inline literal filter rows. Test mixed-case text, Case sensitive on/off, rule Enabled on/off, removal, overlapping rules, punctuation, Unicode and line breaks. The test covers all enabled built-in and custom filters and does not save or copy data. Leave Field label blank for plain text; enter API key with a short sample value to test Sensitive field values, then disable that filter and verify the value remains visible. Changing the field label must clear the prior result. Changing a rule or sample clears the old test result.
4. Save filters, return to a synthetic page and exercise Copy, Save (Desktop) and Preview in both formats and all compression profiles. Verify the rules apply everywhere in captured text, field values, titles and URLs, including when strings have no credential-shaped markers. Master redaction off bypasses the selected filters. Always verify password input values stay omitted.
5. Verify each built-in switch on examples isolated from other groups. For example, a long token URL parameter can also match Assigned secrets. Disabling one overlapping group does not promise the text will remain visible.
6. Click **Export** and verify it immediately downloads `copy-as-context-filters.json` without showing a JSON panel or altering the clipboard. Inspect the downloaded file: all sixteen built-in definitions and enabled states plus every custom rule must be present. Click **Import** and verify it opens a file picker; selecting that file must populate the table directly. Cancel the picker once and verify no changes. Unsaved edits require confirmation before replacement; **Save filters** is still required to apply imported rows. Test native download and picker behavior on each browser, including Android.
7. Try malformed JSON, unknown versions/IDs, duplicate IDs, empty text, oversized files and excessive rule counts/lengths. Saved settings must remain intact. Failures must not expose raw private values in diagnostics.
8. Change settings without saving, then Reload saved or Restore defaults. Confirm cancellation preserves edits; confirming restores the intended form. Saving defaults removes custom rules and restores built-in defaults without changing the popup's master switch.
9. Open two settings tabs, save in one, then attempt to save stale edits in the other. Verify the detected conflict requests Reload saved. Interrupt storage access or use malformed saved settings in an isolated profile: redacted exports should stop with an error, and explicit Restore defaults followed by Save should recover.
10. Verify keyboard navigation, labels, visible focus, live feedback, touch targets, scrolling and reaching the sticky Save bar with a mobile keyboard open. Close beside Save filters closes only the settings tab. With unsaved edits, cancelling its confirmation keeps the form; confirming closes without a second unload prompt. With saved settings, Close needs no confirmation. Closing or reloading unsaved settings using the browser may display a warning; warning support varies. No sample text should be restored from extension storage.

11. Verify there is one Rule type dropdown per row (Regex rows also have an Insert example dropdown) and only On/Case sensitive checkboxes. Built-in types are disabled and describe the matching engines. Add `pass / private code`, select Text, Field labels and Field labels — whole words in turn; test substring/word-boundary differences, mixed case and Save/Reload. Export/import preserves the selected type. Older literal rules retain Text — single literal behavior, and old multi-mode rules appear as separate rows.

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


### Regex rules and presets (v8)

- Rule type offers Regex instead of separate GitHub, AWS and OpenAI types; JWT remains separate. Duplicate built-in token filters and check their editable expressions with all originals disabled.
- Insert each Regex example, verify replacement confirmation preserves edits on Cancel, and run its matching sample and near miss through Try filters. Paste a custom sample for arbitrary expressions; automatic example loading must explain that no sample is available.
- Test repeated emails, captures, slash characters, Unicode before a match, case sensitivity, disabled rules, overlaps, zero-length matches and existing redaction markers. Invalid or unsupported expressions must display an inline error and prevent Save/import without including raw private input in diagnostics.
- Export/import v8 and import genuine v7 and older exports. Verify token rules retain their prefixes, character sets, lengths, names, case settings and enabled states after conversion. Save/Reload persists Regex; tester inputs are never saved.
- Check Regex controls at 320px, 390px and desktop widths in both color schemes. Confirm Actions alignment and one-line initial textareas remain intact. Physical Firefox Android and assistive-technology checks remain manual.


### Automatic email types (v9)

- Verify Mask email addresses is enabled and Hide email addresses disabled on first use, Restore defaults, and migration from v1 settings or pre-v9 exports. Other switches must survive migration.
- Test a, ab, abc, abcd and abcdefg before @; expect *, a*, a**, ab** and abc****. Also test abcdefgh before @; expect abc***** (at most three visible characters). The domain stays intact. Repeat processing must leave masked addresses unchanged; full hiding must also hide already masked addresses.
- Add custom emailMask/emailHide rows with empty matching text. Matching text and Case sensitive controls must be unavailable; changing back to Text restores editable controls. Save/Reload and v9 export/import preserve both types and their enabled states.
- Test repeated addresses, mailto links, punctuation, field values, titles and source URLs in both formats and every compression profile. Master redaction off bypasses email processing.
- Reorder custom email, Regex and literal rules. Full hiding of even part of an address must hide the whole email, identically in every ordering; sensitive fields must still hide the entire value. Try filters reports each matching rule independently and can test the disabled full-hiding built-in without enabling it.


### Email/domain masking (v10)

- Verify the new Mask email addresses and domains built-in is off by default, including migration from v2 settings and v9 exports. Existing email switch states must survive migration.
- Select emailMaskDomain in a custom row without matching text. Verify hidden/disabled matching text and case controls, Save/Reload, v10 export/import, and synthetic examples in Try filters.
- Test ab, abcd and abcdefgh before @; for gmail.com expect a*@gm***.com, ab**@gm***.com and abc*****@gm***.com. Test subdomains and already masked names. Repeated processing must be stable; full hiding must also hide partially masked domains and older @*** output.
- Permute the three email types and overlapping Regex/Text rules. Verify full hiding > domain masking > name-only masking. Check desktop and narrow layouts.


### Consolidated email masking (v11)

- Only Mask email addresses (including domains) and Hide email addresses remain in the built-in list and Rule type selector. Masking is on by default; full hiding is off.
- Import v9/v10 exports and v2/v3 saved settings with all four combinations of the old masking switches. The new mask must be enabled when either old mask was enabled and disabled only when both were off. Preserve full hiding independently.
- Old custom emailMask rows become emailMaskDomain rows, preserving IDs, names and enabled states. Confirm Save/Reload, v11 round trips, type-only controls and the three-character name/domain cap.


## Personal-data presets (v12 exports / v5 storage)

- Confirm 14 built-ins: card and IBAN hiding on; phone hiding and Hide personal field values (English labels) off. Existing email defaults remain unchanged.
- Test selected on each automatic type: Load example matches; Load near miss does not. Testing an off phone rule does not enable it.
- Cards: `4242 4242 4242 4242` and hyphenated equivalent hide; `4242 4242 4242 4241`, repeated zeros and longer identifiers remain unchanged.
- IBAN: `GB82 WEST 1234 5698 7654 32` hides; changing 82 to 83 does not. Check compact/lowercase and Ukrainian IBAN examples.
- Phones: enable the rule. `+1 (202) 555-0123`, `00380 44 123 45 67` and `Phone: 020 7946 0958` hide; bare `0501234567`, dates, amounts and order IDs remain. Check tel: links and text punctuation.
- Enable Personal field values. English labelled inputs (Full name, Email, Address, Passport, SSN, Card number, CVV, IBAN) hide values and nested text, keeping labels. Names/addresses in prose remain. Email fields fully hide; plain-text email masking stays unchanged.
- Automatic presets have no Duplicate action or custom Rule type option. Personal fields hiding retains Duplicate and an editable English term list. Test automatic presets through their built-in selections.
- Reorder overlapping custom Regex and card/phone/IBAN rules: output is identical. Repeated redaction preserves placeholders.
- Save/reload and v12 export/import preserve new switches and types. Import a real v11 export: existing switches survive and new presets use defaults. No sample data is persisted.
- Verify new rows at 320/390px without horizontal page scrolling, and both browser packages after reload.


## Phone and personal-field mask presets (v13 exports / v6 storage)

- Verify Mask phone numbers and Mask personal field values (English labels) are on by default, before their corresponding full-hide rows. Both have separate Rule type values, automatic matching text and no case control.
- Both masks are built-in only with no Duplicate action. Test their synthetic examples/near misses through Test selected. No matching text or case setting is needed.
- `+380 50 123 4567` becomes `+380 ** *** ****`; Phone/Mobile labelled local values and repeated processing behave the same. Unlabelled local phone-shaped prose remains unchanged. Enable Hide phone numbers and confirm raw and previously masked phones fully hide.
- Full name fields: A → *, Al → A*, Ann → A**, Anna → An**, Alexander → Ale******. Verify Unicode, nested value text, short phone fields, email name/domain masking, and preserved labels.
- Passport, SSN, Tax ID, National ID, Driver license, DOB, Card number, IBAN, Bank account, Routing number, CVV and CVC values fully hide, even with short or invalid values.
- Enable full personal-field hiding or overlap Regex/literal rules with masks. Full hiding wins in every order; password/secret field hiding also wins for nested controls.
- Save/reload and v13 import/export preserve both mask switches. Real v12 imports retain old switches and add masks enabled by default; export/import all rules off keeps them off.
- Verify both formats, all compression levels, master redaction off, and compact row layout at desktop/320/390px after browser reload.


## Live Demo and test contexts

- Verify Demo beside Import/Export. It opens a styled page with only enabled rules, combined before/after results, labelled fields, query links and a six-field personal-data showcase. Built-in values are synthetic; custom literals are inserted as text.
- Return to Customize, toggle/change enabled rules without saving, then open Demo again: examples use the current draft, including full hiding overriding masking. Disabled unfinished custom rows can remain; an invalid enabled rule blocks Demo/capture rather than using stale results.
- Open two filter settings tabs. In each, Demo and Customize filters must stay in that same tab, preserving independent unsaved drafts. Returning restores dirty state and unfinished disabled rows. Navigation must not save extension preferences or trigger a discard warning. Verify Save and Reload saved update the temporary draft and concurrent saved-settings changes still trigger the existing conflict check.
- Use the popup to Copy, Preview and Save (where supported) the Demo in both formats and every compression level. Capture uses the displayed draft; ordinary pages continue using saved filters. Compare privacy on/off with synthetic examples. Repeat on Chrome, Firefox Desktop and Firefox Android.
- Verify ordinary extension pages (filters/preview), another extension and browser UI remain blocked. No new permissions should appear. Demo uses DOM capture in both browsers, so Chrome AX extraction remains covered by ordinary-page smoke tests.
- Arbitrary custom Regex without a preset is listed under Add your own sample and links to Try filters. No fabricated Regex sample is shown. With every rule disabled, Demo shows an empty state.
- Try filters: check Text or field value, Link URL, Page title and Page URL. Field context must not leak into other contexts; loading an example resets it. Test a full query URL, a JWT, a card, an IBAN and personal-field masking. Selected off rules remain off.
- Check Demo at 320/390px, desktop, dark/light mode and keyboard navigation. Reload after builds; verify no horizontal page scrolling, readable original/result text and accessible field labels.

- Compact layout: compare Demo sample cards and fields before/after at desktop and 320/390px. On narrow filter tables, input/select/button/toggle heights should match the compact desktop sizes (32px controls) rather than growing to 44px/16px text. Preserve wrapping, focus outlines and no horizontal page overflow.


## Custom type restrictions

- New custom rows offer only the nine configurable types. Automatic types never appear in the dropdown, and automatic built-ins have no Duplicate button. Configurable built-ins still duplicate with all aliases/case settings; fixed builtin type controls show only their own type.
- Export defaults and add an enabled/disabled custom email/phone/card/IBAN/personal-field-mask rule manually: Import must reject it with a built-in-only message and retain the current editor unchanged. Repeat with raw settings JSON and an unknown type.
- Change each built-in's type or matchingRule in an export: reject. Change caseSensitive on an automatic built-in: reject. Configurable built-in case changes and On switches must still round-trip.
- Edit catalog labels/descriptions: they must never redefine the detector. Spoofed built-in definitions and legacy mode flags must not bypass validation.
- Temporary Demo drafts cannot restore forbidden custom types, including disabled rows. Legitimate unfinished configurable rows still survive same-tab navigation.
- Retest automatic matching/masking, overlaps, examples, Demo capture, both formats and master privacy off through built-in switches. Legitimate historical configurable imports remain supported.
