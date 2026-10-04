import { browser } from 'wxt/browser';
import { captureActiveTab } from '../src/adapters/capture';
import { CAPTURE_ACTIVE_TAB_MESSAGE, isCaptureActiveTabRequest, type CaptureActiveTabResponse } from '../src/capture-message';
import { prepareExport, type CaptureResult } from '@/src/core';

function unsupportedPage(message: string): CaptureActiveTabResponse {
  return { ok: false, error: { code: 'unsupported-page', message } };
}

function canAttemptCapture(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'https:' || protocol === 'http:' || protocol === 'file:';
  } catch {
    return false;
  }
}

function formatCaptureTime(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function reportCaptureResult(result: CaptureResult): void {
  // Keep raw capture data and page text out of local diagnostics.
  if (result.ok) {
    console.info('[Copy as Context] Capture succeeded', {
      rootRole: result.tree.root.role,
    });
    return;
  }

  console.error('[Copy as Context] Capture failed', {
    code: result.error.code,
  });
}

// noinspection JSUnusedGlobalSymbols
export default defineBackground(() => {
  console.info('[Copy as Context] Background ready.');

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      (message as { type?: unknown }).type !== CAPTURE_ACTIVE_TAB_MESSAGE
    ) {
      return;
    }

    if (sender.tab || sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/popup.html')) return;

    if (!isCaptureActiveTabRequest(message)) {
      sendResponse({ ok: false, error: { code: 'capture-failed', message: 'Invalid export preferences.' } });
      return;
    }
    console.info('[Copy as Context] Capture request received.');

    void (async () => {
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      if (tab?.id === undefined || !canAttemptCapture(tab.url)) {
        const result = unsupportedPage('This browser page cannot be captured.');
        sendResponse(result);
        return;
      }
      const result = await captureActiveTab({ id: tab.id, title: tab.title, url: tab.url }, formatCaptureTime(new Date()));
      reportCaptureResult(result);
      const response: CaptureActiveTabResponse = result.ok
        ? { ok: true, export: prepareExport(result.tree, message.compression, message.format, message.redactSensitiveData), ...(result.warnings?.length ? { warnings: result.warnings } : {}) }
        : result;
      sendResponse(response);
    })().catch(() => {
      const result: CaptureActiveTabResponse = {
        ok: false,
        error: { code: 'capture-failed', message: 'Unable to prepare this page’s context.' },
      };
      reportCaptureResult(result);
      try {
        sendResponse(result);
      } catch {
        // The popup may have closed while capture was finishing.
      }
    });

    return true;
  });
});
