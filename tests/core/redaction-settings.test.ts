// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { BUILTIN_FILTERS, EXTRA_MODE_KEYS, RULE_TYPES, legacyRuleFromType, customRuleFromBuiltin, defaultRedactionSettings, exportRedactionSettings, importRedactionSettings, REDACTION_LIMITS, validateRedactionSettings, type RedactionSettings } from '@/src/core/privacy/settings';
import { redactSemanticTree, prepareExport, COMPRESSION_LEVELS, type SemanticTree } from '@/src/core';

const rule = (text: string, extra = {}) => ({ id: 'example', name: 'Example', text, caseSensitive: false, enabled: true, ...extra });
const tree = (text: string): SemanticTree => ({ schemaVersion: 1, title: text, sourceUrl: `https://example.test/${text}`, root: { role: 'text', name: text, value: text, href: `https://example.test/${text}`, children: [] } });
const config = (text: string, extra = {}): RedactionSettings => ({ ...defaultRedactionSettings(), customRules: [rule(text, extra)] });

describe('custom redaction filters', () => {
  it('redacts only URL parameter values with every built-in disabled', () => {
    const settings: RedactionSettings = { ...config('client_key / private.token', { urlParameters: true, fieldLabels: false }), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) };
    const text = 'https://example.test/client_key?x=keep&client_key=short&private.token=abc=def&privateXtoken=keep#anchor';
    const expected = 'https://example.test/client_key?x=keep&client_key=[REDACTED]&private.token=[REDACTED]&privateXtoken=keep#anchor';
    const input = tree(text); const snapshot = structuredClone(input);
    const result = redactSemanticTree(input, settings);
    expect(result.tree.title).toBe(expected);
    expect(result.tree.root.href).toBe(`https://example.test/${expected}`);
    expect(result.tree.root.name).toBe(expected);
    expect(input).toEqual(snapshot);
    expect(redactSemanticTree(result.tree, settings).redactionCount).toBe(0);
    expect(redactSemanticTree(tree('client_key abc'), settings).tree.title).toBe('client_key abc');
  });

  it('respects URL mode case sensitivity, enabled state, repeated and empty parameters', () => {
    const text = '?CLIENT_KEY=one&client_key=&client_key=two&client_key=[REDACTED]&x=client_key';
    expect(redactSemanticTree(tree(text), config('client_key', { urlParameters: true })).tree.title).toBe('?CLIENT_KEY=[REDACTED]&client_key=&client_key=[REDACTED]&client_key=[REDACTED]&x=client_key');
    expect(redactSemanticTree(tree(text), config('client_key', { urlParameters: true, caseSensitive: true })).tree.title).toContain('?CLIENT_KEY=one');
    expect(redactSemanticTree(tree(text), config('client_key', { urlParameters: true, enabled: false })).tree.title).toBe(text);
  });

  it('can reproduce Secret URL parameters with literal parameter names', () => {
    const settings: RedactionSettings = { ...config('api key / api_key / api-key / apikey / token / secret / password', { urlParameters: true }), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) };
    const builtinOnly: RedactionSettings = { ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.filter(filter => filter.id !== 'query-values').map(filter => filter.id) };
    const input = tree('?API_KEY=one&api-key=two&apikey=three&api key=four&token=short&secret=x&password=y&public=keep');
    expect(redactSemanticTree(input, settings)).toEqual(redactSemanticTree(input, builtinOnly));
  });

  it('combines Field labels and URL parameters and merges overlapping replacements', () => {
    const settings: RedactionSettings = { ...config('client_key', { urlParameters: true, fieldLabels: true }), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) };
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'client_key', value: 'secret', href: 'https://example.test/?client_key=secret', children: [] } };
    const result = redactSemanticTree(input, settings);
    expect(result.tree.root.name).toBe('client_key');
    expect(result.tree.root.value).toBe('[REDACTED]');
    expect(result.tree.root.href).toBe('https://example.test/?client_key=[REDACTED]');
    settings.customRules.push(rule('secret', { id: 'overlap' }));
    expect(redactSemanticTree(input, settings)).toEqual(result);
  });

  it.each(['semantic-text', 'markdown'] as const)('applies URL parameter rules to all %s compression profiles and baseline metrics', format => {
    const settings: RedactionSettings = { ...config('client_key', { urlParameters: true }), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) };
    const input = tree('https://example.test/?client_key=synthetic-url-value');
    const baseline = prepareExport(input, 'without', format, true, settings).characterCount;
    for (const level of COMPRESSION_LEVELS) {
      const result = prepareExport(input, level, format, true, settings);
      expect(result.serialized.content).not.toContain('synthetic-url-value');
      expect(result.reductionRatio).toBe(Math.max(0, 1 - result.characterCount / baseline));
      expect(prepareExport(input, level, format, false, settings).serialized.content).toContain('synthetic-url-value');
    }
  });
  it.each([
    ['authorization', 'bearer abcdefghijklmnop'], ['jwt', 'EYJabcdef.abcdefgh.abcdefgh'],
    ['github', 'GHP_abcdefghijklmnopqrstuvwxyz'], ['aws', 'akia0123456789abcdef'],
    ['openai', 'SK-abcdefghijklmnop'], ['assignments', 'TOKEN=abcdefghijk'],
    ['query-values', 'https://example.test/?TOKEN=short'],
  ] as const)('honors the built-in %s case-sensitivity setting', (id, sample) => {
    const settings: RedactionSettings = { ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.filter(filter => filter.id !== id).map(filter => filter.id) };
    const insensitive = { ...settings, builtinCaseSensitivity: { [id]: false } };
    const sensitive = { ...settings, builtinCaseSensitivity: { [id]: true } };
    expect(redactSemanticTree(tree(sample), insensitive).tree.title).toContain('[REDACTED]');
    expect(redactSemanticTree(tree(sample), sensitive).tree.title).toBe(sample);
  });

  it('honors case sensitivity for built-in field labels without changing their defaults', () => {
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Password', value: 'short', children: [] } };
    expect(redactSemanticTree(input).tree.root.value).toBe('[REDACTED]');
    expect(redactSemanticTree(input, { ...defaultRedactionSettings(), builtinCaseSensitivity: { 'sensitive-fields': true } }).tree.root.value).toBe('short');
  });
  it('matches the same slash-separated alternatives as text or field labels', () => {
    const text = 'client code / project id';
    expect(redactSemanticTree(tree('Client code and project ID'), config(text, { fieldLabels: false })).tree.title).toBe('[REDACTED] and [REDACTED]');
    const field: SemanticTree = { schemaVersion: 1, title: 'Client code', root: { role: 'textbox', name: 'Client CODE', value: 'short', children: [{ role: 'generic', children: [{ role: 'text', name: 'short', children: [] }] }] } };
    const result = redactSemanticTree(field, config(text, { fieldLabels: true }));
    expect(result.tree.title).toBe(field.title);
    expect(result.tree.root.name).toBe('Client CODE');
    expect(result.tree.root.value).toBe('[REDACTED]');
    expect(result.tree.root.children[0]!.children[0]!.name).toBe('[REDACTED]');
    expect(redactSemanticTree(result.tree, config(text, { fieldLabels: true })).redactionCount).toBe(0);
    expect(redactSemanticTree(field, config(text, { fieldLabels: true, caseSensitive: true })).tree).toEqual(field);
    expect(redactSemanticTree(field, config(text, { fieldLabels: true, enabled: false })).tree).toEqual(field);
    expect(redactSemanticTree({ schemaVersion: 1, root: { role: 'text', name: 'client code', children: [] } }, config(text, { fieldLabels: true })).redactionCount).toBe(0);
  });

  it('keeps commas, regex symbols and URL slashes literal in either mode', () => {
    const text = 'https://internal.test/a/b / name, surname / a.b';
    expect(redactSemanticTree(tree('https://internal.test/a/b name, surname a.b axb'), config(text, { fieldLabels: false })).tree.title).toBe('[REDACTED] [REDACTED] [REDACTED] axb');
    const field: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'name, surname', value: 'short', children: [] } };
    expect(redactSemanticTree(field, config(text, { fieldLabels: true })).tree.root.value).toBe('[REDACTED]');
    expect(redactSemanticTree(tree('one / two'), config('one / two')).tree.title).toBe('[REDACTED]');
    expect(redactSemanticTree(tree('one'), config('one / two')).tree.title).toBe('one');
  });

  it.each(['semantic-text', 'markdown'] as const)('applies saved field-label rules in every %s compression profile', format => {
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'page', children: [{ role: 'textbox', name: 'Private code', value: 'synthetic-hidden-field-value', children: [] }] } };
    const settings = importRedactionSettings(exportRedactionSettings(config('pass / private code', { fieldLabels: true })));
    for (const level of COMPRESSION_LEVELS) {
      expect(prepareExport(input, level, format, true, settings).serialized.content).not.toContain('synthetic-hidden-field-value');
      expect(prepareExport(input, level, format, false, settings).serialized.content).toContain('synthetic-hidden-field-value');
    }
  });
  it('preserves the existing defaults and can switch each builtin group off', () => {
    const cases = [
      ['authorization', 'Bearer abcdefghijklmnop'], ['jwt', 'eyJabcdef.abcdefgh.abcdefgh'],
      ['github', 'ghp_abcdefghijklmnopqrstuvwxyz'], ['aws', 'AKIA0123456789ABCDEF'],
      ['openai', 'sk-abcdefghijklmnop'], ['assignments', 'token=abcdefghijk'],
      ['query-values', 'https://example.test/?token=short'],
    ] as const;
    for (const [id, text] of cases) {
      expect(redactSemanticTree(tree(text)).tree.title).toContain('[REDACTED]');
      expect(redactSemanticTree(tree(text), { ...defaultRedactionSettings(), disabledBuiltins: [id] }).tree.title).toBe(text);
    }
    const field: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Password', value: 'short', children: [{ role: 'text', name: 'short', children: [] }] } };
    const settings: RedactionSettings = { ...defaultRedactionSettings(), disabledBuiltins: ['sensitive-fields'] };
    expect(redactSemanticTree(field).tree.root.value).toBe('[REDACTED]');
    expect(redactSemanticTree(field, settings).tree).toEqual(field);
    expect(redactSemanticTree(tree('token=abcdefgh'), { ...settings, disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) }).redactionCount).toBe(0);
  });

  it('applies custom literal text throughout metadata and semantic fields without requiring a credential marker', () => {
    const input = tree('Acme Corporation'); const snapshot = structuredClone(input);
    const result = redactSemanticTree(input, config('Acme Corporation'));
    expect(JSON.stringify(result.tree)).not.toContain('Acme Corporation');
    expect(result.tree.title).toBe('[REDACTED]');
    expect(input).toEqual(snapshot);
    expect(redactSemanticTree(result.tree, config('Acme Corporation'))).toEqual({ tree: result.tree, redactionCount: 0 });
  });

  it.each(['(a+)+$', 'a.b', '[abc]', '$&', 'a|b', '\\', 'literal\ntext', '😀'])('treats %j literally and protects replacement markers', text => {
    const result = redactSemanticTree(tree(`before ${text} after [REDACTED]`), config(text));
    expect(result.tree.title).toBe('before [REDACTED] after [REDACTED]');
    expect(redactSemanticTree(result.tree, config(text)).redactionCount).toBe(0);
  });

  it('supports Unicode case matching and disabled rules', () => {
    expect(redactSemanticTree(tree('КЛІЄНТ'), config('клієнт')).tree.title).toBe('[REDACTED]');
    expect(redactSemanticTree(tree('КЛІЄНТ'), config('клієнт', { caseSensitive: true })).tree.title).toBe('КЛІЄНТ');
    expect(redactSemanticTree(tree('Acme'), config('Acme', { enabled: false })).redactionCount).toBe(0);
    expect(redactSemanticTree(tree('[REDACTED]'), config('REDACTED')).redactionCount).toBe(0);
  });

  it('merges overlaps between custom modes and builtins without revealing unmatched portions', () => {
    const settings = config('Acme');
    settings.customRules.push(rule('ACME Corporation', { id: 'second', caseSensitive: true }));
    expect(redactSemanticTree(tree('ACME Corporation'), settings).tree.title).toBe('[REDACTED]');
    const overlapping = config('ab');
    overlapping.customRules.push(rule('bc', { id: 'third' }));
    expect(redactSemanticTree(tree('abc'), overlapping).tree.title).toBe('[REDACTED]');
    expect(redactSemanticTree(tree('ababa'), config('aba')).tree.title).toBe('[REDACTED]');
    expect(redactSemanticTree(tree('😀😀😀'), config('😀😀')).tree.title).toBe('[REDACTED]');
    expect(redactSemanticTree(tree('token=abcdefgh Client Name'), config('abcdefgh Client Name')).tree.title).toBe('token=[REDACTED]');
    expect(redactSemanticTree(tree('Bearer abcdefghijklmnop'), config('Bearer')).tree.title).toBe('[REDACTED]');
  });

  it('handles dense one-character rules as merged spans', () => {
    const input = { schemaVersion: 1 as const, root: { role: 'text', name: 'a'.repeat(100_000), children: [] } };
    const result = redactSemanticTree(input, config('a'));
    expect(result.tree.root.name).toBe('[REDACTED]'); expect(result.redactionCount).toBe(1);
  });

  it.each(['semantic-text', 'markdown'] as const)('uses selected filters for every compression profile in %s, including baseline metrics', format => {
    const input = tree('Acme Corporation'); const settings = config('Acme Corporation');
    const baseline = prepareExport(input, 'without', format, true, settings).characterCount;
    for (const level of COMPRESSION_LEVELS) {
      const result = prepareExport(input, level, format, true, settings);
      expect(result.serialized.content).not.toContain('Acme Corporation');
      expect(result.reductionRatio).toBe(Math.max(0, 1 - result.characterCount / baseline));
      expect(prepareExport(input, level, format, false, settings).serialized.content).toContain('Acme Corporation');
    }
  });
});

function historicalFile(settings: RedactionSettings, version: number): { format: string; version: number; filters: Record<string, any>[] } {
  return { format: 'copy-as-context-filters', version, filters: [
    ...BUILTIN_FILTERS.map(builtin => ({
      type: 'builtin', id: builtin.id, name: builtin.name, description: builtin.description,
      matchingRule: version === 2 && builtin.id === 'sensitive-fields' ? 'Field labels: password, passcode, secret, token, api key, authorization' : version < 6 ? builtin.matchingRule : customRuleFromBuiltin(builtin.id).text,
      ...(version >= 3 ? { fieldLabels: builtin.id === 'sensitive-fields' } : {}),
      ...(version >= 5 ? { urlParameters: builtin.id === 'query-values' } : {}),
      ...(version >= 6 ? Object.fromEntries(EXTRA_MODE_KEYS.map(key => [key, legacyRuleFromType(customRuleFromBuiltin(builtin.id))[key] ?? false])) : {}),
      caseSensitive: settings.builtinCaseSensitivity?.[builtin.id] ?? builtin.caseSensitive, enabled: !settings.disabledBuiltins.includes(builtin.id),
    })),
    ...settings.customRules.map(rule => ({
      ...rule, type: 'text', ...(version < 4 ? { text: rule.text } : { matchingRule: rule.text, text: undefined }),
    })),
  ] };
}

describe('filter configuration import and validation', () => {
  it('round-trips URL modes and accepts historical v4/v5 files', () => {
    const settings = config('client_key / token', { urlParameters: true, fieldLabels: false });
    expect(importRedactionSettings(exportRedactionSettings(settings))).toEqual(validateRedactionSettings(settings));
    const oldSettings = config('Acme / Other', { fieldLabels: false });
    expect(importRedactionSettings(JSON.stringify(historicalFile(settings, 5)))).toEqual(validateRedactionSettings(settings));
    const oldFile = historicalFile(oldSettings, 4);
    oldFile.filters.forEach((filter: any) => { delete filter.urlParameters; });
    expect(importRedactionSettings(JSON.stringify(oldFile))).toEqual(validateRedactionSettings(oldSettings));
    oldFile.filters.at(-1)!.urlParameters = true;
    expect(() => importRedactionSettings(JSON.stringify(oldFile))).toThrow();
    const file = JSON.parse(exportRedactionSettings(settings));
    file.filters.find((filter: any) => filter.id === 'query-values').urlParameters = false;
    expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
  });
  it('exports matchingRule with the same field order for built-in and custom filters', () => {
    const file = JSON.parse(exportRedactionSettings(config('Acme', { fieldLabels: false, urlParameters: false })));
    const keys = ['source', 'id', 'name', 'description', 'type', 'matchingRule', 'caseSensitive', 'enabled'];
    expect(file.availableRuleTypes).toEqual(RULE_TYPES);
    for (const filter of file.filters) {
      expect(Object.keys(filter)).toEqual(keys);
      expect(filter).not.toHaveProperty('text');
    }
  });

  it('round-trips built-in case overrides and preserves historical version 3 imports', () => {
    const settings: RedactionSettings = { ...config('Acme / Other', { fieldLabels: false }), builtinCaseSensitivity: { github: false, 'sensitive-fields': true } };
    expect(importRedactionSettings(exportRedactionSettings(settings))).toEqual(validateRedactionSettings(settings));
    const oldSettings = config('Acme / Other', { fieldLabels: false });
    const oldFile = historicalFile(oldSettings, 3);
    for (const filter of oldFile.filters) {
      delete filter.urlParameters;
    }
    expect(importRedactionSettings(JSON.stringify(oldFile))).toEqual(validateRedactionSettings(oldSettings));
    oldFile.filters[0]!.caseSensitive = true;
    expect(() => importRedactionSettings(JSON.stringify(oldFile))).toThrow();
  });

  it('rejects ambiguous or missing matchingRule fields in version 7 custom filters', () => {
    for (const variant of ['missing', 'ambiguous']) {
      const file = JSON.parse(exportRedactionSettings(config('Acme')));
      const custom = file.filters.at(-1);
      custom.text = 'Other';
      if (variant === 'missing') delete custom.matchingRule;
      expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
    }
  });
  it('preserves Field labels and list semantics in version 7 files', () => {
    for (const fieldLabels of [true, false]) {
      const settings = config('pass / private', { fieldLabels });
      expect(importRedactionSettings(exportRedactionSettings(settings))).toEqual(validateRedactionSettings(settings));
    }
    const file = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
    expect(file.filters[0]).toMatchObject({ type: 'fieldWords', matchingRule: customRuleFromBuiltin('sensitive-fields').text });
    expect(file.filters[1].type).toBe('authorization');
    file.filters[0].fieldLabels = false;
    expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
  });

  it('imports previous version 2 exports without treating a Field labels prefix as an instruction', () => {
    const settings = config('Field labels: pass');
    const file = historicalFile(settings, 2);
    file.filters.forEach((filter: any) => {
      delete filter.fieldLabels;
      delete filter.urlParameters;
    });
    file.filters[0]!.matchingRule = 'Field labels: password, passcode, secret, token, api key, authorization';
    const imported = importRedactionSettings(JSON.stringify(file));
    expect(imported).toEqual(validateRedactionSettings(settings));
    expect(redactSemanticTree(tree('Field labels: pass'), imported).tree.title).toBe('[REDACTED]');
  });
  it('round-trips configurations and detaches nested values', () => {
    const settings = config('  Acme  '); settings.disabledBuiltins = ['github'];
    const clone = importRedactionSettings(exportRedactionSettings(settings));
    expect(clone).toEqual(validateRedactionSettings(settings));
    clone.customRules[0]!.text = 'Changed';
    expect(settings.customRules[0]!.text).toBe('  Acme  ');
    expect(defaultRedactionSettings()).toEqual({ version: 1, disabledBuiltins: [], customRules: [] });
  });
  it('includes every built-in definition and state, and accepts earlier configuration files', () => {
    const settings = config('Acme'); settings.disabledBuiltins = ['github'];
    const file = JSON.parse(exportRedactionSettings(settings));
    expect(file.format).toBe('copy-as-context-filters'); expect(file.version).toBe(7);
    expect(file.filters.filter((filter: { source: string }) => filter.source === 'builtin')).toHaveLength(8);
    expect(file.filters.find((filter: { id: string }) => filter.id === 'github')).toMatchObject({ enabled: false, matchingRule: expect.stringContaining('ghp_') });
    expect(file.filters.find((filter: { source: string }) => filter.source === 'custom').matchingRule).toBe('Acme');
    expect(importRedactionSettings(JSON.stringify(settings))).toEqual(validateRedactionSettings(settings));
  });
  it('rejects incomplete, duplicate or changed built-in definitions in portable files', () => {
    const exported = exportRedactionSettings(defaultRedactionSettings());
    for (const modify of [
      (file: any) => { file.filters.pop(); },
      (file: any) => { file.filters[1] = file.filters[0]; },
      (file: any) => { file.filters[0].matchingRule = 'altered'; },
      (file: any) => { file.filters[0].enabled = 'yes'; },
      (file: any) => { file.format = 'other'; },
    ]) {
      const file = JSON.parse(exported); modify(file);
      expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
    }
  });
  it.each([
    null, {}, { ...defaultRedactionSettings(), version: 2 },
    { ...defaultRedactionSettings(), disabledBuiltins: ['unknown'] },
    { ...defaultRedactionSettings(), disabledBuiltins: ['github', 'github'] },
    { ...defaultRedactionSettings(), builtinCaseSensitivity: { github: 'yes' } },
    { ...defaultRedactionSettings(), builtinCaseSensitivity: { unknown: true } },
    { ...defaultRedactionSettings(), builtinCaseSensitivity: [] },
    config('   '), config('x'.repeat(257)), config('text', { enabled: 'yes' }),
    config('text', { fieldLabels: 'yes' }), config(' / pass', { fieldLabels: true }), config('pass / ', { fieldLabels: false }),
    config('text', { urlParameters: 'yes' }), config('?token=', { urlParameters: true }),
    config('token / ', { urlParameters: true }), config('token\nname', { urlParameters: true }),
    config('text', { name: '' }), config('text', { caseSensitive: undefined }),
    { ...config('text'), customRules: [rule('one'), rule('two')] },
    { ...config('text'), customRules: Array.from({ length: REDACTION_LIMITS.rules + 1 }, (_, index) => rule('a', { id: `rule-${index}` })) },
    { ...config('text'), customRules: Array.from({ length: Math.floor(REDACTION_LIMITS.totalText / 256) + 1 }, (_, index) => rule('a'.repeat(256), { id: `rule-${index}` })) },
  ])('rejects malformed or excessive configurations', value => {
    expect(() => validateRedactionSettings(value)).toThrow();
  });
  it('rejects invalid JSON or oversized imports without returning partial filters', () => {
    expect(() => importRedactionSettings('{')).toThrow('Invalid JSON');
    expect(() => importRedactionSettings(' '.repeat(REDACTION_LIMITS.json + 1))).toThrow('too large');
  });
});

describe('single rule types and the v7 catalog', () => {
  it.each(RULE_TYPES)('round-trips the code-defined $id type without legacy flags', type => {
    const settings = config('client_key', { type: type.id });
    const file = JSON.parse(exportRedactionSettings(settings));
    const custom = file.filters.at(-1);
    expect(custom).toMatchObject({ source: 'custom', type: type.id });
    for (const key of ['fieldLabels', 'urlParameters', ...EXTRA_MODE_KEYS]) expect(custom).not.toHaveProperty(key);
    expect(importRedactionSettings(JSON.stringify(file))).toEqual(settings);
  });

  it.each([2, 3, 4, 5, 6])('migrates a genuine version %s export and keeps its matching behavior', version => {
    const settings = config('  ACME / Other  ', version < 3 ? {} : { fieldLabels: false });
    const imported = importRedactionSettings(JSON.stringify(historicalFile(settings, version)));
    expect(imported.customRules[0]!.type).toBe(version < 3 ? 'literalText' : 'text');
    expect(imported.customRules[0]!.text).toBe('  ACME / Other  ');
    expect(redactSemanticTree(tree('ACME Other  ACME / Other  '), imported)).toEqual(redactSemanticTree(tree('ACME Other  ACME / Other  '), settings));
    expect(importRedactionSettings(exportRedactionSettings(imported))).toEqual(imported);
  });

  it('splits combined legacy scopes into distinct rows without losing any redaction', () => {
    const settings = config('token', { fieldLabels: true, wholeWords: true, urlParameters: true, assignedSecrets: true });
    settings.disabledBuiltins = BUILTIN_FILTERS.map(filter => filter.id);
    const snapshot = structuredClone(settings);
    const imported = importRedactionSettings(JSON.stringify(historicalFile(settings, 6)));
    expect(imported.customRules.map(rule => rule.type)).toEqual(['fieldWords', 'urlParameters', 'assignedSecrets']);
    expect(new Set(imported.customRules.map(rule => rule.id)).size).toBe(3);
    const input: SemanticTree = { schemaVersion: 1, title: 'token=abcdefgh', root: { role: 'textbox', name: 'Token', value: 'short', href: '?token=x&public=keep', children: [{ role: 'text', name: 'short', children: [] }] } };
    const result = redactSemanticTree(input, imported).tree;
    expect(result.title).toBe('token=[REDACTED]');
    expect(result.root).toMatchObject({ name: 'Token', value: '[REDACTED]', href: '?token=[REDACTED]&public=keep', children: [{ name: '[REDACTED]' }] });
    expect(importRedactionSettings(exportRedactionSettings(imported))).toEqual(imported);
    expect(settings).toEqual(snapshot);
  });

  it('reserves existing IDs when splitting legacy combined rules', () => {
    const settings = config('token', { fieldLabels: true, urlParameters: true });
    settings.customRules.push(rule('private', { id: 'example-type-2' }));
    const migrated = validateRedactionSettings(settings);
    expect(migrated.customRules.map(rule => rule.id)).toEqual(['example', 'example-type-3', 'example-type-2']);
    expect(validateRedactionSettings(migrated)).toEqual(migrated);
  });

  it('fits the former maximum of 50 rules with all eight modes into a valid v7 export', () => {
    const settings: RedactionSettings = { ...defaultRedactionSettings(), customRules: Array.from({ length: 50 }, (_, index) => rule('x'.repeat(160), {
      id: `rule-${index}`.padEnd(64, 'x'), name: 'N'.repeat(80), fieldLabels: true, urlParameters: true,
      ...Object.fromEntries(EXTRA_MODE_KEYS.map(key => [key, true])),
    })) };
    const migrated = validateRedactionSettings(settings);
    expect(migrated.customRules).toHaveLength(400);
    const exported = exportRedactionSettings(migrated);
    expect(exported.length).toBeLessThan(REDACTION_LIMITS.json);
    expect(importRedactionSettings(exported)).toEqual(migrated);
  });

  it('keeps the catalog informational rather than accepting definitions from a file', () => {
    const settings = config('eyJ', { type: 'jwt', caseSensitive: true });
    const file = JSON.parse(exportRedactionSettings(settings));
    const jwt = file.availableRuleTypes.find((type: { id: string }) => type.id === 'jwt');
    jwt.description = 'A different description does not change the detector'; jwt.scope = 'fields';
    const imported = importRedactionSettings(JSON.stringify(file));
    expect(redactSemanticTree(tree('eyJabcde.abcde.abcde'), imported).tree.title).toBe('[REDACTED]');
    expect(JSON.parse(exportRedactionSettings(imported)).availableRuleTypes).toEqual(RULE_TYPES);
    jwt.id = 'customExecutableType'; file.filters.at(-1).type = 'customExecutableType';
    expect(() => importRedactionSettings(JSON.stringify(file))).toThrow('supported rule types');
  });

  it.each([
    (file: any) => { file.filters.at(-1).type = 'unsupported'; },
    (file: any) => { delete file.filters.at(-1).type; },
    (file: any) => { file.filters.at(-1).type = ['text', 'jwt']; },
    (file: any) => { file.filters.at(-1).fieldLabels = false; },
    (file: any) => { file.filters[0].type = 'text'; },
    (file: any) => { file.filters.at(-1).source = 'other'; },
    (file: any) => { delete file.availableRuleTypes; },
    (file: any) => { file.availableRuleTypes[1] = file.availableRuleTypes[0]; },
  ])('rejects unknown, conflicting or incomplete typed files', change => {
    const file = JSON.parse(exportRedactionSettings(config('client_key', { type: 'text' })));
    change(file);
    expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
  });
});
