import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { SemanticTree } from '@/src/core';
import { assertSemanticNode } from '@/tests/helpers/assert-semantic-node';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, '..', 'fixtures');
const inputDirectory = resolve(fixtureDirectory, 'compression-input');
const detailedDirectory = resolve(fixtureDirectory, 'compression-expected', 'detailed');
const compactDirectory = resolve(fixtureDirectory, 'compression-expected', 'compact');

async function readTree(path: string): Promise<SemanticTree> {
  return JSON.parse(await readFile(path, 'utf8')) as SemanticTree;
}

describe('compression fixture corpus', () => {
  it('pairs each input with detailed and compact targets', async () => {
    const [inputs, detailed, compact] = await Promise.all([
      readdir(inputDirectory),
      readdir(detailedDirectory),
      readdir(compactDirectory),
    ]);
    const json = (files: string[]) => files.filter((file) => file.endsWith('.json')).sort();

    expect(json(detailed)).toEqual(json(inputs));
    expect(json(compact)).toEqual(json(inputs));
  });

  for (const scenario of ['noise-baseline', 'interactive-safety'] as const) {
    it(`keeps valid tree contracts in ${scenario}`, async () => {
      const [input, detailed, compact] = await Promise.all([
        readTree(resolve(inputDirectory, `${scenario}.json`)),
        readTree(resolve(detailedDirectory, `${scenario}.json`)),
        readTree(resolve(compactDirectory, `${scenario}.json`)),
      ]);

      expect(input.schemaVersion).toBe(1);
      expect(detailed.schemaVersion).toBe(1);
      expect(compact.schemaVersion).toBe(1);
      assertSemanticNode(input.root);
      assertSemanticNode(detailed.root);
      assertSemanticNode(compact.root);
    });
  }
});
