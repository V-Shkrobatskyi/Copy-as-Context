# Changelog

## 1.0.0 — prepared for submission

First release candidate for Chrome Desktop, Firefox Desktop 140+, and Firefox Android 142+. This entry describes the prepared package; store publication has not occurred.

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

### Verification

The maintainer confirmed successful manual Desktop and Android checks on 2026-10-04. Exact device/browser versions and per-scenario reports are not recorded. Store review and signing are separate steps.
