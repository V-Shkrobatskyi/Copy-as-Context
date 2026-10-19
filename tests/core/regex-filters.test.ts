// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { redactSemanticTree, prepareExport, COMPRESSION_LEVELS, type SemanticTree } from '@/src/core';
import { REGEX_EXAMPLES, compileRegex } from '@/src/core/privacy/regex';
import { BUILTIN_FILTERS, LEGACY_BUILTIN_FILTERS, DETECTOR_MODES, LEGACY_RULE_TYPES, RULE_TYPES, defaultRedactionSettings, exportRedactionSettings, importRedactionSettings, validateRedactionSettings, type RedactionSettings } from '@/src/core/privacy/settings';
import { filterExample, testRedactionFilters } from '@/src/core/privacy/test-filters';

const config = (text: string, caseSensitive = true): RedactionSettings => ({
  ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id),
  customRules: [{ id: 'pattern', name: 'Pattern', text, type: 'regex', caseSensitive, enabled: true }],
});
const tree = (text: string): SemanticTree => ({ schemaVersion: 1, title: text, sourceUrl: text, root: { role: 'text', name: text, value: text, href: text, children: [] } });
const redact = (sample: string, pattern: string, sensitive = true) => redactSemanticTree(tree(sample), config(pattern, sensitive));

describe('Regex filters', () => {
  it.each(REGEX_EXAMPLES)('finds the $label example and leaves the near miss', example => {
    expect(testRedactionFilters(config(example.pattern), example.sample).matches).toHaveLength(1);
    expect(testRedactionFilters(config(example.pattern), example.nearMiss).matches).toHaveLength(0);
    expect(importRedactionSettings(exportRedactionSettings(config(example.pattern)))).toEqual(config(example.pattern));
    const item = { key: 'custom:pattern', source: 'custom' as const, rule: config(example.pattern).customRules[0]! };
    expect(filterExample(item).sample).toBe(example.sample);
    expect(filterExample(item, true).sample).toBe(example.nearMiss);
  });

  it('applies matches to text, values, links and metadata without mutating input', () => {
    const input = tree('One client@example.test and two client@example.test.');
    const before = structuredClone(input);
    const result = redactSemanticTree(input, config(REGEX_EXAMPLES[0].pattern));
    expect(result.tree.title).toBe('One [REDACTED] and two [REDACTED].');
    expect(result.tree.sourceUrl).toBe(result.tree.title);
    expect(result.tree.root).toMatchObject({ name: result.tree.title, value: result.tree.title, href: result.tree.title });
    expect(input).toEqual(before);
  });

  it('uses whole matches, preserves slash syntax, Unicode offsets and case settings', () => {
    expect(redact('😀 ACCOUNT-123 account-456', '(ACCOUNT)-[0-9]+').tree.title).toBe('😀 [REDACTED] account-456');
    expect(redact('😀 ACCOUNT-123 account-456', '(ACCOUNT)-[0-9]+', false).tree.title).toBe('😀 [REDACTED] [REDACTED]');
    expect(redact('foo / bar foo bar', 'foo / bar').tree.title).toBe('[REDACTED] foo bar');
  });

  it('ignores empty matches and preserves existing markers even inside broad matches', () => {
    expect(redact('unchanged', '^|$').redactionCount).toBe(0);
    expect(redact('aaa!', 'a*').tree.title).toBe('[REDACTED]!');
    expect(redact('private [REDACTED] private', '.+').tree.title).toBe('[REDACTED][REDACTED][REDACTED]');
    expect(redact('[REDACTED]', '.+').redactionCount).toBe(0);
    const first = redact('private [REDACTED] private', '.+');
    expect(redactSemanticTree(first.tree, config('.+'))).toEqual({ tree: first.tree, redactionCount: 0 });
  });

  it('merges Regex and literal overlaps using the original input', () => {
    const settings = config('account-[0-9]+');
    settings.customRules.push({ id: 'literal', name: 'Literal', type: 'text', text: '123-secret', enabled: true, caseSensitive: true });
    expect(redactSemanticTree(tree('account-123-secret'), settings).tree.title).toBe('[REDACTED]');
  });

  it('does not truncate an overlong AWS suffix to a valid shorter match', () => {
    expect(redact('AKIA0123456789ABCDEFG', REGEX_EXAMPLES[2].pattern).redactionCount).toBe(0);
  });

  it.each(['[', '(?=private)', '(private)\\1'])('rejects invalid or unsupported expressions without exposing them (%s)', pattern => {
    expect(() => validateRedactionSettings(config(pattern))).toThrow('Invalid Regex');
    try { validateRedactionSettings(config(pattern)); } catch (error) { expect((error as Error).message).not.toContain('private'); }
    const disabled = config(pattern); disabled.customRules[0]!.enabled = false;
    expect(() => validateRedactionSettings(disabled)).toThrow('Invalid Regex');
  });

  it('handles a nested repetition on a long nonmatching sample without backtracking', () => {
    expect(redact('a'.repeat(50_000) + '!', '(a+)+$').redactionCount).toBe(0);
  });

  it('asks for user-provided samples for arbitrary expressions', () => {
    expect(() => filterExample({ key: 'custom:pattern', source: 'custom', rule: config('private-[0-9]+').customRules[0]! })).toThrow('Paste your own sample');
  });

  it.each(['semantic-text', 'markdown'] as const)('uses Regex through every %s export profile', format => {
    const settings = config(REGEX_EXAMPLES[0].pattern);
    for (const level of COMPRESSION_LEVELS) {
      const result = prepareExport(tree('client@example.test'), level, format, true, settings);
      expect(result.serialized.content).not.toContain('client@example.test');
      expect(result.serialized.content).toContain('[REDACTED]');
    }
  });

  it('migrates v7 files and stored token types, preserving escaped prefixes and settings', () => {
    const file = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
    file.filters = file.filters.filter((entry: { id: string }) => LEGACY_BUILTIN_FILTERS.some(filter => filter.id === entry.id));
    file.version = 7; file.availableRuleTypes = LEGACY_RULE_TYPES;
    for (const entry of file.filters) {
      const mode = DETECTOR_MODES.find(mode => mode.builtin === entry.id);
      if (mode) { entry.type = mode.key; entry.matchingRule = mode.terms; }
    }
    file.filters.push({ source: 'custom', id: 'old', name: 'Old', type: 'githubTokens', matchingRule: 'company. / private[', caseSensitive: false, enabled: false });
    const migrated = importRedactionSettings(JSON.stringify(file));
    expect(migrated.customRules[0]).toMatchObject({ type: 'regex', caseSensitive: false, enabled: false });
    const pattern = compileRegex(migrated.customRules[0]!.text, false);
    expect(pattern.matcher('COMPANY.abcdefghijklmnopqrst').find()).toBe(true);
    expect(pattern.matcher('companyXabcdefghijklmnopqrst').find()).toBe(false);
    expect(importRedactionSettings(exportRedactionSettings(migrated))).toEqual(migrated);
    expect(RULE_TYPES.map(type => type.id)).not.toContain('githubTokens');
    expect(RULE_TYPES.map(type => type.id)).toContain('jwt');
    expect(JSON.parse(exportRedactionSettings(migrated)).version).toBe(13);
  });
});
