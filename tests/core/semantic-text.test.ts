import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  compressSemanticTree,
  serializeSemanticText,
  type SemanticTree,
} from '@/src/core';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, '..', 'fixtures');

async function inputTree(scenario: string): Promise<SemanticTree> {
  return JSON.parse(
    await readFile(resolve(fixtureDirectory, 'compression-input', `${scenario}.json`), 'utf8'),
  ) as SemanticTree;
}

describe('semantic text serializer', () => {
  it('renders the compact pipeline as stable golden text', async () => {
    const input = await inputTree('noise-baseline');
    const expected = await readFile(
      resolve(fixtureDirectory, 'semantic-text', 'noise-baseline.compact.txt'),
      'utf8',
    );

    const result = serializeSemanticText(compressSemanticTree(input, 'compact'));

    expect(result).toEqual({
      format: 'semantic-text',
      content: expected,
      characterCount: expected.length,
    });
  });

  it('uses aliases, fixed attribute order, and explicit false states', () => {
    const tree: SemanticTree = {
      schemaVersion: 1,
      root: {
        role: 'page',
        children: [{
          role: 'textbox',
          name: 'Display name',
          value: 'Ada',
          level: 2,
          href: 'https://example.test/settings',
          states: {
            checked: false,
            selected: false,
            expanded: false,
            disabled: false,
            required: true,
            focusable: true,
          },
          children: [],
        }],
      },
    };

    expect(serializeSemanticText(tree).content).toBe(
      'page\n' +
      '  input "Display name" [value="Ada", checked=false, selected=false, expanded=false, disabled=false, required=true, focusable=true, level=2, href="https://example.test/settings"]\n',
    );
  });

  it('keeps unknown roles safe and text fields on one output line', () => {
    const tree: SemanticTree = {
      schemaVersion: 1,
      root: {
        role: 'custom role',
        name: 'line one\n"quoted"\\tab\t',
        children: [],
      },
    };

    const result = serializeSemanticText(tree);

    expect(result.content).toBe('role="custom role" "line one\\n\\"quoted\\"\\\\tab\\t"\n');
    expect(result.content.split('\n')).toHaveLength(2);
    expect(result.characterCount).toBe(result.content.length);
  });
});
