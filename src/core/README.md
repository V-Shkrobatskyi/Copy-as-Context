# Semantic core boundary

`src/core` contains the normalized model and pure transformations shared by all browser adapters. It must not import Chrome, Firefox, WXT entrypoints, browser globals, or DOM APIs.

Adapters convert browser-specific data to this contract. UI and browser entrypoints may consume the contract but must not define or mutate browser-specific fields on `SemanticNode`.

## Compression boundary

`compressSemanticTree(tree, level)` is the pure entry point for compression
profiles. It returns a new tree and never mutates its input. `without` is an
unpruned normalized clone; `detailed` additionally removes only empty `none`
presentation wrappers. `compact` removes only regression-tested noise: `InlineTextBox`,
empty or ancestor-duplicated `StaticText`/`image`, attribute-free `generic` or
`none` presentation wrappers, and selected empty structural leaves. `maximum` currently aliases
the conservative `compact` policy until it has its own safety corpus.

Compact also removes a complete ordered sequence of plain text fragments when
it exactly reconstructs a button or link name. Partial labels, visible column
labels and semantic boundaries remain intact. A textbox's plain text duplicate
of its own nonempty value is removed before redaction; value matching is case
sensitive and never uses `[REDACTED]` as a duplicate key. These local rules cross
only attribute-free presentation wrappers and retain controls and their states.
Heading and list levels remain explicit.

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
ratio against the redacted Without output in the same format, and a redaction
count. It contains no browser APIs. Clipboard and file-download code belongs in
the popup and must consume only the already prepared serialized content.

The browser background entrypoint now prepares the export and sends only final
content and counters to the popup. The popup does not receive the semantic tree
or run transforms. Browser-specific capture and message validation remain outside
the core; future browser adapters can call the same `prepareExport` function.

Export preparation reads the normalized input directly for Without, reuses its
selected size as the baseline, and counts other profiles' Without output through
the same rendering code without accumulating baseline lines or a full string.
Public compression functions still return independent trees. Compact's href
filter modifies only its owned clone, and ancestor label reference counts are
scoped to a single traversal. There is no retained capture cache.

Redaction skips the replacement passes for strings without any supported
credential marker. This fast check is a superset of the credential patterns;
adding a pattern requires updating the marker check and its regression cases.
