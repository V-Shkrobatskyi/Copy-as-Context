# Single-block element picker

The Desktop picker adds one DOM subtree to the existing semantic export/Preview pipeline. Build and reload both extension targets before testing. No commits are needed for local verification.

## Automated checks

Run `npm run check`. Picker tests cover scoped DOM/AX content, external labels, hidden/detached roots, slot membership, session authentication, target-tab identity, duplicate requests, cancellation, late results, startup timeout, retry and cleanup. The memory suite checks detached selection references and channel listeners after cancel, disconnect, completion and failure while the source documents remain alive. The jsdom retention fixture uses coordinate selection without focusing the target; it does not measure native browser DOM retention.

## Native synthetic probes

```sh
node scripts/probe-chrome-iframes.mjs --selection --extension
node scripts/probe-firefox-iframes.mjs --selection
```

Use isolated temporary profiles, not a personal browser profile. These are opt-in checks outside deterministic CI.

Chrome covers ignored wrappers, `display:contents`, open Shadow DOM, assigned slots, a selected iframe, outside-frame omission, password omission, missing-target errors and repeated whole-page capture. The built-extension path uses an action gesture, closes the popup, selects a block on the page and receives the prepared context through the authenticated Preview channel. The current probe selects with native pointer events; the initial implementation was also checked with F2.

Firefox covers the actual isolated picker bundle, F2 selection, scoped DOM/ARIA capture, an embedded document and Markdown Preview. Its temporary harness grants root-host access and hosts the coordinator in a probe page. This verifies the native data path but does not prove production action-menu activeTab grants, popup closure, optional permission prompts or Android interaction. The existing frame probe also checks root-only and all-site host-grant modes.

Native runs on 2026-10-19: Chrome 155.0.8059.85 and Firefox 158.0 passed. Repeat the commands after changing the picker or capture adapters.

## Desktop manual checklist

1. Open a normal HTTP/HTTPS page. Pick a format, compression level and privacy setting, then choose **Select element**. The popup closes and the picker remains on the page.
2. Move over an article, card, table, list and form. The outline follows the hovered element. Click a block to fix it; moving the mouse no longer changes the selection.
3. Confirm that selecting a link/button does not navigate, submit a form, toggle a checkbox or run the normal page action. Scroll and resize while the picker is active.
4. Use **Select parent**, **Back**, and **Pick again**. Body/html and the picker itself must never become selected. Focus a page control and press F2; keyboard focus must reach the panel actions.
5. Choose **Preview & edit**. Check the **Selected element context** heading, source metadata, selected subtree, states, external labels, warnings, counters, redaction, and absence of sibling blocks and picker UI.
6. Exercise Semantic Text/Markdown and every compression profile. Copy and Desktop Save must retain their existing boundaries/file behavior. No copying or downloading happens just by opening Preview.
7. Before confirmation, switch tabs and return. Capture must still use the original tab. Reload, navigate to a different URL, replace the selected DOM node, and close the source tab: no stale result should open.
8. Cancel using Esc and the panel button; repeat selection several times. Confirm normal page events resume and no marker, outline or duplicate panel remains. Leave selection idle for more than 30 seconds, then confirm; after five minutes it must end.
9. Select a main-document block containing same-origin/cross-origin frames. Existing access settings apply; unavailable documents are reported. Frames outside the block must not contribute text or warnings. Pointing inside an iframe must not pretend to select its internal DOM.
10. Try open shadow components, slots, nested scroll containers, zoom, sticky/fixed elements and pages with strong CSS rules. Verify the panel remains usable and does not appear in exports.
11. Check browser-internal, extension, Demo and file pages: picker startup reports its HTTP/HTTPS restriction without changing existing whole-page behavior. Check permission-denied pages and a busy Chrome debugger.
12. On Firefox Android, the picker action stays hidden; whole-page Copy/Preview remain available and Save remains unavailable.

Remaining human/device checks: production Firefox action-menu startup and popup closure, permission-denied website UX, real-world hostile event handlers, screen-reader/keyboard usability, zoom/sticky layout, and Android regression on a device. Native probes use synthetic fixtures and do not establish universal site compatibility.

## Iframe pointer regression — 2026-10-20

The pointer surface now spans embedded documents, so movement and clicks over an iframe select its owner element instead of leaving a stale highlight on the main document. The panel is compact, aligned to the lower right, and shows adjustment/Preview actions only after selection. Its instructions describe clicking and Esc without mentioning F2; the optional keyboard shortcut remains available.

Native Chrome verification on the reported [W3Schools Tryit page](https://www.w3schools.com/html/tryit.asp?filename=tryhtml_youtubeiframe) selected the full `iframeResult` on the right with an outline matching its 572.5-pixel width, then successfully selected the editor on the left after Pick again. The pointer test used a temporary profile and a 1440 × 1000 viewport. Whole-frame selection follows the existing capture permissions; individual elements within the embedded document are still outside picker scope.

## Panel appearance and minimal picking state

While pointing, only a compact bar with the extension icon, a click/Esc hint and a labelled close button is visible. Clicking a block expands the panel with the Copy as Context header, selection information and actions. Pick again returns to the compact bar. Esc and the close button cancel in either state.

The isolated panel reuses the popup's shared light/dark palette and packaged SVG icon, including button, focus, border and surface colors. It does not fetch icons or styles from the visited site or add web-accessible resources. Check both system themes and narrow viewports; hover must not expand the panel or reveal the action group. Native visual checks on the W3Schools fixture confirm a compact height below 80 pixels, a rendered icon and the popup's dark background color.

## Direct Copy and Save from the selection panel

- Confirm the action labels are **Preview & edit**, **Copy context**, **Save to file**. All three use the selected subtree and fixed export settings.
- Copy must not open an editor. Paste the result and check content, redaction and clipboard boundaries. Exercise HTTPS and the HTTP clipboard fallback, including a blocked clipboard and retry.
- Save must not open an editor. Firefox requests optional download permission from the content-script click through an authenticated runtime message. Denial retains the selection and does not capture/export anything. The temporary save document receives prepared content through the authenticated one-time channel and owns the blob until completion.
- Verify file format, UTF-8, timestamp filename, absence of clipboard boundaries, and completion after the source page is closed. Cancelling the chooser or a failed download must show an error in the save tab. After a successful save that tab closes.
- After direct actions, the selected block and adjustment buttons remain usable. Cancel/navigation during capture must discard a late result; Copy success must wait for the matching operation acknowledgement.

Native Chrome probe checks the actual clipboard and saved UTF-8 file. The Firefox selection fixture pregrants clipboard-read/download permissions and disables Save As only in its temporary package to verify data and blob lifetime without automating the native chooser. Production chooser/permission prompts still need the normal manual check.

## Export completion

In Chrome and Firefox Desktop, select a block and choose **Copy context**. Confirm
the clipboard contains only that block with context boundaries, the picker panel
and outline disappear, and ordinary page clicks work again. Repeat with **Save to
file**: the picker closes after the temporary save tab accepts the prepared
export, and that tab remains responsible for the download. Cancel the file dialog
and verify no invisible picker continues to intercept the page. If clipboard
copying, permission approval, capture or transfer to the save tab fails, the
selection must remain available with an error and a working retry action.
