# Firefox release preparation

The maintainer confirmed manual smoke checks of the shared 1.0.1 package on
2026-10-05, including Firefox Desktop Save and Android Copy, preferences and button
feedback. The supplied capture identifies Firefox Android 157.0; Desktop browser
and Android device/OS versions and a full per-scenario report were not supplied.
The earlier separate 1.0.0 builds were checked on 2026-10-04. Local artifacts remain
unsigned; browser verification does not imply store submission, signing or approval.

## Build and archives

Run `npm run check`, then `npm run zip:firefox` and
`npm run check:firefox-package`. The package check verifies exact uncompressed ZIP
content against the corresponding build directory, required license/notice files,
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

Version 1.0.1 uses one Firefox ZIP and matching source ZIP for Desktop and Android.
The package retains the existing add-on ID, declares Desktop 140+ and Android
142+, and lists downloads only as an optional permission. Upload it once to AMO
and select both platform groups. Do not submit legacy separate 1.0.0 variants.

Shared-package smoke checks are confirmed. Before submission, verify remaining
checklist scenarios, including permission denial, revocation and retry on Desktop
and the absence of download prompts on Android. Minimum-version coverage is not
claimed by the reported smoke checks.

## Metadata and owner decisions

| Field | Prepared value | Remaining release requirement |
| --- | --- | --- |
| Name | Copy as Context | Confirm final listing |
| Version | 1.0.1, prepared locally | Verify final manifest/package before signing |
| Add-on ID | {e97aa566-cac0-4e2c-81f7-0ab664bf86ce} | AMO uniqueness/account ownership checked on first submission |
| Desktop minimum | Firefox 140.0 | Smoke check confirmed; minimum/ESR not certified |
| Android | Shared package, Firefox Android 142+, Copy-only | Smoke check confirmed on Android 157.0; minimum not certified |
| Permissions | activeTab, scripting, clipboardWrite, storage; downloads optional | Explain on listing; no debugger or broad host access |
| Data collection | required: [none] | Reconfirm final package matches local-only implementation |
| Channel | Listed AMO | Submit one package with Desktop and Android compatibility |
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

Firefox Save opens a separate extension tab that owns the local Blob URL until
completion or interruption. This keeps the file available when the Save As dialog
closes the popup. Keep that tab open during saving; it closes after success and
shows a generic error if saving fails or is cancelled. Chrome retains the popup's
Blob URL until completion or interruption. No broad host permissions or network
request are needed. The filename contains a timestamp and extension, not page
title/URL. Native probes verify both UTF-8 formats with a surviving save document
and reproduce the expired Blob failure. Use the manual checklist for real
Desktop permission prompts and Save As picker checks.
Browsers without downloads API show Save unavailable.

Desktop Save requests downloads permission directly from the click handler,
before awaiting capture. Denial leaves Copy available and starts no capture or
download. Repeated requests use Firefox's remembered grant; a revoked grant is
requested again on the next Save. Android detection disables Save before any
permission request or download call. Unknown platforms keep Copy available and
Save unavailable.

The shared package passes `npm run lint:firefox` with zero errors and warnings
in the current local environment. Static lint does not prove Android device
behavior; retain the manual checks before submission.

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

On Firefox Desktop, Copy and Save are available. On Firefox Android 142+, the
shared package supports Copy on Android; Save is unavailable. Do not promise universal page
coverage or exact model token counts. Store category, screenshots, release notes,
support links and final version are owner decisions. Use synthetic content for
screenshots and verification rather than private real pages.

## Signing and publication gate

Shared 1.0.1 smoke checks were confirmed by the maintainer on 2026-10-05. Complete
any remaining scenarios and keep
[Desktop](firefox-desktop-testing.md) and [Android](firefox-android-testing.md)
checklists for future regressions and record actual versions when available.
Confirm the release version and distribution channel, regenerate matching archives,
review hashes/source reproduction and current Mozilla policies, then obtain
explicit authorization to sign or submit. Credentials stay outside source and
command logs. This document does not execute a signing or submission command.
Unsigned ZIPs load only via supported development workflows; renaming a ZIP to XPI
does not sign it or make it a normal installable release.
