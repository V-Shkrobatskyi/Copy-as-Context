import { describe, expect, it } from 'vitest';
import { compressSemanticTree, prepareExport, type SemanticNode, type SemanticTree } from '@/src/core';

const text = (name: string): SemanticNode => ({ role: 'StaticText', name, children: [] });
const treeWith = (children: SemanticNode[], role = 'page'): SemanticTree => ({
  schemaVersion: 1, title: 'Synthetic page', sourceUrl: 'https://example.test/',
  capturedAt: '2026.10.09 12:00:00', browser: 'Firefox', root: { role, children },
});

describe('Detailed wrapper compression', () => {
  it('flattens nested wrappers and empty leaves in order without sharing mutable data', () => {
    const button: SemanticNode = {
      role: 'button', name: 'Save', states: { disabled: false, focusable: true },
      children: [text('Save'), { role: 'InlineTextBox', name: 'Save', children: [] }],
    };
    const input = treeWith([
      text('Before'),
      { role: 'generic', id: 'adapter-only', children: [
        text('First'), { role: 'none', children: [button, text('Last')] },
        { role: 'generic', states: {}, children: [] },
      ] },
      text('After'),
    ]);
    const before = structuredClone(input);
    const output = compressSemanticTree(input, 'detailed');
    expect(output).toEqual(treeWith([text('Before'), text('First'), button, text('Last'), text('After')]));
    expect(input).toEqual(before);
    expect(compressSemanticTree(output, 'detailed')).toEqual(output);
    const clonedButton = output.root.children[2]!;
    clonedButton.states!.disabled = true;
    clonedButton.children[0]!.name = 'Changed';
    output.root.children.push(text('New'));
    expect(input).toEqual(before);
  });

  it.each(['generic', 'none'])('retains the %s root even without attributes', (role) => {
    const input = treeWith([{ role: 'generic', children: [text('Visible')] }], role);
    expect(compressSemanticTree(input, 'detailed')).toEqual(treeWith([text('Visible')], role));
  });

  it.each(['generic', 'none'])('protects every defined semantic attribute on %s', (role) => {
    const attributes: Partial<SemanticNode>[] = [
      { name: '' }, { name: 'Context' }, { value: '' }, { href: '' }, { level: 0 },
      { states: { focused: false } }, { states: { readOnly: false } },
      { states: { checked: 'mixed' } }, { states: { focusable: true } },
    ];
    for (const attribute of attributes) {
      const wrapper: SemanticNode = { role, ...attribute, children: [text('Visible')] };
      expect(compressSemanticTree(treeWith([wrapper]), 'detailed')).toEqual(treeWith([wrapper]));
    }
  });

  it('retains semantic boundaries, including unnamed structural leaves', () => {
    const boundaries = ['group', 'region', 'paragraph', 'table', 'row', 'cell', 'list', 'listitem', 'form', 'document'];
    const children = boundaries.map((role): SemanticNode => ({ role, children: [] }));
    children.push({ role: 'region', name: 'Settings', children: [
      { role: 'generic', children: [{ role: 'button', name: 'Save', children: [text('Save')] }] },
    ] });
    const expected = structuredClone(children);
    expected.at(-1)!.children = [{ role: 'button', name: 'Save', children: [text('Save')] }];
    expect(compressSemanticTree(treeWith(children), 'detailed')).toEqual(treeWith(expected));
  });

  it.each(['semantic-text', 'markdown'] as const)('keeps Detailed content and privacy while shrinking %s', (format) => {
    const secret = 'syntheticprivatevalue';
    const input = treeWith([{ role: 'generic', children: [
      { role: 'link', name: 'Settings', href: 'https://example.test/settings', children: [
        text('Settings'), { role: 'InlineTextBox', name: 'Settings', children: [] },
      ] },
      { role: 'textbox', name: 'API key', value: secret, states: { readOnly: false, focusable: true },
        children: [{ role: 'generic', children: [text(secret)] }] },
    ] }]);
    const original = structuredClone(input);
    for (const privacy of [false, true]) {
      const without = prepareExport(input, 'without', format, privacy);
      const detailed = prepareExport(input, 'detailed', format, privacy);
      const compact = prepareExport(input, 'compact', format, privacy);
      expect(detailed.characterCount).toBeLessThan(without.characterCount);
      expect(detailed.characterCount).toBeGreaterThan(compact.characterCount);
      expect(detailed.characterCount).toBe(detailed.serialized.content.length);
      expect(detailed.approximateTokenCount).toBe(Math.ceil(detailed.characterCount / 4));
      expect(detailed.reductionRatio).toBeCloseTo(1 - detailed.characterCount / without.characterCount);
      expect(detailed.serialized.content).toContain('InlineTextBox');
      expect(detailed.serialized.content).toContain('href=');
      expect(detailed.serialized.content).toContain('readonly=false');
      expect(detailed.serialized.content).toContain('focusable=true');
      expect(detailed.redactionCount).toBe(privacy ? 2 : 0);
      if (privacy) expect(detailed.serialized.content).not.toContain(secret);
      else expect(detailed.serialized.content).toContain(secret);
    }
    expect(input).toEqual(original);
  });

  it('allows equal profiles when there is no additional noise', () => {
    const input = treeWith([text('Unique text')]);
    expect(compressSemanticTree(input, 'detailed')).toEqual(compressSemanticTree(input, 'without'));
    expect(compressSemanticTree(input, 'detailed')).toEqual(compressSemanticTree(input, 'compact'));
  });
});
