// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { normalizeChromeAxTree } from '@/src/adapters/chrome/normalize-ax';
import { defaultRedactionSettings } from '@/src/core/privacy/settings';
import { COMPRESSION_LEVELS, prepareExport } from '@/src/core';

describe('numeric AX values', () => {
  it.each([['progressbar', 64], ['slider', 0], ['spinbutton', 1.25]] as const)('preserves %s=%s in every export', (role, value) => {
    const result = normalizeChromeAxTree({ nodes: [
      { nodeId: 'root', role: { value: 'RootWebArea' }, childIds: ['control'] },
      { nodeId: 'control', role: { value: role }, name: { value: 'Public progress' }, value: { value } },
    ] });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.tree.root.children[0]?.value).toBe(String(value));
    for (const level of COMPRESSION_LEVELS) for (const format of ['semantic-text', 'markdown'] as const) {
      const exported = prepareExport(result.tree, level, format, false).serialized.content;
      expect(exported).toContain(format === 'semantic-text' ? `value="${value}"` : `value=\`${value}\``);
      const filters = { ...defaultRedactionSettings(), customRules: [{ id: 'numeric', name: 'Numeric secret', type: 'text' as const, text: String(value), enabled: true, caseSensitive: true }] };
      const redacted = prepareExport(result.tree, level, format, true, filters).serialized.content;
      expect(redacted).toContain('[REDACTED]');
      if (role !== 'progressbar') expect(prepareExport(result.tree, level, format, false, undefined, { includeTitle: true, includeFormValues: false, pageUrl: 'full', linkUrls: 'full' }).serialized.content).not.toContain(`value=`);
    }
  });
  it.each([NaN, Infinity, -Infinity, undefined, true])('ignores invalid numeric values: %s', value => {
    const result = normalizeChromeAxTree({ nodes: [{ nodeId: 'root', role: { value: 'RootWebArea' }, value: { value } }] });
    expect(result.ok).toBe(true); if (result.ok) expect(result.tree.root.value).toBeUndefined();
  });
});
