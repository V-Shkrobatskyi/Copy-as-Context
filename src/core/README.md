# Semantic core boundary

`src/core` contains the normalized model and pure transformations shared by all browser adapters. It must not import Chrome, Firefox, WXT entrypoints, browser globals, or DOM APIs.

Adapters convert browser-specific data to this contract. UI and browser entrypoints may consume the contract but must not define or mutate browser-specific fields on `SemanticNode`.

## Compression boundary

`compressSemanticTree(tree, level)` is the pure entry point for compression
profiles. It returns a new tree and never mutates its input. `detailed` is a
lossless clone. `compact` removes only regression-tested noise: `InlineTextBox`,
empty or ancestor-duplicated `StaticText`/`image`, attribute-free `generic` or
`none` presentation wrappers, and selected empty structural leaves. `maximum` currently aliases
the conservative `compact` policy until it has its own safety corpus.

Compression receives normalized semantic data only. Chrome/CDP capture and
clipboard/download APIs remain outside this boundary.

## Semantic Text

`serializeSemanticText(tree)` renders an already-transformed tree in pre-order,
using two spaces per depth and a final newline. Text fields are JSON-quoted so
that newlines, tabs, quotes, and backslashes cannot produce extra node lines.
The serializer preserves explicit `false` and `mixed` states and returns a
`SerializedContext` whose `characterCount` is exactly `content.length`.

`serializeMarkdown(tree)` uses the same already-transformed tree and emits a
stable nested-list representation. JSON and raw-debug exports are intentionally
not exposed in the MVP popup.

## Privacy and export preparation

`redactSemanticTree(tree)` is a pure, immutable, idempotent heuristic filter.
It redacts password values and common credential-shaped text in every
normalized text field before serialization. It returns only a replacement count
and never retains matched secret values. This is not a general PII or DLP
solution; adapters and UI must not claim it catches every secret.

`prepareExport(tree, compressionLevel, format)` is the only core orchestration
entry point for supported user exports. Its required order is:

```text
compress → redact → serialize
```

It currently supports `semantic-text` and `markdown`, and returns exact
character count, `ceil(characters / 4)` approximate token count, a reduction
ratio against the redacted Detailed output in the same format, and a redaction
count. It contains no browser APIs. Clipboard and file-download code belongs in
the popup and must consume only the already prepared serialized content.
