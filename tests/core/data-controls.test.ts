// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { prepareExport } from '@/src/core/export';
import { COMPRESSION_LEVELS } from '@/src/core/contracts';
import { DEFAULT_DATA_CONTROLS, applyDataControls } from '@/src/core/data-controls';
import { resolveDataControls } from '@/src/policy/model';
import type { SemanticTree } from '@/src/core/model';
const tree: SemanticTree = { schemaVersion: 1, title: 'SYNTHETIC-TITLE', sourceUrl: 'https://example.test/private?secret=SECRET-QUERY#SECRET-FRAGMENT', capturedAt: '2026.10.21 12:00:00', root: { role: 'page', children: [
  { role: 'textbox', name: 'Account label', value: 'SECRET-VALUE', children: [{ role: 'StaticText', name: 'SECRET-VALUE', children: [] }] },
  { role: 'generic', editable: true, children: [{ role: 'StaticText', name: 'SECRET-EDITABLE', children: [] }] },
  { role: 'checkbox', name: 'Agree', states: { checked: true, disabled: false }, children: [] },
  { role: 'link', name: 'Useful link', href: 'https://example.test/route?token=SECRET-LINK#fragment', children: [] },
  { role: 'embedded-document', value: 'Captured', children: [{ role: 'page', name: 'SECRET-FRAME-TITLE', href: 'https://frame.test?SECRET-FRAME-URL', children: [] }] },
] } };
describe('mandatory export exclusions', () => {
  it.each(COMPRESSION_LEVELS)('excludes data before %s serialization, even with redaction off', level => {
    const before = JSON.stringify(tree);
    for (const format of ['markdown', 'semantic-text'] as const) {
      const result = prepareExport(tree, level, format, false, undefined, { includeTitle: false, pageUrl: 'origin', linkUrls: 'without-query', includeFormValues: false });
      const content = result.serialized.content;
      expect(content).not.toContain('SECRET'); expect(content).not.toContain('SYNTHETIC-TITLE'); expect(content).not.toContain('checked=true');
      expect(content).toContain('Account label'); expect(content).toContain('Useful link'); if (level === 'without' || level === 'detailed') expect(content).toContain('https://example.test/route');
      expect(result.characterCount).toBe(content.length); expect(result.approximateTokenCount).toBe(Math.ceil(content.length / 4));
    }
    expect(JSON.stringify(tree)).toBe(before);
  });
  it('keeps the default output and tree identity unchanged', () => {
    expect(applyDataControls(tree)).toBe(tree);
    expect(prepareExport(tree, 'compact', 'markdown', false)).toEqual(prepareExport(tree, 'compact', 'markdown', false, undefined, DEFAULT_DATA_CONTROLS));
  });
  it('does not permit personal preferences to weaken minimum exclusions', () => {
    expect(resolveDataControls({ IncludeFormValues: false, IncludePageTitle: false, PageUrlMode: 'origin', LinkUrlMode: 'omit' })).toEqual({ includeTitle: false, includeFormValues: false, pageUrl: 'origin', linkUrls: 'omit' });
    expect(resolveDataControls({ PageUrlMode: 'without-query' }, { ...DEFAULT_DATA_CONTROLS, pageUrl: 'omit' }).pageUrl).toBe('omit');
  });
});
