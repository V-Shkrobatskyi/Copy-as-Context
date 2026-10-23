// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { captureDomPage } from '@/src/adapters/dom/capture';
import { selectChromeAxTree, selectedDomIds } from '@/src/adapters/chrome/selection';
import { normalizeChromeAxTree } from '@/src/adapters/chrome/normalize-ax';
import { isPickerStart, PICKER_START, pickerToken, PICKER_PORT, selectedElementInfo, selectedElementReference, selectionAttribute } from '@/src/element-picker-protocol';

afterEach(() => vi.unstubAllGlobals());

describe('single block boundaries', () => {
  it('uses the retained isolated-world reference even when the page copies its marker and replaces DOM lookup', () => {
    const dom = new JSDOM('<section id="chosen">Chosen</section><section id="other">Outside selection</section>');
    try {
      const doc = dom.window.document;
      const chosen = doc.getElementById('chosen')!;
      const other = doc.getElementById('other')!;
      chosen.setAttribute(selectionAttribute('opaque'), '');
      other.setAttribute(selectionAttribute('opaque'), '');
      doc.querySelectorAll = (() => [other]) as any;
      vi.stubGlobal('document', doc);
      vi.stubGlobal('__pageAsContextPicker', { token: 'opaque', root: () => chosen });
      expect(selectedElementReference('opaque')).toBe(chosen);
      expect(selectedElementReference('wrong')).toBeNull();
      chosen.removeAttribute(selectionAttribute('opaque'));
      expect(selectedElementReference('opaque')).toBeNull();
    } finally { dom.window.close(); }
  });
  it('verifies the original marked element and permits visible descendants of visibility-hidden ancestors', () => {
    const dom = new JSDOM('<div style="visibility:hidden"><p id="pick" style="visibility:visible">Visible selection</p></div>');
    try {
      const selected = dom.window.document.querySelector('#pick')!;
      vi.stubGlobal('__pageAsContextPicker', { token: 'opaque', root: () => selected });
      expect(selectedElementInfo('opaque')).toBeUndefined();
      selected.setAttribute(selectionAttribute('opaque'), '');
      expect(selectedElementInfo('opaque')).toEqual({ tagName: selected.localName });
      expect(selectedElementInfo('other')).toBeUndefined();
      expect(captureDomPage(dom.window.document, undefined, { root: selected })).toMatchObject({ ok: true });
      selected.remove(); expect(selectedElementInfo('opaque')).toBeUndefined();
    } finally { dom.window.close(); }
  });
  it('captures the DOM root, controls and external labels without its neighbours', () => {
    const dom = new JSDOM('<label for="field">External label</label><aside>Outside text</aside><section id="pick"><h2>Selected heading</h2><input id="field" value="Selected value"><input type="password" value="secret-never-export"><p hidden>Hidden</p></section><footer>Outside footer</footer>', { url: 'https://example.test/' });
    try {
      const result = captureDomPage(dom.window.document, undefined, { root: dom.window.document.querySelector('#pick')! });
      expect(result.ok).toBe(true);
      const json = JSON.stringify(result);
      for (const text of ['Selected heading', 'Selected value', 'External label']) expect(json).toContain(text);
      for (const text of ['Outside text', 'Outside footer', 'secret-never-export', 'Hidden']) expect(json).not.toContain(text);
    } finally { dom.window.close(); }
  });

  it('rejects detached and hidden roots, and preserves inherited list levels', () => {
    const dom = new JSDOM('<ul><li id="pick">Selected item</li></ul><div hidden><p id="hidden">Private</p></div>');
    try {
      const doc = dom.window.document;
      const root = doc.querySelector('#pick')!;
      const result = captureDomPage(doc, undefined, { root });
      expect(result).toMatchObject({ ok: true, tree: { root: { children: [{ role: 'listitem', level: 1 }] } } });
      expect(captureDomPage(doc, undefined, { root: doc.querySelector('#hidden')! })).toMatchObject({ ok: false });
      root.remove();
      expect(captureDomPage(doc, undefined, { root })).toMatchObject({ ok: false, error: { code: 'page-changed' } });
    } finally { dom.window.close(); }
  });

  it('promotes AX descendants of an ignored wrapper without outside wrapper names or aria-owned content', () => {
    const selected = selectChromeAxTree({ nodes: [
      { nodeId: 'page', role: { value: 'RootWebArea' }, frameId: 'main', childIds: ['outside', 'wrapper'] },
      { nodeId: 'outside', backendDOMNodeId: 2, role: { value: 'StaticText' }, name: { value: 'Outside text' } },
      { nodeId: 'wrapper', backendDOMNodeId: 3, role: { value: 'generic' }, name: { value: 'Outside wrapper name' }, childIds: ['one', 'two'] },
      { nodeId: 'one', backendDOMNodeId: 10, role: { value: 'heading' }, name: { value: 'Selected heading' }, childIds: ['inline', 'owned'] },
      { nodeId: 'inline', role: { value: 'InlineTextBox' }, name: { value: 'Selected heading' } },
      { nodeId: 'owned', backendDOMNodeId: 90, role: { value: 'StaticText' }, name: { value: 'Outside owned text' } },
      { nodeId: 'two', backendDOMNodeId: 11, role: { value: 'StaticText' }, name: { value: 'Selected prose' } },
    ] }, new Set([10, 11]));
    const result = normalizeChromeAxTree(selected, { frameId: 'main' });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain('Selected prose');
    expect(JSON.stringify(result)).not.toContain('Outside');
    expect(selected.nodes[0]?.childIds).toEqual(['one', 'two']);
    expect(() => selectChromeAxTree(selected, new Set([999]))).toThrow('no accessible content');
  });

  it('uses the composed DOM, resolving slot contents and omitting undistributed light children', async () => {
    const root = { backendNodeId: 1, children: [{ backendNodeId: 99 }], shadowRoots: [{ backendNodeId: 2, shadowRootType: 'open', children: [
      { backendNodeId: 3, nodeName: 'SLOT', children: [{ backendNodeId: 98 }], distributedNodes: [{ backendNodeId: 4 }] },
    ] }] };
    const ids = await selectedDomIds(root, async id => ({ backendNodeId: id, children: [{ backendNodeId: 5 }] }));
    expect([...ids].sort()).toEqual([1, 2, 3, 4, 5]);
    await expect(selectedDomIds({}, async () => ({}))).rejects.toThrow();
  });

  it('validates preferences and opaque session names', () => {
    expect(isPickerStart({ type: PICKER_START, compression: 'compact', format: 'markdown', redactSensitiveData: true })).toBe(true);
    expect(isPickerStart({ type: PICKER_START, compression: 'html', format: 'markdown', redactSensitiveData: true })).toBe(false);
    expect(pickerToken(PICKER_PORT + '11111111-2222-4333-8444-555555555555')).toBe('11111111-2222-4333-8444-555555555555');
    expect(pickerToken(PICKER_PORT + 'untrusted')).toBeUndefined();
  });
});
