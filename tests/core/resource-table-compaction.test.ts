import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compressSemanticTree, prepareExport, serializeSemanticText, type SemanticNode, type SemanticTree } from '@/src/core';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quality', 'resource-table-compaction');
async function fixture(name: string): Promise<SemanticTree> {
  return JSON.parse(await readFile(resolve(directory, `${name}.json`), 'utf8')) as SemanticTree;
}
function nodes(node: SemanticNode): SemanticNode[] {
  return [node, ...node.children.flatMap(nodes)];
}

describe('resource table compaction', () => {
  it.each(['detailed', 'compact'] as const)('matches reviewed %s tree and text goldens without mutation', async (level) => {
    const input = await fixture('input');
    const original = structuredClone(input);
    const result = compressSemanticTree(input, level);
    expect(result).toEqual(await fixture(level));
    expect(serializeSemanticText(result).content).toBe(await readFile(resolve(directory, `${level}.txt`), 'utf8'));
    expect(input).toEqual(original);
    expect(compressSemanticTree(result, level)).toEqual(result);
  });

  it('removes exactly nine repeated text nodes while retaining the complete action tree', async () => {
    const baseline = await fixture('repeated-text-baseline');
    const result = compressSemanticTree(baseline, 'compact');
    const previous = nodes(baseline.root);
    const current = nodes(result.root);
    expect(result).toEqual(await fixture('compact'));
    expect(previous.length - current.length).toBe(9);
    const signatures = (items: SemanticNode[]) => items
      .filter((node) => node.role !== 'StaticText')
      .map(({ children: _children, ...attributes }) => attributes);
    expect(signatures(current)).toEqual(signatures(previous));
    expect(current.filter((node) => node.role === 'StaticText').map((node) => node.name)).toEqual(['/', 'Name', 'Value']);
    const before = serializeSemanticText(baseline).content;
    const after = serializeSemanticText(result).content;
    expect(Buffer.byteLength(after)).toBeLessThan(Buffer.byteLength(before));
  });

  it('preserves environment, table actions, creation fields and closed states in both export formats', async () => {
    const input = await fixture('input');
    for (const format of ['semantic-text', 'markdown'] as const) {
      const output = prepareExport(input, 'compact', format).serialized.content;
      for (const label of ['Development', 'SAMPLE_KEY_1', 'SAMPLE_KEY_5', 'Copy value', 'More actions', 'New resource name', 'New resource value', 'Root folder']) {
        expect(output).toContain(label);
      }
      for (const state of ['expanded=false', 'checked=false', 'readonly=true', 'disabled=true', 'level=1']) {
        expect(output).toContain(state);
      }
      expect(output).toContain('[REDACTED]');
    }
  });
});
