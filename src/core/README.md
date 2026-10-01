# Semantic core boundary

`src/core` contains the normalized model and pure transformations shared by all browser adapters. It must not import Chrome, Firefox, WXT entrypoints, browser globals, or DOM APIs.

Adapters convert browser-specific data to this contract. UI and browser entrypoints may consume the contract but must not define or mutate browser-specific fields on `SemanticNode`.

## Compression boundary

`compressSemanticTree(tree, level)` is the pure entry point for compression
profiles. It returns a new tree and never mutates its input. `without` is an
unpruned normalized clone; `detailed` additionally removes only empty `none`
presentation wrappers. `compact` removes only regression-tested noise: `InlineTextBox`,
empty or ancestor-duplicated `StaticText`/`image`, attribute-free `generic` or
`none` presentation wrappers, and selected empty structural leaves. `maximum` shares
the conservative `compact` structural policy; its export encoding follows redaction.

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


## Maximum encoding

`prepareExport` applies Maximum encoding only to the already-redacted Compact tree.
It preserves every exported node occurrence, field, explicit state and child order.
Adapter IDs are not exported. Header placement and clipboard boundaries retain existing behavior.
Attribution uses the package version, the selected compression index times two
plus the privacy flag (`0`–`7`), and the author `V. Shkrobatskyi`. Direct serializers
without export settings include the version only. Maximum fallback retains the
requested profile code. The encoding legend has no internal format version. Metadata is never placed in a dictionary.

The self-contained legend describes quoted literals, explicit `key=value`
attributes, indentation, and the features actually used:

- Selective calibrated role aliases, such as `st=StaticText` and `li=listitem`.
  Aliases occupy role slots only; a conflicting original role prevents that alias.
  `button=bt` is excluded because calibration found no token benefit.
- Exact whole-string definitions `A="..."` through `Z="..."`. Bare references
  occupy name/value/href slots only; quoted `"A"` remains literal. Short candidates
  require three occurrences; two suffice when estimated literal cost covers the
  definition, references and uncertainty margin. Unsupported scripts and
  `[REDACTED]` stay literal. ASCII and bullet-mask text have local calibration.
- `cell+link NAME`, only for an attribute-free same-name cell with one link child;
  following children belong to the link. Both nodes remain present on expansion.
- `paragraph inline={...}` for supported unnamed, attribute-free paragraphs with
  exact StaticText leaves and nested code/strong groups. Semicolons retain sibling
  boundaries, and quotes retain whitespace; each string represents one text node.
- Exact repeated subtrees, defined under `T1:` etc. `@T1` inserts a fresh copy.
  Definition indentation is relative to its root. Definitions contain no subtree
  references; the final tree starts after `Page tree:`. Differences in states,
  values, levels, links or child order prevent sharing; IDs are ignored as before.

Selection compares at most eight combinations of chains, inline groups and exact
subtrees. Slot frequencies are counted in the selected representation, including
one copy of each definition. Thus parent packing cannot claim child savings twice.
Exact structural keys are interned without probabilistic hashes. Definitions are
flat, so they cannot form reference cycles. This bounded heuristic does not claim
globally optimal packing.

The separate character ledger counts escaping, all definitions, legends and line
breaks exactly. A small local lexical cost model, calibrated offline with
`cl100k_base` and `o200k_base`, estimates tokens. Candidate margins reject small
uncertain benefits. The complete payload must save at least 64 characters and 2%,
and at least 24 estimated tokens and 4%; otherwise serialization falls back to
Compact without an encoding legend. These are empirical guards, not guarantees for
arbitrary pages or other models. Popup `ceil(characters / 4)` remains an independent
rough estimate. No runtime tokenizer, network request, dependency or permission is
added.

Analysis is iterative and bounded to 100,000 nodes, depth 256, 4,096 interned
signatures and unique string candidates, 26 strings and 8 subtree definitions.
Inline groups allow at most 128 nodes and 4,096 encoded characters. Limit overflow
uses literal fragments or Compact fallback without truncation. New analysis limits
do not expand the existing capture/transform/legacy serializer depth contract.
All maps and cost caches belong to one export and are discarded afterwards.

Local Stage 13 verification lives in ignored `dev_notes/info/S1/p1/stage12_test`
per the user's test-location instruction; it is not included in CI or public PRs.
It includes independent expansion, holdout/token reports and legacy comparisons.
