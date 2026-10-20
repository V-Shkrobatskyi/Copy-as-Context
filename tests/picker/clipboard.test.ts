// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { copySelectedContext } from '@/src/element-picker-clipboard';

describe('selected context clipboard', () => {
  it('uses the clipboard API without inserting the export into the DOM', async () => {
    const dom = new JSDOM('<main></main>');
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText } });
      const shadow = dom.window.document.querySelector('main')!.attachShadow({ mode: 'closed' });
      await copySelectedContext(dom.window.document, shadow, 'Prepared context');
      expect(writeText).toHaveBeenCalledWith('Prepared context');
      expect(shadow.textContent).toBe('');
    } finally { dom.window.close(); }
  });

  it('supports HTTP fallback with only a placeholder in the DOM and cleans up after failure', async () => {
    const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
    try {
      const doc = dom.window.document;
      const shadow = doc.querySelector('main')!.attachShadow({ mode: 'closed' });
      const setData = vi.fn();
      doc.execCommand = vi.fn(() => {
        expect(shadow.querySelector('textarea')!.value).toBe(' ');
        expect(shadow.textContent).not.toContain('Private export');
        const event = new dom.window.Event('copy', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { setData } });
        dom.window.dispatchEvent(event); return true;
      });
      await copySelectedContext(doc, shadow, 'Private export');
      expect(setData).toHaveBeenCalledWith('text/plain', 'Private export');
      expect(shadow.querySelector('textarea')).toBeNull();
      doc.execCommand = () => false;
      await expect(copySelectedContext(doc, shadow, 'Private export')).rejects.toThrow();
      expect(shadow.querySelector('textarea')).toBeNull();
    } finally { dom.window.close(); }
  });
});
