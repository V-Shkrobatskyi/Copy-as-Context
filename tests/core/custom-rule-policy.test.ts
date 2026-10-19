// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { BUILTIN_FILTERS, RULE_TYPES, CUSTOM_RULE_TYPES, isCustomRuleType, customRuleFromBuiltin, defaultRedactionSettings, validateRedactionSettings, importRedactionSettings, exportRedactionSettings } from '@/src/core/privacy/settings';

const automatic = RULE_TYPES.filter(type => !isCustomRuleType(type.id));
const custom = (type: string, enabled: boolean) => ({ id: 'custom', name: 'Custom', type, text: 'synthetic', caseSensitive: false, enabled });

describe('custom versus built-in rule policy', () => {
  it('uses an explicit allowlist for configurable custom types', () => {
    expect(CUSTOM_RULE_TYPES.map(type => type.id)).toEqual(['text', 'literalText', 'fieldLabels', 'fieldWords', 'urlParameters', 'regex', 'authorization', 'jwt', 'assignedSecrets']);
    expect(isCustomRuleType('futureAutomaticType')).toBe(false);
  });

  it.each(automatic)('rejects custom $id rules in raw settings and portable imports, including disabled rules', type => {
    for (const enabled of [true, false]) {
      const settings = { ...defaultRedactionSettings(), customRules: [custom(type.id, enabled)] };
      const before = structuredClone(settings);
      expect(() => validateRedactionSettings(settings)).toThrow('built-in only');
      expect(() => importRedactionSettings(JSON.stringify(settings))).toThrow('built-in only');
      const file = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
      file.filters.push({ source: 'custom', ...custom(type.id, enabled), matchingRule: 'synthetic' });
      delete file.filters.at(-1).text;
      expect(() => importRedactionSettings(JSON.stringify(file))).toThrow('built-in only');
      expect(settings).toEqual(before);
    }
  });

  it.each(BUILTIN_FILTERS)('rejects type or matching-definition changes for built-in $id', builtin => {
    for (const field of ['type', 'matchingRule']) {
      const file = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
      const entry = file.filters.find((filter: { id: string }) => filter.id === builtin.id);
      entry[field] = field === 'type' ? entry.type === 'text' ? 'regex' : 'text' : 'tampered definition';
      expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
    }
  });

  it.each(BUILTIN_FILTERS.filter(filter => !isCustomRuleType(customRuleFromBuiltin(filter.id).type)))('allows only the on/off setting for automatic $id', builtin => {
    const file = JSON.parse(exportRedactionSettings(defaultRedactionSettings()));
    file.filters.find((filter: { id: string }) => filter.id === builtin.id).caseSensitive = true;
    expect(() => importRedactionSettings(JSON.stringify(file))).toThrow();
    for (const value of [true, false]) {
      expect(() => validateRedactionSettings({ ...defaultRedactionSettings(), builtinCaseSensitivity: { [builtin.id]: value } })).toThrow();
    }
    const enabled = { ...defaultRedactionSettings(), disabledBuiltins: defaultRedactionSettings().disabledBuiltins.filter(id => id !== builtin.id) };
    expect(importRedactionSettings(exportRedactionSettings(enabled))).toEqual(enabled);
  });

  it('retains legitimate configurable built-in case settings and ignores catalog descriptions as implementations', () => {
    const settings = { ...defaultRedactionSettings(), builtinCaseSensitivity: { authorization: false } };
    const file = JSON.parse(exportRedactionSettings(settings));
    file.availableRuleTypes.forEach((type: { label: string; description: string }) => { type.label = 'Fake label'; type.description = 'Fake implementation'; });
    expect(importRedactionSettings(JSON.stringify(file))).toEqual(settings);
  });
});
