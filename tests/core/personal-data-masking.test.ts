// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { settingsForRules } from '../helpers/redaction-rules';
import { PERSONAL_FIELD_TERMS } from '@/src/core/privacy/personal-data';
import { describe, expect, it } from 'vitest';
import { redactSemanticTree, prepareExport, COMPRESSION_LEVELS, type SemanticTree } from '@/src/core';
import { BUILTIN_FILTERS, V12_BUILTIN_FILTERS, V12_RULE_TYPES, defaultRedactionSettings, validateRedactionSettings, exportRedactionSettings, importRedactionSettings, type CustomRedactionRule, type RedactionSettings } from '@/src/core/privacy/settings';
import { testRules, filterExample, testRedactionFilters } from '@/src/core/privacy/test-filters';

const textTree = (text: string): SemanticTree => ({ schemaVersion: 1, title: text, sourceUrl: text, root: { role: 'text', name: text, value: text, href: text, children: [] } });
const fieldTree = (name: string, value: string): SemanticTree => ({ schemaVersion: 1, root: { role: 'textbox', name, value, children: [{ role: 'generic', children: [{ role: 'text', name: value, children: [] }] }] } });
const rule = (type: CustomRedactionRule['type'], text = '', id = String(type)): CustomRedactionRule => ({ id, name: id, type, text, caseSensitive: false, enabled: true });
const only = (...rules: CustomRedactionRule[]): RedactionSettings => settingsForRules(rules);

describe('phone and English personal-field masking', () => {
  it.each([
    ['A', '*'], ['Al', 'A*'], ['Ann', 'A**'], ['Anna', 'An**'], ['Alice', 'Al***'],
    ['Robert', 'Rob***'], ['Alexander', 'Ale******'], ['Charlotte', 'Cha******'], ['😀😀😀😀', '😀😀**'],
  ])('uses the email length algorithm for %s', (value, expected) => {
    const input = fieldTree('Full name', value);
    const result = redactSemanticTree(input, only(rule('personalFieldsMask')));
    expect(result.tree.root).toMatchObject({ name: 'Full name', value: expected, children: [{ children: [{ name: expected }] }] });
    expect(redactSemanticTree(result.tree, only(rule('personalFieldsMask')))).toEqual({ tree: result.tree, redactionCount: 0 });
    expect(input.root.value).toBe(value);
  });

  it.each([
    ['+380 50 123 4567', '+380 ** *** ****'], ['Phone: 020 7946 0958', 'Phone: 020 **** ****'],
    ['00380 44 123 45 67', '003** ** *** ** **'], ['tel:+1 (202) 555-0123', 'tel:+1 (20*) ***-****'],
  ])('masks digits and preserves formatting in %s', (value, expected) => {
    const input = textTree(value);
    const result = redactSemanticTree(input, only(rule('phoneNumbersMask')));
    expect(result.tree).toMatchObject({ title: expected, sourceUrl: expected, root: { name: expected, value: expected, href: expected } });
    expect(redactSemanticTree(result.tree, only(rule('phoneNumbersMask')))).toEqual({ tree: result.tree, redactionCount: 0 });
    expect(redactSemanticTree(result.tree, only(rule('phoneNumbers'))).tree.title).toContain('[REDACTED]');
  });

  it.each([
    ['Address', '123 Example Street', '123***************'],
    ['Email', 'person@gmail.com', 'per***@gm***.com'],
    ['Mobile number', '050 123 4567', '050 *** ****'],
    ['Phone', '12', '1*'], ['Phone', '5', '*'], ['Phone', 'unknown', 'unk****'],
  ])('masks %s field values with the appropriate contact format', (label, value, expected) => {
    const input = fieldTree(label, value);
    const result = redactSemanticTree(input);
    expect(result.tree.root.value).toBe(expected);
    expect(result.tree.root.children[0]!.children[0]!.name).toBe(expected);
    expect(redactSemanticTree(result.tree)).toEqual({ tree: result.tree, redactionCount: 0 });
  });

  it.each(['CVV', 'CVC', 'Passport', 'SSN', 'Social security', 'Tax ID', 'National ID', 'Driver license', 'Card number', 'IBAN', 'Bank account', 'Routing number', 'Date of birth', 'DOB'])('fully hides %s fields even when their values are short or fail format checks', label => {
    expect(redactSemanticTree(fieldTree(label, '123')).tree.root.value).toBe('[REDACTED]');
    expect(redactSemanticTree(fieldTree(label, '1')).tree.root.children[0]!.children[0]!.name).toBe('[REDACTED]');
  });

  it('preserves labels and ignores unrelated fields, ordinary prose and empty values', () => {
    const input = fieldTree('Filename', 'Alexander');
    expect(redactSemanticTree(input).tree).toEqual(input);
    expect(redactSemanticTree(textTree('Full name: Alexander; Address: 123 Example Street')).tree.title).toBe('Full name: Alexander; Address: 123 Example Street');
    expect(redactSemanticTree(fieldTree('Full name', '')).redactionCount).toBe(0);
    expect(redactSemanticTree(fieldTree('Full name', '[REDACTED]')).redactionCount).toBe(0);
  });

  it('never lets nested masking weaken an ancestor full-hide field', () => {
    const input = fieldTree('Password', 'Alexander');
    input.root.children = [fieldTree('Full name', 'Alexander').root];
    const result = redactSemanticTree(input);
    expect(result.tree.root.children[0]!.value).toBe('[REDACTED]');
    expect(result.tree.root.children[0]!.children[0]!.children[0]!.name).toBe('[REDACTED]');
  });

  it('prefers full hiding for all rule orders, including overlaps with Regex and literal rules', () => {
    for (const hide of [rule('phoneNumbers'), rule('regex', '123', 'regex'), rule('text', '123', 'literal')]) {
      for (const rules of [[rule('phoneNumbersMask'), hide], [hide, rule('phoneNumbersMask')]]) {
        expect(redactSemanticTree(textTree('+380 50 123 4567'), only(...rules)).tree.title).toBe('[REDACTED]');
      }
    }
    for (const hide of [rule('fieldWords', 'Full name'), rule('regex', 'lex', 'regex')]) {
      for (const rules of [[rule('personalFieldsMask'), hide], [hide, rule('personalFieldsMask')]]) {
        expect(redactSemanticTree(fieldTree('Full name', 'Alexander'), only(...rules)).tree.root.value).toBe('[REDACTED]');
      }
    }
    const hideAll = { ...defaultRedactionSettings(), disabledBuiltins: [] };
    expect(redactSemanticTree(fieldTree('Email', 'person@gmail.com'), hideAll).tree.root.value).toBe('[REDACTED]');
  });

  it('allows independent switches and keeps the new defaults', () => {
    const config = defaultRedactionSettings();
    expect(config.disabledBuiltins).not.toContain('phone-mask');
    expect(config.disabledBuiltins).not.toContain('personal-fields-mask');
    expect(config.disabledBuiltins).toContain('phone-numbers');
    expect(config.disabledBuiltins).toContain('personal-fields');
    expect(redactSemanticTree(textTree('+380 50 123 4567'), { ...config, disabledBuiltins: [...config.disabledBuiltins, 'phone-mask', 'personal-fields-mask'] }).tree.title).toBe('+380 50 123 4567');
    expect(redactSemanticTree(fieldTree('Full name', 'Alexander'), { ...config, disabledBuiltins: [...config.disabledBuiltins, 'personal-fields-mask'] }).tree.root.value).toBe('Alexander');
  });

  it.each(['phone-mask', 'personal-fields-mask', 'personal-fields'] as const)('supports built-in %s samples and selected off-rule testing', id => {
    const settings = { ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) };
    const selected = testRules(settings).find(item => item.rule.id === id)!;
    const positive = filterExample(selected); const negative = filterExample(selected, true);
    expect(testRedactionFilters(settings, positive.sample, positive.fieldLabel, selected.key).matches).toHaveLength(1);
    expect(testRedactionFilters(settings, negative.sample, negative.fieldLabel, selected.key).matches).toHaveLength(0);
  });

  it('imports genuine v12 files and v5 storage, preserving old switches and adding mask defaults', () => {
    const old: RedactionSettings = { version: 5, disabledBuiltins: V12_BUILTIN_FILTERS.map(filter => filter.id), customRules: [] };
    const migrated = validateRedactionSettings(old);
    expect(migrated.version).toBe(6);
    expect(migrated.disabledBuiltins).toEqual(old.disabledBuiltins);
    expect(importRedactionSettings(JSON.stringify(old))).toEqual(migrated);
    const file = JSON.parse(exportRedactionSettings(migrated));
    file.version = 12; file.availableRuleTypes = V12_RULE_TYPES;
    const legacyPersonal = file.filters.find((filter: { id: string }) => filter.id === 'personal-fields');
    legacyPersonal.type = 'fieldWords'; legacyPersonal.matchingRule = PERSONAL_FIELD_TERMS;
    file.filters = file.filters.filter((filter: { id: string }) => V12_BUILTIN_FILTERS.some(builtin => builtin.id === filter.id));
    expect(importRedactionSettings(JSON.stringify(file))).toEqual(migrated);
    const allOff = only();
    expect(importRedactionSettings(exportRedactionSettings(allOff))).toEqual(allOff);
  });

  it.each(['semantic-text', 'markdown'] as const)('masks across every %s compression profile and respects master redaction off', format => {
    const input = fieldTree('Full name', 'Alexander');
    for (const level of COMPRESSION_LEVELS) {
      expect(prepareExport(input, level, format, true).serialized.content).toContain('Ale******');
      expect(prepareExport(input, level, format, false).serialized.content).toContain('Alexander');
    }
  });
});
