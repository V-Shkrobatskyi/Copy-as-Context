# Copy as Context

Copy a compact, semantic representation of the current page into an AI conversation or local notes. Choose Semantic Text or Markdown, adjust compression, and export with one click. Processing stays on your device: no LLM API, capture backend, or analytics.

![Copy as Context icon](public/icon/128.png)

For example, a page with a heading and button can become:

```text
<web_page>
URL: https://example.test/
Title: Project overview
Browser: Firefox Desktop 140.0
Captured: 2026-10-04T12:00:00Z

heading: Project overview
button: Create project
</web_page>
```

This shortened example illustrates the structure; actual output includes extension attribution and depends on the page, browser, and selected settings.

## Installation

Version **1.0.0** is prepared for submission. Chrome Web Store and Firefox Add-ons links will be added after publication; no store listing is claimed here.

For local installation, use Node.js 24.10.0 and npm 11.6.0:

```sh
npm ci
npm run build
npm run build:firefox
npm run build:firefox:android
```

- **Chrome:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `.output/chrome-mv3`.
- **Firefox Desktop:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`. Temporary installation ends when Firefox closes.
- **Firefox Android:** use `.output/firefox-mv3-android` with the [device installation instructions](docs/firefox-android-testing.md). Store installation will become available after AMO publication.

## Supported browsers

| Browser | Capture | Export | Minimum |
| --- | --- | --- | --- |
| Chrome Desktop | Accessibility-tree snapshot | Copy and Save | Current Chrome; no older-version minimum has been certified |
| Firefox Desktop | HTML/ARIA semantics | Copy and Save | Firefox 140 |
| Firefox Android | HTML/ARIA semantics | Copy; Save unavailable | Firefox Android 142 |

The maintainer confirmed successful manual Desktop and Android checks on 2026-10-04. Exact tested versions and device details are not recorded. Desktop and Android have separate Firefox build variants; the default Firefox ZIP is Desktop-only.

## Quick start

1. Open the page you want to export, then open the extension from the browser toolbar or Android extensions menu.
2. Choose **Semantic Text** or **Markdown**, a compression level, and the privacy setting.
3. Click **Copy page context**, then paste into your conversation or notes. On Desktop, **Save to file** exports a local UTF-8 file.

**Save preferences** keeps your choices for the next popup session.

| Compression | Behavior |
| --- | --- |
| Without | Keeps every captured semantic node, rather than all page HTML |
| Detailed | Removes empty presentation wrappers |
| Compact (default) | Removes repeated accessibility noise while retaining meaningful controls |
| Maximum | Packs Compact output with selective abbreviations and repeated structures; falls back when packing would add overhead |

Copy wraps the export in `<web_page>` boundaries, or `**` boundaries for Maximum. Save exports the context without these boundaries. Token counts are rough estimates, not model-specific tokenization.

## Privacy and limitations

[Read the privacy policy](PRIVACY.md). Page content, URL, semantic form values, and browser metadata are processed locally after an export action. The extension sends no captured data to the developer or an LLM service. Only preferences are persisted by the extension; copied text and saved files remain in the destinations you choose.

**Redact sensitive data** is enabled by default. Credential redaction is heuristic and cannot guarantee removal of all private information. Firefox always omits password input values, even with redaction disabled. Review exports before sharing them.

Capture reflects browser accessibility or HTML/ARIA semantics. It does not perform OCR or promise complete page coverage. Firefox omits embedded frames, closed shadow roots, canvas pixels, and unmounted virtualized content. Browser-internal pages and protected sites may reject capture. Chrome briefly uses the `debugger` permission and may display a browser warning.

Page text can contain instructions aimed at an AI assistant. Treat exports as untrusted source material and tell the assistant to use them as evidence for your task. Compression, redaction, and export boundaries do not remove all malicious instructions.

See [capture and export details](docs/capture-and-export.md) for browser differences, permissions, metrics, privacy behavior, and troubleshooting.

## Development and releases

```sh
npm ci
npm run dev
npm run check
```

`npm run check` runs TypeScript, unit tests, three browser builds, bundle checks, and Firefox lint. Native browser probes and manual regression procedures are documented separately.

- [Contributor workflow](CONTRIBUTING.md)
- [Reproducible package builds](BUILDING.md)
- [Release checklist and store submission](docs/releasing.md)
- [Firefox Desktop verification](docs/firefox-desktop-testing.md)
- [Firefox Android verification](docs/firefox-android-testing.md)
- [Architecture](src/core/README.md)
- [Changelog](CHANGELOG.md)

## Support

Report issues through [GitHub Issues](https://github.com/V-Shkrobatskyi/Copy-as-Context/issues) or email [copyascontext@gmail.com](mailto:copyascontext@gmail.com). Include extension/browser versions and reproduction steps; do not send sensitive page content.

You can [support development via PrivatBank (UAH)](https://www.privat24.ua/send/kh73d). Contributions are voluntary and do not unlock additional functionality.

## License

[MIT](LICENSE)
