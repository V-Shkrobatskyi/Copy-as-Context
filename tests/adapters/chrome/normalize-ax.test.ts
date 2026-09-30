import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalizeChromeAxTree } from '@/src/adapters/chrome/normalize-ax';
import type { ChromeAxTreeResponse } from '@/src/adapters/chrome/types';
import { compressSemanticTree, serializeSemanticText, type SemanticTree } from '@/src/core';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, '..', '..', 'fixtures');
const scenarios = ['basic-page', 'form', 'tabs', 'accordion', 'table', 'dialog', 'checked-tristate'] as const;

async function fixture<T>(directory: string, scenario: string): Promise<T> {
  return JSON.parse(await readFile(resolve(fixtureDirectory, directory, `${scenario}.json`), 'utf8')) as T;
}

describe('normalizeChromeAxTree', () => {
  it('preserves CDP tristate checked tokens through every compression profile', async () => {
    const raw = await fixture<ChromeAxTreeResponse>('raw-ax', 'checked-tristate');
    const result = normalizeChromeAxTree(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    for (const level of ['without', 'detailed', 'compact', 'maximum'] as const) {
      const tree = compressSemanticTree(result.tree, level);
      expect(tree.root.children.map((node) => node.states?.checked)).toEqual([false, true, 'mixed']);
      const content = serializeSemanticText(tree).content;
      expect(content).toContain('checked=false');
      expect(content).toContain('checked=true');
      expect(content).toContain('checked=mixed');
    }
  });

  it.each(['unknown', '', 0, 1, null])('ignores unsupported checked values without coercion: %s', (value) => {
    const result = normalizeChromeAxTree({ nodes: [{
      nodeId: 'root', role: { value: 'checkbox' }, properties: [
        { name: 'checked', value: { type: 'tristate', value } },
        { name: 'expanded', value: { value: 'false' } },
      ],
    }] });
    expect(result).toEqual({ ok: true, tree: { schemaVersion: 1, root: { role: 'checkbox', children: [] } } });
  });

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
            { name: 'readonly', value: { value: true } },
            { name: 'focused', value: { value: true } },
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
              states: { focusable: true, readOnly: true, focused: true },
              children: [],
            },
          ],
        },
      },
    });
  });

  it('normalizes the root frame when embedded frames reuse AX node IDs', () => {
    const result = normalizeChromeAxTree({
      nodes: [
        {
          nodeId: '1',
          frameId: 'main-frame',
          childIds: ['2'],
          role: { value: 'RootWebArea' },
        },
        {
          nodeId: '2',
          frameId: 'main-frame',
          role: { value: 'button' },
          name: { value: 'Continue' },
        },
        {
          nodeId: '1',
          frameId: 'embedded-frame',
          childIds: ['2'],
          role: { value: 'RootWebArea' },
        },
        {
          nodeId: '2',
          frameId: 'embedded-frame',
          role: { value: 'link' },
          name: { value: 'Embedded content' },
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      tree: {
        schemaVersion: 1,
        root: {
          role: 'page',
          children: [{ role: 'button', name: 'Continue', children: [] }],
        },
      },
    });
  });

  it('keeps root-document descendants when Chrome omits their frame IDs', () => {
    const result = normalizeChromeAxTree({
      nodes: [
        {
          nodeId: 'root',
          frameId: 'main-frame',
          childIds: ['main'],
          role: { value: 'RootWebArea' },
        },
        {
          nodeId: 'main',
          childIds: ['heading', 'button'],
          role: { value: 'main' },
        },
        {
          nodeId: 'heading',
          role: { value: 'heading' },
          name: { value: 'Overview' },
        },
        {
          nodeId: 'button',
          role: { value: 'button' },
          name: { value: 'Create task' },
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
              role: 'main',
              children: [
                { role: 'heading', name: 'Overview', children: [] },
                { role: 'button', name: 'Create task', children: [] },
              ],
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
