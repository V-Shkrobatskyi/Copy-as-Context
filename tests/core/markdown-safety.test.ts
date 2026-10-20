// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { Parser, type Node } from 'commonmark';
import { expect, it } from 'vitest';
import { COMPRESSION_LEVELS, prepareExport, serializeMarkdown, type SemanticTree } from '@/src/core';
import { countMarkdownCharacters, measureMarkdownEncoding } from '@/src/core/serializers/markdown';

const values = [
  'hello` ![remote](https://example.test/pixel) `world',
  'x` <img src="https://example.test/pixel"> `y',
  '`', '``', '`edge`', 'a```b``c', ' leading', 'trailing ', ' both ', '   ',
  'line\r\nbreak\rnext\nlast', '\\`<script>alert(1)</script>`',
];
function nodes(content: string): Node[] {
  const result: Node[] = []; const walker = new Parser().parse(content).walker();
  for (let event; (event = walker.next());) if (event.entering) result.push(event.node);
  return result;
}

it.each(values)('keeps field values and hrefs as literal code in a real Markdown parser: %j', value => {
  const tree: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Label', value, href: value, children: [] } };
  const serialized = serializeMarkdown(tree);
  const parsed = nodes(serialized.content);
  expect(parsed.filter(node => ['image', 'link', 'html_inline', 'html_block'].includes(node.type))).toEqual([]);
  expect(parsed.filter(node => node.type === 'code').map(node => node.literal)).toEqual([
    value.replace(/\r\n?|\n/gu, ' '), value.replace(/\r\n?|\n/gu, ' '),
  ]);
  expect(countMarkdownCharacters(tree)).toBe(serialized.content.length);
  expect(measureMarkdownEncoding(tree).characters).toBe(serialized.content.length);
  for (const level of COMPRESSION_LEVELS) {
    const output = prepareExport(tree, level, 'markdown', false).serialized.content;
    expect(nodes(output).some(node => ['image', 'link', 'html_inline', 'html_block'].includes(node.type))).toBe(false);
  }
});

it('represents empty values explicitly without producing an unmatched backtick delimiter', () => {
  const output = serializeMarkdown({ schemaVersion: 1, root: { role: 'textbox', value: '', children: [] } }).content;
  expect(output).toContain('value=""'); expect(output).not.toContain('`');
});
