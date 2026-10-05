# Store listing drafts for Firefox 1.0.1

These drafts describe the shared Firefox 1.0.1 package. Chrome 1.0.0 has already been submitted for review. No Firefox listing has been submitted by this preparation.

## Shared metadata

- Name: Copy as Context
- Suggested category: Productivity (select the closest available category in each dashboard)
- Support email: copyascontext@gmail.com
- Support website: https://github.com/V-Shkrobatskyi/Copy-as-Context/issues
- Homepage: https://github.com/V-Shkrobatskyi/Copy-as-Context
- License: MIT
- Privacy policy after merge: https://github.com/V-Shkrobatskyi/Copy-as-Context/blob/main/PRIVACY.md

## Short description

Copy a compact semantic representation of the current page for LLM chats.

## Description

Turn the current page into useful context for an AI conversation or local notes. Copy as Context reads semantic page structure, processes it locally, and exports the result as Semantic Text or Markdown.

Choose Without, Detailed, Compact, or Maximum compression. Optional credential redaction is enabled by default. Save preferences for your next export and see character counts, rough token estimates, and context reduction.

Firefox Desktop supports clipboard export and local UTF-8 downloads. Firefox Android supports clipboard export; file downloads are unavailable. Both platforms use the same extension package. Desktop asks for download permission the first time Save is clicked.

There is no LLM service, capture backend, analytics, or advertising integration. The extension does not upload captured page content to the developer. You decide whether to share the exported text with another application.

Firefox approximates HTML/ARIA semantics in the main document and supported open web components. Browser-internal and protected pages may deny access. Capture does not perform OCR or guarantee complete page coverage.

Firefox always omits password input values. Credential redaction is heuristic and may miss sensitive information. Review exports before sharing them; page text can include untrusted instructions aimed at AI assistants. Token estimates are not model-specific tokenization.

Voluntary developer-support links do not unlock functionality or affect export behavior.

## Permission justifications

| Permission | Explanation |
| --- | --- |
| debugger (Chrome) | Reads one Accessibility.getFullAXTree snapshot from the active page after the user requests Copy or Save; detaches after capture. No background browsing-history collection. |
| activeTab (Firefox) | Grants temporary access to the active page when the user opens the extension action. |
| scripting (Firefox) | Injects the bounded HTML/ARIA collector into the active top-level document for a requested export. |
| clipboardWrite | Writes the user-requested context export to the clipboard. |
| downloads (Firefox optional; Chrome required) | Saves the requested export as a local UTF-8 text or Markdown file. Firefox requests it only from the Desktop Save button; Android never requests it. |
| storage | Persists compression, format, and privacy preferences locally when requested. |

No broad persistent host permissions or remotely hosted executable code are used.

## Reviewer notes

Build instructions are in BUILDING.md; use Node.js 24.10.0, npm 11.6.0, and npm ci with the included lockfile. The submitted Firefox source archive must match the selected extension archive. No account, LLM key, login, or paid service is needed to use the extension.

Open a regular page containing a heading, list, and form controls. Open the extension from the browser action/menu, choose a profile and format, and copy into a local text editor. Desktop also supports Save to file. Firefox capture requires an action-granted activeTab permission; opening popup.html as a browser tab does not grant it.

For synthetic fixtures, serve tests/manual/firefox-dom-quality.html or tests/fixtures/quality/desktop-holdout.html locally as documented in the verification guides. Do not use personal browsing profiles for automated probes.

The manifest declares Firefox Desktop 140+ and Firefox Android 142+ under one
add-on ID. Download permission is optional and requested before capture only when
the user clicks Save on Desktop. Declining permission starts no capture or
download and leaves Copy usable. Android never requests downloads permission and
keeps Save unavailable, including if the runtime exposes a downloads stub.

Manual checks of the separate 1.0.0 packages were confirmed by the maintainer on
2026-10-04. The shared 1.0.1 package needs a fresh Desktop and Android smoke check.
Record the final lint warnings and device results before submission; do not claim
that automated checks certify physical-device behavior.

## Launch materials still needed

Prepare Firefox Desktop and Android screenshots, verify public privacy/support
URLs, and complete the shared-package manual checks before AMO submission. Chrome
screenshots and the promotional tile were prepared by the maintainer for its
separate 1.0.0 submission. No screenshots are generated by this preparation.
