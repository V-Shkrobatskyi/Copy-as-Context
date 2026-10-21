// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_PORT_PREFIX, PREVIEW_TIMEOUT_MS, MAX_PREVIEW_CHARACTERS, isPreviewPayload, type PreviewPayload } from '@/src/preview-message';

function event() {
  const listeners = new Set<(...args: any[]) => void>();
  return { listeners, addListener: vi.fn((fn: (...args: any[]) => void) => listeners.add(fn)),
    removeListener: vi.fn((fn: (...args: any[]) => void) => listeners.delete(fn)),
    fire: (...args: any[]) => { for (const fn of [...listeners]) fn(...args); } };
}
const token = '11111111-2222-4333-8444-555555555555';
const url = `chrome-extension://test/preview.html#${token}`;
const payload: PreviewPayload = { content: 'safe context', compression: 'compact', format: 'markdown', redactSensitiveData: true, redactionCount: 2, reductionRatio: .78, warnings: ['canvas-content'] };
function port(overrides = {}) {
  return { name: `${PREVIEW_PORT_PREFIX}${token}`, sender: { id: 'test', url, tab: { id: 2 } },
    onMessage: event(), onDisconnect: event(), disconnect: vi.fn(), postMessage: vi.fn(), ...overrides };
}
let onConnect: ReturnType<typeof event>;
let api: any;
let pageHide: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  onConnect = event();
  api = { runtime: { id: 'test', lastError: undefined, onConnect, getURL: (path: string) => `chrome-extension://test${path}`, connect: vi.fn() },
    tabs: { create: vi.fn().mockResolvedValue({ id: 2 }), update: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue(undefined) } };
  vi.doMock('wxt/browser', () => ({ browser: api }));
  vi.stubGlobal('crypto', { randomUUID: () => token, subtle: webcrypto.subtle });
  vi.stubGlobal('window', { addEventListener: vi.fn((_type, fn) => { pageHide = fn; }), removeEventListener: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

describe('preview transport', () => {
  it('delivers a selection to its authenticated save document without activating it', async () => {
    const { openSelectionSave } = await import('@/src/preview-session');
    const task = openSelectionSave({ ...payload, scope: 'selection' });
    await flush();
    const targetUrl = `chrome-extension://test/selection-save.html#${token}`;
    expect(api.tabs.create).toHaveBeenCalledWith({ url: targetUrl, active: false });
    const target = port({ sender: { id: 'test', url: targetUrl, tab: { id: 2 } } });
    onConnect.fire(target); target.onMessage.fire({ type: 'preview-accepted-v1', token });
    await task;
    expect(api.tabs.update).not.toHaveBeenCalled(); expect(onConnect.listeners.size).toBe(0);
  });
  it('supports background delivery without window and removes the pending tab on cancellation', async () => {
    vi.stubGlobal('window', undefined);
    const { openPreview } = await import('@/src/preview-session');
    const controller = new AbortController();
    const task = openPreview({ ...payload, scope: 'selection' }, controller.signal);
    const rejected = expect(task).rejects.toThrow('preview-cancelled');
    await flush(); controller.abort(); await rejected;
    expect(api.tabs.remove).toHaveBeenCalledWith(2);
    expect(onConnect.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('delivers only to the created document and activates after acknowledgement, releasing listeners', async () => {
    const { openPreview } = await import('@/src/preview-session');
    const task = openPreview(payload);
    await flush();
    expect(api.tabs.create).toHaveBeenCalledWith({ url, active: false });
    for (const sender of [{ id: 'other', url, tab: { id: 2 } }, { id: 'test', url, tab: { id: 3 } }, { id: 'test', url: 'https://example.test/', tab: { id: 2 } }]) {
      const stranger = port({ sender }); onConnect.fire(stranger);
      expect(stranger.postMessage).not.toHaveBeenCalled();
      expect(stranger.disconnect).toHaveBeenCalledOnce();
    }
    const target = port(); onConnect.fire(target);
    expect(target.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'preview-content-v1', token, payload });
    expect(api.tabs.update).not.toHaveBeenCalled();
    target.onMessage.fire({ type: 'preview-accepted-v1', token: 'wrong' });
    expect(api.tabs.update).not.toHaveBeenCalled();
    target.onMessage.fire({ type: 'preview-accepted-v1', token });
    await task;
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(2, { active: true });
    expect(onConnect.listeners.size).toBe(0);
    expect(target.onMessage.listeners.size).toBe(0);
    expect(target.onDisconnect.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(api.tabs.remove).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'disconnect', 'closed-popup', 'activation-failed'])('cleans up failed delivery: %s', async failure => {
    const { openPreview } = await import('@/src/preview-session');
    if (failure === 'activation-failed') api.tabs.update.mockRejectedValue(new Error('failed'));
    const task = openPreview(payload);
    const result = expect(task).rejects.toThrow();
    await flush();
    const target = port();
    onConnect.fire(target);
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS);
    if (failure === 'disconnect') target.onDisconnect.fire();
    if (failure === 'closed-popup') pageHide?.();
    if (failure === 'activation-failed') target.onMessage.fire({ type: 'preview-accepted-v1', token });
    await result;
    expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2);
    expect(onConnect.listeners.size).toBe(0);
    expect(target.onMessage.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the listener if tab creation fails and rejects oversized or malformed exports before opening', async () => {
    const { openPreview } = await import('@/src/preview-session');
    api.tabs.create.mockRejectedValue(new Error('denied'));
    await expect(openPreview(payload)).rejects.toThrow('denied');
    expect(onConnect.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    api.tabs.create.mockClear();
    await expect(openPreview({ ...payload, content: 'x'.repeat(MAX_PREVIEW_CHARACTERS + 1) })).rejects.toThrow();
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect(isPreviewPayload({ ...payload, redactionCount: -1 })).toBe(false);
    for (const reductionRatio of [undefined, NaN, Infinity, -.1, 1.1, '78%']) {
      expect(isPreviewPayload({ ...payload, reductionRatio })).toBe(false);
    }
    expect(isPreviewPayload({ ...payload, reductionRatio: null })).toBe(true);
    expect(isPreviewPayload({ ...payload, warnings: ['private text'] })).toBe(false);
    expect(isPreviewPayload({ ...payload, compression: 'unknown' })).toBe(false);
  });

  it('times out a pending tab creation and removes a tab returned after cancellation', async () => {
    const { openPreview } = await import('@/src/preview-session');
    let created!: (tab: { id: number }) => void;
    api.tabs.create.mockImplementation(() => new Promise(resolve => { created = resolve; }));
    const task = openPreview(payload);
    const result = expect(task).rejects.toThrow('preview-timeout');
    await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS);
    await result;
    expect(onConnect.listeners.size).toBe(0);
    created({ id: 9 }); await flush();
    expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith(9);
  });

  it('keeps simultaneous sessions isolated', async () => {
    const { openPreview } = await import('@/src/preview-session');
    const otherToken = '99999999-2222-4333-8444-555555555555';
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce(token).mockReturnValueOnce(otherToken) });
    api.tabs.create.mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce({ id: 3 });
    const first = openPreview(payload);
    const secondPayload = { ...payload, content: 'independent context' };
    const second = openPreview(secondPayload);
    await flush();
    const a = port();
    const b = port({ name: `${PREVIEW_PORT_PREFIX}${otherToken}`, sender: { id: 'test', url: `chrome-extension://test/preview.html#${otherToken}`, tab: { id: 3 } } });
    onConnect.fire(a); onConnect.fire(b);
    expect(a.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'preview-content-v1', token, payload });
    expect(b.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'preview-content-v1', token: otherToken, payload: secondPayload });
    b.onMessage.fire({ type: 'preview-accepted-v1', token: otherToken });
    await second;
    expect(onConnect.listeners.size).toBe(1);
    a.onMessage.fire({ type: 'preview-accepted-v1', token }); await first;
    expect(onConnect.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries disconnected receivers, accepts one payload and releases all timers and ports', async () => {
    const { receivePreview } = await import('@/src/preview-session');
    const first = port(); const second = port();
    api.runtime.connect.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const accept = vi.fn(); const unavailable = vi.fn();
    const stop = receivePreview(token, accept, unavailable);
    first.onDisconnect.fire();
    await vi.advanceTimersByTimeAsync(100);
    second.onMessage.fire({ type: 'preview-content-v1', token: 'wrong', payload });
    second.onMessage.fire({ type: 'preview-content-v1', token, payload: { ...payload, content: null } });
    expect(accept).not.toHaveBeenCalled();
    second.onMessage.fire({ type: 'preview-content-v1', token, payload });
    second.onMessage.fire({ type: 'preview-content-v1', token, payload: { ...payload, content: 'overwrite' } });
    expect(accept).toHaveBeenCalledExactlyOnceWith(payload);
    expect(second.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'preview-accepted-v1', token });
    stop();
    expect(second.onMessage.listeners.size).toBe(0);
    expect(first.onDisconnect.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(unavailable).not.toHaveBeenCalled();
  });

  it('expires an abandoned receiver and cancellation prevents late deliveries', async () => {
    const { receivePreview } = await import('@/src/preview-session');
    const target = port(); api.runtime.connect.mockReturnValue(target);
    const accept = vi.fn(); const unavailable = vi.fn();
    const stop = receivePreview(token, accept, unavailable);
    await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(target.onMessage.listeners.size).toBe(0);
    stop();
    target.onMessage.fire({ type: 'preview-content-v1', token, payload });
    expect(accept).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});


it('does not create a preview tab when administrator policy denies preview', async () => {
  api.storage = { managed: { get: vi.fn().mockResolvedValue({ PreviewAllowed: false }) } };
  const { openPreview } = await import('@/src/preview-session');
  await expect(openPreview(payload)).rejects.toThrow('Preview is disabled');
  expect(api.tabs.create).not.toHaveBeenCalled(); expect(onConnect.listeners.size).toBe(0);
});
