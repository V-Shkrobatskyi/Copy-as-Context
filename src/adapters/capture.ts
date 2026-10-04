import type { CaptureOutcome } from './types';

export interface CaptureTab {
  id: number;
  title?: string;
  url?: string;
}

/** WXT replaces the target at build time, excluding Chrome capture from Firefox. */
export async function captureActiveTab(tab: CaptureTab, capturedAt: string): Promise<CaptureOutcome> {
  if (import.meta.env.BROWSER === 'firefox') {
    const { captureFirefoxPage } = await import('./firefox/capture');
    return captureFirefoxPage(tab, capturedAt);
  }

  const { captureChromeAccessibilityTree } = await import('./chrome/capture');
  const { addChromeDocumentMetadata } = await import('./chrome/document-metadata');
  const capture = await captureChromeAccessibilityTree(tab.id);
  return capture.ok
    ? { ok: true, tree: addChromeDocumentMetadata(capture.tree, tab, capturedAt) }
    : capture;
}
