// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ api: {} as any, state: undefined as any, historyState: undefined as any, listener: undefined as any }));
vi.mock('wxt/browser', () => ({ browser: mocks.api }));
vi.mock('@/src/diagnostics/store', () => ({ journalStore: () => ({ load: async () => structuredClone(mocks.state), save: async (state: unknown) => { mocks.state = structuredClone(state); } }), localStateStore: () => ({ load: async () => structuredClone(mocks.historyState), save: async (state: unknown) => { mocks.historyState = structuredClone(state); } }) }));
import { installDiagnostics } from '@/src/diagnostics/background';
const sender = (path = '/diagnostics.html') => ({ id: 'extension', url: `chrome-extension://test${path}`, tab: { id: 42 } });
const send = (action: string, extra = {}, source = sender()) => new Promise<any>(resolve => { const result = mocks.listener({ type: 'diagnostics', action, ...extra }, source, resolve); if (result === undefined) resolve(undefined); });
beforeEach(() => {
  mocks.state = undefined; mocks.historyState = undefined;
  mocks.api.storage = { managed: { get: vi.fn().mockResolvedValue({}) }, local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } };
  mocks.api.runtime = { id: 'extension', getURL: (path: string) => `chrome-extension://test${path}`, getPlatformInfo: async () => ({ os: 'linux' }), onMessage: { addListener: (fn: any) => { mocks.listener = fn; } } };
  installDiagnostics();
});
describe('diagnostics trust and report privacy', () => {
  it('rejects content scripts, other extensions and extension pages outside the allowlist', async () => {
    for (const source of [{ ...sender(), url: 'https://private.test' }, { ...sender(), id: 'other' }, sender('/demo.html')]) expect(await send('read', {}, source)).toBeUndefined();
    expect(await send('read', {}, sender('/popup.html'))).toBeUndefined();
    expect(await send('event', { event: { code: 'capture-complete', result: 'error', url: 'https://SECRET.test' } }, sender('/popup.html'))).toEqual({ ok: false });
    expect((await send('read')).report.journal.count).toBe(0);
  });
  it('reports counts and safe effective values without domains, rules or configuration hashes', async () => {
    mocks.api.storage.managed.get.mockResolvedValue({ PolicyVersion: 1, AllowedCaptureSources: ['https://SECRET-INTERNAL.test'], RequiredBuiltinFilters: ['email-hide'], PreviewAllowed: false, FilterSettingsAllowed: false, PageUrlMode: 'origin' });
    const result = await send('read');
    expect(result.ok).toBe(true); expect(JSON.stringify(result)).not.toContain('SECRET-INTERNAL'); expect(result.report).not.toHaveProperty('revision');
    expect(result.report.organization).toMatchObject({ allowedSourceCount: 1, requiredRuleCount: 1, restrictions: { preview: true, customize: true } });
    expect(result.report.valueSources.pageUrl).toBe('organization'); expect(result.report.effectiveDataControls.pageUrl).toBe('origin');
  });
  it('excludes events from reports unless requested and honors export switches separately from context formats', async () => {
    await send('event', { event: { code: 'capture-complete', result: 'error', reason: 'failed' } }, sender('/popup.html'));
    expect((await send('read')).report.events).toBeUndefined();
    expect((await send('read', { includeLog: true })).report.events).toHaveLength(1);
    mocks.api.storage.managed.get.mockResolvedValue({ AllowedExportFormats: [], FileExportAllowed: false, ClipboardExportAllowed: false });
    expect((await send('read')).ok).toBe(true); expect((await send('export-copy')).ok).toBe(false); expect((await send('export-save')).ok).toBe(false);
    mocks.api.storage.managed.get.mockResolvedValue({ AllowedExportFormats: [] });
    expect((await send('export-copy')).ok).toBe(true);
  });
  it('keeps diagnosis visible on policy failure and does not overwrite managed restrictions', async () => {
    mocks.api.storage.managed.get.mockRejectedValue(new Error('SECRET-POLICY-ERROR'));
    const result = await send('read', { includeLog: true });
    expect(result.report.policyState).toBe('error'); expect(result.copyAllowed).toBe(false); expect(result.saveAllowed).toBe(false); expect(JSON.stringify(result)).not.toContain('SECRET');
    expect((await send('data', { data: { includeTitle: true, includeFormValues: true, pageUrl: 'full', linkUrls: 'full' } })).ok).toBe(false);
    expect(mocks.api.storage.local.set).not.toHaveBeenCalled();
  });
});

it('keeps capture history opt-in, separate from technical reports, and available only to diagnostics', async () => {
  const { recordCaptureHistory } = await import('@/src/history/client');
  expect((await send('history-read')).history.settings.enabled).toBe(false);
  expect(await send('history-settings', { settings: { enabled: true, retentionDays: 60, maxMiB: 10 } }, sender('/popup.html'))).toBeUndefined();
  expect((await send('history-settings', { settings: { enabled: true, retentionDays: 365, maxMiB: 50 } })).ok).toBe(true);
  recordCaptureHistory({ scope: 'selection', title: 'PRIVATE-HISTORY-TITLE', sourceUrl: 'https://private-history.test/', selectedElementTag: 'article' });
  const result = await send('history-read'); expect(result.history.count).toBe(1); expect(result.history.entries[0].selectedElementTag).toBe('article');
  expect(JSON.stringify((await send('read', { includeLog: true })).report)).not.toContain('PRIVATE-HISTORY');
  mocks.api.storage.managed.get.mockResolvedValue({ IncludePageTitle: false, PageUrlMode: 'omit' });
  const cleaned = await send('history-export', { destination: 'copy' });
  expect(cleaned.ok).toBe(true); expect(cleaned.json).not.toContain('PRIVATE-HISTORY'); expect(cleaned.json).not.toContain('private-history.test');
  mocks.api.storage.managed.get.mockResolvedValue({ FileExportAllowed: false });
  expect((await send('history-export', { destination: 'save' })).ok).toBe(false);
  await send('history-clear'); expect((await send('history-read')).history.count).toBe(0);
});

it('enforces independent clear policies in the background and restores clearing after policy removal', async () => {
  const { recordCaptureHistory } = await import('@/src/history/client');
  await send('history-settings', { settings: { enabled: true, retentionDays: 60, maxMiB: 10 } });
  recordCaptureHistory({ scope: 'page', title: 'Retained capture' });
  await send('event', { event: { code: 'capture-complete', result: 'error' } });
  expect((await send('history-read')).history.clearAllowed).toBe(true);
  expect((await send('read')).log.clearAllowed).toBe(true);
  mocks.api.storage.managed.get.mockResolvedValue({ CaptureHistoryClearAllowed: false, TechnicalLogClearAllowed: false });
  expect((await send('history-read')).history.clearAllowed).toBe(false);
  expect((await send('read')).log.clearAllowed).toBe(false);
  expect((await send('history-clear')).ok).toBe(false);
  expect((await send('clear')).ok).toBe(false);
  expect((await send('history-read')).history.count).toBe(1);
  expect((await send('read')).log.events).toHaveLength(1);
  mocks.api.storage.managed.get.mockResolvedValue({ TechnicalLogClearAllowed: false });
  expect((await send('history-clear')).ok).toBe(true);
  expect((await send('clear')).ok).toBe(false);
  expect((await send('history-read')).history.count).toBe(0);
  mocks.api.storage.managed.get.mockRejectedValue(new Error('Policy unavailable'));
  expect((await send('clear')).ok).toBe(false);
  expect((await send('history-clear')).ok).toBe(false);
  mocks.api.storage.managed.get.mockResolvedValue({});
  expect((await send('clear')).ok).toBe(true);
  expect((await send('read')).log.events).toHaveLength(0);
});

it('saves personal source restrictions only from diagnostics, validates them and supports explicit recovery', async () => {
  const settings = { allowlistEnabled: true, allowed: ['https://*.example.test'], blocked: ['https://private.example.test'] };
  expect(await send('sources-save', { settings }, sender('/popup.html'))).toBeUndefined();
  expect((await send('sources-save', { settings: { ...settings, allowed: settings.allowed.map(site => `${site}/`), blocked: settings.blocked.map(site => `${site}/`) } })).ok).toBe(true);
  expect(mocks.api.storage.local.set).toHaveBeenCalledWith({ 'capture-sources-v1': settings });
  mocks.api.storage.local.get.mockResolvedValue({ 'capture-sources-v1': settings });
  expect((await send('sources-read')).settings).toEqual(settings);
  expect(JSON.stringify((await send('read')).report)).not.toContain('private.example.test');
  expect((await send('sources-save', { settings: { ...settings, blocked: ['https://bad.test/path'] } })).ok).toBe(false);
  mocks.api.storage.managed.get.mockResolvedValue({ UserPreferencesSaveAllowed: false });
  expect((await send('sources-save', { settings })).ok).toBe(false);
  expect((await send('sources-read')).preferencesAllowed).toBe(false);
  mocks.api.storage.managed.get.mockResolvedValue({});
  mocks.api.storage.local.get.mockResolvedValue({ 'capture-sources-v1': { allowlistEnabled: 'invalid' } });
  expect((await send('sources-read')).available).toBe(false);
  expect((await send('sources-save', { settings })).ok).toBe(true);
});
