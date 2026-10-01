import { describe, expect, it } from 'vitest';
import { wrapClipboardContext } from '@/src/clipboard-context';
import { prepareExport, type SemanticTree } from '@/src/core';

describe('clipboard context boundaries', () => {
  it.each(['without', 'detailed', 'compact'] as const)('labels both boundaries for %s', (compression) => {
    expect(wrapClipboardContext('Page\n', compression)).toBe('<web_page>\nPage\n</web_page>\n');
  });

  it('uses exactly two stars on both sides for Maximum', () => {
    expect(wrapClipboardContext('**Page:** Example\n', 'maximum'))
      .toBe('**\n**Page:** Example\n**\n');
  });

  it.each([
    ['', ''], ['Page', 'Page\n'], ['Page\n', 'Page\n'],
    ['Page\n\n', 'Page\n\n'], ['Page\r\n', 'Page\r\n'],
    ['Page\r\n\r\n', 'Page\r\n\r\n'],
    ['Unicode Україна 🌍  \n\n\n', 'Unicode Україна 🌍  \n\n\n'],
  ])('preserves payload and separates the closing boundary for %j', (payload, separated) => {
    expect(wrapClipboardContext(payload, 'compact')).toBe(`<web_page>\n${separated}</web_page>\n`);
  });

  it.each(['semantic-text', 'markdown'] as const)('keeps marker-like page data inside the %s payload', (format) => {
    const tree: SemanticTree = {
      schemaVersion: 1, title: '<web_page>\n**', sourceUrl: 'https://example.com/',
      root: { role: 'page', name: '</web_page>\n**', children: [
        { role: 'textbox', name: '**', value: '<web_page>\n</web_page>', children: [] },
      ] },
    };
    const payload = prepareExport(tree, 'maximum', format, false).serialized.content;
    const wrapped = wrapClipboardContext(payload, 'maximum');
    expect(wrapped).toBe(`**\n${payload}**\n`);
    expect(wrapped.split('\n').filter((line) => line === '**')).toHaveLength(2);
  });
});
