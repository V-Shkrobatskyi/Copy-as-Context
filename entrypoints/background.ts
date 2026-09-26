import { captureChromeAccessibilityTree } from '../src/adapters/chrome/capture';
import { CAPTURE_ACTIVE_TAB_MESSAGE, type CaptureActiveTabResponse } from '../src/capture-message';
import type { SemanticNode } from '@/src/core';

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

function countNodes(node: SemanticNode): number {
  return 1 + node.children.reduce((count, child) => count + countNodes(child), 0);
}

function reportCaptureResult(result: CaptureActiveTabResponse): void {
  // Keep raw CDP data and page text out of diagnostics, but make the local
  // service-worker console sufficient to confirm each capture lifecycle.
  if (result.ok) {
    console.info('[Copy as Context] Capture succeeded', {
      nodeCount: countNodes(result.tree.root),
      rootRole: result.tree.root.role,
    });
    return;
  }

  console.warn('[Copy as Context] Capture was not completed', {
    code: result.error.code,
    details: result.error.details,
  });
}

// noinspection JSUnusedGlobalSymbols
export default defineBackground(() => {
  console.info('[Copy as Context] Background service worker ready.');

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      (message as { type?: unknown }).type !== CAPTURE_ACTIVE_TAB_MESSAGE
    ) {
      return;
    }

    console.info('[Copy as Context] Capture request received.');

    void (async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !canAttemptCapture(tab.url)) {
        const result = unsupportedPage('This Chrome page cannot be captured.');
        reportCaptureResult(result);
        sendResponse(result);
        return;
      }
      const result = await captureChromeAccessibilityTree(tab.id);
      reportCaptureResult(result);
      sendResponse(result);
    })().catch((error) => {
      const details = error instanceof Error ? error.message : String(error);
      const result: CaptureActiveTabResponse = {
        ok: false,
        error: { code: 'capture-failed', message: 'Unable to capture this page’s accessibility tree.', details },
      };
      reportCaptureResult(result);
      sendResponse(result);
    });

    return true;
  });
});
