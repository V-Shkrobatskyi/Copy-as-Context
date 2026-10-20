// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { settingsForRules as withRules } from '../helpers/redaction-rules';
import { describe, expect, it } from 'vitest';
import { redactSemanticTree, prepareExport, COMPRESSION_LEVELS, type SemanticTree } from '@/src/core';
import { BUILTIN_FILTERS, V11_BUILTIN_FILTERS, RULE_TYPES, V8_RULE_TYPES, V9_RULE_TYPES, V10_RULE_TYPES, defaultRedactionSettings, validateRedactionSettings, importRedactionSettings, exportRedactionSettings, type CustomRedactionRule, type RedactionSettings } from '@/src/core/privacy/settings';
import { filterExample, testRedactionFilters, testRules } from '@/src/core/privacy/test-filters';

const tree = (text: string): SemanticTree => ({ schemaVersion: 1, title: text, sourceUrl: text, root: { role: 'text', name: text, value: text, href: text, children: [] } });
const custom = (type: CustomRedactionRule['type'], text = '', id = 'custom'): CustomRedactionRule => ({ id, name: 'Custom', text, type, enabled: true, caseSensitive: true });


describe('automatic email filters', () => {
  it.each([
    ['gmail.com', 'gm***.com'], ['outlook.com', 'out****.com'], ['company.org', 'com****.org'],
    ['a.com', '*.com'], ['ab.com', 'a*.com'], ['abc.com', 'a**.com'],
    ['mail.company.co.uk', 'ma**.com****.c*.uk'],
  ])('partially masks %s and preserves its final suffix', (domain, expected) => {
    const settings = withRules([custom('emailMaskDomain')]);
    const result = redactSemanticTree(tree('abcdef@' + domain), settings);
    expect(result.tree.title).toBe('abc***@' + expected);
    expect(redactSemanticTree(result.tree, settings)).toEqual({ tree: result.tree, redactionCount: 0 });
    expect(redactSemanticTree(result.tree, withRules([custom('emailHide')])).tree.title).toBe('[REDACTED]');
    expect(redactSemanticTree(result.tree).tree.title).toBe(result.tree.title);
  });

  it('masks domain labels while preserving the final suffix and name-masking limits', () => {
    const settings = withRules([custom('emailMaskDomain')]);
    const source = 'ab@domain.com abc@domain.com abcd@sub.domain.com abcdefgh@domain.com';
    const result = redactSemanticTree(tree(source), settings);
    expect(result.tree.title).toBe('a*@dom***.com a**@dom***.com ab**@s**.dom***.com abc*****@dom***.com');
    expect(redactSemanticTree(result.tree, settings)).toEqual({ tree: result.tree, redactionCount: 0 });
    expect(redactSemanticTree(tree('abc*****@domain.com'), settings).tree.title).toBe('abc*****@dom***.com');
    expect(redactSemanticTree(tree('abc*****@***')).tree.title).toBe('abc*****@***');
    expect(redactSemanticTree(tree('abc*****@***.'), withRules([custom('emailHide')])).tree.title).toBe('[REDACTED].');
  });

  it('resolves built-in email actions by strength rather than rule order', () => {
    const mask = custom('emailMaskDomain', '', 'mask');
    const domain = custom('emailMaskDomain', '', 'domain');
    const hide = custom('emailHide', '', 'hide');
    for (const rules of [[mask, domain], [domain, mask]]) {
      expect(redactSemanticTree(tree('abcdefgh@example.test'), withRules(rules)).tree.title).toBe('abc*****@exa****.test');
    }
    for (const rules of [[mask, domain, hide], [mask, hide, domain], [domain, mask, hide], [domain, hide, mask], [hide, mask, domain], [hide, domain, mask]]) {
      expect(redactSemanticTree(tree('abcdefgh@example.test'), withRules(rules)).tree.title).toBe('[REDACTED]');
    }
    for (const full of [custom('text', 'example', 'literal'), custom('regex', 'example', 'regex')]) {
      for (const rules of [[domain, full], [full, domain]]) {
        expect(redactSemanticTree(tree('abcdefgh@example.test'), withRules(rules)).tree.title).toBe('[REDACTED]');
      }
    }
  });

  it('migrates v2 storage and genuine v9 exports to the consolidated mask', () => {
    const migrated = validateRedactionSettings({ version: 2, disabledBuiltins: [], customRules: [] });
    expect(migrated).toMatchObject({ version: 6, disabledBuiltins: ['phone-numbers', 'personal-fields'] });
    const old = JSON.parse(exportRedactionSettings(migrated));
    old.version = 9; old.availableRuleTypes = V9_RULE_TYPES;
    old.filters = old.filters.filter((filter: { id: string }) => V11_BUILTIN_FILTERS.some(builtin => builtin.id === filter.id) && filter.id !== 'email-mask-domain');
    old.filters.push({ source: 'builtin', id: 'email-mask', name: 'Mask email addresses', type: 'emailMask', matchingRule: '', caseSensitive: false, enabled: true });
    expect(importRedactionSettings(JSON.stringify(old))).toEqual(migrated);
    const enabled = { ...migrated, disabledBuiltins: [] };
    expect(importRedactionSettings(exportRedactionSettings(enabled))).toEqual(enabled);
    expect(testRedactionFilters(defaultRedactionSettings(), 'abcd@example.test', '', 'builtin:email-mask-domain').output).toBe('ab**@exa****.test');
    expect(defaultRedactionSettings().disabledBuiltins).not.toContain('email-mask-domain');
  });

  it.each([
    ['a@domain.com', '*@dom***.com'], ['ab@domain.com', 'a*@dom***.com'],
    ['abc@domain.com', 'a**@dom***.com'], ['abcd@domain.com', 'ab**@dom***.com'],
    ['abcdefg@domain.com', 'abc****@dom***.com'],
    ['abcdefgh@domain.com', 'abc*****@dom***.com'],
    ['abcdefghijkl@domain.com', 'abc*********@dom***.com'],
    ['First.Last+tag@Sub.Example.COM', 'Fir***********@S**.Exa****.COM'],
  ])('masks %s with defaults', (input, expected) => {
    const result = redactSemanticTree(tree(input));
    expect(result.tree.title).toBe(expected);
    expect(result.tree.sourceUrl).toBe(expected);
    expect(result.tree.root).toMatchObject({ name: expected, value: expected, href: expected });
    expect(redactSemanticTree(result.tree)).toEqual({ tree: result.tree, redactionCount: 0 });
  });

  it('uses the agreed default states and migrates old storage without losing switches', () => {
    expect(defaultRedactionSettings()).toMatchObject({ version: 6, disabledBuiltins: ['email-hide', 'phone-numbers', 'personal-fields'] });
    const migrated = validateRedactionSettings({ version: 1, disabledBuiltins: ['github'], customRules: [] });
    expect(migrated.disabledBuiltins).toEqual(['github', 'email-hide', 'phone-numbers', 'personal-fields']);
    expect(redactSemanticTree(tree('abcd@example.test'), migrated).tree.title).toBe('ab**@exa****.test');
    const disabled = { ...defaultRedactionSettings(), disabledBuiltins: ['email-mask-domain', 'email-hide'] as RedactionSettings['disabledBuiltins'] };
    expect(redactSemanticTree(tree('abcd@example.test'), disabled).tree.title).toBe('abcd@example.test');
  });

  it('hides full addresses when enabled, including previously masked input', () => {
    const settings = { ...defaultRedactionSettings(), disabledBuiltins: [] };
    expect(redactSemanticTree(tree('abcd@example.test ab**@example.test'), settings).tree.title).toBe('[REDACTED] [REDACTED]');
    expect(importRedactionSettings(exportRedactionSettings(settings))).toEqual(settings);
  });

  it.each(['emailMask', 'emailMaskDomain', 'emailHide'] as const)('rejects custom %s rules rather than changing their behavior', type => {
    expect(() => validateRedactionSettings({ ...defaultRedactionSettings(), customRules: [custom(type)] })).toThrow('built-in only');
  });

  it.each([
    [false, false], [false, true], [true, false], [true, true],
  ])('consolidates v3 storage and v10 exports: name mask %s, domain mask %s', (nameEnabled, domainEnabled) => {
    const oldDisabled: RedactionSettings['disabledBuiltins'] = ['email-hide'];
    if (!nameEnabled) oldDisabled.push('email-mask');
    if (!domainEnabled) oldDisabled.push('email-mask-domain');
    const expected = validateRedactionSettings({ version: 3, disabledBuiltins: oldDisabled, customRules: [] });
    expect(testRedactionFilters({ version: 3, disabledBuiltins: oldDisabled, customRules: [] }, 'abcdef@example.com').output).toBe(nameEnabled || domainEnabled ? 'abc***@exa****.com' : 'abcdef@example.com');
    expect(expected.disabledBuiltins.includes('email-mask-domain')).toBe(!nameEnabled && !domainEnabled);
    expect(expected.disabledBuiltins).not.toContain('email-mask');
    const file = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
    file.version = 10; file.availableRuleTypes = V10_RULE_TYPES;
    file.filters = file.filters.filter((filter: { source: string; id: string }) => filter.source === 'custom' || V11_BUILTIN_FILTERS.some(builtin => builtin.id === filter.id));
    file.filters.find((filter: { id: string }) => filter.id === 'email-mask-domain').enabled = domainEnabled;
    file.filters.push({ source: 'builtin', id: 'email-mask', name: 'Mask email addresses', type: 'emailMask', matchingRule: '', caseSensitive: false, enabled: nameEnabled });
    expect(importRedactionSettings(JSON.stringify(file))).toEqual(expected);
    expect(importRedactionSettings(exportRedactionSettings(expected))).toEqual(expected);
  });

  it('accepts fully disabled old storage and v10 files at the custom-rule limit', () => {
    const disabledBuiltins = [...V11_BUILTIN_FILTERS.map(filter => filter.id), 'email-mask' as const];
    const migrated = validateRedactionSettings({ version: 3, disabledBuiltins, customRules: [] });
    expect(migrated.disabledBuiltins).toEqual([...V11_BUILTIN_FILTERS.map(filter => filter.id), 'phone-numbers', 'personal-fields']);
    const settings = { ...migrated, customRules: Array.from({ length: 400 }, (_, index) => custom('text', 'private', `custom-${index}`)) };
    const file = JSON.parse(exportRedactionSettings(settings));
    file.version = 10; file.availableRuleTypes = V10_RULE_TYPES;
    file.filters = file.filters.filter((filter: { source: string; id: string }) => filter.source === 'custom' || V11_BUILTIN_FILTERS.some(builtin => builtin.id === filter.id));
    file.filters.push({ source: 'builtin', id: 'email-mask', name: 'Mask email addresses', type: 'emailMask', matchingRule: '', caseSensitive: false, enabled: false });
    expect(importRedactionSettings(JSON.stringify(file))).toEqual(settings);
  });

  it('always prefers full hiding over partial masking in every rule permutation', () => {
    const rules = [custom('emailMaskDomain', '', 'mask'), custom('regex', 'example', 'regex'), custom('text', 'abcd', 'literal')];
    for (const permutation of [rules, [...rules].reverse(), [rules[1]!, rules[0]!, rules[2]!], [rules[2]!, rules[0]!, rules[1]!]]) {
      expect(redactSemanticTree(tree('abcd@example.test'), withRules(permutation)).tree.title).toBe('[REDACTED]');
    }
    for (const rules of [[custom('emailMaskDomain'), custom('emailHide', '', 'hide')], [custom('emailHide'), custom('emailMaskDomain', '', 'mask')]]) {
      expect(redactSemanticTree(tree('abcd@example.test'), withRules(rules)).tree.title).toBe('[REDACTED]');
    }
  });

  it('keeps field hiding stronger and reports both email actions against original input', () => {
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Password', value: 'abcd@example.test', children: [] } };
    expect(redactSemanticTree(input).tree.root.value).toBe('[REDACTED]');
    const result = testRedactionFilters(defaultRedactionSettings(), 'abcd@example.test', '', 'builtin:email-hide');
    expect(result.output).toBe('[REDACTED]');
    expect(defaultRedactionSettings().disabledBuiltins).toContain('email-hide');
    const combined = testRedactionFilters({ ...defaultRedactionSettings(), disabledBuiltins: [] }, 'abcd@example.test');
    expect(combined.matches.map(match => match.key)).toEqual(['builtin:email-mask-domain', 'builtin:email-hide']);
  });

  it('handles repeated addresses, mailto links, punctuation and malformed near misses', () => {
    expect(redactSemanticTree(tree('Mail <abcd@example.test>, mailto:abcd@example.test.')).tree.title).toBe('Mail <ab**@exa****.test>, mailto:ab**@exa****.test.');
    for (const input of ['person at example.test', 'a..b@example.test', '.abc@example.test', 'abc.@example.test', 'abc@example', 'abc@example.test_invalid', '\u00E9abc@example.test']) {
      expect(redactSemanticTree(tree(input)).tree.title).toBe(input);
    }
  });

  it('imports genuine v8 exports with the new default email states', () => {
    const old = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
    old.version = 8; old.availableRuleTypes = V8_RULE_TYPES;
    old.filters = old.filters.filter((filter: { id: string }) => V11_BUILTIN_FILTERS.some(builtin => builtin.id === filter.id) && !['email-mask-domain', 'email-hide'].includes(filter.id));
    expect(importRedactionSettings(JSON.stringify(old))).toEqual(defaultRedactionSettings());
    expect(JSON.parse(exportRedactionSettings(defaultRedactionSettings())).version).toBe(13);
    expect(RULE_TYPES.some(type => String(type.id) === 'emailMask')).toBe(false);
  });

  it.each(['semantic-text', 'markdown'] as const)('masks emails in every %s profile and respects master redaction off', format => {
    for (const level of COMPRESSION_LEVELS) {
      const input = tree('abcd@example.test');
      expect(prepareExport(input, level, format, true).serialized.content).toContain('ab**@exa****.test');
      expect(prepareExport(input, level, format, false).serialized.content).toContain('abcd@example.test');
    }
  });
});
