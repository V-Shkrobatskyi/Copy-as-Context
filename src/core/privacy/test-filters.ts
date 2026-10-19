// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import type { SemanticTree } from '../model';
import { redactSemanticTree } from './redact';
import { BUILTIN_FILTERS, builtinCaseSensitive, customRuleFromBuiltin, customRuleTerms, defaultRedactionSettings, validateRedactionSettings, type CustomRedactionRule, type RedactionSettings, type RuleType } from './settings';

export const FILTER_TEST_LIMITS = { sample: 100_000, label: 256 } as const;
export interface TestRule {
  key: string;
  source: 'builtin' | 'custom';
  rule: CustomRedactionRule;
}
export interface FilterTestResult {
  output: string;
  fieldLabel?: string;
  redactionCount: number;
  testedCount: number;
  matches: { key: string; source: TestRule['source']; name: string; type: RuleType; redactionCount: number }[];
}

export function testRules(settings: RedactionSettings): TestRule[] {
  return [
    ...BUILTIN_FILTERS.map(filter => ({ key: `builtin:${filter.id}`, source: 'builtin' as const, rule: {
      ...customRuleFromBuiltin(filter.id, builtinCaseSensitive(settings, filter.id)), enabled: !settings.disabledBuiltins.includes(filter.id),
    } })),
    ...settings.customRules.map(rule => ({ key: `custom:${rule.id}`, source: 'custom' as const, rule })),
  ];
}

function isolatedSettings(settings: RedactionSettings, rules: TestRule[]): RedactionSettings {
  const selectedBuiltins = new Set(rules.filter(item => item.source === 'builtin').map(item => item.rule.id));
  return {
    ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.filter(filter => !selectedBuiltins.has(filter.id)).map(filter => filter.id),
    builtinCaseSensitivity: settings.builtinCaseSensitivity,
    customRules: rules.filter(item => item.source === 'custom').map(item => ({ ...item.rule, enabled: true })),
  };
}

/** Selected tests intentionally include an off rule without changing its saved state. */
export function testRedactionFilters(settings: RedactionSettings, sample: string, fieldLabel = '', selectedKey?: string): FilterTestResult {
  if (sample.length > FILTER_TEST_LIMITS.sample || fieldLabel.length > FILTER_TEST_LIMITS.label) throw new Error('Test input exceeds the sample limits.');
  const rules = testRules(settings);
  const selected = selectedKey === undefined ? rules.filter(item => item.rule.enabled) : rules.filter(item => item.key === selectedKey);
  if (selectedKey !== undefined && selected.length !== 1) throw new Error('Choose an existing filter to test.');
  const config = validateRedactionSettings(isolatedSettings(settings, selected));
  const active = testRules(config).filter(item => item.rule.enabled);
  const tree: SemanticTree = { schemaVersion: 1, root: fieldLabel
    ? { role: 'textbox', name: fieldLabel, value: sample, children: [] }
    : { role: 'text', name: sample, children: [] } };
  const result = redactSemanticTree(tree, config);
  // Check original input independently: broad field rules and overlapping patterns
  // must not hide another matching rule from the diagnostic list.
  const matches: FilterTestResult['matches'] = [];
  for (const item of active) {
    const count = active.length === 1 ? result.redactionCount : redactSemanticTree(tree, isolatedSettings(config, [item])).redactionCount;
    if (count) matches.push({ key: item.key, source: item.source, name: item.rule.name, type: item.rule.type!, redactionCount: count });
  }
  return {
    output: (fieldLabel ? result.tree.root.value : result.tree.root.name) ?? '',
    ...(fieldLabel ? { fieldLabel: result.tree.root.name ?? '' } : {}),
    redactionCount: result.redactionCount, testedCount: active.length, matches,
  };
}

/** Examples use the actual rule terms and contain only synthetic values. */
export function filterExample(item: TestRule, nearMiss = false): { sample: string; fieldLabel: string } {
  const rule = validateRedactionSettings(isolatedSettings(defaultRedactionSettings(), [{ ...item, source: 'custom' }])).customRules[0]!;
  const terms = customRuleTerms(rule);
  const term = terms[0]!;
  const shortest = [...terms].sort((a, b) => Array.from(a).length - Array.from(b).length)[0]!;
  const shorter = Array.from(shortest).slice(0, -1).join('');
  let sample: string;
  switch (rule.type) {
    case 'fieldLabels': case 'fieldWords':
      return { fieldLabel: nearMiss ? shorter : term, sample: 'synthetic-value' };
    case 'urlParameters': sample = `https://example.test/?${term}${nearMiss ? '_extra' : ''}=synthetic-value`; break;
    case 'authorization': sample = `${term} ${nearMiss ? 'abc' : 'synthetic12345'}`; break;
    case 'jwt': sample = `${term}${nearMiss ? 'abcd' : 'abcde'}.abcde.abcde`; break;
    case 'githubTokens': sample = `${term}${'a'.repeat(nearMiss ? 19 : 20)}`; break;
    case 'awsKeys': sample = `${term}${nearMiss ? '0123456789ABCDE' : '0123456789ABCDEF'}`; break;
    case 'openaiKeys': sample = `${term}${'a'.repeat(nearMiss ? 15 : 16)}`; break;
    case 'assignedSecrets': sample = `${term}=${nearMiss ? 'short' : 'synthetic-secret'}`; break;
    default: sample = nearMiss ? shorter : term;
  }
  return { sample, fieldLabel: '' };
}
