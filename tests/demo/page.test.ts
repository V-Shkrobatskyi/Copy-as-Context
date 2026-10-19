// @vitest-environment jsdom
// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultRedactionSettings, BUILTIN_FILTERS } from '@/src/core/privacy/settings';
import { writeFilterDemoDraft } from '@/src/filter-demo-draft';
import { isDomCaptureOutcome } from '@/src/adapters/dom/validate';
let settings: unknown;
let draft: unknown;
let messages: Set<any>;
let storageListeners: Set<any>;
let events: Map<string, any>;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const get = (id: string) => document.getElementById(id)!;
beforeEach(async () => {
  document.body.innerHTML = readFileSync('entrypoints/demo/index.html', 'utf8').split('<body>')[1]!.split('</body>')[0]!;
  history.replaceState(null, '', '#demo-session');
  sessionStorage.clear();
  settings = defaultRedactionSettings(); draft = undefined; messages = new Set(); storageListeners = new Set(); events = new Map();
  vi.doMock('wxt/browser', () => ({ browser: {
    runtime: { id: 'own', getURL: (path: string) => `chrome-extension://own${path}`, sendMessage: vi.fn().mockImplementation(async () => draft), onMessage: { addListener: (listener: any) => messages.add(listener), removeListener: (listener: any) => messages.delete(listener) } },
    storage: { local: { get: vi.fn().mockImplementation(async () => ({ 'redaction-filters-v1': settings })) }, onChanged: { addListener: (listener: any) => storageListeners.add(listener), removeListener: (listener: any) => storageListeners.delete(listener) } },
    tabs: { getCurrent: vi.fn().mockResolvedValue({ id: 42 }) },
  } }));
  vi.spyOn(window, 'addEventListener').mockImplementation((type, callback) => { events.set(type, callback); });
  await import('@/entrypoints/demo/main'); await settle();
});
afterEach(() => { events.get('pagehide')?.(); vi.restoreAllMocks(); vi.resetModules(); });

describe('live demo page', () => {
  it('renders saved enabled samples with real field controls and query links, using text nodes for custom terms', async () => {
    expect(get('status').textContent).toContain('13 enabled filters');
    expect(get('source').textContent).toContain('saved filters');
    expect(document.querySelector('input[readonly]')).not.toBeNull();
    expect(document.querySelector('a.sample')?.getAttribute('href')).toContain('?api_key=');
    expect(get('examples').textContent).toContain('Ale******');
    settings = { ...defaultRedactionSettings(), customRules: [{ id: 'html', name: '<script>name</script>', type: 'text', text: '<img src=x onerror=alert(1)>', enabled: true, caseSensitive: false }] };
    [...storageListeners][0]!({ 'redaction-filters-v1': {} }, 'local');
    await vi.waitFor(() => expect(get('examples').textContent).toContain('<img src=x onerror=alert(1)>'));
    expect(get('examples').querySelector('img')).toBeNull(); expect(get('examples').querySelector('script')).toBeNull();
  });

  it('groups samples by rule identity and keeps equally named custom rules separate', async () => {
    expect(get('examples').querySelectorAll('section.example')).toHaveLength(13);
    expect(get('examples').querySelectorAll('.sample-row')).toHaveLength(18);
    const personal = [...get('examples').querySelectorAll('section.example')].find(group => group.querySelector('h2')?.textContent === 'Mask personal field values (English labels)')!;
    expect(personal).toBeDefined();
    expect(personal.querySelectorAll('.sample-row')).toHaveLength(6);
    expect(personal.querySelectorAll('input[readonly]')).toHaveLength(6);
    expect(personal.querySelectorAll('output')).toHaveLength(6);
    settings = { ...defaultRedactionSettings(), customRules: ['first', 'second'].map(id => ({ id, name: 'Same name', type: 'text', text: id, enabled: true, caseSensitive: false })) };
    [...storageListeners][0]!({ 'redaction-filters-v1': {} }, 'local');
    await vi.waitFor(() => expect(get('examples').querySelectorAll('section.example')).toHaveLength(15));
    const sameName = [...get('examples').querySelectorAll('section.example')].filter(group => group.querySelector('h2')?.textContent === 'Same name');
    expect(sameName).toHaveLength(2);
    expect(sameName.map(group => group.querySelectorAll('.sample-row').length)).toEqual([1, 1]);
  });

  it('loads the same-tab draft, returns to Customize in the same tab and blocks invalid enabled drafts', async () => {
    writeFilterDemoDraft({ session: 'demo-session', settings: { ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) }, baseline: JSON.stringify(defaultRedactionSettings()) });
    events.get('focus')!();
    await vi.waitFor(() => expect(get('status').textContent).toContain('0 enabled filters'));
    expect(get('source').textContent).toContain('filter draft'); expect(get('empty').hidden).toBe(false);
    // Re-entering Demo wires the return link to the preserved draft.
    events.get('pagehide')!(); vi.resetModules();
    await import('@/entrypoints/demo/main'); await settle();
    const link = document.querySelector<HTMLAnchorElement>('.settings-link')!;
    expect(link.href).toBe('chrome-extension://own/filters.html#demo-session');
    expect(link.target).toBe('');
    writeFilterDemoDraft({ session: 'demo-session', settings: { ...defaultRedactionSettings(), customRules: [{ id: 'bad', name: '', text: '[', type: 'regex', caseSensitive: false, enabled: true }] } });
    events.get('focus')!();
    await vi.waitFor(() => expect(get('status').textContent).toContain('Complete the enabled filters'));
    expect(get('examples').children.length).toBe(0);
  });

  it('captures its current DOM and draft only for the targeted internal request, then removes listeners', async () => {
    const listener = [...messages][0]!; const reply = vi.fn();
    const message = { type: 'filter-demo-capture', tabId: 42, url: location.href };
    listener(message, { id: 'foreign' }, reply); listener(message, { id: 'own', tab: { id: 42 } }, reply);
    expect(reply).not.toHaveBeenCalled();
    listener(message, { id: 'own' }, reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledOnce());
    const response = reply.mock.calls[0]![0];
    expect(response.settings).toEqual(defaultRedactionSettings()); expect(isDomCaptureOutcome(response.capture)).toBe(true);
    expect(JSON.stringify(response.capture)).toContain('Alexander');
    events.get('pagehide')!(); expect(messages.size).toBe(0); expect(storageListeners.size).toBe(0);
  });
});
