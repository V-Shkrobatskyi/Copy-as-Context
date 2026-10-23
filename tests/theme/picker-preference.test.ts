// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPickerTheme } from '@/src/element-picker-theme';

const storage = vi.hoisted(() => ({ get: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { storage: { local: { get: storage.get }, onChanged: storage } } }));
const key = 'page-as-context:theme';
beforeEach(() => vi.resetAllMocks());

describe('picker theme storage', () => {
  it('loads the saved preference, follows local changes and unsubscribes', async () => {
    storage.get.mockResolvedValue({ [key]: 'light' });
    const listener = vi.fn();
    const stop = watchPickerTheme(listener);
    await Promise.resolve();
    expect(listener).toHaveBeenLastCalledWith('light');
    const change = storage.addListener.mock.calls[0]![0];
    change({ [key]: { newValue: 'dark' } }, 'sync');
    expect(listener).toHaveBeenCalledTimes(1);
    change({ unrelated: { newValue: 'dark' } }, 'local');
    expect(listener).toHaveBeenCalledTimes(1);
    change({ [key]: { newValue: 'dark' } }, 'local');
    expect(listener).toHaveBeenLastCalledWith('dark');
    change({ [key]: {} }, 'local');
    expect(listener).toHaveBeenLastCalledWith(undefined);
    stop();
    expect(storage.removeListener).toHaveBeenCalledWith(change);
  });

  it.each([false, true])('ignores a delayed initial read after a change or closure (closed: %s)', async closed => {
    let resolve!: (value: Record<string, string>) => void;
    storage.get.mockReturnValue(new Promise(done => { resolve = done; }));
    const listener = vi.fn();
    const stop = watchPickerTheme(listener);
    if (closed) stop();
    else storage.addListener.mock.calls[0]![0]({ [key]: { newValue: 'dark' } }, 'local');
    resolve({ [key]: 'light' });
    await Promise.resolve();
    expect(listener.mock.calls).toEqual(closed ? [] : [['dark']]);
    stop();
  });
});
