// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { captureMetadata } from '@/src/history/model';
import { recordCaptureHistory } from '@/src/history/client';
import { checkPolicy, policyMessage, captureDataControls, captureOptions, assertSource } from '@/src/policy/runtime';
import { PolicyError, mergeManagedFilters } from '@/src/policy/model';
import { browser, type Browser } from 'wxt/browser';
import { captureFilterDemo } from '@/src/adapters/filter-demo';
import { isOwnFilterDemo } from '@/src/filter-demo-protocol';
import type { RedactionSettings } from '@/src/core/privacy/settings';
import type { CaptureOutcome } from '@/src/adapters/types';
import { loadRedactionSettings } from '@/src/redaction-settings';
import { resolveBrowserInfo, type BrowserInfoDependencies } from './platform/browser-info';
import { captureActiveTab } from './adapters/capture';
import { type CaptureActiveTabRequest, type CaptureActiveTabResponse } from './capture-message';
import { prepareExport } from '@/src/core';
import type { installDiagnostics } from '@/src/diagnostics/background';

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

/** Shared capture path for popup requests and browser keyboard commands. */
export async function capturePageContext(
  message: CaptureActiveTabRequest,
  journal: ReturnType<typeof installDiagnostics>,
  sourceTab?: Browser.tabs.Tab,
): Promise<CaptureActiveTabResponse> {
  const runtime = browser.runtime as typeof browser.runtime & { getBrowserInfo?: BrowserInfoDependencies['getBrowserInfo'] };
  const operation = crypto.randomUUID();
  const started = Date.now();
  void journal.append({ code: 'capture-start', result: 'started', operation });
  try {
    const snapshot = await checkPolicy('capture');
    const context = { ...message, policyRevision: snapshot.revision };
    await checkPolicy('capture', context);
    const tab = sourceTab ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    const demo = isOwnFilterDemo(tab?.url, browser.runtime.getURL('/demo.html'));
    if (tab?.id === undefined || (!demo && !canAttemptCapture(tab.url))) {
      const result = unsupportedPage('This browser page cannot be captured.');
      void journal.append({ code: 'capture-complete', result: 'error', reason: 'unsupported-page', operation });
      return result;
    }
    let filters: RedactionSettings | undefined;
    if (message.redactSensitiveData && !demo) {
      try { filters = await loadRedactionSettings(); }
      catch {
        void journal.append({ code: 'filters-load', result: 'error', reason: 'redaction-settings', operation });
        return { ok: false, error: { code: 'redaction-settings', message: 'Unable to load redaction filters. Open Customize to reload or restore them.' } };
      }
    }
    if (!demo) assertSource(tab.url, snapshot);
    const data = captureDataControls(snapshot);
    const target = { id: tab.id, title: tab.title, url: tab.url };
    const capturedAt = formatCaptureTime(new Date());
    let result: CaptureOutcome;
    if (demo) {
      const captured = await captureFilterDemo(target, capturedAt);
      result = captured;
      if (captured.ok) filters = mergeManagedFilters(snapshot.policy, captured.filters);
    } else result = await captureActiveTab(target, capturedAt, undefined, undefined, captureOptions(snapshot));

    if (result.ok) {
      result.tree.browser = await resolveBrowserInfo({
        getBrowserInfo: typeof runtime.getBrowserInfo === 'function' ? () => runtime.getBrowserInfo!() : undefined,
        getPlatformInfo: () => browser.runtime.getPlatformInfo(),
        userAgent: globalThis.navigator?.userAgent,
        userAgentData: (globalThis.navigator as Navigator & { userAgentData?: BrowserInfoDependencies['userAgentData'] })?.userAgentData,
      });
    }
    await checkPolicy('capture', context);
    if (!demo && result.ok) { const current = await browser.tabs.get(tab.id); assertSource(current.url, snapshot); if (current.url !== tab.url) throw new PolicyError('The page changed. Prepare the context again.'); }
    const response: CaptureActiveTabResponse = result.ok
      ? { ok: true, operationId: operation, ...(snapshot.revision ? { policyRevision: snapshot.revision } : {}), export: prepareExport(result.tree, message.compression, message.format, message.redactSensitiveData, filters, data), ...(result.warnings?.length ? { warnings: result.warnings } : {}), ...(result.frameAccess?.length ? { frameAccess: result.frameAccess } : {}) }
      : result;
    void journal.append({ code: 'capture-complete', result: result.ok ? 'success' : 'error', reason: result.ok ? 'none' : result.error.code, operation, durationMs: Math.min(3600000, Date.now() - started) });
    if (result.ok && !tab.incognito && !demo) recordCaptureHistory(captureMetadata(result.tree, data, message.redactSensitiveData, filters, message.compression));
    return response;
  } catch (error) {
    void journal.append({ code: 'capture-complete', result: 'error', reason: error instanceof PolicyError ? 'policy-blocked' : 'failed', operation });
    return { ok: false, error: error instanceof PolicyError
      ? { code: 'policy-blocked', message: policyMessage(error) }
      : { code: 'capture-failed', message: 'Unable to prepare this page’s context.' } };
  }
}
