# Desktop keyboard shortcuts

Run in Chrome (including minimum supported Chrome 125) and Firefox Desktop, on
macOS and Windows/Linux where available. Unit tests and builds do not establish
native keyboard dispatch, clipboard policy or operating-system shortcut behavior.

1. Reload the extension and open the browser's extension shortcut settings.
   Confirm four assignments: Alt+Shift+P/C/S/E (Option+Shift on macOS). Remove or
   reassign one and verify dispatch follows the browser setting. Action buttons
   must have no shortcut labels. The popup footer opens the browser manager;
   older Firefox versions may open about:addons for manual navigation.
2. On an ordinary HTTPS page, use P to open the populated editor, C to copy the
   whole-page context, S to save a UTF-8 file, and E to start element selection.
   No popup click should be needed. Inspect clipboard boundaries and ensure file
   content has none. The temporary save tab closes only after download completion.
3. Save Markdown/Maximum/privacy preferences in the popup. Close it and run each
   shortcut; verify the saved settings and custom redaction filters apply. Change
   settings without saving, close the popup, and verify shortcuts still use the
   saved settings. Copy/Preview/Save must still capture the whole page when a
   picker selection exists; picker-panel actions continue to export the block.
4. In Firefox, revoke downloads permission. Invoke S and allow the request, then
   repeat with denial. Denial must not capture or export; another shortcut must
   remain usable. Repeat with an already-granted permission and cancel Save As.
5. Test C on HTTP as well as HTTPS, with a focused control and selected text.
   Verify clipboard content, restored focus/selection and icon success feedback.
   Test a protected browser page and a clipboard/injection failure: no false
   success, an error badge with a readable English tooltip, and later recovery.
6. Press shortcuts repeatedly during a slow capture. Only one shortcut operation
   should run. Change tabs, navigate, or close the source page while capture is
   pending; do not copy content into a different document. Check policy-blocked
   actions, forced format/redaction, and personally blocked capture sources.
7. Repeat P/C/S/E with English and Ukrainian keyboard layouts. On Windows, enable
   Alt+Shift language switching and check actual behavior. Record any OS or
   extension conflicts and verify reassignment in the browser resolves them.
8. Confirm the existing popup, picker-panel and editor actions still work in both
   browsers. Firefox Android retains its existing whole-page popup actions.
