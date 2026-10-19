// @vitest-environment jsdom
// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

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
const payload: PreviewPayload = { content: '<script>private text stays inert</script>\n', format: 'markdown', compression: 'compact', redactSensitiveData: true, redactionCount: 3, reductionRatio: .78, warnings: ['embedded-frames-partial'] };
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = () => element<HTMLTextAreaElement>('context');
const button = (id: string) => element<HTMLButtonElement>(id);
const input = (text: string) => { editor().value = text; editor().dispatchEvent(new Event('input')); };
let beforeUnload: EventListener;
let pageHide: EventListener;
async function loadEditor(firefox = false, os = 'linux') {
  vi.stubEnv('BROWSER', firefox ? 'firefox' : 'chrome');
  vi.useFakeTimers();
  document.body.innerHTML = readFileSync(resolve('entrypoints/preview/index.html'), 'utf8').split('<body>')[1]!.split('</body>')[0]!;
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

describe('preview editor', () => {
  it('explains the 23-character clipboard overhead with matching character and token counts', () => {
    accept({ ...payload, content: 'x'.repeat(4978) + '\n' });
    expect(element('metrics').textContent).toContain('5002 characters to copy · ~1251 tokens (including boundaries)');
    expect(element('metrics').textContent).toContain('File/editor: 4979 characters · ~1245 tokens (without boundaries)');
  });

  it.each([0, null])('shows original compression accurately for ratio %s', reductionRatio => {
    accept({ ...payload, reductionRatio });
    expect(element('compression-metrics').textContent).toContain(reductionRatio === null ? 'unavailable' : '0% smaller');
  });

  it('shows safe plain text and original metadata without copying automatically', () => {
    accept(payload);
    expect(editor().value).toBe(payload.content);
    expect(element('editor-panel').hidden).toBe(false);
    expect(element('settings').textContent).toContain('3 automatic redactions in the original export');
    expect(element('warnings').textContent).toContain('Some embedded documents');
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
    accept({ ...payload, format });
    const text = '  Edited 😀\n\n';
    input(text); button('save').click();
    expect(saveFile).toHaveBeenCalledExactlyOnceWith(text, format);
    expect(button('copy').disabled).toBe(true);
    expect(button('save').disabled).toBe(true);
    expect(editor().readOnly).toBe(true);
    await Promise.resolve();
    expect(element('status').textContent).toContain(`${text.length} characters saved`);
    expect(editor().value).toBe(text);
    expect(editor().readOnly).toBe(false);
    expect(button('save').disabled).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(element('compression-metrics').textContent).toContain('before manual edits');
  });

  it('keeps edits and allows retry after a cancelled or failed save', async () => {
    accept(payload); input('keep me');
    saveFile.mockRejectedValueOnce(new Error('private failure details'));
    button('save').click(); await Promise.resolve();
    expect(editor().value).toBe('keep me');
    expect(element('status').textContent).toContain('saving was cancelled');
    expect(element('status').textContent).not.toContain('private failure details');
    expect(button('save').disabled).toBe(false);
    button('save').click(); await Promise.resolve();
    expect(element('status').textContent).toContain('Saved edited context');
  });

  it('requests Firefox download permission only on Save and preserves edits after denial', async () => {
    vi.resetModules(); await loadEditor(true);
    accept(payload); input('Firefox edits');
    expect(requestPermission).not.toHaveBeenCalled();
    requestPermission.mockResolvedValueOnce(false);
    button('save').click();
    expect(requestPermission).toHaveBeenCalledWith({ permissions: ['downloads'] });
    await Promise.resolve();
    expect(saveFile).not.toHaveBeenCalled();
    expect(editor().value).toBe('Firefox edits');
    expect(element('status').textContent).toContain('permission was not granted');
    button('save').click(); await Promise.resolve(); await Promise.resolve();
    expect(saveFile).toHaveBeenCalledExactlyOnceWith('Firefox edits', 'markdown');
  });

  it('keeps Save unavailable on Firefox Android while Copy remains available', async () => {
    vi.resetModules(); await loadEditor(true, 'android');
    accept(payload);
    expect(button('save').disabled).toBe(true);
    button('save').click();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
    expect(button('copy').disabled).toBe(false);
  });

  it.each((['semantic-text', 'markdown'] as const).flatMap(format =>
    (['without', 'detailed', 'compact', 'maximum'] as const).map(compression => ({ format, compression })),
  ))('copies exact edits and boundaries for $format / $compression', async ({ format, compression }) => {
    accept({ ...payload, format, compression });
    const text = '  Edited context\n😀\n\n';
    input(text);
    button('copy').click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(wrapClipboardContext(text, compression));
    expect(button('copy').disabled).toBe(true);
    await Promise.resolve();
    expect(element('status').textContent).toContain('Copied edited context.');
    expect(element('status').textContent).toContain(`${wrapClipboardContext(text, compression).length} characters copied`);
    expect(editor().readOnly).toBe(false);
    expect(editor().value).toBe(text);
    expect(element('maximum-note').hidden).toBe(compression !== 'maximum');
  });

  it('updates metrics, resets only with confirmation and protects dirty drafts on unload', async () => {
    accept(payload); input('changed');
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
    accept(payload); input('retry me');
    writeText.mockRejectedValueOnce(new Error('private failure details'));
    button('copy').click(); await Promise.resolve();
    expect(element('status').textContent).toContain('Unable to copy');
    expect(element('status').textContent).not.toContain('private failure details');
    expect(editor().value).toBe('retry me');
    expect(button('copy').disabled).toBe(false);
    button('copy').click(); await Promise.resolve();
    expect(element('status').textContent).toContain('Copied edited context.');
  });

  it('rejects empty and oversized edits without trimming or truncating them', async () => {
    accept(payload);
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

  it('clears the draft and pending work on pagehide; a missing session offers recovery', () => {
    accept(payload); input('sensitive draft');
    pageHide(new Event('pagehide'));
    expect(stop).toHaveBeenCalled();
    expect(editor().value).toBe('');
    expect(element('editor-panel').hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    unavailable();
    expect(element('status').textContent).toContain('No preview was received');
  });

  it('confirms discarding edits when Close is clicked without a second unload prompt', async () => {
    accept(payload); input('changed');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    button('close').click();
    expect(remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    button('close').click(); await Promise.resolve();
    expect(remove).toHaveBeenCalledExactlyOnceWith(4);
    const event = new Event('beforeunload', { cancelable: true }); beforeUnload(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
