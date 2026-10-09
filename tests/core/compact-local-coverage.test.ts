import { describe, expect, it } from 'vitest';

import { compressSemanticTree, prepareExport, redactSemanticTree, type SemanticNode, type SemanticTree } from '@/src/core';

const text = (name: string, extra: Partial<SemanticNode> = {}): SemanticNode =>
  ({ role: 'StaticText', name, children: [], ...extra });
const treeWith = (node: SemanticNode): SemanticTree =>
  ({ schemaVersion: 1, root: { role: 'page', children: [node] } });
const compact = (node: SemanticNode): SemanticNode => compressSemanticTree(treeWith(node), 'compact').root.children[0]!;

function all(node: SemanticNode): SemanticNode[] {
  return [node, ...node.children.flatMap(all)];
}

describe('Compact local text coverage', () => {
  it.each(['button', 'link'])('covers a complete ordered %s label through presentation wrappers', (role) => {
    const input: SemanticNode = {
      role, name: 'Demo Organization', states: { expanded: false }, children: [
        { role: 'generic', children: [text('Demo', { children: [{ role: 'InlineTextBox', name: 'Demo', children: [] }] })] },
        text('Organization'),
      ],
    };
    const original = structuredClone(input);
    expect(compact(input)).toEqual({ role, name: 'Demo Organization', states: { expanded: false }, children: [] });
    expect(input).toEqual(original);
    expect(compressSemanticTree(treeWith(input), 'detailed').root.children[0]?.children).toEqual([
      ...input.children[0]!.children, input.children[1]!,
    ]);
  });

  it.each([
    ['partial', 'Save as', [text('Save')]],
    ['reversed', 'Demo Organization', [text('Organization'), text('Demo')]],
    ['extra', 'Demo Organization', [text('Demo'), text('Organization'), text('warning')]],
    ['missing', 'Demo Organization', [text('Demo')]],
    ['columnheader', 'Value Reveal All', [text('Value'), text('Reveal All')]],
  ])('retains %s text', (kind, name, children) => {
    expect(compact({ role: kind === 'columnheader' ? 'columnheader' : 'button', name, children }).children).toEqual(children);
  });

  it.each(['button', 'cell', 'row', 'form', 'navigation', 'generic'])('does not cross a semantic %s boundary', (role) => {
    const boundary: SemanticNode = { role, children: [text('Organization')] };
    if (role === 'generic') boundary.name = 'Context';
    const output = compact({ role: 'button', name: 'Demo Organization', children: [text('Demo'), boundary] });
    expect(all(output).filter((node) => node.role === 'StaticText').map((node) => node.name)).toEqual(['Demo', 'Organization']);
    expect(all(output).some((node) => node.role === role && node !== output)).toBe(true);
  });

  it.each([
    { states: { focused: true } }, { value: 'note' }, { href: 'https://example.test' }, { level: 2 },
    { children: [{ role: 'button', name: 'Details', children: [] }] },
  ] satisfies Partial<SemanticNode>[])('preserves text with semantic attributes or descendants: %j', (extra) => {
    const children = [text('Demo'), text('Organization', extra)];
    expect(compact({ role: 'button', name: 'Demo Organization', children }).children).toEqual(children);
  });

  it('matches value case sensitively while retaining helper text and textbox state', () => {
    const output = compact({
      role: 'textbox', name: 'Display name', value: 'Demo', states: { readOnly: true },
      children: [{ role: 'generic', children: [text('Demo')] }, text('demo'), text('Visible hint')],
    });
    expect(output).toEqual({
      role: 'textbox', name: 'Display name', value: 'Demo', states: { readOnly: true },
      children: [text('demo'), text('Visible hint')],
    });
  });

  it.each([undefined, '', '[REDACTED]'])('does not use empty or redacted values as duplicate keys: %s', (value) => {
    const child = text('••••••••');
    expect(compact({ role: 'textbox', name: 'Value', value, children: [child] }).children).toEqual([child]);
    if (value === '[REDACTED]') {
      expect(compact({ role: 'textbox', name: 'Value', value, children: [text(value)] }).children).toEqual([text(value)]);
    }
  });

  it('keeps repeated values behind semantic boundaries and stateful wrappers', () => {
    for (const boundary of [
      { role: 'button', name: 'Preview', children: [text('Demo')] },
      { role: 'generic', states: { expanded: false }, children: [text('Demo')] },
    ] satisfies SemanticNode[]) {
      expect(compact({ role: 'textbox', name: 'Value', value: 'Demo', children: [boundary] }).children).toEqual([boundary]);
    }
  });

  it('stays idempotent when ordinary cleanup exposes a complete label sequence', () => {
    const input = treeWith({ role: 'button', name: 'Demo Organization', children: [
      text('Demo Organization'), text('Demo'), text('Organization'), { role: 'image', children: [] },
    ] });
    const once = compressSemanticTree(input, 'compact');
    expect(once.root.children[0]?.children).toEqual([]);
    expect(compressSemanticTree(once, 'compact')).toEqual(once);
  });

  it('removes repeated values before redaction without exposing credentials in any representation', () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
    const input = treeWith({
      role: 'textbox', name: 'Secret value', value: secret, states: { readOnly: true }, children: [text(secret)],
    });
    const compactTree = compressSemanticTree(input, 'compact');
    expect(compactTree.root.children[0]?.children).toEqual([]);
    expect(JSON.stringify(redactSemanticTree(compactTree).tree)).not.toContain(secret);
    for (const format of ['semantic-text', 'markdown'] as const) {
      const safe = prepareExport(input, 'compact', format).serialized.content;
      expect(safe).toContain('[REDACTED]');
      expect(safe).toContain('readonly=true');
      expect(safe).not.toContain(secret);
      expect(prepareExport(input, 'compact', format, false).serialized.content).toContain(secret);
    }
  });
});
