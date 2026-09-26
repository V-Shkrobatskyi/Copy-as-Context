# Semantic core boundary

`src/core` contains the normalized model and pure transformations shared by all browser adapters. It must not import Chrome, Firefox, WXT entrypoints, browser globals, or DOM APIs.

Adapters convert browser-specific data to this contract. UI and browser entrypoints may consume the contract but must not define or mutate browser-specific fields on `SemanticNode`.

## Compression boundary

`compressSemanticTree(tree, level)` is the pure entry point for compression
profiles. It returns a new tree and never mutates its input. `detailed` is a
lossless clone. `compact` removes only regression-tested noise: `InlineTextBox`,
empty or ancestor-duplicated `StaticText`/`image`, attribute-free `generic`
wrappers, and selected empty structural leaves. `maximum` currently aliases
the conservative `compact` policy until it has its own safety corpus.

Compression receives normalized semantic data only. Chrome/CDP capture,
privacy filtering, clipboard access, and serializers remain outside this
boundary.

## Semantic Text

`serializeSemanticText(tree)` renders an already-transformed tree in pre-order,
using two spaces per depth and a final newline. Text fields are JSON-quoted so
that newlines, tabs, quotes, and backslashes cannot produce extra node lines.
The serializer preserves explicit `false` and `mixed` states and returns a
`SerializedContext` whose `characterCount` is exactly `content.length`.

The serializer does not choose a profile or prune nodes. Markdown, JSON,
privacy filtering, clipboard access, and file downloads remain later-stage
work.
