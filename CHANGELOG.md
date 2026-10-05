# Changelog

## 1.0.1 — unreleased

- Use one Firefox package and stable add-on ID for Desktop 140+ and Android 142+.
- Request optional download permission only when Save is clicked on Firefox Desktop.
- Keep Android Copy-only and select responsive controls at runtime.
- Remove separate Android build and package commands.
- Update AMO source-package, submission, and manual verification instructions.

The shared package requires fresh manual browser checks before AMO submission.

## 1.0.0 — Chrome review pending

Chrome Desktop 1.0.0 was submitted to Chrome Web Store. Firefox Desktop 140+ and Android 142+ were prepared as separate builds but were not submitted to AMO.

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
