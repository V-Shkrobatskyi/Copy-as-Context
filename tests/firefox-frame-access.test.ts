// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { isFrameAccess } from '@/src/frame-access';

let dom: JSDOM | undefined;
afterEach(() => { dom?.window.close(); vi.resetModules(); vi.unstubAllGlobals(); });
async function setup(granted = false) {
  dom = new JSDOM('<input type="checkbox" />');
  vi.stubGlobal('window', dom.window);
  const added = new Set<() => void>(); const removed = new Set<() => void>();
  const permissions = {
    request: vi.fn(async () => { granted = true; return true; }),
    contains: vi.fn(async () => granted),
    getAll: vi.fn(async () => ({ origins: granted ? ['http://*/*', 'https://*/*', 'https://old.test/*'] : [] })),
    remove: vi.fn(async () => { granted = false; return true; }),
    onAdded: { addListener: (fn: () => void) => added.add(fn), removeListener: (fn: () => void) => added.delete(fn) },
    onRemoved: { addListener: (fn: () => void) => removed.add(fn), removeListener: (fn: () => void) => removed.delete(fn) },
  };
  vi.doMock('wxt/browser', () => ({ browser: { permissions } }));
  const { installFrameAccessToggle } = await import('@/src/firefox-frame-access');
  const input = dom.window.document.querySelector('input')!;
  const feedback = vi.fn(); const busy = vi.fn();
  const toggle = installFrameAccessToggle(input, feedback, busy);
  await vi.waitFor(() => expect(input.disabled).toBe(false));
  return { input, toggle, permissions, feedback, busy, added, removed,
    change(value: boolean) { input.checked = value; input.dispatchEvent(new dom!.window.Event('change')); },
    revoke() { granted = false; removed.forEach(fn => fn()); } };
}

describe('Firefox other-site frames toggle', () => {
  it('defaults off and requests all HTTP/HTTPS hosts synchronously from one click', async () => {
    const fixture = await setup();
    expect(fixture.input.checked).toBe(false);
    expect(fixture.permissions.request).not.toHaveBeenCalled();
    fixture.change(true);
    expect(fixture.permissions.request).toHaveBeenCalledExactlyOnceWith({ origins: ['http://*/*', 'https://*/*'] });
    expect(fixture.input.disabled).toBe(true);
    await vi.waitFor(() => expect(fixture.toggle.pending).toBe(false));
    expect(fixture.input.checked).toBe(true);
    expect(fixture.feedback).toHaveBeenCalledWith(expect.stringContaining('Use Copy or Save'));
  });
  it('returns to off after denial and prevents repeated permission requests', async () => {
    const fixture = await setup(); let finish!: (value: boolean) => void;
    fixture.permissions.request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    fixture.change(true); fixture.change(true);
    expect(fixture.permissions.request).toHaveBeenCalledOnce(); finish(false);
    await vi.waitFor(() => expect(fixture.toggle.pending).toBe(false));
    expect(fixture.input.checked).toBe(false);
    expect(fixture.feedback).toHaveBeenCalledWith(expect.stringContaining('not granted'));
  });
  it('restores the granted state on reopen and removes broad and legacy host grants on disable', async () => {
    const fixture = await setup(true);
    expect(fixture.input.checked).toBe(true); fixture.change(false);
    await vi.waitFor(() => expect(fixture.toggle.pending).toBe(false));
    expect(fixture.permissions.remove).toHaveBeenCalledExactlyOnceWith({ origins: ['http://*/*', 'https://*/*', 'https://old.test/*'] });
    expect(fixture.input.checked).toBe(false);
    expect(fixture.permissions.request).not.toHaveBeenCalled();
  });
  it('tracks external revocation and disables the toggle during exports', async () => {
    const fixture = await setup(true);
    fixture.toggle.setPending(true); expect(fixture.input.disabled).toBe(true);
    fixture.revoke(); await vi.waitFor(() => expect(fixture.input.checked).toBe(false));
    expect(fixture.input.disabled).toBe(true);
    fixture.toggle.setPending(false); expect(fixture.input.disabled).toBe(false);
    dom!.window.dispatchEvent(new dom!.window.Event('unload'));
    expect(fixture.added.size + fixture.removed.size).toBe(0);
  });
  it('keeps the granted state when revocation fails, and handles request errors', async () => {
    const fixture = await setup(true);
    fixture.permissions.remove.mockResolvedValue(false); fixture.change(false);
    await vi.waitFor(() => expect(fixture.toggle.pending).toBe(false));
    expect(fixture.input.checked).toBe(true);
    expect(fixture.feedback).toHaveBeenCalledWith(expect.stringContaining('Unable to remove'));
    fixture.revoke(); await vi.waitFor(() => expect(fixture.input.checked).toBe(false));
    fixture.permissions.request.mockRejectedValue(Error('Denied')); fixture.change(true);
    await vi.waitFor(() => expect(fixture.toggle.pending).toBe(false));
    expect(fixture.input.checked).toBe(false);
    expect(fixture.feedback).toHaveBeenCalledWith('Unable to request site access.');
  });
  it('retains narrow metadata validation separately from the broad user permission', () => {
    expect(isFrameAccess(['https://child.test/*'])).toBe(true);
    expect(isFrameAccess(['https://*/*'])).toBe(false);
  });
});
