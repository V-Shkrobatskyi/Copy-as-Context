import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  compressSemanticTree,
  prepareExport,
  type SemanticNode,
  type SemanticTree,
} from '@/src/core';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'quality',
  'chrome-mvp-representative.json',
);

async function representativeTree(): Promise<SemanticTree> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as SemanticTree;
}

function findByRoleAndName(node: SemanticNode, role: string, name: string): SemanticNode | undefined {
  if (node.role === role && node.name === name) return node;
  return node.children.flatMap((child) => findByRoleAndName(child, role, name) ?? []).at(0);
}

function hasRole(node: SemanticNode, role: string): boolean {
  return node.role === role || node.children.some((child) => hasRole(child, role));
}

function namesForRole(node: SemanticNode, role: string): string[] {
  const own = node.role === role && node.name !== undefined ? [node.name] : [];
  return [...own, ...node.children.flatMap((child) => namesForRole(child, role))];
}

describe('representative Chrome MVP quality gates', () => {
  it('preserves dashboard, form, navigation, table, dialog, menu, and article semantics in Compact', async () => {
    const tree = await representativeTree();
    const compact = compressSemanticTree(tree, 'compact');

    expect(findByRoleAndName(compact.root, 'main', 'Workspace overview')).toBeDefined();
    expect(findByRoleAndName(compact.root, 'button', 'Create task')).toBeDefined();
    expect(findByRoleAndName(compact.root, 'textbox', 'Display name')?.value).toBe('Synthetic workspace');
    expect(findByRoleAndName(compact.root, 'textbox', 'Password')?.states).toEqual({ required: true });
    expect(findByRoleAndName(compact.root, 'checkbox', 'Send weekly summary')?.states).toEqual({ checked: true });
    expect(findByRoleAndName(compact.root, 'button', 'Advanced options')?.states).toEqual({ expanded: false });
    expect(findByRoleAndName(compact.root, 'table', 'Recent tasks')).toBeDefined();
    expect(findByRoleAndName(compact.root, 'dialog', 'Archive workspace')).toBeDefined();
    expect(findByRoleAndName(compact.root, 'menu', 'Task actions')).toBeDefined();
    expect(findByRoleAndName(compact.root, 'article', 'Release guide')).toBeDefined();
    expect(namesForRole(compact.root, 'tab')).toEqual(['Activity', 'Members']);
    expect(namesForRole(compact.root, 'menuitem')).toEqual(['Duplicate', 'Delete']);
    expect(findByRoleAndName(compact.root, 'InlineTextBox', 'Overview')).toBeUndefined();
    expect(hasRole(compact.root, 'generic')).toBe(false);
    expect(hasRole(compact.root, 'none')).toBe(false);
  });

  it('exports only redacted representative content in both supported formats with comparable metrics', async () => {
    const tree = await representativeTree();

    for (const format of ['semantic-text', 'markdown'] as const) {
      const detailed = prepareExport(tree, 'detailed', format);
      const compact = prepareExport(tree, 'compact', format);

      expect(compact.serialized.content).toContain('[REDACTED]');
      expect(compact.serialized.content).not.toContain('synthetic-password-value');
      expect(compact.serialized.content).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
      expect(compact.serialized.content).not.toContain('sk-proj_abcdefghijklmnopqrstuvwxyz');
      expect(compact.serialized.content).toContain('Collapsed content remains available');
      expect(compact.characterCount).toBe(compact.serialized.content.length);
      expect(compact.approximateTokenCount).toBe(Math.ceil(compact.characterCount / 4));
      expect(compact.reductionRatio).toBeGreaterThanOrEqual(0);
      // Compact omits the unique named guide link, so its token-like URL no
      // longer reaches redaction; title and password-shaped value still must.
      expect(compact.redactionCount).toBeGreaterThanOrEqual(2);
      expect(compact.characterCount).toBeLessThan(detailed.characterCount);
    }
  });
});
