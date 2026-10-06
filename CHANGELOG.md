# Changelog

## 1.0.1 — unreleased

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
