# Regression fixtures

Each scenario has a small, hand-authored `raw-ax` fixture and its expected normalized `semantic` tree. Raw fixtures intentionally resemble the subset of Chromium CDP Accessibility data that the future adapter consumes; semantic fixtures contain only browser-independent core fields.

Fixtures are synthetic and must remain free of personal data, real credentials, private URLs, and production page content. They define normalization expectations only. Compression/pruning expectations belong to the stage 3 test corpus.

`compression-input/` contains browser-independent trees before compression.
`compression-expected/detailed/` is their lossless baseline, while
`compression-expected/compact/` records the intentional removals and
preservation guarantees for Compact. `semantic-text/` contains golden output
from the pure compression → serializer pipeline.

`privacy/redaction-cases.json` contains synthetic positive and negative inputs
for the local credential-redaction heuristic. The values resemble secrets only
for regression coverage; they are not valid credentials.

`quality/chrome-mvp-representative.json` is a browser-independent, synthetic
end-to-end quality corpus for the Chrome MVP. It covers dashboard, settings
form, tabs, collapsed content, table, dialog, menu, article, and privacy
boundaries. `tests/manual/chrome-mvp-quality.html` is its local browser smoke
test companion. Neither fixture may contain real page captures or credentials.
