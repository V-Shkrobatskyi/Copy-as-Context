# Semantic core boundary

`src/core` contains the normalized model and pure transformations shared by all browser adapters. It must not import Chrome, Firefox, WXT entrypoints, browser globals, or DOM APIs.

Adapters convert browser-specific data to this contract. UI and browser entrypoints may consume the contract but must not define or mutate browser-specific fields on `SemanticNode`.
