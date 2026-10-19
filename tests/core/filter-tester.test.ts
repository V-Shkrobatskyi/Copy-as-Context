// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { filterExample, FILTER_TEST_LIMITS, testRedactionFilters, testRules } from '@/src/core/privacy/test-filters';
import { BUILTIN_FILTERS, customRuleFromBuiltin, defaultRedactionSettings, RULE_TYPES, type CustomRedactionRule, type RedactionSettings } from '@/src/core/privacy/settings';

const custom = (extra: Partial<CustomRedactionRule> = {}): CustomRedactionRule => ({ id: 'custom', name: 'Private client', text: 'ACME', type: 'text', caseSensitive: false, enabled: true, ...extra });
const config = (...rules: CustomRedactionRule[]): RedactionSettings => ({ ...defaultRedactionSettings(), customRules: rules });

describe('filter tester', () => {
  it('tests a selected off rule in isolation without changing settings or evaluating unfinished rows', () => {
    const settings = config(custom({ enabled: false }), custom({ id: 'unfinished', name: '', text: '' }));
    const snapshot = structuredClone(settings);
    expect(testRedactionFilters(settings, 'ACME token=abcdefgh', '', 'custom:custom')).toMatchObject({
      output: '[REDACTED] token=abcdefgh', testedCount: 1, redactionCount: 1,
      matches: [{ key: 'custom:custom', source: 'custom', name: 'Private client', type: 'text', redactionCount: 1 }],
    });
    expect(settings).toEqual(snapshot);
    expect(() => testRedactionFilters(settings, 'ACME')).toThrow();
  });

  it('uses only enabled rules for Test all, ignoring unfinished off rules', () => {
    const settings = config(custom({ enabled: false, name: '', text: '' }));
    expect(testRedactionFilters(settings, 'ACME token=abcdefgh')).toMatchObject({ output: 'ACME token=[REDACTED]', matches: [{ key: 'builtin:assignments' }] });
    settings.disabledBuiltins = BUILTIN_FILTERS.map(filter => filter.id);
    expect(testRedactionFilters(settings, 'ACME')).toEqual({ output: 'ACME', redactionCount: 0, testedCount: 0, matches: [] });
  });

  it('reports overlapping rules independently while keeping the combined count merged', () => {
    const settings = config(custom(), custom({ id: 'copy', name: 'Another client filter' }));
    const result = testRedactionFilters(settings, 'ACME');
    expect(result.output).toBe('[REDACTED]'); expect(result.redactionCount).toBe(1);
    expect(result.matches.map(match => [match.key, match.redactionCount])).toEqual([['custom:custom', 1], ['custom:copy', 1]]);
    expect(JSON.stringify(result.matches)).not.toContain('ACME');
  });

  it('reports credential matches even when a field rule hides the entire value first', () => {
    const result = testRedactionFilters(defaultRedactionSettings(), 'eyJabcde.abcde.abcde', 'Token');
    expect(result).toMatchObject({ output: '[REDACTED]', fieldLabel: 'Token', redactionCount: 1 });
    expect(result.matches.map(match => match.key)).toEqual(['builtin:sensitive-fields', 'builtin:jwt']);
  });

  it('exposes a changed field label so counts include only visible result fields', () => {
    const result = testRedactionFilters(config(custom()), 'public value', 'ACME label', 'custom:custom');
    expect(result).toMatchObject({ output: 'public value', fieldLabel: '[REDACTED] label', redactionCount: 1 });
  });

  it('distinguishes custom IDs from built-in IDs and preserves built-in case overrides', () => {
    const settings = config(custom({ id: 'jwt' }));
    expect(testRedactionFilters(settings, 'ACME eyJabcde.abcde.abcde', '', 'custom:jwt').output).toBe('[REDACTED] eyJabcde.abcde.abcde');
    expect(testRedactionFilters(settings, 'ACME eyJabcde.abcde.abcde', '', 'builtin:jwt').output).toBe('ACME [REDACTED]');
    settings.disabledBuiltins = ['aws']; settings.builtinCaseSensitivity = { aws: false };
    expect(testRedactionFilters(settings, 'akia0123456789abcdef', '', 'builtin:aws').output).toBe('[REDACTED]');
    expect(settings.disabledBuiltins).toEqual(['aws']);
  });

  it('does not report protected placeholders as replacements', () => {
    expect(testRedactionFilters(config(custom({ text: '[REDACTED]' })), '[REDACTED]', '', 'custom:custom').matches).toEqual([]);
  });

  it('normalizes older combined rules before reporting their types', () => {
    const settings = config(custom({ type: undefined, text: 'token', fieldLabels: true, urlParameters: true }));
    const result = testRedactionFilters(settings, '?token=private', 'token', 'custom:custom');
    expect(result.testedCount).toBe(2);
    expect(result.matches.map(match => match.type)).toEqual(['fieldLabels', 'urlParameters']);
    expect(result.output).toBe('[REDACTED]');
  });

  it('rejects removed selections and oversized samples without including private input in errors', () => {
    expect(() => testRedactionFilters(defaultRedactionSettings(), 'private', '', 'custom:removed')).toThrow('Choose an existing filter');
    expect(() => testRedactionFilters(defaultRedactionSettings(), 'x'.repeat(FILTER_TEST_LIMITS.sample + 1))).toThrow('sample limits');
    expect(() => testRedactionFilters(defaultRedactionSettings(), 'private', 'x'.repeat(FILTER_TEST_LIMITS.label + 1))).toThrow('sample limits');
  });

  it.each(RULE_TYPES)('provides a matching example and a near miss for $id', type => {
    const builtin = BUILTIN_FILTERS.map(filter => customRuleFromBuiltin(filter.id)).find(rule => rule.type === type.id);
    const settings = config(builtin ? { ...builtin, id: 'custom', enabled: false } : custom({ type: type.id, text: 'client code / private phrase' }));
    const item = testRules(settings).find(item => item.source === 'custom')!;
    const positive = filterExample(item);
    const negative = filterExample(item, true);
    expect(testRedactionFilters(settings, positive.sample, positive.fieldLabel, item.key).matches).toHaveLength(1);
    expect(testRedactionFilters(settings, negative.sample, negative.fieldLabel, item.key).matches).toHaveLength(0);
  });

  it('uses unsaved literal prefixes and parameter names in examples', () => {
    for (const [type, text] of [['authorization', 'Custom[Auth]'], ['urlParameters', 'private.key'], ['githubTokens', 'internal_']] as const) {
      const settings = config(custom({ type, text }));
      const item = testRules(settings).find(item => item.source === 'custom')!;
      const example = filterExample(item);
      expect(example.sample).toContain(text);
      expect(testRedactionFilters(settings, example.sample, example.fieldLabel, item.key).matches).toHaveLength(1);
    }
  });
});
