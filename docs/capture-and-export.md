# Capture and export details

## Firefox capture

Run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`. The Desktop minimum is Firefox 140+. Reload the temporary add-on after rebuilding.

On Desktop, Copy and Save capture the active top-level document on demand. Firefox Desktop requests `activeTab` and `scripting` instead of `debugger`, plus `clipboardWrite` and `storage`. Desktop requests the optional `downloads` permission when you choose Save. It does not request persistent access to all sites. Capture excludes password input values even with redaction disabled. Other values follow the selected privacy setting.

The DOM adapter preserves supported HTML/ARIA roles, labels, live form values and states, tables, lists, open Shadow DOM and slots. It approximates accessible names; it is not Gecko's native accessibility tree or a complete implementation of the Accessible Name specification. Closed shadow roots, embedded frames, canvas pixels, CSS-generated content, unmounted virtualized UI and `aria-owns` reordering are not captured. Embedded-frame/canvas warnings appear next to export metrics. Hidden/inert content is excluded, but explicitly referenced hidden labels can contribute to accessible names. Collapsed details retain their summary and expanded state.

Capture has explicit node, depth, text and time limits; overflow produces an error rather than a silent partial export. Navigation during capture discards the result. Some browser pages and protected websites cannot be injected into.

For synthetic manual checks, serve the repository locally with `python3 -m http.server 8765 --bind 127.0.0.1`, open `http://127.0.0.1:8765/tests/manual/firefox-dom-quality.html`, and test both formats and all compression profiles. This test server serves only the fixture; the extension itself has no backend.

The Desktop quality gate also compares critical semantics with Chrome AX on an independent synthetic holdout. See [Firefox Desktop verification](firefox-desktop-testing.md) for native-browser probes, performance/retention checks, the support evidence required for minimum/ESR versions, and toolbar/lifecycle smoke tests. Use these checklists for manual regression testing.

The default Firefox package supports Desktop 140+ and Android 142+ using one add-on ID. Use `npm run build:firefox` on both platforms. Desktop requests the optional downloads permission when Save is clicked; Android keeps Save unavailable. See [Android verification](firefox-android-testing.md), [release preparation](firefox-release.md), and [BUILDING.md](../BUILDING.md).

## Chrome capture

While a regular `http`, `https`, or local `file` page is active, choose a compression level and export format in the popup, then click **Copy page context** or **Save to file**. The background service worker briefly attaches through Chrome's `debugger` permission, requests a single `Accessibility.getFullAXTree` snapshot, normalizes it, and detaches immediately.

Chrome may show a debugger-access warning. Capture cannot run on Chrome internal pages, the Chrome Web Store, and other protected pages. If another debugger client is attached to the tab, close it and retry. The result remains inside the extension except for the clipboard or local file destination selected by the user.

## Export and privacy

The popup supports **Semantic Text** (default) and **Markdown**. `Compact` is the default compression level; `Maximum` preserves Compact context and packs profitable repeated text and structures with selective role abbreviations. Its output includes a short legend; pages fall back to Compact when the estimated benefit is too small. Copy surrounds the entire page context with `<web_page>` and `</web_page>` on separate lines, or `**` on both sides for Maximum, without extra blank lines around the context and with a single newline after the closing boundary. Your instructions can go before or after the block. Save to file exports the original context without these boundaries.

Export headers include `Browser:` between `URL:` and `Captured:` in both formats and every compression profile. It records the browser name, Desktop or Android platform when known, and the available version. Firefox uses runtime metadata; Chromium uses local browser hints with a User-Agent fallback. A reduced version is shown as its major version; unavailable versions are omitted, and missing metadata appears as `Unavailable`. This adds no permissions or network requests.

Export attribution includes the installed extension version and a settings digit, for example `1.0.1/7 (created by V. Shkrobatskyi)` (illustrative version). The codes are Without `0`, Detailed `2`, Compact `4`, Maximum `6`; add `1` when **Redact sensitive data** is enabled. The digit records the selected profile even when Maximum falls back to Compact, and the privacy option rather than a guarantee that every sensitive value was found.

The popup shows the exact JavaScript character count (including boundaries for Copy), a rough token estimate (`ceil(characters / 4)`), and context reduction relative to Without output with the same format and privacy setting. Boundaries are excluded from the reduction ratio. The estimate is not model-specific tokenization. Maximum uses a separate local cost heuristic for packing; it does not bundle a tokenizer or guarantee savings for every model.

When **Redact sensitive data** is enabled, the extension applies a local heuristic redaction pass to the normalized context. It replaces password field values and common credential-shaped text (for example Bearer/Basic authorization values, JWTs, GitHub tokens, AWS access-key IDs, OpenAI-style keys, and selected `token`/`api_key` URL parameters) with `[REDACTED]`. This is a safeguard against obvious accidental disclosure, **not** a general DLP or PII detector: review exported context before sharing it, especially when it contains personal or business-sensitive data.

The Chrome build requests `debugger` to read the computed accessibility tree, `clipboardWrite` to copy a user-requested export, `downloads` to save a user-requested local file, and `storage` to keep preferences. Download filenames use the local `YYYY.MM.DD_HHmmss` timestamp and do not include the page title or URL.

Save downloads a local UTF-8 file. Chrome confirms completion while its popup remains open. Firefox uses a separate extension tab to keep the Blob URL alive when the Save As picker closes the popup; keep this tab open until saving finishes. It closes after success and shows a generic error if saving fails or is cancelled. The browser download manager also shows progress and completion. Android shows Save unavailable.

## Review page content before sharing

Exported context can include text you did not see on the page, such as white text on a white background, text covered by another element, or accessible labels. Inclusion depends on what Chrome exposes in its accessibility tree and what the export preserves. Hidden accessibility text can serve a legitimate purpose; its presence alone does not mean a page is malicious.

The export is not a copy of all HTML text. Content excluded from the accessibility tree, not yet loaded, or present only as image pixels may be absent; the extension does not perform OCR. Some hidden text can still contribute to an element's accessible name. **Without** keeps captured semantic nodes, not everything that exists on the page. See [MDN's accessibility notes on hiding content](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/display#accessibility).

Visible or hidden page text can also contain instructions aimed at an AI assistant, often called **prompt injection**. These may ask it to ignore your task, reveal private information, or take unrelated actions. Treat exported page content as untrusted source material:

- Review the exported text before sharing it, and remove suspicious or irrelevant instructions.
- Tell the assistant to use the page as source material rather than instructions to follow.
- Review consequential actions, such as sending information or changing data, before allowing them.

Local processing, credential redaction, compression, and export boundaries do not detect or guarantee removal of malicious instructions. The review steps above can help reduce risk, but they do not guarantee protection.
