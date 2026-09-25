# Copy as Context

Chrome Desktop extension that will copy a compact, semantic representation of the current web page for use with LLM chats. It works locally: it does not call an LLM API or send page data to a backend.

> Work in progress.

The current foundation defines a browser-independent semantic tree. Chrome-specific accessibility capture is the next implementation stage; Firefox is not supported yet.

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

`src/core/` contains the normalized semantic model and must not depend on Chrome, WXT entrypoints, browser globals, or DOM APIs. Browser-specific code belongs in `src/adapters/`; UI belongs in `entrypoints/`. This separation allows a future DOM/ARIA adapter to produce the same semantic tree.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

## License

[MIT](LICENSE)
