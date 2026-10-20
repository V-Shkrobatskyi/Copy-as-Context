# Security audit follow-up

The privacy regressions in `tests/core/security-regressions.test.ts` cover:

- Native form values duplicated into ancestor accessible names.
- Labelled ARIA textboxes whose semantic nodes have no `value` property.
- Named descendants and link targets inside sensitive fields.
- Encoded URL parameter names, including custom rules, case preferences,
  disabled filters, empty values, malformed escapes and repeat redaction.

The tests exercise both export formats and every compression profile. Privacy-off
exports retain field contents; ordinary sibling text remains available.

## Selection, Markdown and download follow-up

Chrome selection resolves the retained picker reference in the root frame's
extension-owned isolated world. It filters browser-provided execution contexts
by extension origin, frame and world type, uses the unique context ID, and
checks exact node identity again before export. There is no page-world lookup
fallback and copied DOM markers cannot select a different block.

Markdown code spans use delimiters longer than any backtick sequence in the
value. Tests parse exports with CommonMark and verify that field values and
link targets cannot introduce images or raw HTML. CommonMark is a test-only
dependency and is not bundled into the extension.

All file-export pages now use `saveContextFile`. It handles history erasure,
optional abort signals and page unload in addition to completion and download
errors, releasing listeners and blob URLs in every outcome. Cancellation ends
the local wait; it does not cancel a download already accepted by the browser.

Run `node scripts/probe-chrome-selection.mjs` for an opt-in browser check using
the production capture adapter with a synthetic local page and a temporary
extension/profile. The page copies the marker and replaces its DOM lookup;
the export must retain only the originally selected block. Set `CHROME_BINARY`
when Chrome is installed outside the default macOS application path.

## Development dependencies

Vite is updated to 8.3.4 or later. npm overrides require shell-quote 1.12.0 or
later and source-map-js 1.2.2 or later, including transitive installations.

As of October 21, 2026, node-forge 1.4.0 remains a development-only dependency
through `web-ext -> @devicefarmer/adbkit -> node-forge`. Its RSA signature
verification advisory has no published patched release:
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
`npm audit` reports four high-severity package entries along this dependency
chain; these are not four independent vulnerabilities. This dependency issue
remains unresolved. No dependency downgrade or advisory suppression is applied.

Check the full dependency tree with `npm audit` and production dependencies with
`npm audit --omit=dev`. Run `npm run check` for types, regression tests, memory
checks, both browser builds, package checks and Firefox lint.
