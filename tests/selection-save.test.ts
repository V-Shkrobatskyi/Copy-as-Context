// @vitest-environment jsdom
// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, expect, it, vi } from 'vitest';
import type { PreviewPayload } from '@/src/preview-message';
const mocks = vi.hoisted(() => ({ save: vi.fn(), accept: undefined as undefined | ((payload: PreviewPayload) => void), stop: vi.fn() }));
vi.mock('@/src/save-context', () => ({ saveContextFile: mocks.save }));
vi.mock('@/src/preview-session', () => ({ receivePreview: (_token: string, accept: (payload: PreviewPayload) => void) => { mocks.accept = accept; return mocks.stop; } }));
const payload: PreviewPayload = { content: 'Prepared selected context', format: 'markdown', compression: 'compact', redactSensitiveData: true, redactionCount: 0, reductionRatio: null, warnings: [] };
async function load(target: string) {
  vi.stubEnv('BROWSER', target);
  document.body.innerHTML = '<p id="status"></p><button id="close">Close</button>';
  location.hash = '11111111-2222-4333-8444-555555555555';
  const api = { tabs: { getCurrent: vi.fn().mockResolvedValue({ id: 8 }), remove: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) } };
  vi.doMock('wxt/browser', () => ({ browser: api }));
  await import('@/entrypoints/selection-save/main');
  mocks.accept!(payload);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  return api;
}
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });

it.each(['chrome', 'firefox'])('closes the inactive save tab after success in %s', async target => {
  mocks.save.mockResolvedValue(undefined); const api = await load(target);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(payload.content, payload.format, undefined, payload);
  expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith(8);
  expect(api.tabs.update).not.toHaveBeenCalled();
});
it.each(['chrome', 'firefox'])('closes a cancelled save without activating the helper tab in %s', async target => {
  const { DownloadCancelledError } = await import('@/src/download-errors');
  mocks.save.mockRejectedValue(new DownloadCancelledError()); const api = await load(target);
  expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith(8);
  expect(api.tabs.update).not.toHaveBeenCalled(); expect(mocks.stop).toHaveBeenCalledOnce();
});
it('keeps a real failure visible instead of silently closing the save tab', async () => {
  mocks.save.mockRejectedValue(new Error('FILE_ACCESS_DENIED')); const api = await load('chrome');
  expect(api.tabs.remove).not.toHaveBeenCalled();
  expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(8, { active: true });
  expect(document.querySelector('#status')!.textContent).toContain('Unable to save the file.');
});
