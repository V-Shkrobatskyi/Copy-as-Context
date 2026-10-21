// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { browser } from 'wxt/browser';
import { installDiagnostics } from '@/src/diagnostics/background';
import { capturePageContext } from '@/src/page-capture';
import { CAPTURE_ACTIVE_TAB_MESSAGE, isCaptureActiveTabRequest } from '@/src/capture-message';
import { PICKER_START, isPickerStart } from '@/src/element-picker-protocol';
import { createPickerCoordinator } from '@/src/element-picker-session';
import { installKeyboardShortcuts } from '@/src/keyboard-shortcuts';

// noinspection JSUnusedGlobalSymbols
export default defineBackground(() => {
  const journal = installDiagnostics();
  void journal.append({ code: 'background-ready', result: 'success' });
  let picker: ReturnType<typeof createPickerCoordinator> | undefined;
  const startPicker: ReturnType<typeof createPickerCoordinator>['start'] = (preferences, target) => {
    picker ??= createPickerCoordinator();
    return picker.start(preferences, target);
  };
  installKeyboardShortcuts(journal, startPicker);

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.tab || sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/popup.html')) return;
    if (message && typeof message === 'object' && (message as { type?: unknown }).type === PICKER_START) {
      if (!isPickerStart(message)) { sendResponse({ ok: false, error: { message: 'Invalid selection preferences.' } }); return; }
      void startPicker(message).then(sendResponse);
      return true;
    }
    if (typeof message !== 'object' || message === null || (message as { type?: unknown }).type !== CAPTURE_ACTIVE_TAB_MESSAGE) return;
    if (!isCaptureActiveTabRequest(message)) {
      sendResponse({ ok: false, error: { code: 'capture-failed', message: 'Invalid export preferences.' } });
      return;
    }
    void capturePageContext(message, journal).then(result => {
      try { sendResponse(result); }
      catch { /* The popup may have closed while capture was finishing. */ }
    });
    return true;
  });
});
