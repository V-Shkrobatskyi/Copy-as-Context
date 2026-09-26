# Regression fixtures

Each scenario has a small, hand-authored `raw-ax` fixture and its expected normalized `semantic` tree. Raw fixtures intentionally resemble the subset of Chromium CDP Accessibility data that the future adapter consumes; semantic fixtures contain only browser-independent core fields.

Fixtures are synthetic and must remain free of personal data, real credentials, private URLs, and production page content. They define normalization expectations only. Compression/pruning expectations belong to the stage 3 test corpus.

`compression-input/` contains browser-independent trees before compression.
`compression-expected/detailed/` is their lossless baseline, while
`compression-expected/compact/` records the intentional removals and
preservation guarantees for Compact. `semantic-text/` contains golden output
from the pure compression → serializer pipeline.
