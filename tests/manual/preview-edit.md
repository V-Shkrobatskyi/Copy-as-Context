# Preview and edit verification

Use isolated synthetic pages without real credentials. Build and reload both browser packages before testing. All extension-facing text must be in English.

## Automated Desktop probe

```sh
npm run build
npm run build:firefox
node scripts/probe-preview.mjs
node scripts/probe-preview.mjs --firefox
```

The scripts use temporary browser profiles and remove them afterward. The default macOS browser paths can be overridden with `CHROME_BINARY` and `FIREFOX_BINARY`. Chrome needs support for the experimental Extensions automation domain and explicitly enables unsafe extension debugging only in the temporary profile.

Chrome exercises the production toolbar → capture → redaction → popup → private port → editor path. Firefox tests the built editor and production private-port transfer with a synthetic export from a temporary harness at the popup URL; it does not exercise Firefox's native toolbar/activeTab gesture. Both first exercise Customize, built-in toggles, literal rules, filter file import/export and local persistence, then check editing, exact clipboard boundaries with an intercepted clipboard destination, and loss of the draft on reload. Chrome also checks narrow-screen overflow and writes Desktop/mobile-layout screenshots to the system temporary directory. These probes do not verify the system clipboard, an Android device, mobile keyboard behavior, or screen-reader interaction.

## Manual browser matrix

Run these checks in Chrome Desktop, Firefox Desktop and Firefox Android. Record browser versions and results; a simulated narrow viewport does not establish Android support.

1. Open a regular page and choose **Preview & edit**. Keep the popup open until the editor is ready. Confirm that the source page, rather than the editor tab, was captured and that opening the editor does not change the clipboard or create a download.
2. Repeat with Semantic Text and Markdown, all four compression levels, and redaction on/off. Verify password input values stay omitted. Maximum shows its packed-structure warning; other profiles do not.
3. Edit text with spaces, blank lines and Unicode. Choose **Copy** and paste into an external plain-text editor. Verify exact edits and the appropriate single outer boundary pair. The copy count includes boundaries and matches copy feedback; the file/editor count excludes them. Original compression reduction matches the popup and remains labeled as before manual edits.
   On Desktop, choose **Save to file** for both formats and verify the UTF-8 file contains exactly the edited text without boundaries. Cancel once and retry; the draft must survive. Firefox requests download permission only on Save; deny once and retry. Saving keeps the editor open. On Android Save remains unavailable.
4. Clear the editor or enter only whitespace. Copy must be unavailable. Restore some text and verify Copy becomes available. If clipboard access is denied, edits remain and Copy can be retried.
5. Choose **Reset changes**: cancel once, then confirm. Only this preview's initial prepared text returns. Close with edits: cancel once, then confirm. Test browser close/reload separately; warning support varies by browser.
6. Open two previews with distinct content. Edit each independently. Reload one and verify it shows the missing-preview message and no recovered text. The other must retain its draft.
7. Close the popup while capturing and while delivering to the editor. Verify no partial text is copied and no tab remains stuck indefinitely on a loading status. Retry from the source page.
8. Exercise capture errors, partial iframe/canvas warnings and a large context. Warnings remain in the editor, text is not silently truncated, and typing/count updates remain usable.
9. Verify Tab order, visible focus, field label and status announcements with a screen reader. On Android test touch selection, scrolling, copying and reaching buttons with the keyboard open, in portrait and landscape.
10. Recheck direct Copy/Save. Firefox Desktop asks for downloads permission only after Save; Preview does not ask. Android Save remains unavailable before and after Preview.

## Implementation verification record — 2026-10-18

- Chrome Desktop native probe: passed using the production toolbar capture path.
- Firefox Desktop native probe: passed using the synthetic handoff harness described above.
- Clipboard content assertions used an intercepted destination; real clipboard paste remains a manual check.
- Narrow-screen Chrome layout: no horizontal document overflow; screenshots visually reviewed.
- Physical Firefox Android, mobile keyboard, real toolbar gesture in Firefox, and assistive-technology checks: not performed in this workspace.

## Editor metrics and saving verification — 2026-10-19

- Full checks passed: 391 unit tests, 10 memory tests, both browser builds, build boundary checks and Firefox lint.
- Chrome Desktop probe passed: copy metrics match wrapped text, file/editor metrics match unwrapped text, original compression is visible, and a real downloaded `.txt` contains the exact edited Unicode text without boundaries.
- Firefox Desktop synthetic handoff probe passed with the new metrics and compression metadata. Download permission denial/retry and Android Save availability are covered by mocked editor tests; Firefox's native permission prompt and editor file picker remain manual checks.
- Desktop and narrow-screen editor screenshots reviewed; no horizontal document overflow.
