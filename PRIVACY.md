# Privacy policy for Copy as Context

Last updated: 2026-10-05. Applies to versions 1.0.0 and 1.0.1.

## Purpose and local processing

Copy as Context exports semantic content from the active page for your AI conversations or notes. Capture, compression, credential redaction, and serialization run locally on your device after you request an export. The extension has no capture backend, analytics, advertising SDK, or LLM API integration.

## Information processed

An export can contain page text, title, URL, accessible labels, semantic roles, form values and states, capture time, browser/platform/version metadata when available, and the extension version and selected settings. This information can include personal or sensitive information present on the page. Chrome reads an accessibility-tree snapshot; Firefox reads HTML/ARIA semantics. Firefox always omits password input values.

The extension uses this information only to create the export you request. It does not monitor your browsing history in the background or upload captured pages to the developer.

## Storage and retention

The extension persists your compression, format, and privacy preferences in browser-local extension storage when you choose Save preferences. It does not maintain a persistent archive of captured pages. Capture data is held temporarily for processing; runtime and browser cleanup determine when memory is reclaimed.

Copy places the result on your clipboard. Desktop Save writes a UTF-8 file to a destination controlled by your browser. Clipboard history, operating-system clipboard synchronization, browser download history, backups, and destination applications may retain copies under their own settings. Android supports Copy only.

You can change saved preferences in the popup or remove extension-local preferences by clearing the extension's data or uninstalling it. Delete exported files and clipboard/history entries separately using your browser, operating system, or destination application.

## Sharing and external services

The extension does not send captured page content, URLs, or preferences to the developer, sell user data, or use it for advertising. You decide whether to paste or upload an export into another application; that application then handles it under its own policies.

Help, project, contact, and voluntary donation links are opened only when you choose them. GitHub, your email provider, and the payment provider may receive normal navigation/contact/payment information under their own privacy policies. Capture data is not attached to these links.

If you email a bug report or post a GitHub issue, the recipient/service receives the information you provide and may retain it for support. Do not include passwords, tokens, or private page content. Contact the developer to request deletion of information you sent directly; public GitHub content is also governed by GitHub's controls and policies.

## Permissions

- Chrome debugger: briefly reads the active page's accessibility tree after an export action and detaches afterward.
- Firefox activeTab and scripting: obtain temporary page access and run on-demand semantic extraction.
- clipboardWrite: writes the export you request to your clipboard.
- downloads (Desktop only): saves the export you request as a local file. In Firefox 1.0.1, this permission is optional and requested when you click Save; Android never requests it.
- storage: persists export preferences locally.

The extension does not request persistent access to all websites.

## Security and redaction

Credential redaction is enabled by default and replaces detected credential patterns before export. It is heuristic and cannot guarantee that all credentials or personal information are removed. Disabling redaction can expose original values. Review the output before sharing it. Page content is untrusted; the extension does not guarantee removal of instructions aimed at AI assistants.

Local diagnostics contain operational information such as capture status, root role, warning codes, and failure information; they do not log raw page text or the exported context.

## Chrome Web Store Limited Use

Copy as Context uses information obtained through browser permissions solely for its user-requested page-context export feature. Its use of that information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. The extension does not transfer captured data to the developer or third parties, use it for personalized advertising, or give the developer access to your captures.

## Changes and contact

Changes to data handling will be reflected in this policy with an updated date. The policy is included in the extension and maintained in the project repository.

For privacy questions, contact [copyascontext@gmail.com](mailto:copyascontext@gmail.com) or visit the [project repository](https://github.com/V-Shkrobatskyi/Copy-as-Context). Avoid sharing sensitive exports in public issues.
