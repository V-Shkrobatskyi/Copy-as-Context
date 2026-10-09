import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { captureDomPage } from '@/src/adapters/dom/capture';
import { compressSemanticTree, prepareExport, type SemanticNode } from '@/src/core';

const text = (name: string): SemanticNode => ({ role: 'StaticText', name, children: [] });

it('compresses DOM wrappers while retaining named boundaries, states, controls and composed text order', () => {
  const dom = new JSDOM(`<title>Detailed DOM</title><main>
    <div><span>Before</span><div><button>Save</button></div><span>After</span></div>
    <div></div><span role="none"></span>
    <div aria-label="Context"><span>Named text</span></div>
    <div aria-expanded="false"><span>Closed text</span></div>
    <div tabindex="0"><span>Focusable text</span></div>
    <form><span>Unnamed form</span></form><form aria-label="Account"><input aria-label="Name" value="Ada"></form>
    <section><span>Unnamed section</span></section><section aria-label="Preferences"><p>Paragraph</p></section>
    <ul><li>Item</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table>
    <div id="host"><span slot="label">Slotted</span></div>
    <iframe></iframe><canvas></canvas><iframe title="Embedded"></iframe><canvas title="Chart"></canvas>
  </main>`, { url: 'https://example.test/' });
  try {
    dom.window.document.querySelector('#host')!.attachShadow({ mode: 'open' }).innerHTML =
      '<div><span>Shadow before</span><slot name="label"></slot><span>Shadow after</span></div>';
    const captured = captureDomPage(dom.window.document);
    expect(captured.ok).toBe(true);
    if (!captured.ok) throw new Error(captured.error.code);
    const original = structuredClone(captured);
    const detailed = compressSemanticTree(captured.tree, 'detailed');
    expect(detailed).toEqual({ ...captured.tree, root: { role: 'page', children: [{ role: 'main', children: [
      text('Before'),
      { role: 'button', name: 'Save', states: { disabled: false, focusable: true }, children: [text('Save')] },
      text('After'),
      { role: 'generic', name: 'Context', children: [text('Named text')] },
      { role: 'generic', states: { expanded: false }, children: [text('Closed text')] },
      { role: 'generic', states: { focusable: true }, children: [text('Focusable text')] },
      text('Unnamed form'),
      { role: 'form', name: 'Account', children: [
        { role: 'textbox', name: 'Name', value: 'Ada', states: { disabled: false, required: false, readOnly: false, focusable: true }, children: [] },
      ] },
      text('Unnamed section'),
      { role: 'region', name: 'Preferences', children: [{ role: 'paragraph', children: [text('Paragraph')] }] },
      { role: 'list', children: [{ role: 'listitem', level: 1, children: [text('Item')] }] },
      { role: 'table', children: [{ role: 'rowgroup', children: [{ role: 'row', children: [
        { role: 'cell', name: 'Cell', children: [text('Cell')] },
      ] }] }] },
      text('Shadow before'), text('Slotted'), text('Shadow after'),
      { role: 'generic', states: { focusable: true }, children: [] },
      { role: 'generic', name: 'Embedded', states: { focusable: true }, children: [] },
      { role: 'generic', name: 'Chart', children: [] },
    ] }] } });
    expect(captured.warnings).toEqual(['embedded-frames', 'canvas-content']);
    expect(captured).toEqual(original);
    expect(compressSemanticTree(detailed, 'detailed')).toEqual(detailed);
    for (const format of ['semantic-text', 'markdown'] as const) {
      for (const privacy of [false, true]) {
        const without = prepareExport(captured.tree, 'without', format, privacy);
        const output = prepareExport(captured.tree, 'detailed', format, privacy);
        expect(output.characterCount).toBeLessThan(without.characterCount);
        expect(output.characterCount).toBe(output.serialized.content.length);
        expect(output.serialized.content).toContain('expanded=false');
        expect(output.serialized.content).toContain('Slotted');
      }
    }
  } finally { dom.window.close(); }
});
