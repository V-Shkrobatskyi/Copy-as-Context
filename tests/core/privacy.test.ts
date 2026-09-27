import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { redactSemanticTree, serializeMarkdown, serializeSemanticText, type SemanticTree } from '@/src/core';

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
