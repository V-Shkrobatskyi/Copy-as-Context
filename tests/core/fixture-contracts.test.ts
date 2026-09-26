import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { SemanticTree } from '@/src/core';
import { assertSemanticNode } from '@/tests/helpers/assert-semantic-node';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, '..', 'fixtures');
const rawDirectory = resolve(fixtureDirectory, 'raw-ax');
const semanticDirectory = resolve(fixtureDirectory, 'semantic');
const scenarios = ['basic-page', 'form', 'tabs', 'accordion', 'table', 'dialog'] as const;
async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
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
