# Changelog

## 1.4.2 — unreleased

- Add compact Find and replace controls to Preview & edit, with literal text search, match counts, case matching, forward/backward navigation and replacement of one or all matches.
- Scroll the editor automatically to selected matches, including wrapped text and navigation after replacement.
- Support keyboard search shortcuts and prevent replacements that exceed the draft size limit.

## 1.4.1

- Move Preview & edit, Copy page context and Save to file above the popup preferences panel for quicker access.

## 1.4.0

- Add Regex filters using RE2JS, preset expressions, validation limits and migration of earlier token rule types.
- Add automatic email/domain, phone and English personal-field masking, plus full hiding for emails, phones, personal fields, payment card numbers and IBANs. Card and IBAN detection includes checksum validation.
- Apply full hiding before partial masking on overlapping original-text matches, independently of filter order.
- Restrict custom rules to configurable types and reject changes to automatic built-in definitions during import.
- Make the filters table responsive, reduce row and test-field heights, and describe automatic detection criteria.
- Add a live, capturable Demo with grouped examples for enabled filters and same-tab navigation that preserves unsaved filter drafts.
- Extend Try filters to test text, labelled fields, links, page titles and page URLs.
- Keep Customize compact on Firefox Android and dismiss the popup after Customize or Preview opens successfully.

## 1.3.0

- Improve Try filters with isolated selected-rule tests, independent matched-rule diagnostics, field-label results and synthetic matching/near-miss examples based on the selected type and current terms.

- Allow custom rules to reproduce every built-in detector: use one Rule type dropdown per row, editable literal names/prefixes and Duplicate actions. V7 import/export includes a catalog of code-defined types, accepts v1–6 files and splits older combined-mode rules without losing checks.
- Add Customize for redaction filters: toggle built-in groups, add literal text, Field labels or URL parameters rules with optional case matching and a shared ` / ` separator, test examples, and import/export filter files including built-in definitions. Unify exported matchingRule names and field order, and allow Case sensitive changes for built-in and custom rules. Saved filters apply locally to future exports when redaction is enabled.

- Add Preview: review prepared page context in a separate tab, edit it, reset changes, and copy or save the result. Show live counts with and without clipboard boundaries and the original compression reduction. Drafts stay in memory and disappear when the editor is closed or reloaded.

- License this release under GPL-3.0-only and add an offline license and source-code page. Previously distributed MIT versions retain their original license; bundled third-party notices are preserved.

## 1.1.0 — draft

- Capture eligible iframe documents in Chrome and Firefox while preserving their page positions and document boundaries.
- Capture available same-origin iframe documents by default in Firefox Desktop and Android.
- Add an optional Firefox switch for other-site frames with one request for access to all HTTP/HTTPS websites and access removal when disabled.
- Skip hidden frames and tracking pixels, apply shared capture limits, and report unavailable or changing documents.
- Keep Firefox popup content responsive and add extension branding to the file saving page.

- Keep Firefox Save files available after the Save As dialog closes the popup.
- Prevent sticky touch hover and show immediate button feedback after Android Compression changes.
- Show pressed button borders on Desktop without delaying release feedback.
- Use one Firefox package and stable add-on ID for Desktop 140+ and Android 142+.
- Request optional download permission only when Save is clicked on Firefox Desktop.
- Keep Android Copy-only and select responsive controls at runtime.
- Remove separate Android build and package commands.
- Update AMO source-package, submission, and manual verification instructions.

## 1.0.0

### Features

- On-demand local capture of semantic page content: Chrome accessibility-tree snapshots and Firefox HTML/ARIA extraction.
- Semantic Text and Markdown exports with Without, Detailed, Compact, and Maximum compression profiles.
- Clipboard export on all supported targets; local UTF-8 downloads on Desktop.
- Credential redaction enabled by default, persistent export preferences, export metrics, and browser/version attribution.
- Separate Android build with responsive controls and Copy-only export.

### Known limitations

- Android Save is unavailable because the downloads API is unsupported.
- Firefox capture approximates accessible names and excludes embedded frames, closed shadow roots, canvas pixels, CSS-generated content, and unmounted virtualized UI.
- Browser-internal and protected pages may reject capture; Chrome capture can conflict with another debugger connection.
- Redaction is heuristic; token counts are estimates. Review page content before sharing it with another service.
