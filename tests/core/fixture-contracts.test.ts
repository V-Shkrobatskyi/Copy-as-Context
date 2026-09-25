import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { SemanticNode, SemanticTree } from '../../src/core';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, '..', 'fixtures');
const rawDirectory = resolve(fixtureDirectory, 'raw-ax');
const semanticDirectory = resolve(fixtureDirectory, 'semantic');
const scenarios = ['basic-page', 'form', 'tabs', 'accordion', 'table', 'dialog'] as const;
const stateKeys = new Set([
  'checked',
  'disabled',
  'expanded',
  'selected',
  'required',
  'focusable',
]);

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

function assertSemanticNode(node: unknown): asserts node is SemanticNode {
  expect(node).toEqual(expect.any(Object));
  const candidate = node as Record<string, unknown>;
  expect(candidate.role).toEqual(expect.any(String));
  expect(Array.isArray(candidate.children)).toBe(true);

  if (candidate.name !== undefined) expect(candidate.name).toEqual(expect.any(String));
  if (candidate.value !== undefined) expect(candidate.value).toEqual(expect.any(String));
  if (candidate.level !== undefined) expect(candidate.level).toEqual(expect.any(Number));
  if (candidate.href !== undefined) expect(candidate.href).toEqual(expect.any(String));

  if (candidate.states !== undefined) {
    expect(candidate.states).toEqual(expect.any(Object));
    for (const [key, value] of Object.entries(candidate.states as Record<string, unknown>)) {
      expect(stateKeys.has(key)).toBe(true);
      if (key === 'checked') expect([true, false, 'mixed']).toContain(value);
      else expect(typeof value).toBe('boolean');
    }
  }

  for (const child of candidate.children as unknown[]) assertSemanticNode(child);
}

describe('fixture corpus', () => {
  it('contains exactly the required raw and semantic scenarios', async () => {
    const [rawFiles, semanticFiles] = await Promise.all([
      readdir(rawDirectory),
      readdir(semanticDirectory),
    ]);
    const expected = scenarios.map((scenario) => `${scenario}.json`).sort();

    expect(rawFiles.filter((file) => file.endsWith('.json')).sort()).toEqual(expected);
    expect(semanticFiles.filter((file) => file.endsWith('.json')).sort()).toEqual(expected);
  });

  for (const scenario of scenarios) {
    it(`has valid raw AX and normalized semantic data for ${scenario}`, async () => {
      const [raw, semantic] = await Promise.all([
        readJson(resolve(rawDirectory, `${scenario}.json`)),
        readJson(resolve(semanticDirectory, `${scenario}.json`)),
      ]);

      expect(raw).toEqual(expect.objectContaining({ nodes: expect.any(Array) }));
      expect((raw as { nodes: unknown[] }).nodes.length).toBeGreaterThan(0);

      const tree = semantic as SemanticTree;
      expect(tree.schemaVersion).toBe(1);
      assertSemanticNode(tree.root);
    });
  }
});
