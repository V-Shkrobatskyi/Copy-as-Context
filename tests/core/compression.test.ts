import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compressSemanticTree, type SemanticTree } from '@/src/core';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, '..', 'fixtures');
const inputDirectory = resolve(fixtureDirectory, 'compression-input');
const expectedDirectory = resolve(fixtureDirectory, 'compression-expected');

async function inputTree(scenario: string): Promise<SemanticTree> {
  return JSON.parse(await readFile(resolve(inputDirectory, `${scenario}.json`), 'utf8')) as SemanticTree;
}

async function expectedTree(level: 'detailed' | 'compact', scenario: string): Promise<SemanticTree> {
  return JSON.parse(
    await readFile(resolve(expectedDirectory, level, `${scenario}.json`), 'utf8'),
  ) as SemanticTree;
}

async function compressionScenarios(): Promise<string[]> {
  return (await readdir(inputDirectory))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length));
}

describe('semantic tree compression boundary', () => {
  it('matches every detailed target without mutating its input', async () => {
    for (const scenario of await compressionScenarios()) {
      const input = await inputTree(scenario);
      const before = structuredClone(input);

      const output = compressSemanticTree(input, 'detailed');

      expect(output).toEqual(await expectedTree('detailed', scenario));
      expect(output).not.toBe(input);
      expect(output.root).not.toBe(input.root);
      expect(input).toEqual(before);
    }
  });

  it('matches every compact regression target', async () => {
    for (const scenario of await compressionScenarios()) {
      const input = await inputTree(scenario);
      const before = structuredClone(input);

      expect(compressSemanticTree(input, 'compact')).toEqual(await expectedTree('compact', scenario));
      expect(input).toEqual(before);
    }
  });

  it('keeps maximum aligned with the documented compact fallback', async () => {
    const input = await inputTree('noise-baseline');
    expect(compressSemanticTree(input, 'maximum')).toEqual(compressSemanticTree(input, 'compact'));
  });
});
