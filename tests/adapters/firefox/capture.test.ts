import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureOutcome } from '@/src/adapters/types';

const page = () => ({ ok: true, tree: { schemaVersion: 1, title: 'Synthetic', sourceUrl: 'https://example.test/', root: { role: 'page', children: [{ role: 'button', name: 'Save', children: [] }] } }, warnings: ['embedded-frames'] });
const tab = { id: 42, url: 'https://example.test/' };
async function setup() {
  const api = {
    scripting: { executeScript: vi.fn().mockResolvedValue([{ frameId: 0, result: page() }]) },
    tabs: {
      get: vi.fn().mockResolvedValue(tab),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  };
  vi.doMock('wxt/browser', () => ({ browser: api }));
  const { captureFirefoxPage } = await import('@/src/adapters/firefox/capture');
  return { api, run: () => captureFirefoxPage(tab, '2026.10.04 12:00:00') };
}
afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

describe('Firefox on-demand capture boundary', () => {
  it('injects only the top frame and returns validated semantics, warnings and capture time', async () => {
    const { api, run } = await setup();
    const result = await run();
    expect(result).toMatchObject({ ok: true, tree: { capturedAt: '2026.10.04 12:00:00' }, warnings: ['embedded-frames'] });
    expect(api.scripting.executeScript).toHaveBeenCalledExactlyOnceWith({ target: { tabId: 42, frameIds: [0] }, files: ['/dom-capture.js'], world: 'ISOLATED' });
    expect(api.tabs.onUpdated.removeListener).toHaveBeenCalledWith(api.tabs.onUpdated.addListener.mock.calls[0]![0]);
    expect(api.tabs.onRemoved.removeListener).toHaveBeenCalledWith(api.tabs.onRemoved.addListener.mock.calls[0]![0]);
  });

  it.each([[], [{ frameId: 1, result: page() }], [{ frameId: 0, result: { ok: true } }], [{ frameId: 0, error: 'private detail' }]].map((results) => ({ results })))('rejects invalid injection results: %j', async ({ results }) => {
    const { api, run } = await setup();
    api.scripting.executeScript.mockResolvedValue(results);
    expect(await run()).toMatchObject({ ok: false, error: { code: 'invalid-tree' } });
    expect(api.tabs.get).not.toHaveBeenCalled();
  });

  it('passes limit errors safely and recovers after permission failures without exposing details', async () => {
    const { api, run } = await setup();
    api.scripting.executeScript.mockRejectedValueOnce(new Error('Missing host permission: synthetic-private-data'));
    expect(await run()).toEqual({ ok: false, error: { code: 'permission-denied', message: 'The browser denied access to this page.' } });
    api.scripting.executeScript.mockResolvedValueOnce([{ frameId: 0, result: { ok: false, error: { code: 'capture-limit', message: 'synthetic-private-data' } } }]);
    expect(await run()).toEqual({ ok: false, error: { code: 'capture-limit', message: 'This page exceeds the capture limits.' } });
    expect((await run()).ok).toBe(true);
  });

  it.each(['navigation', 'closed', 'changed-url', 'same-url-reload'])('rejects stale snapshots after %s', async (change) => {
    const { api, run } = await setup();
    api.scripting.executeScript.mockImplementation(async () => {
      if (change === 'navigation' || change === 'same-url-reload') api.tabs.onUpdated.addListener.mock.calls[0]![0](42, { status: 'loading' });
      if (change === 'closed') api.tabs.onRemoved.addListener.mock.calls[0]![0](42);
      if (change === 'changed-url') api.tabs.get.mockResolvedValue({ id: 42, url: 'https://example.test/new' });
      return [{ frameId: 0, result: page() }];
    });
    expect(await run()).toMatchObject({ ok: false, error: { code: 'page-changed' } });
  });

  it('blocks duplicate capture, times out, clears listeners and ignores a late result', async () => {
    const { api, run } = await setup();
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    api.scripting.executeScript.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = run();
    expect(await run()).toMatchObject({ ok: false, error: { code: 'capture-failed' } });
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'capture-timeout' } });
    expect(api.tabs.onUpdated.removeListener).toHaveBeenCalledOnce();
    finish([{ frameId: 0, result: page() }]);
    await Promise.resolve();
    expect((await run()).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also times out if the tab verification API never resolves', async () => {
    const { api, run } = await setup();
    vi.useFakeTimers();
    api.tabs.get.mockImplementation(() => new Promise(() => {}));
    const pending: Promise<CaptureOutcome> = run();
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'capture-timeout' } });
  });
});
