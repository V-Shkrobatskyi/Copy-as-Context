// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installElementPicker } from '@/src/element-picker';
import { selectionAttribute } from '@/src/element-picker-protocol';

const token = '11111111-2222-4333-8444-555555555555';
const windows: JSDOM[] = [];
afterEach(() => { windows.splice(0).forEach(window => window.window.close()); vi.restoreAllMocks(); vi.useRealTimers(); });
function setup(beforeSave?: () => Promise<boolean>) {
  const dom = new JSDOM('<main><article><a href="/next">Selected link</a></article><p>Outside</p></main>', { url: 'https://example.test/', pretendToBeVisual: true });
  windows.push(dom);
  const { document: doc } = dom.window;
  doc.elementFromPoint = () => doc.querySelector('a');
  vi.spyOn(dom.window.Element.prototype, 'getClientRects').mockReturnValue([{ x: 0, y: 0, width: 100, height: 20 }] as any);
  let shadow!: ShadowRoot;
  const original = dom.window.Element.prototype.attachShadow;
  vi.spyOn(dom.window.Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) { shadow = original.call(this, init); return shadow; });
  let incoming!: (message: unknown) => void;
  let disconnect!: () => void;
  const stopMessage = vi.fn(); const stopDisconnect = vi.fn();
  const channel = { beforeSave, send: vi.fn(), listen: (listener: typeof incoming) => { incoming = listener; return stopMessage; },
    disconnected: (listener: typeof disconnect) => { disconnect = listener; return stopDisconnect; }, close: vi.fn() };
  const picker = installElementPicker(doc, token, channel);
  incoming({ type: 'active' });
  const button = (id: string) => shadow.querySelector<HTMLButtonElement>(`#${id}`)!;
  const focusedPick = () => {
    (doc.querySelector('a') as HTMLElement).focus();
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
  };
  return { dom, doc, picker, channel, incoming, disconnect, button, focusedPick, stopMessage, stopDisconnect, shadow };
}

describe('element picker interaction', () => {
  it('copies the prepared reply and closes the picker after confirmed success', async () => {
    const h = setup(); h.focusedPick();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(h.dom.window.navigator, 'clipboard', { value: { writeText } });
    expect(h.button('preview').textContent).toBe('Preview & edit');
    h.button('copy').click();
    expect(h.channel.send).toHaveBeenCalledWith('copy');
    expect(h.button('save').disabled).toBe(true);
    h.incoming({ type: 'copy-content', operation: token, content: '<web_page>\nSelected context\n</web_page>\n' });
    await Promise.resolve(); await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('<web_page>\nSelected context\n</web_page>\n');
    expect(h.channel.send).toHaveBeenCalledWith('copied', { operation: token });
    expect(h.channel.close).not.toHaveBeenCalled();
    h.incoming({ type: 'complete' });
    expect(h.shadow.host.isConnected).toBe(false);
    expect(h.channel.close).toHaveBeenCalledOnce();
    expect(h.picker.root()).toBeUndefined();
    expect(h.doc.querySelector(`[${selectionAttribute(token)}]`)).toBeNull();
    h.picker.close();
  });

  it('requests Save permission from the click and keeps the selection after denial', async () => {
    const permit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const h = setup(permit); h.focusedPick();
    h.button('save').click(); expect(permit).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(h.channel.send).not.toHaveBeenCalledWith('save');
    expect(h.button('save').disabled).toBe(false);
    h.button('save').click(); await Promise.resolve();
    expect(h.channel.send).toHaveBeenCalledWith('save');
    h.incoming({ type: 'complete' });
    expect(h.picker.root()).toBeUndefined();
    expect(h.shadow.host.isConnected).toBe(false);
    expect(h.channel.close).toHaveBeenCalledOnce();
    h.picker.close();
  });
  it('intercepts a pointer over an iframe and selects the whole embedded document without activating it', () => {
    const h = setup();
    const embedded = h.doc.createElement('iframe'); h.doc.querySelector('article')!.append(embedded);
    h.doc.elementsFromPoint = () => [h.shadow.host, embedded, h.doc.body];
    const surface = h.shadow.querySelector('#surface')!;
    const pageClick = vi.fn(); embedded.addEventListener('click', pageClick);
    expect(h.shadow.querySelector('#status')!.textContent).not.toContain('F2');
    expect(h.shadow.querySelector<HTMLElement>('#panel')!.dataset.mode).toBe('picking');
    expect(h.shadow.querySelector<HTMLElement>('#buttons')!.hidden).toBe(true);
    expect(h.shadow.querySelector('.brand-mark svg')).not.toBeNull();
    expect(h.button('cancel').getAttribute('aria-label')).toBe('Cancel selection');
    expect(h.button('preview').hidden).toBe(true);
    surface.dispatchEvent(new h.dom.window.MouseEvent('click', { bubbles: true, composed: true, cancelable: true, clientX: 200, clientY: 100 }));
    expect(h.picker.root()).toBe(embedded);
    expect(h.shadow.querySelector<HTMLElement>('#panel')!.dataset.mode).toBe('selected');
    expect(h.shadow.querySelector<HTMLElement>('#buttons')!.hidden).toBe(false);
    expect(pageClick).not.toHaveBeenCalled();
    expect(h.button('preview').hidden).toBe(false);
    expect(h.button('preview').disabled).toBe(false);
    h.button('again').click();
    expect(h.picker.root()).toBeUndefined();
    expect(h.shadow.querySelector<HTMLElement>('#panel')!.dataset.mode).toBe('picking');
    expect(h.shadow.querySelector<HTMLElement>('#buttons')!.hidden).toBe(true);
    expect(h.button('preview').hidden).toBe(true);
    expect(h.shadow.querySelector('#status')!.textContent).not.toContain('F2');
    h.picker.close();
  });
  it('selects one focused block, expands and goes back, then removes UI before capture', () => {
    const h = setup(); h.focusedPick();
    expect(h.picker.root()).toBe(h.doc.querySelector('a'));
    h.button('parent').click(); expect(h.picker.root()).toBe(h.doc.querySelector('article'));
    h.button('back').click(); expect(h.picker.root()).toBe(h.doc.querySelector('a'));
    h.button('preview').click();
    expect(h.channel.send).toHaveBeenCalledWith('capture');
    expect(h.doc.querySelector(`[${selectionAttribute(token)}]`)).toBe(h.doc.querySelector('a'));
    expect(h.shadow.host.isConnected).toBe(false);
    h.incoming({ type: 'error', message: 'Synthetic failure' });
    expect(h.shadow.host.isConnected).toBe(true);
    expect(h.shadow.querySelector('#status')!.textContent).toBe('Synthetic failure');
    expect(h.doc.querySelector(`[${selectionAttribute(token)}]`)).toBeNull();
    h.button('preview').click(); h.incoming({ type: 'complete' });
    expect(h.picker.root()).toBeUndefined(); expect(h.channel.close).toHaveBeenCalledOnce();
    expect(h.stopMessage).toHaveBeenCalled(); expect(h.stopDisconnect).toHaveBeenCalled();
    expect(h.doc.querySelector(`[${selectionAttribute(token)}]`)).toBeNull();
  });

  it('suppresses page clicks but restores them on Esc, and supports picking again', () => {
    const h = setup(); const click = vi.fn(); h.doc.querySelector('a')!.addEventListener('click', click);
    h.doc.querySelector('a')!.dispatchEvent(new h.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(click).not.toHaveBeenCalled();
    h.focusedPick(); h.button('again').click(); expect(h.picker.root()).toBeUndefined();
    h.dom.window.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    h.doc.querySelector('a')!.dispatchEvent(new h.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(click).toHaveBeenCalledOnce(); expect(h.channel.send).toHaveBeenCalledWith('cancel');
  });

  it('invalidates a removed target, closes on disconnect, and makes cleanup idempotent', async () => {
    const h = setup(); h.focusedPick(); h.doc.querySelector('a')!.remove();
    await Promise.resolve();
    expect(h.picker.root()).toBeUndefined(); expect(h.button('preview').disabled).toBe(true);
    h.disconnect(); h.picker.close(); expect(h.channel.close).toHaveBeenCalledOnce();
  });
});
