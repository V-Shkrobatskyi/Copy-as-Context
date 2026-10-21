// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { sourceAllowed, validateSourcePatterns, validateSourceSettings, personalSourceRules } from '@/src/policy/sources';
import { validatePolicy } from '@/src/policy/model';
describe('source boundaries', () => {
  it.each(['https://www.w3schools.com/', 'https://*.example.test/', '*://example.test:*/', 'http://localhost:8080/'])('accepts a root slash consistently in both personal and managed lists (%s)', input => {
    const canonical = input.slice(0, -1);
    expect(validateSourcePatterns([input, canonical])).toEqual([canonical]);
    const personal = validateSourceSettings({ allowlistEnabled: true, allowed: [input], blocked: [input] });
    expect(personal).toEqual({ allowlistEnabled: true, allowed: [canonical], blocked: [canonical] });
    const url = input.replace('https://*.', 'https://child.').replace('*://', 'https://').replace(':*/', ':8443/') + 'path?example=yes';
    expect(sourceAllowed(url, { AllowedCaptureSources: personal.allowed })).toBe(true);
    expect(sourceAllowed(url, { BlockedCaptureSources: personal.blocked })).toBe(false);
    expect(validatePolicy({ AllowedCaptureSources: [input], BlockedCaptureSources: [input] })).toMatchObject({ AllowedCaptureSources: [canonical], BlockedCaptureSources: [canonical] });
  });
  it('intersects personal and organization allowlists and gives either deny list priority', () => {
    const rules = { AllowedCaptureSources: ['https://*.company.test'], BlockedCaptureSources: ['https://admin.company.test'], personal: { AllowedCaptureSources: ['https://team.company.test', 'https://admin.company.test', 'https://outside.test'], BlockedCaptureSources: ['https://team.company.test'] } };
    for (const url of ['https://admin.company.test', 'https://team.company.test', 'https://outside.test', 'https://other.company.test']) expect(sourceAllowed(url, rules)).toBe(false);
    expect(sourceAllowed('https://team.company.test', { ...rules, personal: { AllowedCaptureSources: ['https://team.company.test'] } })).toBe(true);
  });
  it('validates personal lists while preserving a disabled allowlist and distinguishing enabled-empty', () => {
    const settings = validateSourceSettings({ allowlistEnabled: false, allowed: ['https://EXAMPLE.test', 'https://example.test'], blocked: [] });
    expect(settings.allowed).toEqual(['https://example.test']);
    expect(sourceAllowed('https://other.test', personalSourceRules(settings))).toBe(true);
    expect(sourceAllowed('https://other.test', personalSourceRules({ ...settings, allowlistEnabled: true, allowed: [] }))).toBe(false);
    for (const raw of [{ ...settings, extra: true }, { ...settings, allowlistEnabled: 'yes' }, { ...settings, blocked: ['https://example.test/path'] }]) expect(() => validateSourceSettings(raw)).toThrow();
  });
  it('keeps absent rules compatible but distinguishes an empty allowlist', () => {
    expect(sourceAllowed(undefined)).toBe(true);
    expect(sourceAllowed('file:///private/example')).toBe(true);
    expect(sourceAllowed('https://example.test', { AllowedCaptureSources: [] })).toBe(false);
  });
  it('matches normalized origins, subdomain boundaries, ports and deny priority', () => {
    const rules = validatePolicy({ AllowedCaptureSources: ['https://*.EXAMPLE.test.:443', 'http://localhost:8080'], BlockedCaptureSources: ['https://private.example.test'] });
    for (const url of ['https://example.test/path?secret=yes', 'https://child.example.test', 'http://localhost:8080/']) expect(sourceAllowed(url, rules), url).toBe(true);
    for (const url of ['https://example.test.attacker.test', 'http://example.test', 'https://example.test:8443', 'https://private.example.test', 'http://localhost']) expect(sourceAllowed(url, rules), url).toBe(false);
  });
  it('normalizes IDN and supports any port without using URL substrings', () => {
    const rules = { AllowedCaptureSources: validateSourcePatterns(['*://bücher.example:*']) };
    expect(sourceAllowed('https://xn--bcher-kva.example:8443', rules)).toBe(true);
    expect(sourceAllowed('http://bücher.example:8080', rules)).toBe(true);
    expect(sourceAllowed('https://evil.test/?https://bücher.example', rules)).toBe(false);
  });
  it.each(['https://example.test/path', 'https://example.test/path/', 'https://example.test//', 'https://example.test:/', 'https://user:pass@example.test', 'https://example.test?token=x', 'file://*', '<all_urls>', 'https://example.test/#x'])('rejects unsupported pattern %s without its value in policy errors', pattern => {
    expect(() => validatePolicy({ AllowedCaptureSources: [pattern] })).toThrow('AllowedCaptureSources');
    try { validatePolicy({ AllowedCaptureSources: [pattern] }); } catch (error) { expect(String(error)).not.toContain(pattern); }
  });
  it('fails closed for unknown and opaque origins with active rules', () => {
    const rules = { BlockedCaptureSources: ['https://blocked.test'] };
    for (const url of [undefined, 'file:///example', 'data:text/html,private', 'about:blank', 'about:srcdoc', 'blob:null/token']) expect(sourceAllowed(url, rules)).toBe(false);
    expect(sourceAllowed('blob:https://allowed.test/token', rules)).toBe(true);
  });
});

it('keeps explicit wildcard-scheme ports literal and rejects opaque actual origins', () => {
  const rules = { AllowedCaptureSources: validateSourcePatterns(['*://example.test:443']) };
  expect(sourceAllowed('https://example.test', rules)).toBe(true);
  expect(sourceAllowed('http://example.test', rules)).toBe(false);
  expect(sourceAllowed('http://example.test:443', rules)).toBe(true);
  expect(sourceAllowed('https://example.test', rules, 'null')).toBe(false);
});
