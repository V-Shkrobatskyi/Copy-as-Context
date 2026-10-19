// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildFilterDemo } from '@/src/core/privacy/demo';
import { BUILTIN_FILTERS, defaultRedactionSettings, type CustomRedactionRule } from '@/src/core/privacy/settings';
import { testRedactionFilters } from '@/src/core/privacy/test-filters';

const custom = (type: CustomRedactionRule['type'], text: string, id = 'sample'): CustomRedactionRule => ({ id, name: id, type, text, enabled: true, caseSensitive: false });

describe('live filter demo examples', () => {
  it('includes only enabled rules, uses the full configuration and does not mutate settings', () => {
    const settings = defaultRedactionSettings(); const snapshot = structuredClone(settings);
    const demo = buildFilterDemo(settings);
    expect(demo.enabledCount).toBe(BUILTIN_FILTERS.length - settings.disabledBuiltins.length);
    expect(demo.examples.some(example => example.ruleName === 'Hide email addresses')).toBe(false);
    expect(demo.examples.find(example => example.fieldLabel === 'Full name')?.output).toBe('Ale******');
    expect(demo.examples.find(example => example.fieldLabel === 'CVV')?.output).toBe('[REDACTED]');
    expect(demo.examples.find(example => example.type === 'emailMaskDomain')?.output).toContain('per***@exa****.test');
    expect(demo.examples.find(example => example.type === 'urlParameters')?.link).toBe(true);
    expect(settings).toEqual(snapshot);
    const hidden = buildFilterDemo({ ...settings, disabledBuiltins: [] });
    expect(hidden.examples.find(example => example.type === 'emailMaskDomain')?.output).toContain('[REDACTED]');
    expect(hidden.examples.find(example => example.fieldLabel === 'Full name')?.output).toBe('[REDACTED]');
  });

  it('uses URL-stable aliases so actual link hrefs match the displayed sample and result', () => {
    const demo = buildFilterDemo(defaultRedactionSettings());
    const query = demo.examples.find(example => example.type === 'urlParameters')!;
    expect(query.sample).toBe('https://example.test/?api_key=synthetic-value');
    expect(new URL(query.sample).href).toBe(query.sample);
    expect(query.output).toBe('https://example.test/?api_key=[REDACTED]');
    const spaces = buildFilterDemo({ ...defaultRedactionSettings(), customRules: [custom('urlParameters', 'private key')] });
    expect(spaces.examples.find(example => example.ruleName === 'sample')?.link).toBe(false);
  });

  it('shows custom literal examples and lists arbitrary Regex without fabricating matching data', () => {
    const settings = { ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id), customRules: [custom('text', '<img src=x onerror=alert(1)>'), custom('regex', 'private-[0-9]{6}', 'regex')] };
    const demo = buildFilterDemo(settings);
    expect(demo.examples).toHaveLength(1);
    expect(demo.examples[0]).toMatchObject({ sample: '<img src=x onerror=alert(1)>', output: '[REDACTED]' });
    expect(demo.unavailable).toEqual([{ key: 'custom:regex', name: 'regex' }]);
    expect(buildFilterDemo({ ...settings, customRules: [] }).enabledCount).toBe(0);
  });
});

describe('filter tester contexts', () => {
  it.each(['auto', 'link', 'title', 'url'] as const)('tests %s using all rules and reports overlapping matches independently', context => {
    const settings = { ...defaultRedactionSettings(), customRules: [custom('text', 'Acme'), custom('regex', 'Acme', 'regex')] };
    const result = testRedactionFilters(settings, 'Acme ?token=short', 'Unrelated label', undefined, context);
    expect(result.output).toBe('[REDACTED] ?token=[REDACTED]');
    expect(result.matches.map(match => match.key)).toEqual(['builtin:query-values', 'custom:sample', 'custom:regex']);
    expect(result.fieldLabel).toBe(context === 'auto' ? 'Unrelated label' : undefined);
  });

  it('applies fields only in a field context and supports isolated off-rule tests in metadata', () => {
    const settings = defaultRedactionSettings();
    expect(testRedactionFilters(settings, 'Alexander', 'Full name').output).toBe('Ale******');
    expect(testRedactionFilters(settings, 'Alexander', 'Full name', undefined, 'title').output).toBe('Alexander');
    expect(testRedactionFilters(settings, 'person@example.test', '', 'builtin:email-hide', 'url').output).toBe('[REDACTED]');
  });
});
