# Regression fixtures

Each scenario has a small, hand-authored `raw-ax` fixture and its expected normalized `semantic` tree. Raw fixtures intentionally resemble the subset of Chromium CDP Accessibility data that the future adapter consumes; semantic fixtures contain only browser-independent core fields.

Fixtures are synthetic and must remain free of personal data, real credentials, private URLs, and production page content. They define normalization expectations only. Compression/pruning expectations belong to the stage 3 test corpus.
