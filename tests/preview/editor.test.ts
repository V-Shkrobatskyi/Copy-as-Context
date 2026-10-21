// @vitest-environment jsdom
// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewPayload } from '@/src/preview-message';
import { MAX_PREVIEW_CHARACTERS } from '@/src/preview-message';
import { wrapClipboardContext } from '@/src/clipboard-context';

let accept!: (payload: PreviewPayload) => void;
let unavailable!: () => void;
const stop = vi.fn();
const writeText = vi.fn();
const remove = vi.fn();
const saveFile = vi.fn();
const requestPermission = vi.fn();
const managedGet = vi.fn();
const policyListeners = new Set<(...args: any[]) => void>();
const payload: PreviewPayload = { content: '<script>private text stays inert</script>\n', format: 'markdown', compression: 'compact', redactSensitiveData: true, redactionCount: 3, reductionRatio: .78, warnings: ['embedded-frames-partial'] };
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = () => element<HTMLTextAreaElement>('context');
const button = (id: string) => element<HTMLButtonElement>(id);
async function readyPolicy() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
const input = (text: string) => { editor().value = text; editor().dispatchEvent(new Event('input')); };
const search = (text: string) => {
  const field = element<HTMLInputElement>('find-text');
  field.value = text; field.dispatchEvent(new Event('input')); return field;
};
let beforeUnload: EventListener;
let pageHide: EventListener;
async function loadEditor(firefox = false, os = 'linux') {
  managedGet.mockReset().mockResolvedValue({}); policyListeners.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubEnv('BROWSER', firefox ? 'firefox' : 'chrome');
  vi.useFakeTimers();
  const page = new DOMParser().parseFromString(readFileSync(resolve('entrypoints/preview/index.html'), 'utf8'), 'text/html');
  document.body.className = page.body.className;
  document.body.innerHTML = page.body.innerHTML;
  location.hash = '11111111-2222-4333-8444-555555555555';
  writeText.mockReset().mockResolvedValue(undefined);
  stop.mockReset(); remove.mockReset().mockResolvedValue(undefined);
  saveFile.mockReset().mockResolvedValue(undefined);
  requestPermission.mockReset().mockResolvedValue(true);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: any) => {
    if (type === 'beforeunload') beforeUnload = listener;
    if (type === 'pagehide') pageHide = listener;
  });
  vi.doMock('wxt/browser', () => ({ browser: {
    storage: { managed: { get: managedGet }, onChanged: { addListener: (fn: (...args: any[]) => void) => policyListeners.add(fn), removeListener: (fn: (...args: any[]) => void) => policyListeners.delete(fn) } },
    tabs: { getCurrent: vi.fn().mockResolvedValue({ id: 4 }), remove },
    runtime: { getPlatformInfo: vi.fn().mockResolvedValue({ os }) },
    downloads: { download: vi.fn() }, permissions: { request: requestPermission },
  } }));
  vi.doMock('@/src/save-context', () => ({ saveContextFile: saveFile }));
  vi.doMock('@/src/preview-session', () => ({ receivePreview: vi.fn((_token, ready, fail) => { accept = ready; unavailable = fail; return stop; }) }));
  await import('@/entrypoints/preview/main');
}
beforeEach(() => loadEditor());
afterEach(() => {
  pageHide?.(new Event('pagehide'));
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules();
});

describe('preview editor', async () => {
  it('finds literal text, counts matches, navigates in both directions and wraps', async () => {
    accept({ ...payload, content: 'a.b A.B aXb a.b' }); await readyPolicy();
    search('a.b');
    expect(element('find-status').textContent).toBe('3 matches.');
    editor().setSelectionRange(0, 0);
    button('find-next').click();
    expect([editor().selectionStart, editor().selectionEnd]).toEqual([0, 3]);
    expect(element('find-status').textContent).toBe('1 of 3 matches.');
    button('find-previous').click();
    expect(editor().selectionStart).toBe(12);
    button('find-next').click();
    expect(editor().selectionStart).toBe(0);
    const matchCase = element<HTMLInputElement>('match-case');
    matchCase.checked = true; matchCase.dispatchEvent(new Event('change'));
    expect(element('find-status').textContent).toBe('1 of 2 matches.');
    expect(editor().value).toBe('a.b A.B aXb a.b');
    expect(element('edited').hidden).toBe(true);
  });

  it('disables actions for empty queries and missing matches', async () => {
    accept(payload); await readyPolicy();
    for (const query of ['', 'missing text']) {
      search(query);
      for (const id of ['find-previous', 'find-next', 'replace-one', 'replace-all']) expect(button(id).disabled).toBe(true);
    }
    expect(element('find-status').textContent).toBe('No matches.');
  });

  it('replaces one selected match, advances, updates dirty state and copies exact edits', async () => {
    accept({ ...payload, content: 'cat cat cat' }); await readyPolicy();
    search('cat');
    editor().setSelectionRange(4, 7);
    element<HTMLInputElement>('replace-text').value = 'dog';
    button('replace-one').click();
    expect(editor().value).toBe('cat dog cat');
    expect(editor().selectionStart).toBe(8);
    expect(element('edited').hidden).toBe(false);
    const event = new Event('beforeunload', { cancelable: true }); beforeUnload(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(120);
    button('copy').click(); await readyPolicy();
    expect(writeText).toHaveBeenCalledWith(wrapClipboardContext('cat dog cat', 'compact'));
  });

  it('replaces the next match if the editor selection is not a complete match', async () => {
    accept({ ...payload, content: 'cat cat' }); await readyPolicy(); search('cat');
    editor().setSelectionRange(1, 2);
    element<HTMLInputElement>('replace-text').value = 'dog';
    button('replace-one').click();
    expect(editor().value).toBe('cat dog');
  });

  it('replaces all non-overlapping matches once with literal replacement characters', async () => {
    accept({ ...payload, content: '😀 Cat cat' }); await readyPolicy(); search('cat');
    element<HTMLInputElement>('replace-text').value = '$&cat';
    button('replace-all').click();
    expect(editor().value).toBe('😀 $&cat $&cat');
    expect(element('find-status').textContent).toBe('Replaced 2 matches.');
    expect(element('edited').hidden).toBe(false);
  });

  it('supports deletion, refreshes after manual edits and keeps search active after reset', async () => {
    accept({ ...payload, content: 'cat cat' }); await readyPolicy(); search('cat');
    button('replace-all').click();
    expect(editor().value).toBe(' ');
    await vi.advanceTimersByTimeAsync(120);
    expect(button('copy').disabled).toBe(true);
    expect(button('replace-one').disabled).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    button('reset').click();
    expect(editor().value).toBe('cat cat');
    expect(button('replace-all').disabled).toBe(false);
    input('no hits'); await vi.advanceTimersByTimeAsync(120);
    expect(element('find-status').textContent).toBe('No matches.');
  });

  it('rejects oversized replacement without changing the draft', async () => {
    accept({ ...payload, content: 'x'.repeat(MAX_PREVIEW_CHARACTERS) }); await readyPolicy();
    search('x'.repeat(1000)); element<HTMLInputElement>('replace-text').value = 'x'.repeat(1001);
    button('replace-all').click();
    expect(editor().value).toBe('x'.repeat(MAX_PREVIEW_CHARACTERS));
    expect(element('find-status').textContent).toContain('exceeds');
    expect(element('edited').hidden).toBe(true);
  });

  it('supports keyboard search and replacement shortcuts and Enter navigation', async () => {
    accept({ ...payload, content: 'cat cat' }); await readyPolicy();
    editor().setSelectionRange(0, 3);
    const shortcut = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(element('find-text'));
    expect(element<HTMLInputElement>('find-text').value).toBe('cat');
    element('find-text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(editor().selectionStart).toBe(4);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', metaKey: true, bubbles: true }));
    expect(document.activeElement).toBe(element('replace-text'));
    element('replace-text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(editor());
  });

  it('blocks replacements during saving and clears search text with the private draft', async () => {
    accept({ ...payload, content: 'cat' }); await readyPolicy(); search('cat');
    element<HTMLInputElement>('replace-text').value = 'private replacement';
    button('save').click();
    expect(button('replace-all').disabled).toBe(true);
    button('replace-all').click(); expect(editor().value).toBe('cat');
    await readyPolicy();
    expect(button('replace-all').disabled).toBe(false);
    pageHide(new Event('pagehide'));
    expect(element<HTMLInputElement>('find-text').value).toBe('');
    expect(element<HTMLInputElement>('replace-text').value).toBe('');
  });

  it('explains the 23-character clipboard overhead with matching character and token counts', async () => {
    accept({ ...payload, content: 'x'.repeat(4978) + '\n' }); await readyPolicy();
    expect(element('metrics').textContent).toContain('5002 characters to copy · ~1251 tokens (including boundaries)');
    expect(element('metrics').textContent).toContain('File/editor: 4979 characters · ~1245 tokens (without boundaries)');
  });

  it.each([0, null])('shows original compression accurately for ratio %s', async reductionRatio => {
    accept({ ...payload, reductionRatio }); await readyPolicy();
    expect(element('compression-metrics').textContent).toContain(reductionRatio === null ? 'unavailable' : '0% smaller');
  });

  it('explains how to include other-site frames in Firefox previews', async () => {
    vi.resetModules(); await loadEditor(true);
    accept(payload); await readyPolicy();
    expect(element('warnings').textContent).toContain('Some embedded documents could not be captured.');
    expect(element('warnings').textContent).toContain('enable "Include frames from other sites" in the extension popup, then capture again.');
    accept({ ...payload, warnings: ['canvas-content'] }); await readyPolicy();
    expect(element('warnings').textContent).toBe('Canvas content is not included.');
    accept({ ...payload, warnings: [] }); await readyPolicy();
    expect(element('warnings').hidden).toBe(true);
  });

  it('shows safe plain text and original metadata without copying automatically', async () => {
    accept(payload); await readyPolicy();
    expect(editor().value).toBe(payload.content);
    expect(element('editor-panel').hidden).toBe(false);
    expect(element('settings').textContent).toContain('3 automatic redactions in the original export');
    expect(element('warnings').textContent).toContain('Some embedded documents');
    expect(element('warnings').textContent).not.toContain('Include frames from other sites');
    expect(element('maximum-note').hidden).toBe(true);
    expect(document.querySelector('#editor-panel script')).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    expect(element('metrics').textContent).toContain('without boundaries');
    expect(element('metrics').textContent).toContain(`${wrapClipboardContext(payload.content, payload.compression).length} characters to copy`);
    expect(element('compression-metrics').textContent).toContain('78% smaller than Without');
    expect(saveFile).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each(['semantic-text', 'markdown'] as const)('saves exact edited %s text without clipboard boundaries or recapture', async format => {
    accept({ ...payload, format }); await readyPolicy();
    const text = '  Edited 😀\n\n';
    input(text); button('save').click();
    expect(button('copy').disabled).toBe(true);
    expect(button('save').disabled).toBe(true);
    expect(editor().readOnly).toBe(true);
    await readyPolicy();
    expect(saveFile).toHaveBeenCalledExactlyOnceWith(text, format, undefined, expect.objectContaining({ format }));
    expect(element('status').textContent).toContain(`${text.length} characters saved`);
    expect(editor().value).toBe(text);
    expect(editor().readOnly).toBe(false);
    expect(button('save').disabled).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(element('compression-metrics').textContent).toContain('before manual edits');
  });

  it('keeps edits and allows retry after a cancelled or failed save', async () => {
    accept(payload); await readyPolicy(); input('keep me');
    saveFile.mockRejectedValueOnce(new Error('private failure details'));
    button('save').click(); await readyPolicy();
    expect(editor().value).toBe('keep me');
    expect(element('status').textContent).toContain('saving was cancelled');
    expect(element('status').textContent).not.toContain('private failure details');
    expect(button('save').disabled).toBe(false);
    button('save').click(); await readyPolicy();
    expect(element('status').textContent).toContain('Saved edited context');
  });

  it('requests Firefox download permission only on Save and preserves edits after denial', async () => {
    vi.resetModules(); await loadEditor(true);
    accept(payload); await readyPolicy(); input('Firefox edits');
    expect(requestPermission).not.toHaveBeenCalled();
    requestPermission.mockResolvedValueOnce(false);
    button('save').click();
    expect(requestPermission).toHaveBeenCalledWith({ permissions: ['downloads'] });
    await readyPolicy();
    expect(saveFile).not.toHaveBeenCalled();
    expect(editor().value).toBe('Firefox edits');
    expect(element('status').textContent).toContain('permission was not granted');
    button('save').click(); await readyPolicy(); await readyPolicy();
    expect(saveFile).toHaveBeenCalledExactlyOnceWith('Firefox edits', 'markdown', undefined, expect.objectContaining({ format: 'markdown' }));
  });

  it('keeps Save unavailable on Firefox Android while Copy remains available', async () => {
    vi.resetModules(); await loadEditor(true, 'android');
    accept(payload); await readyPolicy();
    expect(button('save').disabled).toBe(true);
    button('save').click();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
    expect(button('copy').disabled).toBe(false);
  });

  it.each((['semantic-text', 'markdown'] as const).flatMap(format =>
    (['without', 'detailed', 'compact', 'maximum'] as const).map(compression => ({ format, compression })),
  ))('copies exact edits and boundaries for $format / $compression', async ({ format, compression }) => {
    accept({ ...payload, format, compression }); await readyPolicy();
    const text = '  Edited context\n😀\n\n';
    input(text);
    button('copy').click();
    expect(button('copy').disabled).toBe(true);
    await readyPolicy();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(wrapClipboardContext(text, compression));
    expect(element('status').textContent).toContain('Copied edited context.');
    expect(element('status').textContent).toContain(`${wrapClipboardContext(text, compression).length} characters copied`);
    expect(editor().readOnly).toBe(false);
    expect(editor().value).toBe(text);
    expect(element('maximum-note').hidden).toBe(compression !== 'maximum');
  });

  it('updates metrics, resets only with confirmation and protects dirty drafts on unload', async () => {
    accept(payload); await readyPolicy(); input('changed');
    const event = new Event('beforeunload', { cancelable: true });
    beforeUnload(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(120);
    expect(element('metrics').textContent).toContain('7 characters · ~2 tokens');
    expect(element('compression-metrics').textContent).toContain('78% smaller');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    button('reset').click(); expect(editor().value).toBe('changed');
    confirm.mockReturnValue(true);
    button('reset').click(); expect(editor().value).toBe(payload.content);
    expect(confirm).toHaveBeenCalledWith('Discard your edits?');
    expect(element('edited').hidden).toBe(true);
    expect(button('reset').disabled).toBe(true);
    const clean = new Event('beforeunload', { cancelable: true }); beforeUnload(clean);
    expect(clean.defaultPrevented).toBe(false);
  });

  it('retains edits after clipboard failure and retries without recapture', async () => {
    accept(payload); await readyPolicy(); input('retry me');
    writeText.mockRejectedValueOnce(new Error('private failure details'));
    button('copy').click(); await readyPolicy();
    expect(element('status').textContent).toContain('Unable to copy');
    expect(element('status').textContent).not.toContain('private failure details');
    expect(editor().value).toBe('retry me');
    expect(button('copy').disabled).toBe(false);
    button('copy').click(); await readyPolicy();
    expect(element('status').textContent).toContain('Copied edited context.');
  });

  it('rejects empty and oversized edits without trimming or truncating them', async () => {
    accept(payload); await readyPolicy();
    input(' \n '); button('copy').click();
    button('save').click();
    expect(saveFile).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    input('x'.repeat(MAX_PREVIEW_CHARACTERS + 1));
    await vi.advanceTimersByTimeAsync(120);
    expect(button('copy').disabled).toBe(true);
    expect(button('save').disabled).toBe(true);
    expect(editor().value.length).toBe(MAX_PREVIEW_CHARACTERS + 1);
    expect(element('metrics').textContent).toContain('exceeds');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('clears the draft and pending work on pagehide; a missing session offers recovery', async () => {
    accept(payload); await readyPolicy(); input('sensitive draft');
    pageHide(new Event('pagehide'));
    expect(stop).toHaveBeenCalled();
    expect(editor().value).toBe('');
    expect(element('editor-panel').hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    unavailable();
    expect(element('status').textContent).toContain('No preview was received');
  });

  it('confirms discarding edits when Close is clicked without a second unload prompt', async () => {
    accept(payload); await readyPolicy(); input('changed');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    button('close').click();
    expect(remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    button('close').click(); await readyPolicy();
    expect(remove).toHaveBeenCalledExactlyOnceWith(4);
    const event = new Event('beforeunload', { cancelable: true }); beforeUnload(event);
    expect(event.defaultPrevented).toBe(false);
  });
});


describe('managed preview', () => {
  it('makes required-redaction previews read-only and rejects programmatically altered text', async () => {
    managedGet.mockResolvedValue({ RedactionMode: 'force-on' });
    const { readPolicy } = await import('@/src/policy/runtime');
    const snapshot = await readPolicy();
    accept({ ...payload, policyRevision: snapshot.revision });
    await vi.waitFor(() => expect(button('copy').disabled).toBe(false));
    expect(editor().readOnly).toBe(true);
    search('private'); expect(button('replace-all').disabled).toBe(true);
    input('New unfiltered data'); button('copy').click();
    await vi.waitFor(() => expect(element('status').textContent).toContain('read-only'));
    expect(writeText).not.toHaveBeenCalled(); expect(saveFile).not.toHaveBeenCalled();
  });
  it('disables a previously prepared context when a policy changes or is removed', async () => {
    managedGet.mockResolvedValue({ PolicyVersion: 1 });
    const { readPolicy } = await import('@/src/policy/runtime');
    const snapshot = await readPolicy();
    accept({ ...payload, policyRevision: snapshot.revision });
    await vi.waitFor(() => expect(button('copy').disabled).toBe(false));
    managedGet.mockResolvedValue({});
    for (const fn of policyListeners) fn({}, 'managed');
    expect(button('copy').disabled).toBe(true);
    await vi.waitFor(() => expect(element('status').textContent).toContain('changed'));
    button('copy').click(); button('save').click();
    expect(writeText).not.toHaveBeenCalled(); expect(saveFile).not.toHaveBeenCalled();
  });
  it('keeps file and clipboard permissions independent and blocks on a policy read failure', async () => {
    managedGet.mockResolvedValue({ ClipboardExportAllowed: false });
    const { readPolicy } = await import('@/src/policy/runtime');
    const snapshot = await readPolicy();
    accept({ ...payload, policyRevision: snapshot.revision });
    await vi.waitFor(() => expect(button('save').disabled).toBe(false));
    expect(button('copy').disabled).toBe(true);
    managedGet.mockRejectedValue(new Error('Private storage details'));
    button('save').click();
    await vi.waitFor(() => expect(element('status').textContent).toContain('Unable to load organization policies'));
    expect(saveFile).not.toHaveBeenCalled();
  });
});


it('blocks a directly opened preview page when PreviewAllowed is false', async () => {
  managedGet.mockResolvedValue({ PreviewAllowed: false });
  for (const fn of policyListeners) fn({}, 'managed');
  await vi.waitFor(() => expect(element('status').textContent).toContain('Preview is disabled'));
  expect(element('editor-panel').hidden).toBe(true); expect(button('copy').disabled).toBe(true);
});
it('hides an existing preview and blocks export when preview access is revoked', async () => {
  accept(payload); await readyPolicy();
  expect(element('editor-panel').hidden).toBe(false);
  managedGet.mockResolvedValue({ PreviewAllowed: false });
  for (const fn of policyListeners) fn({}, 'managed');
  await vi.waitFor(() => expect(element('status').textContent).toContain('Preview is disabled'));
  expect(element('editor-panel').hidden).toBe(true);
  button('copy').click(); button('save').click(); await readyPolicy();
  expect(writeText).not.toHaveBeenCalled(); expect(saveFile).not.toHaveBeenCalled();
});

it('discards an invalidated preview permanently even if the original policy is restored', async () => {
  accept(payload); await readyPolicy();
  expect(editor().value).toContain(payload.content);
  managedGet.mockResolvedValue({ IncludeFormValues: false });
  for (const fn of policyListeners) fn({}, 'managed');
  await readyPolicy(); expect(editor().value).toBe(''); expect(button('copy').disabled).toBe(true);
  managedGet.mockResolvedValue({});
  for (const fn of policyListeners) fn({}, 'managed');
  await readyPolicy(); expect(editor().value).toBe(''); expect(button('copy').disabled).toBe(true);
  button('reset').click(); expect(editor().value).toBe('');
});
