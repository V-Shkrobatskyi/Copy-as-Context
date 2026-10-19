// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { settingsForRules } from '../helpers/redaction-rules';
import { describe, expect, it } from 'vitest';
import { redactSemanticTree, prepareExport, COMPRESSION_LEVELS, type SemanticTree } from '@/src/core';
import { personalDataMatches, PERSONAL_FIELD_TERMS, type PersonalDataType } from '@/src/core/privacy/personal-data';
import { BUILTIN_FILTERS, V11_BUILTIN_FILTERS, V11_RULE_TYPES, defaultRedactionSettings, exportRedactionSettings, importRedactionSettings, validateRedactionSettings, type CustomRedactionRule, type RedactionSettings } from '@/src/core/privacy/settings';
import { testRedactionFilters, testRules, filterExample } from '@/src/core/privacy/test-filters';

const tree = (text: string): SemanticTree => ({ schemaVersion: 1, title: text, sourceUrl: text, root: { role: 'text', name: text, value: text, href: text, children: [] } });
const custom = (type: PersonalDataType): CustomRedactionRule => ({ id: type, name: type, type, text: '', caseSensitive: false, enabled: true });
const only = (type: PersonalDataType): RedactionSettings => settingsForRules([custom(type)]);
const output = (text: string, type: PersonalDataType) => redactSemanticTree(tree(text), only(type)).tree.title;

describe('automatic personal-data filters', () => {
  it.each([
    '+380 (44) 123-45-67', '+1 (202) 555-0123', '00380 44 123 45 67',
    'Phone: 020 7946 0958', 'telephone = (202) 555-0123', 'Mobile number: 050-123-45-67',
    'TEL:+12025550123', 'Fax no.: 020.7946.0958', '+1\u00a0202\u202f555\u00a00123',
  ])('hides phone candidate %s while retaining its label', text => {
    const result = output(text, 'phoneNumbers');
    expect(result).toBe(text.replace(/(?:\+|00|\(?[0-9])[\s\S]*$/u, '[REDACTED]'));
    expect(redactSemanticTree(tree(result!), only('phoneNumbers')).redactionCount).toBe(0);
  });

  it('handles tel links, punctuation and independent labelled numbers', () => {
    expect(output('Call <tel:+12025550123>; Phone: 020 7946 0958.', 'phoneNumbers')).toBe('Call <tel:[REDACTED]>; Phone: [REDACTED].');
    expect(output('Phone: 020 7946 0958; Mobile: 050 123 4567', 'phoneNumbers')).toBe('Phone: [REDACTED]; Mobile: [REDACTED]');
  });

  it('uses English phone field labels for local values and nested text without hiding the labels', () => {
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Mobile number', value: '050 123 4567', children: [{ role: 'generic', children: [{ role: 'text', name: '050 123 4567', children: [] }] }] } };
    const result = redactSemanticTree(input, only('phoneNumbers'));
    expect(result.tree.root).toMatchObject({ name: 'Mobile number', value: '[REDACTED]', children: [{ children: [{ name: '[REDACTED]' }] }] });
    expect(redactSemanticTree(result.tree, only('phoneNumbers')).redactionCount).toBe(0);
    expect(redactSemanticTree(input, { ...defaultRedactionSettings(), disabledBuiltins: [...defaultRedactionSettings().disabledBuiltins, 'phone-mask', 'personal-fields-mask'] }).tree).toEqual(input);
  });

  it.each([
    'Order: 20261019', '2026-10-19', '0501234567', '+1234567', '+1234567890123456',
    'id+12025550123x', 'Phone: 2026-10-19', 'Phone: (202 555 0123', 'Token count: 1234567890',
  ])('keeps phone near miss %s', text => expect(output(text, 'phoneNumbers')).toBe(text));

  it.each(['4242424242424242', '4242 4242 4242 4242', '4242-4242-4242-4242', '3782 822463 10005', '4000\u00a00000\u00a00000\u00a00002'])('hides Luhn-valid card-shaped number %s', text => {
    expect(output('Card: ' + text + '.', 'paymentCards')).toBe('Card: [REDACTED].');
  });

  it.each(['4242 4242 4242 4241', '42424242424242420', '0000000000000000', '1111111111111111', '123456789012', '42424242424242420000', 'id4242424242424242', '4242424242424242x', '123.45'])('keeps card near miss %s', text => expect(output(text, 'paymentCards')).toBe(text));

  it.each([
    'GB82 WEST 1234 5698 7654 32', 'gb82west12345698765432', 'DE89 3704 0044 0532 0130 00',
    'UA21 3223 1300 0002 6007 2335 6600 1', 'FR14 2004 1010 0505 0001 3M02 606',
    'NL91 ABNA 0417 1643 00', 'NO93 8601 1117 947', 'GB82\u00a0WEST\u202f1234 5698 7654 32',
  ])('hides checksum-valid IBAN %s', text => expect(output('IBAN: ' + text + '.', 'iban')).toBe('IBAN: [REDACTED].'));

  it('keeps trailing prose and handles multiple IBANs', () => {
    expect(output('GB82 WEST 1234 5698 7654 32 paid; DE89370400440532013000', 'iban')).toBe('[REDACTED] paid; [REDACTED]');
  });

  it.each(['GB83 WEST 1234 5698 7654 32', 'ZZ82 WEST 1234 5698 7654 32', 'GB82WEST123456987654320', 'GB82WEST1234569876543', 'idGB82WEST12345698765432', 'GB00WEST12345698765432', 'GB82\nWEST12345698765432'])('keeps IBAN near miss %s', text => expect(output(text, 'iban')).toBe(text));

  it.each(['phone-numbers', 'payment-cards', 'iban'] as const)('tests the off built-in %s without changing its switch', id => {
    const settings = { ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) };
    const item = testRules(settings).find(item => item.rule.id === id)!;
    const sample = filterExample(item);
    expect(testRedactionFilters(settings, sample.sample, '', item.key).matches).toHaveLength(1);
    expect(redactSemanticTree(tree(sample.sample), settings).redactionCount).toBe(0);
  });

  it('merges Regex overlaps independently of rule order and remains stable on repeated processing', () => {
    const settings = only('paymentCards');
    const regex: CustomRedactionRule = { id: 'overlap', name: 'Overlap', type: 'regex', text: 'Card: 4242', caseSensitive: true, enabled: true };
    for (const rules of [[custom('paymentCards'), regex], [regex, custom('paymentCards')]]) {
      const config = settingsForRules(rules);
      const result = redactSemanticTree(tree('Card: 4242 4242 4242 4242'), config);
      expect(result.tree.title).toBe('[REDACTED]');
      expect(redactSemanticTree(result.tree, config)).toEqual({ tree: result.tree, redactionCount: 0 });
    }
  });

  it.each(['semantic-text', 'markdown'] as const)('applies to all %s profiles, metadata and links, respecting master redaction off', format => {
    const sample = '4242 4242 4242 4242';
    const config = only('paymentCards');
    const input = tree(sample); const snapshot = structuredClone(input);
    const result = redactSemanticTree(input, config);
    expect(result.tree).toMatchObject({ title: '[REDACTED]', sourceUrl: '[REDACTED]', root: { name: '[REDACTED]', value: '[REDACTED]', href: '[REDACTED]' } });
    expect(input).toEqual(snapshot);
    for (const level of COMPRESSION_LEVELS) {
      expect(prepareExport(input, level, format, true, config).serialized.content).not.toContain(sample);
      expect(prepareExport(input, level, format, false, config).serialized.content).toContain(sample);
    }
  });

  it('has bounded matching on long invalid numeric and IBAN-like strings', () => {
    for (const type of ['phoneNumbers', 'paymentCards', 'iban'] as const) {
      expect([...personalDataMatches('+' + '1'.repeat(100_000), type)]).toEqual([]);
    }
    expect([...personalDataMatches('GB82' + 'A'.repeat(100_000), 'iban')]).toEqual([]);
  });

  it('uses explicit default switches and preserves old switches when migrating v4 storage and v11 exports', () => {
    const old: RedactionSettings = { version: 4, disabledBuiltins: ['github', 'email-mask-domain'], customRules: [] };
    const expected = validateRedactionSettings(old);
    expect(expected).toEqual({ version: 6, disabledBuiltins: ['github', 'email-mask-domain', 'phone-numbers', 'personal-fields'], customRules: [] });
    const file = JSON.parse(exportRedactionSettings(expected));
    file.version = 11; file.availableRuleTypes = V11_RULE_TYPES;
    file.filters = file.filters.filter((filter: { id: string }) => V11_BUILTIN_FILTERS.some(builtin => builtin.id === filter.id));
    expect(importRedactionSettings(JSON.stringify(file))).toEqual(expected);
    expect(defaultRedactionSettings().disabledBuiltins).toEqual(['email-hide', 'phone-numbers', 'personal-fields']);
    const allOff = { ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) };
    expect(importRedactionSettings(exportRedactionSettings(allOff))).toEqual(allOff);
  });
});

describe('English personal field labels', () => {
  const settings = { ...defaultRedactionSettings(), disabledBuiltins: defaultRedactionSettings().disabledBuiltins.filter(id => id !== 'personal-fields') };
  it.each(PERSONAL_FIELD_TERMS.split(' / '))('hides values and nested text of %s fields but retains labels', name => {
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: name.toUpperCase(), value: 'synthetic-private-value', children: [{ role: 'generic', children: [{ role: 'text', name: 'synthetic-private-value', children: [] }] }] } };
    const result = redactSemanticTree(input, settings);
    expect(result.tree.root).toMatchObject({ name: name.toUpperCase(), value: '[REDACTED]', children: [{ children: [{ name: '[REDACTED]' }] }] });
    expect(redactSemanticTree(input, { ...defaultRedactionSettings(), disabledBuiltins: [...defaultRedactionSettings().disabledBuiltins, 'personal-fields-mask', 'phone-mask'] }).tree.root.value).toBe('synthetic-private-value');
    expect(redactSemanticTree(result.tree, settings).redactionCount).toBe(0);
  });
  it('does not guess personal information in prose or match unrelated labels', () => {
    expect(redactSemanticTree(tree('Full name: Example Person; Address: 123 Example Street'), settings).tree.title).toBe('Full name: Example Person; Address: 123 Example Street');
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Filename', value: 'report.txt', children: [] } };
    expect(redactSemanticTree(input, settings).tree).toEqual(input);
  });
  it('fully hides an Email field instead of partially masking it when enabled', () => {
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Email', value: 'person@example.test', children: [] } };
    expect(redactSemanticTree(input, settings).tree.root.value).toBe('[REDACTED]');
    expect(redactSemanticTree(input).tree.root.value).toBe('per***@exa****.test');
  });
});
