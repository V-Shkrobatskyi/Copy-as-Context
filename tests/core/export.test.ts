import { describe, expect, it } from 'vitest';

import { prepareExport, serializeMarkdown, type SemanticTree } from '@/src/core';

describe('safe export pipeline', () => {
  const tree: SemanticTree = {
    schemaVersion: 1,
    title: 'A *test* page',
    root: {
      role: 'page',
      children: [{
        role: 'textbox',
        name: 'Password',
        value: 'not-for-export',
        states: { required: true },
        children: [],
      }],
    },
  };

  it('serializes Markdown deterministically with escaped content and accurate size', () => {
    const result = serializeMarkdown(tree);

    expect(result).toEqual({
      format: 'markdown',
      content: '# A \\*test\\* page\n\n- **page**\n  - **textbox** — Password (value=`not-for-export`, required=true)\n',
      characterCount: result.content.length,
    });
  });

  it('always redacts after compression and reports format-relative metrics', () => {
    const result = prepareExport(tree, 'compact', 'markdown');

    expect(result.serialized.format).toBe('markdown');
    expect(result.serialized.content).toContain('[REDACTED]');
    expect(result.serialized.content).not.toContain('not-for-export');
    expect(result.characterCount).toBe(result.serialized.content.length);
    expect(result.approximateTokenCount).toBe(Math.ceil(result.characterCount / 4));
    expect(result.reductionRatio).toBeGreaterThanOrEqual(0);
    expect(result.redactionCount).toBe(1);
  });
});
