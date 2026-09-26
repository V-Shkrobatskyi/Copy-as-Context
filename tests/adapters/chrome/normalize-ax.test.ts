import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalizeChromeAxTree } from '@/src/adapters/chrome/normalize-ax';
import type { ChromeAxTreeResponse } from '@/src/adapters/chrome/types';
import type { SemanticTree } from '@/src/core';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, '..', '..', 'fixtures');
const scenarios = ['basic-page', 'form', 'tabs', 'accordion', 'table', 'dialog'] as const;

async function fixture<T>(directory: string, scenario: string): Promise<T> {
  return JSON.parse(await readFile(resolve(fixtureDirectory, directory, `${scenario}.json`), 'utf8')) as T;
}

describe('normalizeChromeAxTree', () => {
  for (const scenario of scenarios) {
    it(`normalizes the ${scenario} fixture`, async () => {
      const [raw, expected] = await Promise.all([
        fixture<ChromeAxTreeResponse>('raw-ax', scenario),
        fixture<SemanticTree>('semantic', scenario),
      ]);

      expect(normalizeChromeAxTree(raw)).toEqual({ ok: true, tree: expected });
    });
  }

  it('maps states, href, values, and RootWebArea without leaking CDP IDs', () => {
    const result = normalizeChromeAxTree({
      nodes: [
        {
          nodeId: 'root',
          childIds: ['link'],
          role: { value: 'RootWebArea' },
        },
        {
          nodeId: 'link',
          role: { value: 'link' },
          name: { value: 'Docs' },
          value: { value: 'read me' },
          properties: [
            { name: 'url', value: { value: 'https://example.test/docs' } },
            { name: 'focusable', value: { value: true } },
          ],
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      tree: {
        schemaVersion: 1,
        root: {
          role: 'page',
          children: [
            {
              role: 'link',
              name: 'Docs',
              value: 'read me',
              href: 'https://example.test/docs',
              states: { focusable: true },
              children: [],
            },
          ],
        },
      },
    });
  });

  it.each([
    ['empty nodes', { nodes: [] }],
    ['missing child', { nodes: [{ nodeId: 'root', childIds: ['missing'], role: { value: 'page' } }] }],
    [
      'cycle',
      {
        nodes: [
          { nodeId: 'a', childIds: ['b'], role: { value: 'page' } },
          { nodeId: 'b', childIds: ['a'], role: { value: 'generic' } },
        ],
      },
    ],
    [
      'disconnected node',
      {
        nodes: [
          { nodeId: 'root', role: { value: 'page' } },
          { nodeId: 'other', role: { value: 'generic' } },
        ],
      },
    ],
    [
      'shared child',
      {
        nodes: [
          { nodeId: 'root', childIds: ['a', 'b'], role: { value: 'page' } },
          { nodeId: 'a', childIds: ['shared'], role: { value: 'generic' } },
          { nodeId: 'b', childIds: ['shared'], role: { value: 'generic' } },
          { nodeId: 'shared', role: { value: 'button' } },
        ],
      },
    ],
  ])('returns invalid-tree for %s', (_label, raw) => {
    const result = normalizeChromeAxTree(raw as ChromeAxTreeResponse);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-tree');
  });
});
