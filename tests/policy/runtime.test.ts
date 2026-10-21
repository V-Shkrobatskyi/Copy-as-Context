// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), localGet: vi.fn(), set: vi.fn(), listeners: new Set<(...args: any[]) => void>() }));
vi.mock('wxt/browser', () => ({ browser: { storage: { managed: { get: mocks.get }, local: { get: mocks.localGet, set: mocks.set }, onChanged: {
  addListener: (fn: (...args: any[]) => void) => mocks.listeners.add(fn), removeListener: (fn: (...args: any[]) => void) => mocks.listeners.delete(fn),
} } } }));
import { checkPolicy, readPolicy, watchPolicy } from '@/src/policy/runtime';
import { loadRedactionSettings, saveRedactionSettings } from '@/src/redaction-settings';
const prefs = { format: 'markdown', compression: 'compact', redactSensitiveData: true } as const;
beforeEach(() => { mocks.get.mockReset().mockResolvedValue({}); mocks.localGet.mockReset().mockResolvedValue({}); mocks.set.mockReset(); mocks.listeners.clear(); });
afterEach(() => vi.unstubAllEnvs());
describe('managed storage enforcement', () => {
  it('does not manufacture a revision on ordinary installations', async () => {
    expect(await readPolicy()).toEqual({ policy: expect.any(Object) });
    await expect(checkPolicy('copy', prefs)).resolves.toBeDefined();
  });
  it('requires a matching revision and rejects stale contexts after change or removal', async () => {
    mocks.get.mockResolvedValue({ PolicyVersion: 1, RedactionMode: 'force-on' });
    const snapshot = await readPolicy();
    expect(snapshot.revision).toMatch(/^[a-f0-9]{64}$/);
    await expect(checkPolicy('copy')).rejects.toThrow('Prepare the context again');
    await expect(checkPolicy('copy', { ...prefs, policyRevision: snapshot.revision })).resolves.toBeDefined();
    await expect(checkPolicy('copy', { ...prefs, redactSensitiveData: false, policyRevision: snapshot.revision })).rejects.toThrow('restricted');
    mocks.get.mockResolvedValue({ PolicyVersion: 1, RedactionMode: 'force-on', FileExportAllowed: false });
    await expect(checkPolicy('copy', { ...prefs, policyRevision: snapshot.revision })).rejects.toThrow('changed');
    mocks.get.mockResolvedValue({});
    await expect(checkPolicy('copy', { ...prefs, policyRevision: snapshot.revision })).rejects.toThrow('changed');
  });
  it('never opens export on a failed read; permits only Firefox’s explicit no-manifest result', async () => {
    mocks.get.mockRejectedValue(new Error('Synthetic storage failure with private value'));
    await expect(checkPolicy('capture')).rejects.toThrow('Unable to load organization policies');
    vi.stubEnv('BROWSER', 'firefox');
    mocks.get.mockRejectedValue(new Error('Managed storage manifest not found'));
    expect((await readPolicy()).revision).toBeUndefined();
    vi.stubEnv('BROWSER', 'chrome');
    await expect(readPolicy()).rejects.toThrow('Unable to load organization policies');
  });
  it('normalizes object/list order for revisions and does not expose rule text in revisions', async () => {
    mocks.get.mockResolvedValue({ FileExportAllowed: false, AllowedExportFormats: ['markdown', 'semantic-text'] });
    const a = await readPolicy();
    mocks.get.mockResolvedValue({ AllowedExportFormats: ['semantic-text', 'markdown'], FileExportAllowed: false });
    expect((await readPolicy()).revision).toBe(a.revision);
  });
  it('watches only managed changes and removes its listener on disposal', () => {
    const changed = vi.fn(); const stop = watchPolicy(changed);
    for (const fn of mocks.listeners) { fn({}, 'local'); fn({}, 'managed'); }
    expect(changed).toHaveBeenCalledOnce(); stop(); expect(mocks.listeners.size).toBe(0);
  });
  it('cannot persist personal filters under either save or customization restrictions', async () => {
    const { defaultRedactionSettings } = await import('@/src/core/privacy/settings');
    for (const policy of [{ UserPreferencesSaveAllowed: false }, { UserRedactionRulesAllowed: false }, { FilterSettingsAllowed: false }]) {
      mocks.get.mockResolvedValue(policy);
      await expect(saveRedactionSettings(defaultRedactionSettings())).rejects.toThrow('disabled');
    }
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('loads corporate rules despite unreadable personal filters when personal customization is disabled', async () => {
    mocks.get.mockResolvedValue({ UserRedactionRulesAllowed: false, RequiredBuiltinFilters: ['email-hide'] });
    mocks.localGet.mockRejectedValue(new Error('Unreadable personal configuration'));
    const filters = await loadRedactionSettings();
    expect(filters.disabledBuiltins).not.toContain('email-hide');
    expect(mocks.localGet).not.toHaveBeenCalled();
  });
});


it('keeps managed on/off overrides outside saved preferences and restores personal states after removal', async () => {
  const { defaultRedactionSettings } = await import('@/src/core/privacy/settings');
  const original = defaultRedactionSettings();
  mocks.localGet.mockResolvedValue({ 'redaction-filters-v1': original });
  mocks.get.mockResolvedValue({ RequiredBuiltinFilters: ['email-hide'], DisabledBuiltinFilters: ['authorization'] });
  const managed = await loadRedactionSettings();
  expect(managed.disabledBuiltins).toContain('authorization'); expect(managed.disabledBuiltins).not.toContain('email-hide');
  expect(mocks.set).not.toHaveBeenCalled(); expect(original).toEqual(defaultRedactionSettings());
  mocks.get.mockResolvedValue({});
  expect(await loadRedactionSettings()).toEqual(original);
});
