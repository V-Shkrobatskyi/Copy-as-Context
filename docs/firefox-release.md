# Firefox release preparation

The local artifacts are unsigned development packages. No add-on has been signed,
submitted to AMO, listed, pushed or published by this work. Full Desktop toolbar
and lifecycle evidence is still required; Android remains deferred.

## Build and archives

Run `npm run check`, then `npm run zip:firefox` and
`npm run check:firefox-package`. The package check verifies exact uncompressed ZIP
content against the built Desktop directory, required license/notice files,
metadata and the source allowlist. It emits SHA-256 for both archives. See
[BUILDING.md](../BUILDING.md) for the reviewer reproduction, including Node/npm
versions and the locked `npm ci` build. No local plan or report is part of either
archive. Publish the matching source ZIP for each submitted bundled/minified
version, as required by [Mozilla source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).

The installed package contains the project MIT license and third-party notices
for WXT entrypoint helpers and @wxt-dev/browser. Node/test tooling is not bundled;
its exact dependency sources are in package-lock.json. There are no private build
dependencies, remotely loaded scripts, analytics SDKs or signing credentials in
the source archive. Re-audit bundled licenses if dependencies or assets change.

## Metadata and owner decisions

| Field | Prepared value | Remaining release requirement |
| --- | --- | --- |
| Name | Copy as Context | Confirm final listing |
| Version | 0.0.0, development | Choose release version before signing |
| Add-on ID | {e97aa566-cac0-4e2c-81f7-0ab664bf86ce} | AMO uniqueness/account ownership checked on first submission |
| Desktop minimum | Firefox 140.0 | Native 140 ESR/157 probes pass; full toolbar matrix pending |
| Android | No production gecko_android declaration | Physical-device/Save gate deferred |
| Permissions | activeTab, scripting, clipboardWrite, storage, downloads | Explain on listing; no debugger or broad host access |
| Data collection | required: [none] | Reconfirm final package matches local-only implementation |
| Channel | Undecided | Owner chooses listed AMO or signed self-distribution |
| Signing | Not performed | Use owner's account/credentials only after authorization |

The ID is a stable project UUID; no address or domain is invented. The
[manifest documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
defines the signing ID and Android availability fields. A manifest declaration or
lint result does not prove AMO acceptance or ID ownership. The
[built-in consent guidance](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
documents the none declaration for extensions without collection/transmission.

## Local export behavior

Capture, compression and heuristic redaction run locally. Password values are
omitted during Firefox extraction. Other values follow the privacy toggle.
The extension has no backend or LLM request; clipboard and local file destinations
are explicitly selected by the user. User-activated help/support links are normal
browser navigations, not capture-data uploads.

Save uses a local Blob URL and retains it until the browser reports download
completion or interruption. The popup releases the URL and listener on either
outcome, and reports success only after completion. No broad host permissions or
network request are needed. The filename contains a timestamp and extension,
not page title/URL. Native probes check exact UTF-8 bytes for both formats after
the initiating extension document closes. The probe chooses a temporary directory
and bypasses Save As; the real Desktop picker remains a manual test. Browsers
without downloads API show Save unavailable.

The current web-ext linter reports one reviewed warning,
KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION: it infers Android 140 from the
Desktop minimum while data_collection_permissions requires Android 142. The
production manifest deliberately omits gecko_android, so AMO Desktop-only
availability is intentional. The separate Android probe declares 142 and omits
unsupported downloads; it is not a production release or a support claim.

## Prepared listing draft

Copy as Context copies a structured summary of the current page for use in LLM
chats or local notes. Choose Semantic Text or Markdown and one of four compression
profiles, then copy the context or download a local file. Processing stays on your
device; the extension has no LLM service, analytics or capture backend.

Firefox capture approximates HTML/ARIA semantics in the main document and supported
open web components. Embedded frames, closed shadow roots, canvas pixels,
CSS-generated content and unmounted virtualized UI are outside capture scope.
Frame/canvas warnings identify detected omissions. Password values are always
excluded; optional credential redaction is heuristic and does not guarantee
removal of all sensitive information. Review context before sharing it.

This draft describes Desktop scope. Do not advertise Android, universal page
coverage or exact model token counts. Store category, screenshots, release notes,
support links and final version are owner decisions. Use synthetic content for
screenshots and verification rather than private real pages.

## Signing and publication gate

Complete [Desktop smoke](firefox-desktop-testing.md), record the actual versions,
confirm the release version and distribution channel, regenerate both archives,
review hashes/source reproduction and current Mozilla policies, then obtain
explicit authorization to sign or submit. Credentials stay outside source and
command logs. This document does not execute a signing or submission command.
Unsigned ZIPs load only via supported development workflows; renaming a ZIP to XPI
does not sign it or make it a normal installable release.
