// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureFilterDemo } from '@/src/adapters/filter-demo';
import { isOwnFilterDemo, DEMO_CAPTURE_TIMEOUT } from '@/src/filter-demo-protocol';
import { isDomCaptureOutcome } from '@/src/adapters/dom/validate';
import { defaultRedactionSettings } from '@/src/core/privacy/settings';
const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { runtime: { getURL: (path: string) => `chrome-extension://own${path}`, sendMessage } } }));
const url = 'chrome-extension://own/demo.html#session-1';
const capture = () => ({ ok: true, tree: { schemaVersion: 1, title: 'Demo', sourceUrl: url, root: { role: 'page', children: [{ role: 'textbox', name: 'Full name', value: 'Alexander', children: [] }] } } });
beforeEach(() => { sendMessage.mockReset(); });
afterEach(() => vi.useRealTimers());

describe('own demo capture boundary', () => {
  it('validates the exact page and the draft configuration without expanding the normal DOM boundary', async () => {
    sendMessage.mockResolvedValue({ capture: capture(), settings: defaultRedactionSettings() });
    expect(isDomCaptureOutcome(capture())).toBe(false);
    expect(isDomCaptureOutcome(capture(), false, url)).toBe(true);
    const result = await captureFilterDemo({ id: 42, url }, 'synthetic-time');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'filter-demo-capture', tabId: 42, url });
    expect(result).toMatchObject({ ok: true, filters: defaultRedactionSettings(), tree: { sourceUrl: 'chrome-extension://own/demo.html', capturedAt: 'synthetic-time' } });
  });

  it.each(['https://example.test/demo.html', 'chrome-extension://other/demo.html', 'chrome-extension://own/filters.html', 'chrome-extension://own/demo.html?x=1', 'chrome-extension://own/demo.html#bad/hash', 'chrome-extension://own/demo.html/extra', 'about:blank'])('does not allow %s as an exception', async invalid => {
    expect(isOwnFilterDemo(invalid, 'chrome-extension://own/demo.html')).toBe(false);
    expect((await captureFilterDemo({ id: 42, url: invalid }, '')).ok).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('accepts only the matching source URL and rejects malformed or oversized payloads', async () => {
    for (const response of [undefined, {}, { capture: capture(), settings: { version: 99 } }, { capture: { ...capture(), tree: { ...capture().tree, sourceUrl: 'https://example.test/' } }, settings: defaultRedactionSettings() }, { capture: { ...capture(), tree: { ...capture().tree, root: { role: 'page', children: [], value: 'x'.repeat(1_000_001) } } }, settings: defaultRedactionSettings() }]) {
      sendMessage.mockResolvedValue(response);
      expect(await captureFilterDemo({ id: 42, url }, '')).toMatchObject({ ok: false, error: { code: 'capture-failed' } });
    }
    expect(isOwnFilterDemo('moz-extension://own/demo.html#abc', 'moz-extension://own/demo.html')).toBe(true);
  });

  it('times out without leaving a capture timer or logging page data', async () => {
    vi.useFakeTimers(); sendMessage.mockReturnValue(new Promise(() => undefined));
    const promise = captureFilterDemo({ id: 42, url }, '');
    await vi.advanceTimersByTimeAsync(DEMO_CAPTURE_TIMEOUT);
    expect((await promise).ok).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
