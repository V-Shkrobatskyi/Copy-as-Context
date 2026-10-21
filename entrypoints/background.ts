// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { checkPolicy, policyMessage } from '@/src/policy/runtime';
import { PolicyError, mergeManagedFilters } from '@/src/policy/model';
import { browser } from 'wxt/browser';
import { captureFilterDemo } from '@/src/adapters/filter-demo';
import { isOwnFilterDemo } from '@/src/filter-demo-protocol';
import type { RedactionSettings } from '@/src/core/privacy/settings';
import type { CaptureOutcome } from '@/src/adapters/types';
import { loadRedactionSettings } from '@/src/redaction-settings';
import { resolveBrowserInfo, type BrowserInfoDependencies } from '../src/platform/browser-info';
import { captureActiveTab } from '../src/adapters/capture';
import { CAPTURE_ACTIVE_TAB_MESSAGE, isCaptureActiveTabRequest, type CaptureActiveTabResponse } from '../src/capture-message';
import { prepareExport, type CaptureResult } from '@/src/core';
import { PICKER_START, isPickerStart } from '@/src/element-picker-protocol';
import { createPickerCoordinator } from '@/src/element-picker-session';

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
  const runtime = browser.runtime as typeof browser.runtime & { getBrowserInfo?: BrowserInfoDependencies['getBrowserInfo'] };
  let picker: ReturnType<typeof createPickerCoordinator> | undefined;

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && typeof message === 'object' && (message as { type?: unknown }).type === PICKER_START) {
      if (sender.tab || sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/popup.html')) return;
      if (!isPickerStart(message)) { sendResponse({ ok: false, error: { message: 'Invalid selection preferences.' } }); return; }
      picker ??= createPickerCoordinator();
      void picker.start(message).then(sendResponse);
      return true;
    }
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
      const snapshot = await checkPolicy('capture');
      const context = { ...message, policyRevision: snapshot.revision };
      await checkPolicy('capture', context);
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      const demo = isOwnFilterDemo(tab?.url, browser.runtime.getURL('/demo.html'));
      if (tab?.id === undefined || (!demo && !canAttemptCapture(tab.url))) {
        const result = unsupportedPage('This browser page cannot be captured.');
        sendResponse(result);
        return;
      }
      let filters: RedactionSettings | undefined;
      if (message.redactSensitiveData && !demo) {
        try { filters = await loadRedactionSettings(); }
        catch {
          sendResponse({ ok: false, error: { code: 'redaction-settings', message: 'Unable to load redaction filters. Open Customize to reload or restore them.' } });
          return;
        }
      }
      const target = { id: tab.id, title: tab.title, url: tab.url };
      const capturedAt = formatCaptureTime(new Date());
      let result: CaptureOutcome;
      if (demo) {
        const captured = await captureFilterDemo(target, capturedAt);
        result = captured;
        if (captured.ok) filters = mergeManagedFilters(snapshot.policy, captured.filters);
      } else result = await captureActiveTab(target, capturedAt);
      reportCaptureResult(result);
      if (result.ok) {
        result.tree.browser = await resolveBrowserInfo({
          getBrowserInfo: typeof runtime.getBrowserInfo === 'function' ? () => runtime.getBrowserInfo!() : undefined,
          getPlatformInfo: () => browser.runtime.getPlatformInfo(),
          userAgent: globalThis.navigator?.userAgent,
          userAgentData: (globalThis.navigator as Navigator & { userAgentData?: BrowserInfoDependencies['userAgentData'] })?.userAgentData,
        });
      }
      await checkPolicy('capture', context);
      const response: CaptureActiveTabResponse = result.ok
        ? { ok: true, ...(snapshot.revision ? { policyRevision: snapshot.revision } : {}), export: prepareExport(result.tree, message.compression, message.format, message.redactSensitiveData, filters), ...(result.warnings?.length ? { warnings: result.warnings } : {}), ...(result.frameAccess?.length ? { frameAccess: result.frameAccess } : {}) }
        : result;
      sendResponse(response);
    })().catch((error: unknown) => {
      const result: CaptureActiveTabResponse = {
        ok: false,
        error: error instanceof PolicyError ? { code: 'policy-blocked', message: policyMessage(error) } : { code: 'capture-failed', message: 'Unable to prepare this page’s context.' },
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
