// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

function event<T>() {
  const listeners = new Set<(value: T) => void>();
  return { listeners, addListener: (fn: (value: T) => void) => listeners.add(fn),
    removeListener: (fn: (value: T) => void) => listeners.delete(fn),
    emit: (value: T) => { for (const fn of [...listeners]) fn(value); } };
}
let changed: ReturnType<typeof event<any>>;
let erased: ReturnType<typeof event<number>>;
let download: ReturnType<typeof vi.fn>;
let search: ReturnType<typeof vi.fn>;
let revoke: ReturnType<typeof vi.spyOn>;
let owner: EventTarget;
beforeEach(() => {
  changed = event(); erased = event();
  download = vi.fn().mockResolvedValue(12);
  search = vi.fn().mockResolvedValue([{ state: 'in_progress' }]);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  owner = new EventTarget(); vi.stubGlobal('window', owner);
  vi.doMock('wxt/browser', () => ({ browser: { downloads: { download, search, onChanged: changed, onErased: erased } } }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });
async function start(signal?: AbortSignal) {
  const { saveContextFile } = await import('@/src/save-context');
  const task = saveContextFile('Synthetic export', 'semantic-text', signal);
  void task.catch(() => {});
  for (let index = 0; index < 8; index++) await Promise.resolve();
  return { task };
}
function cleaned() {
  expect(changed.listeners.size).toBe(0); expect(erased.listeners.size).toBe(0);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test');
}

it.each(['complete', 'interrupted', 'erased'] as const)('finishes and releases resources after %s', async state => {
  const { task } = await start();
  if (state === 'erased') erased.emit(12);
  else changed.emit({ id: 12, state: { current: state } });
  if (state === 'complete') await expect(task).resolves.toBeUndefined();
  else await expect(task).rejects.toThrow(state === 'erased' ? 'download-erased' : 'download-interrupted');
  cleaned();
});

it('ignores other transfers and detects completion that preceded listener attachment', async () => {
  search.mockResolvedValue([{ state: 'complete' }]);
  const { task } = await start();
  erased.emit(99); changed.emit({ id: 99, state: { current: 'interrupted' } });
  await task; cleaned();
});

it('rejects an item erased before the initial history check', async () => {
  search.mockResolvedValue([]);
  const { task } = await start();
  await expect(task).rejects.toThrow('download-unavailable'); cleaned();
});

it.each(['signal', 'pagehide'] as const)('releases a pending transfer on %s', async reason => {
  const controller = new AbortController();
  const { task } = await start(controller.signal);
  if (reason === 'signal') controller.abort(); else owner.dispatchEvent(new Event('pagehide'));
  await expect(task).rejects.toThrow('download-cancelled'); cleaned();
});

it('cancels while the browser dialog is pending, without leaving listeners or a blob', async () => {
  let finish!: (id: number) => void;
  download.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  const { task } = await start(controller.signal);
  controller.abort(); await expect(task).rejects.toThrow('download-cancelled');
  finish(12); await Promise.resolve(); cleaned();
  expect(search).not.toHaveBeenCalled();
});

it('does not initiate a download for an already cancelled operation', async () => {
  const controller = new AbortController(); controller.abort();
  const { task } = await start(controller.signal);
  await expect(task).rejects.toThrow('download-cancelled');
  expect(download).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
