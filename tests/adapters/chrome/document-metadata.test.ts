import { describe, expect, it } from 'vitest';

import type { SemanticTree } from '@/src/core';
import { addChromeDocumentMetadata as addChromeTabDocumentMetadata } from '@/src/adapters/chrome/document-metadata';

describe('Chrome document metadata', () => {
  const tree: SemanticTree = {
    schemaVersion: 1,
    root: {
      role: 'page',
      name: 'Secrets | Infisical',
      href: 'https://app.example.test/secrets',
      states: { focusable: true },
      children: [{ role: 'main', children: [] }],
    },
  };

  it('uses the root title when Chrome omits the active tab title and avoids duplicate root metadata', () => {
    const result = addChromeTabDocumentMetadata(tree, { url: 'https://app.example.test/secrets' }, '2026.09.28 12:00:00');

    expect(result).toEqual({
      schemaVersion: 1,
      title: 'Secrets | Infisical',
      sourceUrl: 'https://app.example.test/secrets',
      capturedAt: '2026.09.28 12:00:00',
      root: {
        role: 'page',
        states: { focusable: true },
        children: [{ role: 'main', children: [] }],
      },
    });
    expect(tree.root.name).toBe('Secrets | Infisical');
    expect(tree.root.href).toBe('https://app.example.test/secrets');
  });

  it('prefers a non-empty active tab title and falls back to the root URL', () => {
    const result = addChromeTabDocumentMetadata(tree, { title: '  Browser title  ' }, '2026.09.28 12:00:00');

    expect(result.title).toBe('Browser title');
    expect(result.sourceUrl).toBe('https://app.example.test/secrets');
  });

  it('preserves metadata verified during capture rather than a stale tab query', () => {
    const result = addChromeTabDocumentMetadata({ ...tree, title: 'Captured title', sourceUrl: 'https://example.test/current' },
      { title: 'Old tab title', url: 'https://example.test/old' }, '2026.10.11 12:00:00');
    expect(result.title).toBe('Captured title');
    expect(result.sourceUrl).toBe('https://example.test/current');
  });
});
