// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { setImmediate } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { installElementPicker } from '@/src/element-picker';

describe('picker structural reference retention', () => {
  it.each(['cancel', 'disconnect', 'complete', 'error'] as const)('releases a detached target and channel listeners after %s', async scenario => {
    const windows: JSDOM[] = [];
    const refs: WeakRef<object>[] = [];
    const channels: Set<unknown>[] = [];
    const run = () => {
      const dom = new JSDOM('<main><article tabindex="0">Synthetic selected block</article></main>', { url: 'https://example.test/', pretendToBeVisual: true });
      windows.push(dom);
      dom.window.Element.prototype.getClientRects = () => [{ width: 100, height: 20 }] as unknown as DOMRectList;
      dom.window.document.elementFromPoint = () => dom.window.document.querySelector('article');
      const listeners = new Set<(message: unknown) => void>();
      const disconnects = new Set<() => void>();
      channels.push(listeners, disconnects);
      const handle = installElementPicker(dom.window.document, crypto.randomUUID(), {
        send() {}, close() {},
        listen(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        disconnected(listener) { disconnects.add(listener); return () => { disconnects.delete(listener); }; },
      });
      for (const listener of listeners) listener({ type: 'active' });
      const selected = dom.window.document.querySelector<HTMLElement>('article')!;
      dom.window.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
      expect(handle.root()).toBe(selected);
      refs.push(new WeakRef(selected));
      for (const listener of listeners) refs.push(new WeakRef(listener));
      if (scenario === 'complete') for (const listener of [...listeners]) listener({ type: 'complete' });
      else if (scenario === 'disconnect') for (const listener of [...disconnects]) listener();
      else {
        if (scenario === 'error') for (const listener of listeners) listener({ type: 'error', message: 'Synthetic failure' });
        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
      }
      selected.remove();
      dom.window.document.querySelector('article');
    };
    try {
      for (let index = 0; index < 3; index++) run();
      expect(channels.every(channel => channel.size === 0)).toBe(true);
      let remaining = refs.length;
      for (let attempt = 0; attempt < 12 && remaining; attempt++) {
        await setImmediate(); global.gc!(); remaining = refs.filter(ref => ref.deref()).length;
      }
      expect(remaining).toBe(0);
      // Keep the original documents alive while checking detached targets and listeners.
      expect(windows.every(dom => dom.window.document.querySelector('main'))).toBe(true);
    } finally { for (const dom of windows) dom.window.close(); }
  });
});
