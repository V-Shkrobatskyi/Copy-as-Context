import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compressSemanticTree, serializeSemanticText, type SemanticNode, type SemanticTree } from '@/src/core';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quality', 'infisical-profiles.json',
);

async function profileTree(): Promise<SemanticTree> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as SemanticTree;
}

function nodes(node: SemanticNode): SemanticNode[] {
  return [node, ...node.children.flatMap(nodes)];
}

function named(node: SemanticNode, role: string, name: string): SemanticNode | undefined {
  return nodes(node).find((candidate) => candidate.role === role && candidate.name === name);
}

describe('compression profile contracts', () => {
  it('keeps Without unpruned while Detailed removes only empty none wrappers', async () => {
    const tree = await profileTree();
    const without = compressSemanticTree(tree, 'without');
    const detailed = compressSemanticTree(tree, 'detailed');

    expect(without).toEqual(tree);
    expect(nodes(without.root).some((node) => node.role === 'none')).toBe(true);
    expect(nodes(detailed.root).some((node) => node.role === 'none')).toBe(false);
    expect(nodes(detailed.root).some((node) => node.role === 'generic')).toBe(true);
    expect(named(detailed.root, 'InlineTextBox', 'Demo Organization')).toBeDefined();
    expect(named(detailed.root, 'link', 'Secrets')?.href).toBe('https://example.test/project/secrets');
    expect(named(detailed.root, 'textbox', 'Secret value')?.states).toMatchObject({
      required: false, focusable: true, readOnly: true, focused: true,
    });
  });

  it('makes Compact LLM-oriented without losing navigation, table, or meaningful state', async () => {
    const compact = compressSemanticTree(await profileTree(), 'compact');
    const serialized = serializeSemanticText(compact).content;

    expect(nodes(compact.root).some((node) => node.role === 'none' || node.role === 'generic')).toBe(false);
    expect(nodes(compact.root).some((node) => node.role === 'InlineTextBox')).toBe(false);
    expect(named(compact.root, 'button', 'Administration')?.states).toEqual({ expanded: true });
    expect(named(compact.root, 'textbox', 'Secret value')?.states).toEqual({ readOnly: true, focused: true });
    expect(named(compact.root, 'table', 'Secrets')).toBeDefined();
    expect(named(compact.root, 'cell', 'SERVICE_TOKEN')).toBeDefined();
    expect(named(compact.root, 'button', 'Copy secret value')).toBeDefined();
    expect(named(compact.root, 'link', 'Secrets')?.href).toBeUndefined();
    expect(nodes(compact.root).filter((node) => node.role === 'link' && node.name === 'Details').map((node) => node.href))
      .toEqual(['https://example.test/first', 'https://example.test/second']);
    expect(serialized).not.toContain('focusable=true');
    expect(serialized).not.toContain('required=false');
    expect(serialized).toContain('readonly=true');
    expect(serialized).toContain('focused=true');
  });
});
