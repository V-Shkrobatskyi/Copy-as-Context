// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import type { CaptureControls, CaptureOutcome } from './types';

export interface CaptureTab {
  id: number;
  title?: string;
  url?: string;
}

/** WXT replaces the target at build time, excluding Chrome capture from Firefox. */
export async function captureActiveTab(tab: CaptureTab, capturedAt: string, selection?: string, signal?: AbortSignal, controls?: CaptureControls): Promise<CaptureOutcome> {
  if (import.meta.env.BROWSER === 'firefox') {
    const { captureFirefoxPage } = await import('./firefox/capture');
    return controls ? captureFirefoxPage(tab, capturedAt, selection, signal, controls) : selection ? captureFirefoxPage(tab, capturedAt, selection, signal) : captureFirefoxPage(tab, capturedAt);
  }

  const { captureChromeAccessibilityTree } = await import('./chrome/capture');
  const { addChromeDocumentMetadata } = await import('./chrome/document-metadata');
  const capture = await captureChromeAccessibilityTree(tab.id, selection, signal, controls);
  return capture.ok
    ? { ...capture, tree: addChromeDocumentMetadata(capture.tree, tab, capturedAt) }
    : capture;
}
