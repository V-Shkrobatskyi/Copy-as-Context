# Copy as Context

Chrome Desktop extension that will copy a compact, semantic representation of the current web page for use with LLM chats. It works locally: it does not call an LLM API or send page data to a backend.

> Work in progress.

The extension can currently capture a normalized accessibility-tree snapshot from an ordinary active Chrome web page. The browser-independent core can also produce Detailed or Compact semantic text, but that output is not connected to the popup yet. Copying and file export are not implemented; Firefox is not supported.

## Chrome capture

Click **Capture page semantics** in the popup while a regular `http`, `https`, or local `file` page is active. The background service worker briefly attaches through Chrome's `debugger` permission, requests a single `Accessibility.getFullAXTree` snapshot, normalizes it, and detaches immediately.

Chrome may show a debugger-access warning. Capture cannot run on Chrome internal pages, the Chrome Web Store, and other protected pages. If another debugger client is attached to the tab, close it and retry. The snapshot remains inside the extension; the popup currently shows only capture status and a node count.

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

The pure core pipeline is `SemanticTree → compression profile → Semantic Text`.
`detailed` is lossless, while `compact` removes only tested structural and
duplicate accessibility noise. Privacy redaction and export UX are deliberately
separate follow-up work.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

## License

[MIT](LICENSE)
