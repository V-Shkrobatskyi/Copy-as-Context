// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { redactSemanticTree, prepareExport, COMPRESSION_LEVELS, type SemanticTree } from '@/src/core';
import { BUILTIN_FILTERS, DETECTOR_MODES, EXTRA_MODE_KEYS, customRuleFromBuiltin, defaultRedactionSettings, exportRedactionSettings, importRedactionSettings, validateRedactionSettings, type CustomRedactionRule, type RedactionSettings } from '@/src/core/privacy/settings';

const disabledBuiltins = BUILTIN_FILTERS.map(filter => filter.id);
const onlyCustom = (customRules: CustomRedactionRule[]): RedactionSettings => ({ version: 1, disabledBuiltins, customRules });
const textTree = (text: string): SemanticTree => ({ schemaVersion: 1, title: text, sourceUrl: `https://example.test/?note=${text}`, root: { role: 'text', name: text, value: text, href: text, children: [] } });
const samples = [
  'Bearer abcdefghijkl Basic abcdefghijkl bearer abcdefghijkl BASIC abcdefghijkl Bearer short Basic ab+/cd==',
  'eyJabcde.abcde.abcde eyJabcd.abcde.abcde eyJabcde.abcd.abcde EYJabcde.abcde.abcde xeyJabcde.abcde.abcde',
  'ghp_abcdefghijklmnopqrst gho_abcdefghijklmnopqrst ghu_abcdefghijklmnopqrst ghs_abcdefghijklmnopqrst ghr_abcdefghijklmnopqrst github_pat_abcdefghijklmnopqrst ghp_short GHP_abcdefghijklmnopqrst xghp_abcdefghijklmnopqrst',
  'AKIA0123456789ABCDEF ASIA0123456789ABCDEF AKIA0123456789ABCDE AKIA0123456789ABCDEFG akia0123456789abcdef AKIA0123456789abcDEF',
  'sk-abcdefghijklmnop sk-proj-abcdefghijklmnop sk-short sk-proj-abcdefghijk SK-abcdefghijklmnop xsk-abcdefghijklmnop sk-abc_def-12345678',
  'api key: abcdefgh api_key=abcdefgh api-key = abcdefgh apikey:abcdefgh token=abcdefgh secret:abcdefgh password=abcdefgh TOKEN=abcdefgh token=short xtoken=abcdefgh secret=[REDACTED] token=abcdefgh&public=keep',
  '?api key=one&api_key=two&api-key=three&apikey=four&token=five&secret=six&password=seven&TOKEN=eight&token=&secret=[REDACTED]&public=keep',
  '[REDACTED] public plain text / punctuation,.',
];
const fixture: SemanticTree = {
  schemaVersion: 1, title: samples.join('\n'), sourceUrl: 'https://example.test/?token=private&public=keep',
  root: { role: 'document', children: [
    ...samples.map(name => ({ role: 'text', name, value: name, href: name, children: [] })),
    ...['Password', 'passcode', 'Secret', 'Token', 'API key', 'api_key', 'api-key', 'apikey', 'authorization', 'tokenizer', 'xtoken', 'token label'].map(name => ({
      role: 'textbox', name, value: 'short', children: [{ role: 'generic', children: [{ role: 'StaticText', name: 'short', children: [] }] }],
    })),
  ] },
};

describe('custom credential detectors', () => {
  it.each(BUILTIN_FILTERS)('reproduces $id with the built-in disabled, including case overrides and field descendants', filter => {
    for (const caseSensitive of [true, false]) {
      const original: RedactionSettings = { version: 1, disabledBuiltins: disabledBuiltins.filter(id => id !== filter.id), customRules: [], builtinCaseSensitivity: { [filter.id]: caseSensitive } };
      const custom = onlyCustom([customRuleFromBuiltin(filter.id, caseSensitive)]);
      expect(redactSemanticTree(fixture, custom)).toEqual(redactSemanticTree(fixture, original));
    }
  });

  it.each(['semantic-text', 'markdown'] as const)('replaces every built-in together through exports and every compression profile (%s)', format => {
    const custom = onlyCustom(BUILTIN_FILTERS.map(filter => customRuleFromBuiltin(filter.id)));
    const imported = importRedactionSettings(exportRedactionSettings(custom));
    expect(imported).toEqual(validateRedactionSettings(custom));
    expect(redactSemanticTree(fixture, imported)).toEqual(redactSemanticTree(fixture));
    for (const level of COMPRESSION_LEVELS) {
      expect(prepareExport(fixture, level, format, true, imported)).toEqual(prepareExport(fixture, level, format, true));
    }
    const result = redactSemanticTree(fixture, imported);
    expect(redactSemanticTree(result.tree, imported)).toEqual({ tree: result.tree, redactionCount: 0 });
  });

  it.each([
    ['authorization', 'CustomAuth', 'CustomAuth abcdefghijkl', 'CustomAuth [REDACTED]', 'CustomAuth short'],
    ['jwt', 'abc', 'abc12345.abcde.12345', '[REDACTED]', 'abc1234.abcde.12345'],
    ['githubTokens', 'company_', 'company_abcdefghijklmnopqrst', '[REDACTED]', 'company_short'],
    ['awsKeys', 'COMP', 'COMP0123456789ABCDEF', '[REDACTED]', 'COMP0123456789ABCDE'],
    ['openaiKeys', 'private-', 'private-abcdefghijklmnop', '[REDACTED]', 'private-short'],
    ['assignedSecrets', 'private_key', 'private_key = abcdefgh', 'private_key = [REDACTED]', 'private_key=short'],
  ] as const)('extends %s with literal names/prefixes without any built-ins', (key, text, input, output, nearMiss) => {
    const rule: CustomRedactionRule = { id: 'custom', name: 'Custom', text, enabled: true, caseSensitive: true, [key]: true };
    const settings = onlyCustom([rule]);
    expect(redactSemanticTree(textTree(input), settings).tree.title).toBe(output);
    expect(redactSemanticTree(textTree(nearMiss), settings).tree.title).toBe(nearMiss);
    const differentCase = input === input.toUpperCase() ? input.toLowerCase() : input.toUpperCase();
    expect(redactSemanticTree(textTree(differentCase), settings).tree.title).toBe(differentCase);
    expect(redactSemanticTree(textTree(input), onlyCustom([{ ...rule, enabled: false }])).tree.title).toBe(input);
    const insensitive = onlyCustom([{ ...rule, caseSensitive: false }]);
    expect(redactSemanticTree(textTree(differentCase), insensitive).tree.title).toBe(input === input.toUpperCase() ? output : output.toUpperCase());
    expect(redactSemanticTree(textTree(text), settings).tree.title).toBe(text);
    expect(redactSemanticTree(textTree(`${input} / [REDACTED]`), settings).tree.title).toBe(`${output} / [REDACTED]`);
  });

  it('escapes metacharacters in every mode and combines assignment and URL scopes', () => {
    const settings = onlyCustom([{ id: 'custom', name: 'Custom', text: 'private.key / client_key', enabled: true, caseSensitive: false, assignedSecrets: true, urlParameters: true }]);
    const text = 'private.key=abcdefgh privateXkey=abcdefgh ?client_key=x&public=keep';
    expect(redactSemanticTree(textTree(text), settings).tree.title).toBe('private.key=[REDACTED] privateXkey=abcdefgh ?client_key=[REDACTED]&public=keep');
  });

  it('keeps original input immutable and merges overlapping custom detectors', () => {
    const settings = onlyCustom([
      { id: 'auth', name: 'Auth', text: 'Custom', authorization: true, enabled: true, caseSensitive: true },
      { id: 'literal', name: 'Literal', text: 'Custom abcdefghijkl', enabled: true, caseSensitive: true },
    ]);
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'text', name: 'Custom abcdefghijkl', children: [] } };
    const before = structuredClone(input);
    expect(redactSemanticTree(input, settings)).toEqual({ tree: { schemaVersion: 1, root: { role: 'text', name: '[REDACTED]', children: [] } }, redactionCount: 1 });
    expect(input).toEqual(before);
  });

  it.each(EXTRA_MODE_KEYS)('validates and round-trips the %s flag without accepting non-booleans', key => {
    const settings = onlyCustom([{ id: 'custom', name: 'Custom', text: 'literal', enabled: true, caseSensitive: false, [key]: true }]);
    expect(importRedactionSettings(exportRedactionSettings(settings))).toEqual(validateRedactionSettings(settings));
    const file = JSON.parse(exportRedactionSettings(settings)); file.filters.at(-1)[key] = 'true';
    expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
    file.filters.at(-1)[key] = true; file.version = 5;
    expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
  });

  it.each(DETECTOR_MODES)('rejects legacy mode flags in v7 files', mode => {
    const file = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
    file.filters.find((filter: { id: string }) => filter.id === mode.builtin)[mode.key] = false;
    expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
  });
});
