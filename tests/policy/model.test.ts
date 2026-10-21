// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { assertAction, mergeManagedFilters, redactionMode, resolvePreferences, validatePolicy } from '@/src/policy/model';
import { defaultRedactionSettings } from '@/src/core/privacy/settings';
import { prepareExport } from '@/src/core';

const rule = { id: 'client', name: 'Client', type: 'text' as const, text: 'Acme', enabled: true, caseSensitive: false };
describe('enterprise policy contract', () => {
  it('keeps personal choices without policies and applies recommended defaults only when needed', () => {
    expect(resolvePreferences({})).toEqual({ format: 'semantic-text', compression: 'compact', redactSensitiveData: true });
    const p = validatePolicy({ DefaultExportFormat: 'markdown', DefaultCompression: 'maximum' });
    expect(resolvePreferences(p)).toMatchObject({ format: 'markdown', compression: 'maximum' });
    expect(resolvePreferences(p, { format: 'semantic-text', compression: 'without' })).toMatchObject({ format: 'semantic-text', compression: 'without' });
  });
  it('forces values, restricts stale choices and uses a stable fallback', () => {
    const p = validatePolicy({ AllowedExportFormats: ['markdown'], AllowedCompressionLevels: ['maximum', 'detailed'], ForcedCompression: 'maximum', RedactionMode: 'force-on' });
    expect(resolvePreferences(p, { format: 'semantic-text', compression: 'without', redactSensitiveData: false })).toEqual({ format: 'markdown', compression: 'maximum', redactSensitiveData: true });
    expect(resolvePreferences(validatePolicy({ AllowedCompressionLevels: ['maximum', 'detailed'] })).compression).toBe('detailed');
    expect(resolvePreferences({ RedactionMode: 'force-off' }, { redactSensitiveData: true }).redactSensitiveData).toBe(false);
  });
  it.each([
    { PreviewAllowed: 'false' }, { FilterSettingsAllowed: 0 }, { PolicyVersion: 2 }, { FileExportAllowed: 'false' }, { AllowedExportFormats: ['json'] },
    { AllowedExportFormats: ['markdown', 'markdown'] }, { AllowedCompressionLevels: 'compact' },
    { AllowedExportFormats: ['markdown'], ForcedExportFormat: 'semantic-text' },
    { AllowedCompressionLevels: [], DefaultCompression: 'compact' },
    { RedactionMode: 'force-off', RequiredBuiltinFilters: ['jwt'] },
    { RedactionMode: 'user-controlled', ManagedRedactionRules: [rule] },
    { DisabledBuiltinFilters: ['unknown'] }, { DisabledBuiltinFilters: ['jwt', 'jwt'] }, { DisabledBuiltinFilters: 'jwt' },
    { RequiredBuiltinFilters: ['jwt'], DisabledBuiltinFilters: ['jwt'] },
    { RequiredBuiltinFilters: ['unknown'] }, { ManagedRedactionRules: [{ ...rule, enabled: false }] },
    { ManagedRedactionRules: [{ ...rule, type: 'regex', text: '(' }] },
    { ManagedRedactionRules: [rule, rule] }, { ManagedRedactionRules: [{ ...rule, type: undefined }] },
  ])('rejects invalid configuration without disclosing its values: %j', raw => {
    expect(() => validatePolicy(raw)).toThrow(/Invalid organization policy:/);
    try { validatePolicy(raw); } catch (error) { expect((error as Error).message).not.toContain('Acme'); }
  });
  it('implies required redaction and whitelists source data', () => {
    expect(redactionMode(validatePolicy({ RequiredBuiltinFilters: ['jwt'] }))).toBe('force-on');
    expect(redactionMode(validatePolicy({ ManagedRedactionRules: [rule] }))).toBe('force-on');
    expect(validatePolicy({ FileExportAllowed: false, UnknownFutureKey: 'secret' })).not.toHaveProperty('UnknownFutureKey');
  });
  it.each(['copy', 'save', 'picker', 'preview', 'capture'] as const)('blocks %s with an empty format or level list', action => {
    expect(() => assertAction({ AllowedExportFormats: [] }, action)).toThrow('disabled');
    expect(() => assertAction({ AllowedCompressionLevels: [] }, action)).toThrow('disabled');
  });
  it('treats permissions independently', () => {
    expect(() => assertAction({ PreviewAllowed: false }, 'preview')).toThrow('Preview is disabled');
    expect(() => assertAction({ FilterSettingsAllowed: false }, 'customize')).toThrow('Filter settings are disabled');
    expect(() => assertAction({ PreviewAllowed: false, FilterSettingsAllowed: false }, 'copy')).not.toThrow();
    expect(() => assertAction({ AllowedExportFormats: [], FileExportAllowed: false }, 'customize')).not.toThrow();
    expect(() => assertAction({ FileExportAllowed: false }, 'copy')).not.toThrow();
    expect(() => assertAction({ ClipboardExportAllowed: false }, 'save')).not.toThrow();
    expect(() => assertAction({ FileExportAllowed: false }, 'save')).toThrow('File export');
    expect(() => assertAction({ ClipboardExportAllowed: false }, 'copy')).toThrow('Copying');
    expect(() => assertAction({ ElementPickerAllowed: false }, 'picker')).toThrow('Element selection');
    expect(() => assertAction({ FileExportAllowed: false, ClipboardExportAllowed: false }, 'capture')).toThrow('Export');
  });
  it('restores original built-in semantics and keeps managed rules outside personal storage', () => {
    const personal = { ...defaultRedactionSettings(), disabledBuiltins: ['authorization' as const], builtinCaseSensitivity: { authorization: false }, customRules: [{ ...rule, id: 'managed-0', text: 'Personal' }] };
    const before = structuredClone(personal);
    const p = validatePolicy({ RequiredBuiltinFilters: ['authorization'], ManagedRedactionRules: [rule] });
    const merged = mergeManagedFilters(p, personal);
    expect(merged.disabledBuiltins).not.toContain('authorization');
    expect(merged.builtinCaseSensitivity?.authorization).toBeUndefined();
    expect(new Set(merged.customRules.map(r => r.id)).size).toBe(2);
    const result = prepareExport({ schemaVersion: 1, root: { role: 'page', children: [{ role: 'StaticText', name: 'Acme Personal Bearer abcdefghijklmnop', children: [] }] } }, 'compact', 'markdown', true, merged);
    expect(result.serialized.content).not.toContain('Acme');
    expect(result.serialized.content).not.toContain('Personal');
    expect(result.serialized.content).not.toContain('abcdefghijklmnop');
    expect(personal).toEqual(before);
  });
  it('ignores personal modifications when prohibited and enforces the combined budget', () => {
    const personal = { ...defaultRedactionSettings(), customRules: [{ ...rule, text: 'Personal' }] };
    const merged = mergeManagedFilters(validatePolicy({ UserRedactionRulesAllowed: false, ManagedRedactionRules: [rule] }), personal);
    expect(merged.customRules).toHaveLength(1);
    expect(merged.customRules[0]!.text).toBe('Acme');
    const full = { ...personal, customRules: Array.from({ length: 400 }, (_, i) => ({ ...rule, id: `u${i}` })) };
    expect(() => mergeManagedFilters(validatePolicy({ ManagedRedactionRules: [rule] }), full)).toThrow('combined filter limits');
  });
});


it('overrides default and personal built-in states without changing matching rules or personal storage', () => {
  const personal = { ...defaultRedactionSettings(), disabledBuiltins: ['email-hide', 'github'] as const, builtinCaseSensitivity: { authorization: false } };
  const input = { ...personal, disabledBuiltins: [...personal.disabledBuiltins] };
  const before = structuredClone(input);
  const policy = validatePolicy({ RequiredBuiltinFilters: ['email-hide'], DisabledBuiltinFilters: ['authorization'] });
  const merged = mergeManagedFilters(policy, input);
  expect(merged.disabledBuiltins).toContain('authorization');
  expect(merged.disabledBuiltins).toContain('github');
  expect(merged.disabledBuiltins).not.toContain('email-hide');
  expect(merged.builtinCaseSensitivity?.authorization).toBeUndefined();
  const result = prepareExport({ schemaVersion: 1, root: { role: 'page', children: [{ role: 'StaticText', name: 'person@example.test Bearer abcdefghijklmnop', children: [] }] } }, 'compact', 'markdown', true, merged);
  expect(result.serialized.content).not.toContain('person@example.test');
  expect(result.serialized.content).toContain('Bearer abcdefghijklmnop');
  expect(input).toEqual(before);
});
it('applies disabled-only policies and ignores personal changes when customization is prohibited', () => {
  const policy = validatePolicy({ DisabledBuiltinFilters: ['authorization'] });
  expect(redactionMode(policy)).toBe('user-controlled');
  expect(mergeManagedFilters(policy, defaultRedactionSettings()).disabledBuiltins).toContain('authorization');
  const locked = validatePolicy({ UserRedactionRulesAllowed: false, RequiredBuiltinFilters: ['email-hide'], DisabledBuiltinFilters: ['authorization'] });
  const merged = mergeManagedFilters(locked, defaultRedactionSettings());
  expect(merged.disabledBuiltins).toContain('authorization'); expect(merged.disabledBuiltins).not.toContain('email-hide');
});
