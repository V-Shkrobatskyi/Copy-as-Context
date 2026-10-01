# Copy as Context

Chrome Desktop extension that will copy a compact, semantic representation of the current web page for use with LLM chats. It works locally: it does not call an LLM API or send page data to a backend.

> Work in progress.

The extension captures a normalized accessibility-tree snapshot from an ordinary active Chrome web page and exports a compact semantic representation locally. It does not call an LLM API or send page data to a backend. Firefox is not supported.

## Chrome capture

While a regular `http`, `https`, or local `file` page is active, choose a compression level and export format in the popup, then click **Copy page context** or **Save to file**. The background service worker briefly attaches through Chrome's `debugger` permission, requests a single `Accessibility.getFullAXTree` snapshot, normalizes it, and detaches immediately.

Chrome may show a debugger-access warning. Capture cannot run on Chrome internal pages, the Chrome Web Store, and other protected pages. If another debugger client is attached to the tab, close it and retry. The result remains inside the extension except for the clipboard or local file destination selected by the user.

## Export and privacy

The popup supports **Semantic Text** (default) and **Markdown**. `Compact` is the default compression level; `Maximum` preserves Compact context and packs profitable repeated text and structures with selective role abbreviations. Its output includes a short legend; pages fall back to Compact when the estimated benefit is too small. Copy surrounds the entire page context with `<web_page>` and `</web_page>` on separate lines, or `**` on both sides for Maximum, without extra blank lines around the context and with a single newline after the closing boundary. Your instructions can go before or after the block. Save to file exports the original context without these boundaries.

Export attribution includes the installed extension version and a settings digit, for example `0.0.0/7 (created by V. Shkrobatskyi)`. The codes are Without `0`, Detailed `2`, Compact `4`, Maximum `6`; add `1` when **Redact sensitive data** is enabled. The digit records the selected profile even when Maximum falls back to Compact, and the privacy option rather than a guarantee that every sensitive value was found.

The popup shows the exact JavaScript character count (including boundaries for Copy), a rough token estimate (`ceil(characters / 4)`), and context reduction relative to Without output with the same format and privacy setting. Boundaries are excluded from the reduction ratio. The estimate is not model-specific tokenization. Maximum uses a separate local cost heuristic for packing; it does not bundle a tokenizer or guarantee savings for every model.

Before every export, the extension applies a local heuristic redaction pass to the normalized context. It replaces password field values and common credential-shaped text (for example Bearer/Basic authorization values, JWTs, GitHub tokens, AWS access-key IDs, OpenAI-style keys, and selected `token`/`api_key` URL parameters) with `[REDACTED]`. This is a safeguard against obvious accidental disclosure, **not** a general DLP or PII detector: review exported context before sharing it, especially when it contains personal or business-sensitive data.

The extension requests three permissions: `debugger` to read the computed accessibility tree, `clipboardWrite` to copy a user-requested export, and `downloads` to save a user-requested local file. Download filenames use the local `YYYY.MM.DD_HHmmss` timestamp and do not include the page title or URL.

## Development

```bash
npm install
npm run dev
```

Run a TypeScript check with:

```bash
npm run compile
```

Run the unit tests with:

```bash
npm test
```

Run all checks, including a production extension build, with:

```bash
npm run check
```

## Architecture

`src/core/` contains the normalized semantic model and must not depend on Chrome, WXT entrypoints, browser globals, or DOM APIs. Browser-specific code belongs in `src/adapters/`; UI belongs in `entrypoints/`. The Chrome adapter owns CDP payloads and the attach → command → detach lifecycle, and returns only a browser-agnostic semantic tree. This separation allows a future DOM/ARIA adapter to produce the same semantic tree.

The pure core pipeline is `SemanticTree → compression profile → privacy redaction
→ serializer`. `without` is the unpruned normalized tree; `detailed` removes
only empty presentation wrappers, while `compact` removes only tested
structural and duplicate accessibility noise. Browser APIs for clipboard and
downloads remain in the popup layer.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

## License

[MIT](LICENSE)
