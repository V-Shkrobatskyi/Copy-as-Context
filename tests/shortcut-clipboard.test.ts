// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyShortcutContext } from '@/src/shortcut-clipboard';

let dom: JSDOM;
function page() {
  dom = new JSDOM('<button>Keep focus</button><p>Keep selection</p>', { url: 'https://example.test/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'location', 'HTMLElement'] as const) vi.stubGlobal(key, dom.window[key]);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  return document;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); dom?.window.close(); });

describe('shortcut clipboard injection', () => {
  it('uses the clipboard API without adding content to the page', async () => {
    page(); const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText } });
    expect(await copyShortcutContext('Private prepared export', location.href)).toBe(true);
    expect(writeText).toHaveBeenCalledExactlyOnceWith('Private prepared export');
    expect(document.documentElement.textContent).not.toContain('Private prepared export');
  });
  it('refuses a navigated or unfocused document', async () => {
    page(); const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText } });
    expect(await copyShortcutContext('Export', 'https://old.test/')).toBe(false);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    expect(await copyShortcutContext('Export', location.href)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each([true, false])('cleans up the HTTP fallback and restores focus and selection after success=%s', async success => {
    page(); const button = document.querySelector('button')!; button.focus();
    const selection = document.getSelection()!; selection.removeAllRanges();
    const range = document.createRange(); range.setStart(document.querySelector('p')!.firstChild!, 0); range.setEnd(document.querySelector('p')!.firstChild!, 14); selection.addRange(range);
    const setData = vi.fn();
    document.execCommand = vi.fn(() => {
      const host = document.querySelector('div')!;
      expect(host.shadowRoot).toBeNull();
      expect(document.documentElement.textContent).not.toContain('Private prepared export');
      if (success) {
        const event = new dom.window.Event('copy', { cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { setData } });
        window.dispatchEvent(event);
      }
      return success;
    });
    expect(await copyShortcutContext('Private prepared export', location.href)).toBe(success);
    expect(document.activeElement).toBe(button); expect(selection.toString()).toBe('Keep selection');
    expect(document.querySelector('div')).toBeNull();
    expect(setData).toHaveBeenCalledTimes(success ? 1 : 0);
    const later = new dom.window.Event('copy', { cancelable: true }); window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });
});
