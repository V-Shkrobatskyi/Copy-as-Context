# Copy as Context

Chrome Desktop extension that will copy a compact, semantic representation of the current web page for use with LLM chats. It works locally: it does not call an LLM API or send page data to a backend.

> Work in progress.

The extension captures a normalized accessibility-tree snapshot from an ordinary active Chrome web page and exports a compact semantic representation locally. It does not call an LLM API or send page data to a backend. Firefox is not supported.

## Chrome capture

While a regular `http`, `https`, or local `file` page is active, choose a compression level and export format in the popup, then click **Copy page context** or **Save to file**. The background service worker briefly attaches through Chrome's `debugger` permission, requests a single `Accessibility.getFullAXTree` snapshot, normalizes it, and detaches immediately.

Chrome may show a debugger-access warning. Capture cannot run on Chrome internal pages, the Chrome Web Store, and other protected pages. If another debugger client is attached to the tab, close it and retry. The result remains inside the extension except for the clipboard or local file destination selected by the user.

## Export and privacy

The popup supports **Semantic Text** (default) and **Markdown**. `Compact` is the default compression level; `Maximum` currently uses the same conservative policy as Compact. The popup shows the exact JavaScript character count, a rough token estimate (`ceil(characters / 4)`), and reduction relative to a redacted Without output in the same format. The estimate is not model-specific tokenization.

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
