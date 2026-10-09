# Regression fixtures

Each scenario has a small, hand-authored `raw-ax` fixture and its expected normalized `semantic` tree. Raw fixtures intentionally resemble the subset of Chromium CDP Accessibility data that the Chrome adapter consumes; semantic fixtures contain only browser-independent core fields.

Fixtures are synthetic and must remain free of personal data, real credentials, private URLs, and production page content. They define normalization expectations only. Compression expectations are defined in the compression fixtures below.

`quality/desktop-holdout.html` is an independent DOM/Chrome AX quality fixture.
`tests/helpers/desktop-quality.ts` specifies required controls, states, named
ancestors, exclusions, Unicode, privacy outcomes and live SPA updates. It is used
by both the DOM unit suite and opt-in native browser probe; allowed summary-role
differences are explicit. Native results are not compared byte-for-byte.

`compression-input/` contains browser-independent trees before compression.
`compression-expected/detailed/` preserves semantic content while flattening
attribute-free `generic`/`none` wrappers, while
`compression-expected/compact/` records the intentional removals and
preservation guarantees for Compact. `semantic-text/` contains golden output
from the pure compression → serializer pipeline.

`privacy/redaction-cases.json` contains synthetic positive and negative inputs
for the local credential-redaction heuristic. The values resemble secrets only
for regression coverage; they are not valid credentials.

`quality/chrome-mvp-representative.json` is a browser-independent, synthetic
end-to-end quality corpus for Chrome. It covers dashboard, settings
form, tabs, collapsed content, table, dialog, menu, article, and privacy
boundaries. `tests/manual/chrome-mvp-quality.html` is its local browser smoke
test companion. Neither fixture may contain real page captures or credentials.

`quality/resource-table-compaction/` contains a synthetic resource table with five masked
values, split control labels, visible column labels, closed menus and creation
fields. Its Detailed and Compact JSON/text goldens specify the reviewed output;
`repeated-text-baseline.json` isolates the nine newly removed text duplicates.

`raw-ax/checked-tristate.json` and its semantic counterpart cover synthetic CDP
`checked` tokens. They are protocol examples, not a live capture. Chromium's
[accessibility helper](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/accessibility/inspector_type_builder_helper.cc)
emits `true`, `false` and `mixed` as tristate strings.
