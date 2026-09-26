import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  compressSemanticTree,
  serializeSemanticText,
  type SemanticNode,
  type SemanticTree,
} from '@/src/core';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, '..', 'fixtures');
const semanticDirectory = resolve(fixtureDirectory, 'semantic');

const IMPORTANT_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch',
  'slider', 'spinbutton', 'tab', 'menuitem', 'option', 'treeitem', 'gridcell', 'cell',
  'dialog', 'alertdialog', 'heading', 'tablist', 'tabpanel', 'table', 'row',
  'columnheader', 'rowheader', 'form', 'list', 'listitem', 'menu', 'navigation', 'main',
]);

async function readTree(path: string): Promise<SemanticTree> {
  return JSON.parse(await readFile(path, 'utf8')) as SemanticTree;
}

function importantSignatures(node: SemanticNode, path: readonly string[] = []): string[] {
  const nextPath = [...path, node.role];
  const own = IMPORTANT_ROLES.has(node.role) || node.value !== undefined || node.states !== undefined
    ? [JSON.stringify({ path: nextPath, role: node.role, name: node.name, value: node.value, states: node.states })]
    : [];
  return [...own, ...node.children.flatMap((child) => importantSignatures(child, nextPath))];
}

describe('compression quality gates', () => {
  it('makes the noisy fixture shorter without mutating semantic content', async () => {
    const input = await readTree(resolve(fixtureDirectory, 'compression-input', 'noise-baseline.json'));
    const detailed = serializeSemanticText(compressSemanticTree(input, 'detailed'));
    const compact = serializeSemanticText(compressSemanticTree(input, 'compact'));

    expect(compact.characterCount).toBeLessThan(detailed.characterCount);
  });

  it('preserves important semantic signatures from every normalized fixture', async () => {
    const files = (await readdir(semanticDirectory)).filter((file) => file.endsWith('.json')).sort();

    for (const file of files) {
      const input = await readTree(resolve(semanticDirectory, file));
      const compact = compressSemanticTree(input, 'compact');
      expect(importantSignatures(compact.root)).toEqual(expect.arrayContaining(importantSignatures(input.root)));
    }
  });
});
