// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only

import { browser } from 'wxt/browser';
import { DEMO_CAPTURE, DEMO_CAPTURE_TIMEOUT, isOwnFilterDemo } from '../filter-demo-protocol';
import { isDomCaptureOutcome } from './dom/validate';
import { validateRedactionSettings, type RedactionSettings } from '../core/privacy/settings';
import type { CaptureOutcome } from './types';
import type { CaptureTab } from './capture';

type DemoOutcome = Extract<CaptureOutcome, { ok: false }> | (Extract<CaptureOutcome, { ok: true }> & { filters: RedactionSettings });

export async function captureFilterDemo(tab: CaptureTab, capturedAt: string): Promise<DemoOutcome> {
  const demoUrl = browser.runtime.getURL('/demo.html');
  const failure = (): DemoOutcome => ({ ok: false, error: { code: 'capture-failed', message: 'Unable to capture the filter demo. Reload the demo and try again.' } });
  if (!isOwnFilterDemo(tab.url, demoUrl)) return failure();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response: unknown = await Promise.race([
      browser.runtime.sendMessage({ type: DEMO_CAPTURE, tabId: tab.id, url: tab.url }),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), DEMO_CAPTURE_TIMEOUT); }),
    ]);
    if (!response || typeof response !== 'object' || !('capture' in response) || !('settings' in response)) return failure();
    const filters = validateRedactionSettings(response.settings);
    if (!isDomCaptureOutcome(response.capture, false, tab.url)) return failure();
    if (!response.capture.ok) return failure();
    return { ...response.capture, tree: { ...response.capture.tree, sourceUrl: demoUrl, capturedAt }, filters };
  } catch { return failure(); }
  finally { clearTimeout(timer); }
}
