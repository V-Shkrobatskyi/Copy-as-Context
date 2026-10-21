// @vitest-environment jsdom
// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_FILTERS, RULE_TYPES, CUSTOM_RULE_TYPES, isCustomRuleType, customRuleFromBuiltin, defaultRedactionSettings, exportRedactionSettings, validateRedactionSettings, REDACTION_LIMITS } from '@/src/core/privacy/settings';
import { isAutomaticType, PERSONAL_FIELD_TERMS } from '@/src/core/privacy/personal-data';
import { readFilterDemoDraft, writeFilterDemoDraft } from '@/src/filter-demo-draft';
import { REGEX_EXAMPLES } from '@/src/core/privacy/regex';

const key = 'redaction-filters-v1';
const managedGet = vi.fn();
const managedListeners = new Set<(...args: any[]) => void>();
let stored: unknown;
let getStored: ReturnType<typeof vi.fn>;
let setStored: ReturnType<typeof vi.fn>;
let clipboard: ReturnType<typeof vi.fn>;
let events: Map<string, EventListener>;
let getCurrentTab: ReturnType<typeof vi.fn>;
let removeTab: ReturnType<typeof vi.fn>;
let updateTab: ReturnType<typeof vi.fn>;
let createTab: ReturnType<typeof vi.fn>;
let sendRuntime: ReturnType<typeof vi.fn>;
let demoListeners: Set<any>;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
function chooseType(type: string, row = document.querySelector('.custom-rule')!) {
  const select = row.querySelector<HTMLSelectElement>('.rule-type-value select')!; select.value = type; select.dispatchEvent(new Event('change'));
}
const click = (id: string) => get<HTMLButtonElement>(id).click();
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function input(element: HTMLInputElement | HTMLTextAreaElement, text: string) { element.value = text; element.dispatchEvent(new Event('input')); }
function addRule(text = 'Acme', name = 'Client') {
  click('add-rule');
  input(document.querySelector<HTMLInputElement>('.custom-rule:last-child input[type="text"]')!, name);
  input(document.querySelector<HTMLTextAreaElement>('.custom-rule:last-child textarea')!, text);
}
function selectFile(text: string, size = text.length): void {
  const file = get<HTMLInputElement>('import-file');
  Object.defineProperty(file, 'files', { configurable: true, value: [{ size, text: async () => text }] });
  file.dispatchEvent(new Event('change'));
}
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  managedGet.mockReset().mockResolvedValue({}); managedListeners.clear();
  document.body.innerHTML = readFileSync(resolve('entrypoints/filters/index.html'), 'utf8').split('<body>')[1]!.split('</body>')[0]!;
  stored = undefined; sessionStorage.clear();
  getStored = vi.fn().mockImplementation(async () => ({ [key]: structuredClone(stored) }));
  setStored = vi.fn().mockImplementation(async value => { stored = structuredClone(value[key]); });
  clipboard = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  getCurrentTab = vi.fn().mockResolvedValue({ id: 7 });
  removeTab = vi.fn().mockResolvedValue(undefined);
  updateTab = vi.fn().mockResolvedValue({ id: 7 });
  createTab = vi.fn().mockResolvedValue({ id: 9 }); sendRuntime = vi.fn().mockResolvedValue(undefined); demoListeners = new Set();
  vi.doMock('wxt/browser', () => ({ browser: { storage: { managed: { get: managedGet }, onChanged: { addListener: (fn: (...args: any[]) => void) => managedListeners.add(fn), removeListener: (fn: (...args: any[]) => void) => managedListeners.delete(fn) }, local: { get: getStored, set: setStored } }, runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test${path}`, sendMessage: sendRuntime, onMessage: { addListener: (listener: any) => demoListeners.add(listener), removeListener: (listener: any) => demoListeners.delete(listener) } }, tabs: { getCurrent: getCurrentTab, remove: removeTab, create: createTab, update: updateTab } } }));
  events = new Map();
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: any) => { events.set(type, listener); });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await import('@/entrypoints/filters/main'); await settle();
});
afterEach(() => { events.get('pagehide')?.(new Event('pagehide')); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('Customize filter settings', () => {
  it('opens Demo in this tab and preserves the entire draft without saving preferences or triggering an unload warning', async () => {
    addRule('Acme', 'Client'); click('open-demo'); await settle();
    expect(createTab).not.toHaveBeenCalled(); expect(updateTab).toHaveBeenCalledOnce();
    expect(updateTab.mock.calls[0]![0]).toBe(7);
    const url = updateTab.mock.calls[0]![1].url as string;
    const session = url.split('#')[1]!;
    expect(readFilterDemoDraft(session)?.settings.customRules[0]).toMatchObject({ name: 'Client', text: 'Acme' });
    expect(readFilterDemoDraft(session)?.baseline).toBe(JSON.stringify(defaultRedactionSettings()));
    const event = new Event('beforeunload', { cancelable: true }); events.get('beforeunload')!(event);
    expect(event.defaultPrevented).toBe(false); expect(setStored).not.toHaveBeenCalled();
  });

  it('restores the unsaved draft, unfinished disabled rows and conflict baseline after returning from Demo', async () => {
    events.get('pagehide')!(new Event('pagehide')); vi.resetModules();
    const draft = { ...defaultRedactionSettings(), customRules: [{ id: 'client', name: 'Client', text: 'Acme', type: 'text' as const, caseSensitive: false, enabled: true }, { id: 'unfinished', name: '', text: '[', type: 'regex' as const, caseSensitive: false, enabled: false }] };
    writeFilterDemoDraft({ session: 'demo-return', settings: draft, baseline: JSON.stringify(defaultRedactionSettings()) });
    await import('@/entrypoints/filters/main'); await settle();
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(2);
    expect(get('status').textContent).toContain('Unsaved filter changes restored');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
    expect(setStored).not.toHaveBeenCalled();
    // Browser Back can restore a BFCache editor; its draft must not reload saved settings.
    events.get('pageshow')!({ persisted: true } as PageTransitionEvent); await settle();
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(2);
  });

  it('keeps the editor usable if navigation fails', async () => {
    addRule('Acme', 'Client'); updateTab.mockRejectedValue(new Error('unavailable'));
    click('open-demo'); await settle();
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
    expect(get('status').textContent).toContain('Your filter changes are still here');
  });

  it('tests page and link contexts without using a stale field label, and examples reset the context', () => {
    const context = get<HTMLSelectElement>('test-context'); context.value = 'link'; context.dispatchEvent(new Event('change'));
    expect(get('test-field-context').hidden).toBe(true);
    input(get<HTMLInputElement>('test-field-label'), 'Password');
    input(get<HTMLTextAreaElement>('test-input'), 'https://example.test/?token=short'); click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('https://example.test/?token=[REDACTED]');
    expect(get('test-label-result').hidden).toBe(true);
    click('load-example');
    expect(context.value).toBe('auto'); expect(get('test-field-context').hidden).toBe(false);
  });

  it('starts with email masking on and full email hiding off', () => {
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('.builtin')];
    expect(rows[8]!.querySelector<HTMLInputElement>('input')!.checked).toBe(true);
    expect(rows[9]!.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
    expect(rows[8]!.querySelector('.case-value')!.textContent).toBe('—');
    expect(rows[8]!.textContent).toContain('ASCII email addresses:');
  });

  it('offers only configurable custom types and no Duplicate action for automatic built-ins', () => {
    addRule('Acme');
    const select = document.querySelector<HTMLSelectElement>('.custom-rule .rule-type-value select')!;
    expect([...select.options].map(option => option.value)).toEqual(CUSTOM_RULE_TYPES.map(type => type.id));
    const rows = [...document.querySelectorAll('.builtin')];
    rows.forEach((row, index) => {
      expect(!!row.querySelector('[data-duplicate]')).toBe(isCustomRuleType(customRuleFromBuiltin(BUILTIN_FILTERS[index]!.id).type));
      expect(row.querySelector<HTMLSelectElement>('select')!.options).toHaveLength(1);
    });
  });

  it('rejects imported automatic custom types atomically without replacing the editor', async () => {
    addRule('Keep this draft', 'Existing');
    const file = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
    file.filters.push({ source: 'custom', id: 'forbidden', name: 'Forbidden', type: 'emailHide', matchingRule: '', caseSensitive: false, enabled: false });
    selectFile(JSON.stringify(file)); await settle();
    expect(get('status').textContent).toContain('built-in only');
    expect(document.querySelector<HTMLTextAreaElement>('.custom-rule textarea')!.value).toBe('Keep this draft');
    expect(setStored).not.toHaveBeenCalled();
  });

  it('inserts an email Regex example, tests it and saves/reloads the expression', async () => {
    addRule('', 'Emails'); chooseType('regex');
    const examples = document.querySelector<HTMLSelectElement>('.custom-rule .regex-examples')!;
    expect(examples.hidden).toBe(false);
    examples.value = 'emails'; examples.dispatchEvent(new Event('change'));
    expect(document.querySelector<HTMLTextAreaElement>('.custom-rule textarea')!.value).toBe(REGEX_EXAMPLES[0].pattern);
    const select = get<HTMLSelectElement>('test-rule'); select.value = [...select.options].find(option => option.value.startsWith('custom:'))!.value;
    input(get<HTMLTextAreaElement>('test-input'), 'Write to client@example.test.');
    click('test-selected'); expect(get<HTMLTextAreaElement>('test-output').value).toBe('Write to [REDACTED].');
    click('save-filters'); await settle(); click('reload-filters'); await settle();
    expect(document.querySelector<HTMLTextAreaElement>('.custom-rule textarea')!.value).toBe(REGEX_EXAMPLES[0].pattern);
    expect(document.querySelector<HTMLSelectElement>('.custom-rule .rule-type-value select')!.value).toBe('regex');
  });

  it('keeps Regex edits on cancelled example replacement and blocks invalid expressions', async () => {
    addRule('private-[0-9]+'); chooseType('regex');
    const examples = document.querySelector<HTMLSelectElement>('.custom-rule .regex-examples')!;
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    examples.value = 'aws'; examples.dispatchEvent(new Event('change'));
    const text = document.querySelector<HTMLTextAreaElement>('.custom-rule textarea')!;
    expect(text.value).toBe('private-[0-9]+');
    input(text, '[');
    expect(text.getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector('.custom-rule .rule-error')!.textContent).toContain('Invalid Regex');
    click('save-filters'); await settle();
    expect(setStored).not.toHaveBeenCalled();
    expect(get('status').textContent).toContain('Invalid Regex');
    input(text, 'private-[0-9]+');
    expect(text.getAttribute('aria-invalid')).toBe('false');
    chooseType('text'); expect(examples.hidden).toBe(true);
  });

  it('keeps one header per mode on reload and preserves edits when reload is cancelled', async () => {
    const headers = [...document.querySelectorAll('thead th')].map(header => header.textContent);
    click('reload-filters'); await settle();
    expect([...document.querySelectorAll('thead th')].map(header => header.textContent)).toEqual(headers);
    addRule('Keep this draft');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    click('reload-filters'); await settle();
    expect(document.querySelector<HTMLTextAreaElement>('.custom-rule textarea')!.value).toBe('Keep this draft');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
    expect([...document.querySelectorAll('thead th')].map(header => header.textContent)).toEqual(headers);
  });

  it('duplicates every configurable built-in as editable custom detectors and saves/reloads their modes', async () => {
    const configurable = BUILTIN_FILTERS.filter(filter => isCustomRuleType(customRuleFromBuiltin(filter.id).type));
    const builtins = [...document.querySelectorAll<HTMLButtonElement>('.builtin [data-duplicate]')];
    for (const duplicate of builtins) duplicate.click();
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(configurable.length);
    expect(document.querySelectorAll('.builtin td:first-child input:checked')).toHaveLength(BUILTIN_FILTERS.length - defaultRedactionSettings().disabledBuiltins.length);
    expect([...document.querySelectorAll<HTMLSelectElement>('.builtin select')].every(input => input.disabled)).toBe(true);
    const expected = validateRedactionSettings({ ...defaultRedactionSettings(), customRules: configurable.map((builtin, index) => ({
      ...customRuleFromBuiltin(builtin.id), id: `copy-${index}`, name: `${builtin.name} copy`,
    })) });
    // IDs are generated by the UI, so compare semantic settings independently.
    click('save-filters'); await settle();
    const actual = stored as ReturnType<typeof defaultRedactionSettings>;
    expect(actual.customRules.map(rule => ({ ...rule, id: rule.name }))).toEqual(expected.customRules.map(rule => ({ ...rule, id: rule.name })));
    const exported = exportRedactionSettings(actual);
    click('restore-defaults');
    selectFile(exported); await settle();
    const rows = [...document.querySelectorAll('.custom-rule')];
    expect(rows).toHaveLength(configurable.length);
    for (let index = 0; index < rows.length; index++) {
      expect(rows[index]!.querySelector<HTMLSelectElement>('.rule-type-value select')!.value).toBe(actual.customRules[index]!.type);
    }
    input(rows[1]!.querySelector<HTMLTextAreaElement>('textarea')!, 'CustomAuth');
    document.querySelectorAll<HTMLInputElement>('.builtin td:first-child input').forEach(toggle => { if (toggle.checked) toggle.click(); });
    input(get<HTMLTextAreaElement>('test-input'), 'CustomAuth abcdefghijkl'); click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('CustomAuth [REDACTED]');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
  });

  it.each(CUSTOM_RULE_TYPES)('saves, reloads and edits the selected $id type after saving', async type => {
    addRule('client_key'); chooseType(type.id);
    click('save-filters'); await settle();
    click('reload-filters'); await settle();
    expect(document.querySelector<HTMLSelectElement>('.custom-rule .rule-type-value select')!.value).toBe(type.id);
    expect(stored).toEqual(expect.objectContaining({ customRules: [expect.objectContaining({ type: type.id })] }));
    chooseType(type.id === 'text' ? 'jwt' : 'text');
    if (isAutomaticType(type.id)) input(document.querySelector<HTMLTextAreaElement>('.custom-rule textarea')!, 'Acme');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
    click('save-filters'); await settle();
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(true);
  });

  it('shows old combined rules as separate typed rows and saves the migration without sample data', async () => {
    selectFile(JSON.stringify({ version: 1, disabledBuiltins: [], customRules: [{ id: 'old', name: 'Old', text: 'client_key', caseSensitive: false, enabled: true, fieldLabels: true, wholeWords: true, urlParameters: true }] }));
    await settle();
    expect([...document.querySelectorAll<HTMLSelectElement>('.custom-rule .rule-type-value select')].map(select => select.value)).toEqual(['fieldWords', 'urlParameters']);
    expect(document.querySelectorAll('.custom-rule input[type=checkbox]')).toHaveLength(4);
    input(get<HTMLInputElement>('test-field-label'), 'Client_key');
    input(get<HTMLTextAreaElement>('test-input'), 'short'); click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('[REDACTED]');
    click('save-filters'); await settle();
    expect(JSON.stringify(stored)).not.toContain('wholeWords');
    expect(JSON.stringify(stored)).not.toContain('short');
  });

  it('tests one off custom rule independently while other rows are unfinished', () => {
    addRule('ACME', 'My custom filter');
    const selectedKey = [...get<HTMLSelectElement>('test-rule').options].find(option => option.textContent?.includes('My custom filter'))!.value;
    document.querySelector<HTMLInputElement>('.custom-rule td:first-child input')!.click();
    addRule('', 'Unfinished');
    const select = get<HTMLSelectElement>('test-rule'); select.value = selectedKey; select.dispatchEvent(new Event('change'));
    input(get<HTMLTextAreaElement>('test-input'), 'ACME token=abcdefgh');
    click('test-selected');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('[REDACTED] token=abcdefgh');
    expect(get('test-count').textContent).toContain('1 matched rule · 1 rule tested (selected only)');
    expect(get('test-matches').textContent).toContain('My custom filter');
    expect(document.querySelector<HTMLInputElement>('.custom-rule td:first-child input')!.checked).toBe(false);
    expect(setStored).not.toHaveBeenCalled(); expect(clipboard).not.toHaveBeenCalled();
    click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('');
    expect(get('test-matches').textContent).toBe('');
    expect(get('status').textContent).toContain('Complete the filters being tested');
  });

  it('lists overlapping and field-hidden matches independently and shows the label result', () => {
    input(get<HTMLInputElement>('test-field-label'), 'Token');
    input(get<HTMLTextAreaElement>('test-input'), 'eyJabcde.abcde.abcde'); click('test-filters');
    expect(get('test-count').textContent).toContain('1 replacement · 2 matched rules');
    expect(get('test-matches').textContent).toContain('Sensitive field values');
    expect(get('test-matches').textContent).toContain('JWTs');
    expect(get('test-label-result').hidden).toBe(false);
    expect(get<HTMLInputElement>('test-label-output').value).toBe('Token');
    input(get<HTMLInputElement>('test-field-label'), 'Public');
    expect(get('test-match-results').hidden).toBe(true);
    expect(get<HTMLInputElement>('test-label-output').value).toBe('');
  });

  it('loads synthetic examples for the selected unsaved type without saving or changing filter states', () => {
    addRule('CustomAuth', 'New auth'); chooseType('authorization');
    const select = get<HTMLSelectElement>('test-rule'); select.value = [...select.options].find(option => option.textContent?.includes('New auth'))!.value;
    select.dispatchEvent(new Event('change'));
    click('load-example');
    expect(get<HTMLTextAreaElement>('test-input').value).toBe('CustomAuth synthetic12345');
    expect(get('example-feedback').textContent).toContain('matching example');
    click('test-selected'); expect(get<HTMLTextAreaElement>('test-output').value).toBe('CustomAuth [REDACTED]');
    click('load-near-miss');
    expect(get<HTMLTextAreaElement>('test-input').value).toBe('CustomAuth abc');
    expect(get('test-match-results').hidden).toBe(true);
    click('test-selected'); expect(get<HTMLTextAreaElement>('test-output').value).toBe('CustomAuth abc');
    expect(get('test-matches').textContent).toContain('No rules matched');
    expect(setStored).not.toHaveBeenCalled(); expect(clipboard).not.toHaveBeenCalled();
  });

  it('loads field examples, keeps the chosen rule across edits, and clears diagnostic data on pagehide', () => {
    const select = get<HTMLSelectElement>('test-rule'); select.value = 'builtin:sensitive-fields';
    click('load-example');
    expect(get<HTMLInputElement>('test-field-label').value).toBe('password');
    click('test-selected'); expect(get<HTMLTextAreaElement>('test-output').value).toBe('[REDACTED]');
    addRule();
    expect(select.value).toBe('builtin:sensitive-fields');
    click('load-example'); click('test-selected');
    events.get('pagehide')!(new Event('pagehide'));
    expect(get<HTMLInputElement>('test-field-label').value).toBe('');
    expect(get<HTMLTextAreaElement>('test-input').value).toBe('');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('');
    expect(get<HTMLInputElement>('test-label-output').value).toBe('');
    expect(get('test-matches').textContent).toBe('');
  });

  it('renders private filter names as text and refreshes the selection when a custom rule is removed', () => {
    addRule('ACME', '<img src=x onerror=alert(1)>');
    const select = get<HTMLSelectElement>('test-rule'); select.value = [...select.options].find(option => option.value.startsWith('custom:'))!.value;
    click('load-example'); click('test-selected');
    expect(get('test-matches').querySelector('img')).toBeNull();
    expect(get('test-matches').textContent).toContain('<img');
    document.querySelector<HTMLButtonElement>('.custom-rule button')!.click();
    expect(select.value).toBe('builtin:sensitive-fields');
    expect(get('test-match-results').hidden).toBe(true);
  });

  it('closes the current settings tab without confirmation when there are no unsaved changes', async () => {
    click('close-filters'); await settle();
    expect(removeTab).toHaveBeenCalledExactlyOnceWith(7);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(setStored).not.toHaveBeenCalled();
  });
  it('preserves edits when closing is cancelled and avoids a second prompt after confirmation', async () => {
    addRule();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    click('close-filters'); await settle();
    expect(removeTab).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLTextAreaElement>('.custom-rule textarea')!.value).toBe('Acme');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
    click('close-filters'); await settle();
    expect(removeTab).toHaveBeenCalledExactlyOnceWith(7);
    const event = new Event('beforeunload', { cancelable: true }); events.get('beforeunload')!(event);
    expect(event.defaultPrevented).toBe(false);
    expect(setStored).not.toHaveBeenCalled();
  });
  it.each(['missing tab', 'API failure'])('restores editing and unload protection after a close failure: %s', async failure => {
    addRule();
    if (failure === 'missing tab') getCurrentTab.mockResolvedValueOnce(undefined);
    else removeTab.mockRejectedValueOnce(new Error('private failure details'));
    click('close-filters'); await settle();
    expect(get('status').textContent).toContain('Unable to close');
    expect(get('status').textContent).not.toContain('private failure details');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
    const event = new Event('beforeunload', { cancelable: true }); events.get('beforeunload')!(event);
    expect(event.defaultPrevented).toBe(true);
    click('close-filters'); await settle();
    expect(removeTab).toHaveBeenLastCalledWith(7);
  });
  it('loads safe defaults without capturing, writing preferences or copying anything', () => {
    expect(document.querySelectorAll('.builtin td:first-child input:checked')).toHaveLength(BUILTIN_FILTERS.length - defaultRedactionSettings().disabledBuiltins.length);
    expect(get('empty-rules').hidden).toBe(false);
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(true);
    expect(setStored).not.toHaveBeenCalled(); expect(clipboard).not.toHaveBeenCalled();
  });
  it('edits built-in case sensitivity, tests the change, and persists it through Save and Reload', async () => {
    const index = BUILTIN_FILTERS.findIndex(filter => filter.id === 'github');
    const toggle = document.querySelectorAll<HTMLInputElement>('.builtin .case-value input')[index]!;
    expect(toggle.checked).toBe(true); expect(toggle.disabled).toBe(false);
    input(get<HTMLTextAreaElement>('test-input'), 'GHP_abcdefghijklmnopqrstuvwxyz');
    click('test-filters'); expect(get<HTMLTextAreaElement>('test-output').value).toBe('GHP_abcdefghijklmnopqrstuvwxyz');
    toggle.click(); expect(get<HTMLTextAreaElement>('test-output').value).toBe('');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
    click('test-filters'); expect(get<HTMLTextAreaElement>('test-output').value).toBe('[REDACTED]');
    click('save-filters'); await settle();
    expect(stored).toEqual(expect.objectContaining({ builtinCaseSensitivity: { github: false } }));
    click('reload-filters'); await settle();
    const restored = document.querySelectorAll<HTMLInputElement>('.builtin .case-value input')[index]!;
    expect(restored.checked).toBe(false); expect(restored.disabled).toBe(false);
    restored.click();
    click('save-filters'); await settle();
    expect(stored).not.toHaveProperty('builtinCaseSensitivity');
  });
  it('saves toggles and literal rules in their own storage key, excluding sample text', async () => {
    addRule();
    const builtin = document.querySelector<HTMLInputElement>('.builtin td:first-child input')!;
    builtin.checked = false; builtin.dispatchEvent(new Event('change'));
    input(get<HTMLTextAreaElement>('test-input'), 'private sample');
    click('save-filters'); await settle();
    expect(setStored).toHaveBeenCalledExactlyOnceWith({ [key]: expect.objectContaining({ disabledBuiltins: ['sensitive-fields', ...defaultRedactionSettings().disabledBuiltins], customRules: [expect.objectContaining({ text: 'Acme', name: 'Client', enabled: true, caseSensitive: false })] }) });
    expect(JSON.stringify(stored)).not.toContain('private sample');
    expect(get('status').textContent).toContain('Filters saved');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(true);
  });
  it.each(['name', 'text', 'enabled', 'caseSensitive', 'type'] as const)('keeps %s editable across repeated saves', async field => {
    addRule();
    click('save-filters'); await settle();
    for (const value of field === 'name' ? ['Updated client', 'Client'] : field === 'text' ? ['New secret', 'Acme'] : field === 'type' ? ['jwt', 'text'] : field === 'enabled' ? [false, true] : [true, false]) {
      if (field === 'name' || field === 'text') {
        input(document.querySelector<HTMLInputElement | HTMLTextAreaElement>(field === 'name' ? '.custom-rule input[type="text"]' : '.custom-rule textarea')!, value as string);
      } else if (field === 'type') chooseType(value as string);
      else {
        const toggle = document.querySelector<HTMLInputElement>(field === 'enabled' ? '.custom-rule td:first-child input' : '.custom-rule .case-value input')!;
        toggle.checked = value as boolean;
        toggle.dispatchEvent(new Event('change'));
      }
      expect(get<HTMLButtonElement>('save-filters').disabled).toBe(false);
      click('save-filters'); await settle();
      expect(stored).toEqual(expect.objectContaining({ customRules: [expect.objectContaining({ [field]: value })] }));
      expect(get<HTMLButtonElement>('save-filters').disabled).toBe(true);
    }
  });
  it('tests and persists custom URL modes with all built-in filters switched off', async () => {
    for (const toggle of document.querySelectorAll<HTMLInputElement>('.builtin td:first-child input')) { if (toggle.checked) toggle.click(); }
    expect([...document.querySelectorAll<HTMLSelectElement>('.builtin select')].every(select => select.disabled)).toBe(true);
    addRule('client_key / token');
    chooseType('urlParameters');
    input(get<HTMLTextAreaElement>('test-input'), 'client_key https://example.test/?client_key=abc&token=xyz&x=keep');
    click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('client_key https://example.test/?client_key=[REDACTED]&token=[REDACTED]&x=keep');
    click('save-filters'); await settle(); click('reload-filters'); await settle();
    expect(document.querySelector<HTMLSelectElement>('.custom-rule .rule-type-value select')!.value).toBe('urlParameters');
    expect(stored).toEqual(expect.objectContaining({ disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id), customRules: [expect.objectContaining({ type: 'urlParameters' })] }));
  });
  it.each([
    ['email-mask-domain', 'ASCII email addresses:', 'name+tag@sub.example.com'],
    ['email-hide', 'ASCII email addresses:', 'name+tag@sub.example.com'],
    ['phone-mask', '8–15 digits;', 'Phone / Telephone / Tel / Mobile / Fax'],
    ['phone-numbers', '8–15 digits;', 'Phone / Telephone / Tel / Mobile / Fax'],
    ['payment-cards', '13–19 digits', 'Luhn checksum'],
    ['iban', 'country code + 2 check digits', 'MOD-97 checksum'],
  ] as const)('describes the fixed detection criteria for %s without editable matching text', (id, format, criterion) => {
    const row = [...document.querySelectorAll('.builtin')][BUILTIN_FILTERS.findIndex(filter => filter.id === id)]!;
    expect(row.children[2]!.textContent).toContain(format);
    expect(row.children[2]!.textContent).toContain(criterion);
    expect(row.querySelector('textarea')).toBeNull();
    expect(row.querySelector('button')).toBeNull();
    expect(customRuleFromBuiltin(id).text).toBe('');
  });

  it('shows both personal field actions as automatic built-ins with fixed matching behavior', () => {
    for (const [id, name] of [['personal-fields-mask', 'Mask personal field values (English labels)'], ['personal-fields', 'Hide personal field values (English labels)']]) {
      const toggle = document.querySelector<HTMLInputElement>(`label[title="Enable ${name}"] input`)!;
      const row = toggle.closest('tr')!;
      expect(row.querySelector('code')!.textContent).toBe(PERSONAL_FIELD_TERMS);
      expect(row.querySelector('textarea')).toBeNull();
      expect(customRuleFromBuiltin(id as 'personal-fields').text).toBe('');
      expect(row.querySelector('button')).toBeNull();
      expect(row.querySelector('select')!.value).toBe(customRuleFromBuiltin(id as 'personal-fields').type);
      expect(row.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    }
  });

  it('shows fixed built-in label behavior and uses the same list separator in both custom modes', async () => {
    const builtinTypes = document.querySelectorAll<HTMLSelectElement>('.builtin select');
    expect(builtinTypes).toHaveLength(BUILTIN_FILTERS.length);
    expect([...builtinTypes].map(select => select.value)).toEqual(BUILTIN_FILTERS.map(filter => customRuleFromBuiltin(filter.id).type));
    expect([...builtinTypes].every(select => select.disabled)).toBe(true);
    expect([...builtinTypes[0]!.options].map(option => option.value)).toEqual(['fieldWords']);
    expect(document.querySelector('.builtin code')!.textContent).toBe(customRuleFromBuiltin('sensitive-fields').text);
    addRule('pass / private');
    input(get<HTMLTextAreaElement>('test-input'), 'pass and private'); click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('[REDACTED] and [REDACTED]');
    chooseType('fieldLabels');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('');
    click('test-filters'); expect(get<HTMLTextAreaElement>('test-output').value).toBe('pass and private');
    input(get<HTMLInputElement>('test-field-label'), 'Pass phrase');
    click('test-filters'); expect(get<HTMLTextAreaElement>('test-output').value).toBe('[REDACTED]');
    click('save-filters'); await settle(); click('reload-filters'); await settle();
    expect(document.querySelector<HTMLSelectElement>('.custom-rule .rule-type-value select')!.value).toBe('fieldLabels');
    expect([...document.querySelectorAll<HTMLSelectElement>('.builtin select')].every(flag => flag.disabled)).toBe(true);
  });
  it('tests unsaved rules safely and invalidates results when sample or rules change', () => {
    addRule('<script>Acme</script>');
    input(get<HTMLTextAreaElement>('test-input'), 'before <script>Acme</script> after');
    click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('before [REDACTED] after');
    expect(document.querySelector('#custom-rules script')).toBeNull();
    expect(setStored).not.toHaveBeenCalled();
    input(get<HTMLTextAreaElement>('test-input'), 'changed');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('');
  });
  it.each([
    ['authorization', 'Bearer abcdefghijklmnop'], ['jwt', 'eyJabcdef.abcdefgh.abcdefgh'],
    ['github', 'ghp_abcdefghijklmnopqrstuvwxyz'], ['aws', 'AKIA0123456789ABCDEF'],
    ['openai', 'sk-abcdefghijklmnop'], ['assignments', 'token=abcdefghijk'],
    ['query-values', 'https://example.test/?token=short'],
  ] as const)('tests enabled built-in %s and respects its toggle before saving', (id, sample) => {
    input(get<HTMLTextAreaElement>('test-input'), sample); click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toContain('[REDACTED]');
    const index = BUILTIN_FILTERS.findIndex(filter => filter.id === id);
    const toggle = document.querySelectorAll<HTMLInputElement>('.builtin td:first-child input')[index]!;
    toggle.checked = false; toggle.dispatchEvent(new Event('change'));
    click('test-filters');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe(sample);
    expect(setStored).not.toHaveBeenCalled();
  });

  it('tests Sensitive field values with an optional label and clears stale results when the label changes', () => {
    const label = get<HTMLInputElement>('test-field-label');
    const sample = get<HTMLTextAreaElement>('test-input');
    const result = get<HTMLTextAreaElement>('test-output');
    input(sample, 'short'); click('test-filters'); expect(result.value).toBe('short');
    input(label, 'API key'); expect(result.value).toBe('');
    click('test-filters'); expect(result.value).toBe('[REDACTED]');
    input(label, 'Public field'); expect(result.value).toBe('');
    click('test-filters'); expect(result.value).toBe('short');
    input(label, 'API key');
    const toggle = document.querySelector<HTMLInputElement>('.builtin td:first-child input')!;
    toggle.checked = false; toggle.dispatchEvent(new Event('change'));
    click('test-filters'); expect(result.value).toBe('short');
    expect(setStored).not.toHaveBeenCalled();
    events.get('pagehide')!(new Event('pagehide'));
    expect(label.value).toBe(''); expect(sample.value).toBe(''); expect(result.value).toBe('');
  });

  it('opens the file picker directly and imports valid files into the table', async () => {
    const picker = vi.spyOn(get<HTMLInputElement>('import-file'), 'click').mockImplementation(() => {});
    click('show-import');
    expect(picker).toHaveBeenCalledOnce();
    const settings = { ...defaultRedactionSettings(), disabledBuiltins: ['github'] as const };
    selectFile(JSON.stringify(settings)); await settle();
    expect(document.querySelectorAll('.builtin td:first-child input:checked')).toHaveLength(BUILTIN_FILTERS.length - settings.disabledBuiltins.length);
    expect(get('status').textContent).toContain('Filters imported');
    expect(setStored).not.toHaveBeenCalled();
    click('save-filters'); await settle();
    expect(stored).toEqual({ ...settings, customRules: [] });
  });
  it('preserves unsaved filters when an import is cancelled and replaces them after confirmation', async () => {
    addRule();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    selectFile(exportRedactionSettings(defaultRedactionSettings())); await settle();
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(1);
    selectFile(exportRedactionSettings(defaultRedactionSettings())); await settle();
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(0);
    expect(setStored).not.toHaveBeenCalled();
  });
  it('restores defaults in the form after confirmation and requires Save to apply them', async () => {
    addRule(); click('save-filters'); await settle();
    vi.mocked(window.confirm).mockReturnValueOnce(false); click('restore-defaults');
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(1);
    click('restore-defaults'); expect(document.querySelectorAll('.custom-rule')).toHaveLength(0);
    expect(setStored).toHaveBeenCalledOnce();
    click('save-filters'); await settle();
    expect(stored).toEqual(defaultRedactionSettings());
  });
  it('keeps unsaved changes after a storage failure or concurrent update and allows recovery', async () => {
    addRule(); setStored.mockRejectedValueOnce(new Error('private failure details'));
    click('save-filters'); await settle();
    expect(get('status').textContent).toContain('Unable to save');
    expect(get('status').textContent).not.toContain('private failure details');
    expect(document.querySelector<HTMLTextAreaElement>('.custom-rule textarea')!.value).toBe('Acme');
    stored = { ...defaultRedactionSettings(), disabledBuiltins: ['github'] };
    click('save-filters'); await settle();
    expect(get('status').textContent).toContain('changed in another tab');
    click('reload-filters'); await settle();
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(0);
  });
  it('can replace unreadable saved settings only after an explicit restore and save', async () => {
    stored = { version: 99 };
    click('reload-filters'); await settle();
    expect(get('status').textContent).toContain('Unable to load');
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(true);
    expect(setStored).not.toHaveBeenCalled();
    click('restore-defaults'); click('save-filters'); await settle();
    expect(stored).toEqual(defaultRedactionSettings());
  });
  it('warns about unsaved filter changes and clears sample text when leaving', () => {
    addRule();
    const event = new Event('beforeunload', { cancelable: true }); events.get('beforeunload')!(event);
    expect(event.defaultPrevented).toBe(true);
    input(get<HTMLTextAreaElement>('test-input'), 'do not persist');
    events.get('pagehide')!(new Event('pagehide'));
    expect(get<HTMLTextAreaElement>('test-input').value).toBe('');
    expect(get<HTMLTextAreaElement>('test-output').value).toBe('');
    expect(exportRedactionSettings(defaultRedactionSettings())).toContain('"version": 13');
  });

  it('rejects malformed or oversized files without changing the table', async () => {
    addRule();
    selectFile('{'); await settle();
    expect(get('status').textContent).toContain('Invalid JSON');
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(1);
    selectFile('{}', REDACTION_LIMITS.json + 1);
    expect(get('status').textContent).toContain('too large');
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(1);
    selectFile('{"version":99}'); await settle();
    expect(get('status').textContent).toContain('Invalid filters');
    expect(document.querySelectorAll('.custom-rule')).toHaveLength(1);
    expect(setStored).not.toHaveBeenCalled();
  });

  it('exports immediately as a file containing all built-in and custom filters', async () => {
    addRule('a.b$&');
    const builtin = document.querySelector<HTMLInputElement>('.builtin td:first-child input')!;
    builtin.checked = false; builtin.dispatchEvent(new Event('change'));
    const createObjectURL = vi.fn().mockReturnValue('blob:filters');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('Blob', NodeBlob);
    let downloaded: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloaded = this; });
    click('export-filters'); await settle();
    expect(downloaded?.download).toBe('copy-as-context-filters.json');
    expect(downloaded?.href).toBe('blob:filters');
    const exported = JSON.parse(await createObjectURL.mock.calls[0]![0].text());
    expect(exported.version).toBe(13);
    const builtins = exported.filters.filter((filter: { source: string }) => filter.source === 'builtin');
    expect(builtins).toHaveLength(BUILTIN_FILTERS.length);
    expect(builtins[0]).toMatchObject({ id: 'sensitive-fields', enabled: false, name: 'Sensitive field values', matchingRule: expect.stringContaining('password') });
    expect(exported.filters.find((filter: { source: string }) => filter.source === 'custom').matchingRule).toBe('a.b$&');
    expect(setStored).not.toHaveBeenCalled(); expect(clipboard).not.toHaveBeenCalled();
    events.get('pagehide')!(new Event('pagehide'));
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:filters');
  });

  it('recovers from a download failure without showing success or copying JSON', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => { throw new Error('private details'); }), revokeObjectURL: vi.fn() });
    click('export-filters'); await settle();
    expect(get('status').textContent).toContain('Unable to download');
    expect(get('status').textContent).not.toContain('private details');
    expect(clipboard).not.toHaveBeenCalled();
    expect(get<HTMLButtonElement>('export-filters').disabled).toBe(false);
  });

});


describe('managed filter settings', () => {
  it('shows mandatory filters read-only and retains them after importing personal defaults', async () => {
    managedGet.mockResolvedValue({ RequiredBuiltinFilters: ['authorization'], ManagedRedactionRules: [{ id: 'company', name: 'Company rule', type: 'text', text: 'SYNTHETIC_PROJECT', enabled: true, caseSensitive: false }] });
    for (const fn of managedListeners) fn({}, 'managed');
    await vi.waitFor(() => expect(get('managed-rules').textContent).toContain('Company rule'));
    const row = document.querySelector<HTMLTableRowElement>('tr[data-required="true"]')!;
    expect(row).not.toBeNull(); expect(row.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    expect(get('managed-filters').hidden).toBe(false);
    selectFile(exportRedactionSettings(defaultRedactionSettings())); await settle();
    expect(get('managed-rules').textContent).toContain('SYNTHETIC_PROJECT');
    expect(document.querySelector<HTMLInputElement>('tr[data-required="true"] input')!.disabled).toBe(true);
  });
  it('disables personal changes and filter downloads according to policy', async () => {
    managedGet.mockResolvedValue({ UserRedactionRulesAllowed: false, FileExportAllowed: false });
    for (const fn of managedListeners) fn({}, 'managed');
    await vi.waitFor(() => expect(get('organization-policy').textContent).toContain('Personal filter changes are disabled'));
    expect(get<HTMLButtonElement>('add-rule').disabled).toBe(true);
    expect(get<HTMLButtonElement>('show-import').disabled).toBe(true);
    expect(get<HTMLButtonElement>('restore-defaults').disabled).toBe(true);
    expect(get<HTMLButtonElement>('save-filters').disabled).toBe(true);
    expect(get<HTMLButtonElement>('export-filters').disabled).toBe(true);
    expect(setStored).not.toHaveBeenCalled();
  });
});


it('blocks the directly opened Customize page and clears its rules when access is revoked', async () => {
  managedGet.mockResolvedValue({ FilterSettingsAllowed: false });
  getStored.mockClear();
  for (const fn of managedListeners) fn({}, 'managed');
  await vi.waitFor(() => expect(get('status').textContent).toContain('Filter settings are disabled'));
  expect(document.querySelector<HTMLElement>('.filters-section')!.hidden).toBe(true);
  expect(get('test-panel').hidden).toBe(true); expect(get('builtins').children.length).toBe(0);
  expect(getStored).not.toHaveBeenCalled();
  expect(get<HTMLButtonElement>('save-filters').disabled).toBe(true);
  expect(get<HTMLButtonElement>('close-filters').disabled).toBe(false);
  managedGet.mockResolvedValue({});
  for (const fn of managedListeners) fn({}, 'managed');
  await vi.waitFor(() => expect(get('builtins').children.length).toBeGreaterThan(0));
  expect(document.querySelector<HTMLElement>('.filters-section')!.hidden).toBe(false);
});


it('shows policy-enabled and policy-disabled built-ins read-only and keeps them after personal resets', async () => {
  managedGet.mockResolvedValue({ RequiredBuiltinFilters: ['email-hide'], DisabledBuiltinFilters: ['authorization'] });
  for (const fn of managedListeners) fn({}, 'managed');
  await vi.waitFor(() => expect(document.querySelectorAll('tr[data-managed="true"]')).toHaveLength(2));
  function verify() {
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('tr[data-managed="true"]')];
    const on = rows.find(row => row.dataset.required === 'true')!.querySelector<HTMLInputElement>('input')!;
    const off = rows.find(row => row.dataset.required !== 'true')!.querySelector<HTMLInputElement>('input')!;
    expect(on.checked).toBe(true); expect(on.disabled).toBe(true);
    expect(off.checked).toBe(false); expect(off.disabled).toBe(true);
    expect([...get<HTMLSelectElement>('test-rule').options].find(option => option.textContent?.includes('Authorization values'))!.textContent).toContain('(off)');
  }
  verify();
  vi.spyOn(window, 'confirm').mockReturnValue(true); click('restore-defaults'); verify();
  selectFile(exportRedactionSettings(defaultRedactionSettings())); await settle(); verify();
  managedGet.mockResolvedValue({}); for (const fn of managedListeners) fn({}, 'managed');
  await vi.waitFor(() => expect(document.querySelectorAll('tr[data-managed="true"]')).toHaveLength(0));
});
