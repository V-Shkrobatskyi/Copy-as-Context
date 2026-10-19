# Capture and export details

## Firefox capture

Run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`. The Desktop minimum is Firefox 140+. Reload the temporary add-on after rebuilding.

On Desktop, Copy, Preview, and Save capture the active top-level document on demand. Firefox Desktop requests `activeTab` and `scripting` instead of `debugger`, plus `clipboardWrite` and `storage`. Desktop requests the optional `downloads` permission when you choose Save. It requests persistent access to all HTTP/HTTPS sites only when you enable Include frames from other sites. Capture excludes password input values even with redaction disabled. Other values follow the selected privacy setting.

The DOM adapter preserves supported HTML/ARIA roles, labels, live form values and states, tables, lists, open Shadow DOM and slots. It approximates accessible names; it is not Gecko's native accessibility tree or a complete implementation of the Accessible Name specification. Eligible embedded documents are captured in their owner positions using Firefox frame IDs and isolated scripts. Same-origin access uses activeTab. Cross-origin capture is off by default; Include frames from other sites requests optional access to all HTTP/HTTPS sites in one prompt. Hidden and technical frames are skipped before reading child content; unavailable or changing frames have placeholders and a partial warning. Closed shadow roots, canvas pixels, CSS-generated content, unmounted virtualized UI and `aria-owns` reordering are not captured. Partial-frame/canvas warnings appear next to export metrics. Hidden/inert content is excluded, but explicitly referenced hidden labels can contribute to accessible names. Collapsed details retain their summary and expanded state.

Capture has explicit node, depth, text and time limits; overflow produces an error rather than a silent partial export. Navigation during capture discards the result. Some browser pages and protected websites cannot be injected into.

For synthetic manual checks, serve the repository locally with `python3 -m http.server 8765 --bind 127.0.0.1`, open `http://127.0.0.1:8765/tests/manual/firefox-dom-quality.html`, and test both formats and all compression profiles. This test server serves only the fixture; the extension itself has no backend.

The Desktop quality gate also compares critical semantics with Chrome AX on an independent synthetic holdout. See [Firefox Desktop verification](firefox-desktop-testing.md) for native-browser probes, performance/retention checks, the support evidence required for minimum/ESR versions, and toolbar/lifecycle smoke tests. Use these checklists for manual regression testing.

The default Firefox package supports Desktop 140+ and Android 142+ using one add-on ID. Use `npm run build:firefox` on both platforms. Desktop requests the optional downloads permission when Save is clicked; Android keeps Save unavailable. See [Android verification](firefox-android-testing.md), [release preparation](firefox-release.md), and [BUILDING.md](../BUILDING.md).

## Chrome capture

While a regular `http`, `https`, or local `file` page is active, choose a compression level and export format in the popup, then click **Copy page context**, **Preview**, or **Save to file**. The background service worker briefly attaches through Chrome's `debugger` permission, requests a single `Accessibility.getFullAXTree` snapshot, normalizes it, and detaches immediately.

Chrome may show a debugger-access warning. Capture cannot run on Chrome internal pages, the Chrome Web Store, and other protected pages. If another debugger client is attached to the tab, close it and retry. The result remains inside the extension except for the clipboard or local file destination selected by the user.

## Export and privacy

The popup supports **Semantic Text** (default) and **Markdown**. `Compact` is the default compression level; `Maximum` preserves Compact context and packs profitable repeated text and structures with selective role abbreviations. Its output includes a short legend; pages fall back to Compact when the estimated benefit is too small. Copy surrounds the entire page context with `<web_page>` and `</web_page>` on separate lines, or `**` on both sides for Maximum, without extra blank lines around the context and with a single newline after the closing boundary. Your instructions can go before or after the block. Save to file exports the original context without these boundaries.

Export headers include `Browser:` between `URL:` and `Captured:` in both formats and every compression profile. It records the browser name, Desktop or Android platform when known, and the available version. Firefox uses runtime metadata; Chromium uses local browser hints with a User-Agent fallback. A reduced version is shown as its major version; unavailable versions are omitted, and missing metadata appears as `Unavailable`. This adds no permissions or network requests.

Export attribution includes the installed extension version and a settings digit, for example `1.3.0/7 (created by V. Shkrobatskyi)` (illustrative version). The codes are Without `0`, Detailed `2`, Compact `4`, Maximum `6`; add `1` when **Redact sensitive data** is enabled. The digit records the selected profile even when Maximum falls back to Compact, and the privacy option rather than a guarantee that every sensitive value was found.

The popup shows the exact JavaScript character count (including boundaries for Copy), a rough token estimate (`ceil(characters / 4)`), and context reduction relative to Without output with the same format and privacy setting. Boundaries are excluded from the reduction ratio. The estimate is not model-specific tokenization. Maximum uses a separate local cost heuristic for packing; it does not bundle a tokenizer or guarantee savings for every model.

When **Redact sensitive data** is enabled, the extension applies a local heuristic redaction pass to the normalized context. It replaces password field values and common credential-shaped text (for example Bearer/Basic authorization values, JWTs, GitHub tokens, AWS access-key IDs, OpenAI-style keys, and selected `token`/`api_key` URL parameters) with `[REDACTED]`. This is a safeguard against obvious accidental disclosure, **not** a general DLP or PII detector: review exported context before sharing it, especially when it contains personal or business-sensitive data.

The Chrome build requests `debugger` to read the computed accessibility tree, `clipboardWrite` to copy a user-requested export, `downloads` to save a user-requested local file, and `storage` to keep preferences. Download filenames use the local `YYYY.MM.DD_HHmmss` timestamp and do not include the page title or URL.

Save downloads a local UTF-8 file. Chrome confirms completion while its popup remains open. Firefox uses a separate extension tab to keep the Blob URL alive when the Save As picker closes the popup; keep this tab open until saving finishes. It closes after success and shows a generic error if saving fails or is cancelled. The browser download manager also shows progress and completion. Android shows Save unavailable.

## Customize redaction filters

Choose **Customize** inside **Redact sensitive data** to open settings without capturing the current page. A single table lists built-in and custom filters with On, Name, Text / matching rule, Rule type, Case sensitive and action columns. Built-in names, patterns and types are fixed; Case sensitive is editable for every row. All eight built-in groups are enabled by default. Filters can overlap, so disabling one group may leave another matching the same text. Password input values are omitted independently of these settings.

Choose **+ Add filter**, enter a name and matching terms, then select exactly one **Rule type**. **Duplicate** creates an editable equivalent of any built-in, preserving the current case setting and every literal alias. Disable the original if your copy should replace it. To apply the same terms in two scopes, add two rows. Matching terms are literal names or prefixes, never regex or wildcards. Case sensitive is off by default for new custom rules. Every enabled rule applies to future exports after Save filters; Try filters uses the current form immediately.

Types and matching behavior:

| Rule type | Terms and behavior |
| --- | --- |
| Text | Literal alternatives throughout captured names, values, links, titles and source URLs. |
| Text — single literal | Treat the entire matching rule as one literal substring, including spaces and slashes. Preserves older rules. |
| Field labels | Match literal substrings in field labels; hide values and nested text, keeping labels visible. |
| Field labels — whole words | Require word boundaries in field labels; otherwise the same as Field labels. This reproduces the built-in field detector. |
| URL parameters | Exact names in `?name=value` or `&name=value`; hide only their values. Names match as written without URL decoding. Empty values stay empty. Enter names without `?`, `&`, `=`, `#`, tabs or line breaks. |
| Authorization | Scheme names such as `Bearer / Basic / CustomAuth`, whitespace and at least 8 credential characters; keep the scheme. |
| JWT | First-segment prefixes such as `eyJ`, followed by at least 5 characters and two dot-separated segments of at least 5 characters each. Segments use letters, digits, `_` and `-`. |
| GitHub tokens | Prefixes such as `ghp_ / github_pat_`, followed by at least 20 letters, digits or underscores. |
| AWS keys | Prefixes such as `AKIA / ASIA`, followed by exactly 16 uppercase letters or digits; lowercase also accepted when Case sensitive is off. |
| OpenAI keys | Prefixes such as `sk- / sk-proj-`, followed by at least 16 letters, digits, underscores or hyphens. |
| Assigned secrets | Names such as `api_key / token / private_key`, optional whitespace, `:` or `=`, optional whitespace and at least 8 value characters. Whitespace, `&`, quotes, commas and semicolons terminate values. Keep the label and separator. |

All types except Text — single literal separate alternatives with ` / ` (space, slash, space). Commas and ordinary URL/path slashes are literal. Empty alternatives are invalid. Field/assignment/query copies include all built-in aliases, such as `api key / api_key / api-key / apikey`. The prefix `Field labels:` in an old literal rule is not interpreted as a setting. Credential shapes and word boundaries match the built-in engines; character sets and length thresholds are fixed. These are shape checks, not cryptographic validation.

Rules match within individual captured strings; text split across semantic nodes may not match as one phrase. Matches are found against original text, and overlapping or adjacent spans are merged into `[REDACTED]`, so one replacement cannot prevent another rule from finding an original match. Replacement counts describe merged spans plus sensitive field replacements.

Expand **Try filters** and choose a rule from the Built-in/Custom list. **Test all** checks every enabled rule; **Test selected** checks only the chosen rule, even if its On checkbox is off, without enabling or saving it. Both use unsaved edits. Unfinished unrelated rows do not block an isolated test, and disabled rows are excluded from Test all. Leave Field label blank for text/URL/credential checks, or enter a label such as API key to test a field value. When a field label is provided, its redacted result is shown separately so replacements in the label are visible too.

**Matched rules** lists each matching rule, its origin/type and its replacement count when checked alone against the original sample and label. This also reveals rules whose matches would be hidden by a broad field rule or an overlapping pattern. Individual counts can overlap and need not sum to the combined replacement count. With no matches, the panel says so explicitly.

**Load example** and **Load near miss** replace the sample and optional label with synthetic inputs based on the chosen rule's current terms and type. They never change settings. A note reports when a custom configuration also matches the near miss, or does not match its generated example. Use Test selected to isolate the intended check; Test all may match other rules. Changing rules, selected rule or samples clears stale results and diagnostics. Test data stays in the current tab and is never saved or copied; closing the tab clears it. These tests model text or a single field, not nested page capture. Up to 400 custom rows are supported, with names up to 80 characters, matching rules up to 256 characters each, and 65,536 matching-rule characters in total. These bounds allow the previous maximum of 50 rules with eight simultaneous modes to migrate without losing checks.

**Save filters** persists the configuration locally and applies it to future Copy, Save and Preview actions when the popup's **Redact sensitive data** switch is on. It does not change that switch or reprocess existing previews. Closing unsaved settings loses changes. **Reload saved** reloads the last configuration; **Restore defaults** enables every built-in group and removes custom rules from the form, then requires Save filters to apply. A detected concurrent change requires Reload saved before saving over it.

**Export** immediately downloads `copy-as-context-filters.json` with every row from the current table, including unsaved changes. The file includes all eight built-in definitions and their on/off states, plus enabled and disabled custom text filters. There is no intermediate JSON editor or copy step.

**Import** opens a file picker. Select a filter export and its rows immediately replace the table; if you have unsaved edits, confirm replacing them. Choose **Save filters** to apply the imported rows. Cancelling file selection or importing an invalid file leaves the table unchanged. The limit is 256 KB. Built-in patterns and matching modes are fixed by the extension; an import restores enabled states and Case sensitive settings and must use compatible patterns. The portable format identifies itself as `copy-as-context-filters`, version 7. Each filter uses the same field order: source, id, name, description, type, matchingRule, caseSensitive, enabled. `source` is `builtin` or `custom`; `type` is exactly one code-defined detector ID. Custom description is empty. The top-level `availableRuleTypes` catalog lists every supported type with its ID, label, description and scope (`text` or `fields`). This catalog is informational: imported descriptions cannot implement or redefine a detector. Unknown or conflicting types are rejected without replacing settings.

Version 1 configuration exports and version 2–6 portable exports remain accepted. Legacy booleans are converted into one typed row per active detector, retaining names, matching text, case and enabled settings. Field labels plus Whole field words becomes the fieldWords type. Legacy single literals become literalText; slash-separated text rules become text. Generated IDs avoid collisions with existing rows. Migration happens in memory on read/import; Save filters persists it. Local storage retains its version 1 envelope but stores a single type on each custom row, with no mode booleans.

Exports include literal custom text, which may itself be private; review a file before sharing it. Filter settings remain local and do not automatically sync between browsers. Downloads use the browser's normal file handling without requesting the extension downloads permission.

A missing configuration uses the original defaults. If saved rules cannot be read or validated, exports with redaction enabled stop with a message rather than silently bypassing your rules. Open Customize and use Reload saved, or Restore defaults and Save filters to replace unreadable settings. Exports with redaction explicitly off do not load or apply these filters.

## Preview and edit before copying

Choose **Preview & edit**, first in the action row, to capture with the current popup settings and open the prepared text in a separate extension tab. Keep the popup open until the editor is ready. Opening the preview does not write to the clipboard, save a file, or request download permission. The existing direct Copy and Save actions remain available.

The editor displays plain Semantic Text or Markdown without clipboard boundaries. Edit it, then choose **Copy**; the existing `<web_page>` boundaries (or `**` for Maximum) are added automatically. **Save to file** on Desktop writes the current editor text as UTF-8 `.txt` or `.md`, without boundaries. Both actions preserve your spaces and line breaks. **Reset changes** restores the initially prepared text after confirmation. The editor stays open after copying or saving. Empty or whitespace-only text cannot be exported. The editor supports up to 16,000,000 JavaScript characters, allowing room for serialization and indentation beyond the capture text budget; oversized edits are rejected without truncation.

Character and approximate token counts below the editor show both the copy size including boundaries and the text/file size without them. The original compression reduction matches the popup's comparison with Without; it excludes boundaries and stays labeled as before manual edits. Automatic redaction counts also describe the original prepared export; manual edits are not scanned again. The editor does not recalculate compression savings or validate Maximum's packed dictionaries and references. Use Compact for easier editing. Capture warnings remain visible.

Drafts and the initial text used by Reset stay only in the editor document's memory. Closing or reloading it loses them; there is no history or draft recovery. A browser may warn before leaving a changed draft, but this is not guaranteed, especially on mobile. Reloaded or directly opened preview tabs show a recovery message. Each editor has an independent one-time session. No captured text is stored in extension storage or placed in the preview URL.

The format, compression and redaction settings are fixed for each preview. To use different settings or capture a page again, return to the source page and open the popup. Firefox Desktop requests download permission when Save is clicked and saves directly from the editor tab; keep it open until saving finishes. A denied permission or cancelled save preserves the draft for retry. Firefox Android supports the preview and Copy; Save remains unavailable.

## Review page content before sharing

Exported context can include text you did not see on the page, such as white text on a white background, text covered by another element, or accessible labels. Inclusion depends on what Chrome exposes in its accessibility tree and what the export preserves. Hidden accessibility text can serve a legitimate purpose; its presence alone does not mean a page is malicious.

The export is not a copy of all HTML text. Content excluded from the accessibility tree, not yet loaded, or present only as image pixels may be absent; the extension does not perform OCR. Some hidden text can still contribute to an element's accessible name. **Without** keeps captured semantic nodes, not everything that exists on the page. See [MDN's accessibility notes on hiding content](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/display#accessibility).

Visible or hidden page text can also contain instructions aimed at an AI assistant, often called **prompt injection**. These may ask it to ignore your task, reveal private information, or take unrelated actions. Treat exported page content as untrusted source material:

- Review the exported text before sharing it, and remove suspicious or irrelevant instructions.
- Tell the assistant to use the page as source material rather than instructions to follow.
- Review consequential actions, such as sending information or changing data, before allowing them.

Local processing, credential redaction, compression, and export boundaries do not detect or guarantee removal of malicious instructions. The review steps above can help reduce risk, but they do not guarantee protection.

Firefox uses one sequential capture budget for the main document and its selected
frames. Document boundaries remain in every compression profile and export format.
Include frames from other sites is a Firefox-only checkbox, off by default.
Enabling it requests all HTTP/HTTPS host access from that user gesture in a single
browser prompt. The checkbox reflects the browser permission, so no Save preferences
click is required. Denial leaves it off; external revocation updates its state.
Disabling it removes all site grants, including earlier individual grants, without
removing Desktop downloads permission. Re-enabling after revocation requests consent
again. Access is global across tabs and persists across browser restarts, but capture
runs only after Copy, Preview, or Desktop Save. Capture remains limited to same-origin children
when broad access is absent, even if an individual host grant remains. Protected-page
restrictions still apply. Desktop and Android share this path; Android remains Copy-only.
