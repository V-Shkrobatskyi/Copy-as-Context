// noinspection ES6PreferShortImport
// Keep direct module imports in this test; the protocol has no parent barrel.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResult } from '@/src/core';
import type { CaptureActiveTabResponse } from '@/src/capture-message';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('../../src/adapters/chrome/capture', () => ({ captureChromeAccessibilityTree: capture }));

async function loadBackground() {
  let listener: ((message: unknown, sender: unknown, reply: (result: unknown) => void) => boolean | void) | undefined;
  vi.stubGlobal('defineBackground', (start: () => void) => start());
  vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: (callback: typeof listener) => { listener = callback; } } },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 42, title: 'Synthetic', url: 'https://example.test/' }]) } });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await import('../../entrypoints/background');
  return { request: (message: unknown) => new Promise<CaptureActiveTabResponse>((resolve) => listener!(message, {}, resolve as (result: unknown) => void)), listener: listener! };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); capture.mockReset(); });

describe('background export boundary', () => {
  it('returns only prepared content and counters with request-selected privacy and format', async () => {
    const tree = { schemaVersion: 1 as const, root: { role: 'page', children: [
      { role: 'textbox', name: 'Password', value: 'synthetic-private-value', children: [] },
    ] } };
    capture.mockResolvedValue({ ok: true, tree } satisfies CaptureResult);
    const background = await loadBackground();
    for (const privacy of [true, false]) {
      const response = await background.request({ type: 'capture-active-tab', compression: 'without', format: 'markdown', redactSensitiveData: privacy });
      expect(capture).toHaveBeenCalledWith(42);
      expect(response.ok).toBe(true);
      expect(response).not.toHaveProperty('tree');
      if (response.ok) {
        expect(response.export.serialized.format).toBe('markdown');
        expect(response.export.serialized.content.includes('synthetic-private-value')).toBe(!privacy);
        expect(response.export.redactionCount).toBe(privacy ? 1 : 0);
        expect(response.export.reductionRatio).toBe(0);
      }
    }
  });

  it('rejects invalid options before capturing and passes capture failures without raw data', async () => {
    const background = await loadBackground();
    for (const invalid of [undefined, 'unknown', 'json']) {
      expect((await background.request({ type: 'capture-active-tab', compression: 'compact', format: invalid, redactSensitiveData: true })).ok).toBe(false);
    }
    expect(capture).not.toHaveBeenCalled();
    capture.mockResolvedValue({ ok: false, error: { code: 'debugger-busy', message: 'Busy' } });
    expect(await background.request({ type: 'capture-active-tab', compression: 'compact', format: 'semantic-text', redactSensitiveData: true })).toEqual({ ok: false, error: { code: 'debugger-busy', message: 'Busy' } });
  });

  it('ignores unrelated messages and recovers after preparation errors', async () => {
    const background = await loadBackground();
    const reply = vi.fn();
    expect(background.listener({ type: 'unrelated' }, {}, reply)).toBeUndefined();
    expect(reply).not.toHaveBeenCalled();
    capture.mockRejectedValue(new Error('synthetic-internal-value'));
    const request = { type: 'capture-active-tab', compression: 'compact', format: 'semantic-text', redactSensitiveData: true };
    expect(await background.request(request)).toEqual({ ok: false, error: { code: 'capture-failed', message: 'Unable to prepare this page’s context.' } });
    capture.mockResolvedValue({ ok: true, tree: { schemaVersion: 1, root: { role: 'page', children: [] } } });
    expect((await background.request(request)).ok).toBe(true);
  });

  it('finishes capture if the popup closes before receiving the response', async () => {
    let finishCapture: ((value: CaptureResult) => void) | undefined;
    capture.mockImplementation(() => new Promise<CaptureResult>((resolve) => { finishCapture = resolve; }));
    const background = await loadBackground();
    const reply = vi.fn(() => { throw new Error('Receiver closed'); });
    expect(background.listener({ type: 'capture-active-tab', compression: 'compact', format: 'semantic-text', redactSensitiveData: true }, {}, reply)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    finishCapture!({ ok: true, tree: { schemaVersion: 1, root: { role: 'page', children: [] } } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reply).toHaveBeenCalled();
  });
});
