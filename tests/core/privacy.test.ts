import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { COMPRESSION_LEVELS, prepareExport, redactSemanticTree, serializeMarkdown, serializeSemanticText, type SemanticTree } from '@/src/core';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'privacy',
  'redaction-cases.json',
);

async function privacyFixture(): Promise<{ positive: SemanticTree; negative: SemanticTree }> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as {
    positive: SemanticTree;
    negative: SemanticTree;
  };
}

describe('semantic privacy redaction', () => {
  it('redacts AX value copies and split text inside sensitive fields without changing sibling context or privacy-off exports', () => {
    const tree: SemanticTree = { schemaVersion: 1, root: { role: 'page', children: [
      { role: 'textbox', name: 'API key', value: 'synthetic-sensitive-value', children: [{ role: 'generic', children: [
        { role: 'StaticText', name: 'synthetic-sensitive-value', children: [
          { role: 'InlineTextBox', name: 'synthetic-sensitive-', children: [] },
          { role: 'InlineTextBox', name: 'value', children: [] },
        ] },
      ] }] },
      { role: 'StaticText', name: 'Ordinary sibling context', children: [] },
      { role: 'textbox', name: 'Resource name', value: 'Public resource', children: [{ role: 'StaticText', name: 'Public resource', children: [] }] },
    ] } };
    const original = structuredClone(tree);
    const once = redactSemanticTree(tree);
    expect(redactSemanticTree(once.tree)).toEqual({ tree: once.tree, redactionCount: 0 });
    for (const profile of COMPRESSION_LEVELS) for (const format of ['semantic-text', 'markdown'] as const) {
      const output = prepareExport(tree, profile, format, true).serialized.content;
      expect(output).not.toContain('synthetic');
      expect(output).toContain('Ordinary sibling context');
      expect(output).toContain('Public resource');
      expect(prepareExport(tree, profile, format, false).serialized.content).toContain('synthetic');
    }
    expect(tree).toEqual(original);
  });
  it.each([
    'Bearer abcdefghijklmnop', 'Basic abcdefghijklmnop',
    'eyJabcdef.abcdefgh.abcdefgh',
    ...['p', 'o', 'u', 's', 'r'].map((kind) => `gh${kind}_abcdefghijklmnopqrstuvwxyz`),
    'github_pat_abcdefghijklmnopqrstuvwxyz',
    'AKIA0123456789ABCDEF', 'ASIA0123456789ABCDEF',
    'sk-abcdefghijklmnop', 'sk-proj-abcdefghijklmnop',
    'API_KEY=abcdefghijklmnop', 'api-key: abcdefghijklmnop',
    'token=abcdefghijklmnop', 'secret: abcdefghijklmnop', 'password: abcdefghijklmnop',
    'https://example.test/?API_KEY=synthetic&password=synthetic',
  ])('keeps the fast marker check compatible with credential pattern %s', (text) => {
    const result = redactSemanticTree({ schemaVersion: 1, title: text, root: { role: 'StaticText', name: text, children: [] } });
    expect(result.tree.title).toContain('[REDACTED]');
    expect(result.tree.root.name).toContain('[REDACTED]');
    expect(result.redactionCount).toBeGreaterThanOrEqual(2);
    expect(redactSemanticTree(result.tree).tree).toEqual(result.tree);
  });

  it('redacts credential-shaped text across the whole normalized tree without mutation', async () => {
    const tree = (await privacyFixture()).positive;
    const before = structuredClone(tree);

    const result = redactSemanticTree(tree);
    const output = serializeSemanticText(result.tree).content + serializeMarkdown(result.tree).content;

    expect(tree).toEqual(before);
    expect(result.tree.root.children[0]?.value).toBe('[REDACTED]');
    expect(result.tree.root.children[0]?.name).toBe('Password');
    expect(result.redactionCount).toBeGreaterThanOrEqual(5);
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('synthetic-password-value');
    expect(output).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
    expect(output).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('does not redact ordinary labels, short identifiers, or benign URLs', async () => {
    const tree = (await privacyFixture()).negative;

    const result = redactSemanticTree(tree);

    expect(result.redactionCount).toBe(0);
    expect(result.tree).toEqual(tree);
  });

  it('is idempotent and preserves structure and states', () => {
    const tree: SemanticTree = {
      schemaVersion: 1,
      root: {
        role: 'textbox',
        name: 'API key',
        value: 'a-private-value',
        states: { required: true, disabled: false },
        children: [{
          role: 'link',
          name: 'child',
          href: 'https://example.test/?token=abcdefghijklmnop',
          children: [],
        }],
      },
    };

    const once = redactSemanticTree(tree);
    const twice = redactSemanticTree(once.tree);

    expect(twice.tree).toEqual(once.tree);
    expect(twice.redactionCount).toBe(0);
    expect(once.tree.root.states).toEqual({ required: true, disabled: false });
    expect(once.tree.root.children[0]?.name).toBe('child');
    expect(once.tree.root.children[0]?.href).toBe('https://example.test/?token=[REDACTED]');
  });
});
