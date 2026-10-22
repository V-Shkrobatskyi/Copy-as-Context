// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const script = readFileSync('public/theme.js', 'utf8');
const key = 'copy-as-context:theme';
const pages: JSDOM[] = [];
function page(saved?: string, unavailable = false) {
  const dom = new JSDOM('<select data-theme-picker><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>', { url: 'https://extension.test', runScripts: 'outside-only' });
  pages.push(dom);
  const { window } = dom;
  const listeners = new Set<() => void>();
  const system = { matches: true, addEventListener: (_type: string, listener: () => void) => listeners.add(listener) };
  Object.defineProperty(window, 'matchMedia', { value: () => system });
  if (saved) window.localStorage.setItem(key, saved);
  if (unavailable) Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('Storage unavailable'); } });
  window.eval(script);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const picker = window.document.querySelector('select')!;
  return {
    window, picker,
    theme: () => window.document.documentElement.dataset.theme,
    choose(value: string) { picker.value = value; picker.dispatchEvent(new window.Event('change')); },
    system(value: boolean) { system.matches = value; listeners.forEach(listener => listener()); },
    sync(value: string | null, changedKey: string | null = key) { window.dispatchEvent(new window.StorageEvent('storage', { key: changedKey, newValue: value })); },
  };
}
afterEach(() => { pages.splice(0).forEach(page => page.window.close()); vi.restoreAllMocks(); });

describe('extension theme preference', () => {
  it('uses the system theme for a missing or invalid preference and follows system changes', () => {
    for (const value of [undefined, 'invalid']) {
      const view = page(value);
      expect(view.theme()).toBe('dark');
      expect(view.picker.value).toBe('system');
      view.system(false);
      expect(view.theme()).toBe('light');
    }
  });
  it('persists explicit choices across page openings and keeps them independent of the system', () => {
    const first = page();
    first.choose('light');
    expect(first.theme()).toBe('light');
    first.system(true);
    expect(first.theme()).toBe('light');
    const reopened = page(first.window.localStorage.getItem(key)!);
    expect(reopened.theme()).toBe('light');
    expect(reopened.picker.value).toBe('light');
    reopened.choose('dark');
    expect(reopened.theme()).toBe('dark');
    expect(reopened.window.localStorage.getItem(key)).toBe('dark');
    reopened.choose('system');
    reopened.system(false);
    expect(reopened.theme()).toBe('light');
  });
  it('updates open pages on preference changes and returns to the system theme when storage is cleared', () => {
    const view = page('light');
    view.sync('dark');
    expect(view.theme()).toBe('dark');
    expect(view.picker.value).toBe('dark');
    view.sync('light', 'unrelated-key');
    expect(view.theme()).toBe('dark');
    view.sync(null, null);
    expect(view.theme()).toBe('dark');
    expect(view.picker.value).toBe('system');
    view.system(false);
    expect(view.theme()).toBe('light');
  });
  it('still applies local choices when preference storage is unavailable', () => {
    const view = page(undefined, true);
    expect(view.theme()).toBe('dark');
    expect(() => view.choose('light')).not.toThrow();
    expect(view.theme()).toBe('light');
  });
});
