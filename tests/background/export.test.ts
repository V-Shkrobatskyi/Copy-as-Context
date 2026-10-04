// noinspection ES6PreferShortImport
// Keep direct module imports in this test; the protocol has no parent barrel.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResult } from '@/src/core';
import type { CaptureActiveTabResponse } from '@/src/capture-message';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('../../src/adapters/chrome/capture', () => ({ captureChromeAccessibilityTree: capture }));

async function loadBackground(target = 'chrome') {
  let listener: ((message: unknown, sender: unknown, reply: (result: unknown) => void) => boolean | void) | undefined;
  vi.stubGlobal('defineBackground', (start: () => void) => start());
  const chromeApi = { runtime: { id: 'synthetic-chrome-id', getURL: (path: string) => `chrome-extension://test${path}`, onMessage: { addListener: (callback: typeof listener) => { listener = callback; } } },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 42, title: 'Synthetic', url: 'https://example.test/' }]) } };
  vi.stubGlobal('chrome', chromeApi);
  const firefoxApi = {
    runtime: { id: 'synthetic-firefox-id', getURL: (path: string) => `moz-extension://test${path}`, onMessage: { addListener: (callback: typeof listener) => { listener = callback; } } },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 42, url: 'https://example.test/' }]),
      get: vi.fn().mockResolvedValue({ id: 42, url: 'https://example.test/' }),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ frameId: 0, result: {
      ok: true, tree: { schemaVersion: 1, title: 'Synthetic Firefox', sourceUrl: 'https://example.test/', root: { role: 'page', children: [{ role: 'button', name: 'Save', children: [] }] } }, warnings: ['embedded-frames'],
    } }]) },
  };
  vi.doMock('wxt/browser', () => ({ browser: target === 'firefox' ? firefoxApi : chromeApi }));
  vi.stubEnv('BROWSER', target);
  if (target === 'firefox') {
    vi.stubGlobal('browser', firefoxApi);
    vi.stubGlobal('chrome', undefined);
  }
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await import('../../entrypoints/background');
  const api = target === 'firefox' ? firefoxApi : chromeApi;
  const sender = { id: api.runtime.id, url: api.runtime.getURL('/popup.html') };
  return { request: (message: unknown) => new Promise<CaptureActiveTabResponse>((resolve) => listener!(message, sender, resolve as (result: unknown) => void)), listener: listener!, sender, firefoxApi };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); capture.mockReset(); });

describe('background export boundary', () => {
  it('prepares Firefox DOM content and warnings without Chrome capture or raw trees in the popup', async () => {
    const background = await loadBackground('firefox');
    const response = await background.request({ type: 'capture-active-tab', compression: 'compact', format: 'semantic-text', redactSensitiveData: true });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.export.serialized.content).toContain('button "Save"');
      expect(response.warnings).toEqual(['embedded-frames']);
    }
    expect(capture).not.toHaveBeenCalled();
    expect(response).not.toHaveProperty('tree');
    expect(background.firefoxApi.scripting.executeScript).toHaveBeenCalledOnce();
  });
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
    expect(background.listener({ type: 'capture-active-tab', compression: 'compact', format: 'semantic-text', redactSensitiveData: true }, background.sender, reply)).toBe(true);
    await vi.waitFor(() => expect(finishCapture).toBeTypeOf('function'));
    finishCapture!({ ok: true, tree: { schemaVersion: 1, root: { role: 'page', children: [] } } });
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(2));
  });

  it('ignores capture requests from content scripts, other extensions and non-popup documents', async () => {
    const background = await loadBackground();
    const reply = vi.fn();
    const message = { type: 'capture-active-tab', compression: 'compact', format: 'semantic-text', redactSensitiveData: true };
    for (const sender of [{}, { ...background.sender, tab: { id: 42 } }, { ...background.sender, id: 'another-extension' }, { ...background.sender, url: 'https://example.test/' }]) {
      expect(background.listener(message, sender, reply)).toBeUndefined();
    }
    expect(reply).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
