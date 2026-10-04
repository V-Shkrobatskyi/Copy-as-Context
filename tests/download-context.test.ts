import { describe, expect, it } from 'vitest';
import { contextBlob, contextDownloadOptions } from '@/src/download-context';

describe('local context downloads', () => {
  it.each(['semantic-text', 'markdown'] as const)('preserves Unicode, delimiters and newlines in a local Blob for %s', async (format) => {
    const content = 'Context 🙂 東京 Україна\n# heading & percent% comma, + ? <web_page>\n';
    const options = contextDownloadOptions('blob:synthetic-download', format, new Date(2026, 9, 4, 12, 34, 56));
    expect(options.filename).toBe(`2026.10.04_123456.${format === 'markdown' ? 'md' : 'txt'}`);
    expect(options.saveAs).toBe(true);
    expect(options.url).toBe('blob:synthetic-download');
    const blob = contextBlob(content, format);
    expect(blob.type).toBe(`text/${format === 'markdown' ? 'markdown' : 'plain'};charset=utf-8`);
    expect(await blob.text()).toBe(content);
  });

  it('handles isolated UTF-16 surrogates with standard Blob UTF-8 encoding', async () => {
    expect(await contextBlob('Context \ud800', 'semantic-text').text()).toBe('Context \ufffd');
  });
});
