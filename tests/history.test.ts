// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { createCaptureHistory, type HistoryState } from '@/src/history/history';
import { captureMetadata, sanitizeMetadataBatch, DEFAULT_HISTORY_SETTINGS, MIB, resolveHistorySettings, validateHistorySettings, type HistoryPolicy } from '@/src/history/model';
import { DEFAULT_DATA_CONTROLS } from '@/src/core/data-controls';
import { validatePolicy } from '@/src/policy/model';
import { version } from '../package.json';
import { prepareExport } from '@/src/core/export';
function fixture(policy: HistoryPolicy = {}) {
  let state: HistoryState | undefined; let time = 1000000000000;
  const store = { load: async () => structuredClone(state), save: async (s: HistoryState) => { state = structuredClone(s); } };
  const context = { policy, sanitize: (m: any) => ({ scope: m.scope, ...(m.title ? { title: m.title } : {}), ...(m.sourceUrl ? { sourceUrl: m.sourceUrl } : {}) }) };
  return { history: createCaptureHistory(store, async () => context, () => time), store, context, advance: (ms: number) => { time += ms; } };
}
describe('opt-in capture history', () => {
  it('records the original extension version and the same settings suffix as the exported context', async () => {
    const tree = { schemaVersion: 1 as const, title: 'Example', sourceUrl: 'https://example.test/', root: { role: 'page', children: [] } };
    const metadata = captureMetadata(tree, DEFAULT_DATA_CONTROLS, true, undefined, 'compact');
    expect(metadata.extensionVersion).toBe(version); expect(metadata.exportSettings).toBe('/5/d');
    expect(prepareExport(tree, 'compact', 'semantic-text', true).serialized.content).toContain(`${metadata.extensionVersion}${metadata.exportSettings}`);
    expect(captureMetadata(tree, DEFAULT_DATA_CONTROLS, false, undefined, 'without').exportSettings).toBe('/0');
    let state: HistoryState | undefined;
    const history = createCaptureHistory({ load: async () => state, save: async s => { state = s; } }, async () => ({ policy: { CaptureHistoryEnabled: true }, sanitize: m => m, sanitizeAll: entries => sanitizeMetadataBatch(entries, DEFAULT_DATA_CONTROLS, true) }));
    await history.append({ ...metadata, extensionVersion: '1.4.2', exportSettings: '/2' });
    await history.append({ scope: 'page', title: 'Legacy entry without version' });
    const entries = JSON.parse(await history.export()).entries;
    expect(entries[0]).toMatchObject({ extensionVersion: '1.4.2', exportSettings: '/2' });
    expect(entries[1]).not.toHaveProperty('extensionVersion'); expect(entries[1]).not.toHaveProperty('exportSettings');
  });
  it('starts off and never stores content in disabled or enabled mode', async () => {
    const f = fixture(); await f.history.append({ scope: 'page', title: 'Example' }); expect((await f.history.read()).count).toBe(0);
    await f.history.setSettings({ ...DEFAULT_HISTORY_SETTINGS, enabled: true });
    await f.history.append({ scope: 'page', title: 'Example', content: 'SECRET-CONTENT' } as any); expect((await f.history.read()).count).toBe(0);
    await f.history.append({ scope: 'selection', title: 'Example', selectedElementTag: 'section' });
    expect((await f.history.read()).count).toBe(1); expect(await f.history.export()).not.toContain('SECRET-CONTENT');
  });
  it('allows manual 1–365 day and 1–50 MiB settings and validates policy types', () => {
    for (const v of [{ enabled: true, retentionDays: 1, maxMiB: 1 }, { enabled: true, retentionDays: 365, maxMiB: 50 }]) expect(validateHistorySettings(v)).toEqual(v);
    for (const v of [{ enabled: true, retentionDays: 0, maxMiB: 10 }, { enabled: true, retentionDays: 366, maxMiB: 10 }, { enabled: true, retentionDays: 60, maxMiB: 51 }]) expect(() => validateHistorySettings(v)).toThrow();
    expect(() => validatePolicy({ CaptureHistoryRetentionDays: 366 })).toThrow('CaptureHistoryRetentionDays');
    expect(() => validatePolicy({ CaptureHistoryEnabled: 'yes' })).toThrow('CaptureHistoryEnabled');
  });
  it('expires entries across restart and serializes clear after pending writes', async () => {
    const f = fixture({ CaptureHistoryClearAllowed: false }); await f.history.setSettings({ enabled: true, retentionDays: 1, maxMiB: 1 });
    await f.history.append({ scope: 'page', title: 'Old' }); f.advance(86400001);
    const restarted = createCaptureHistory(f.store, async () => f.context, () => 1000000000000 + 86400001);
    expect((await restarted.read()).count).toBe(0);
    delete f.context.policy.CaptureHistoryClearAllowed;
    await Promise.all([f.history.append({ scope: 'page', title: 'New' }), f.history.clear()]); expect((await f.history.read()).count).toBe(0);
  });
  it('trims oldest entries to the compact UTF-8 export size, including multibyte metadata', async () => {
    const f = fixture(); await f.history.setSettings({ enabled: true, retentionDays: 365, maxMiB: 1 });
    for (let index = 0; index < 180; index++) await f.history.append({ scope: 'page', title: `${index} ${'界'.repeat(2000)}` });
    const r = await f.history.read(); const json = await f.history.export();
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(MIB); expect(r.count).toBeLessThan(180); expect(r.entries[0]!.title).toMatch(/^179 /);
  });
  it('honors forced fields, locks settings and restores the preserved personal choice', async () => {
    const f = fixture(); await f.history.setSettings({ enabled: true, retentionDays: 120, maxMiB: 20 });
    Object.assign(f.context.policy, { CaptureHistoryRetentionDays: 30 });
    await f.history.setSettings({ enabled: false, retentionDays: 7, maxMiB: 5 });
    expect((await f.history.read()).settings.retentionDays).toBe(30);
    delete f.context.policy.CaptureHistoryRetentionDays; expect((await f.history.read()).settings.retentionDays).toBe(120);
    f.context.policy.CaptureHistorySettingsLocked = true; await expect(f.history.setSettings(DEFAULT_HISTORY_SETTINGS)).rejects.toThrow('managed');
    expect(resolveHistorySettings(f.context.policy).enabled).toBe(false);
  });
  it('applies exclusions and redaction to the header without retaining the tree or credentials', () => {
    const tree = { schemaVersion: 1 as const, title: 'Private heading', sourceUrl: 'https://user:pass@example.test/path?secret=TOP_SECRET', browser: 'Chrome Desktop', capturedAt: '2026.10.21 16:05:55', selectedElementTag: 'section', root: { role: 'page', children: [{ role: 'StaticText', name: 'SECRET-CONTENT', children: [] }] } };
    const m = captureMetadata(tree, { ...DEFAULT_DATA_CONTROLS, includeTitle: false, pageUrl: 'origin' }, true);
    expect(m).toEqual({ scope: 'selection', sourceUrl: 'https://example.test/', browser: 'Chrome Desktop', capturedAt: '2026.10.21 16:05:55', selectedElementTag: 'section' });
    expect(JSON.stringify(m)).not.toContain('SECRET'); expect(JSON.stringify(m)).not.toContain('Private');
    expect(captureMetadata(tree, DEFAULT_DATA_CONTROLS, false).sourceUrl).not.toContain('user:pass');
  });
  it('reapplies current exclusions and required redaction to retained metadata in a batch', () => {
    const entries = [{ scope: 'selection' as const, title: 'Contact person@example.test', sourceUrl: 'https://user:pass@example.test/path?secret=value', browser: 'Chrome Desktop', capturedAt: '2026.10.21 16:05:55', selectedElementTag: 'section' }];
    const safe = sanitizeMetadataBatch(entries, { ...DEFAULT_DATA_CONTROLS, pageUrl: 'origin' }, true);
    expect(safe[0]!.title).not.toContain('person@example.test');
    expect(safe[0]!.sourceUrl).toBe('https://example.test/');
    expect(safe[0]!.selectedElementTag).toBe('section');
    expect(entries[0]!.title).toContain('person@example.test');
    expect(sanitizeMetadataBatch(entries, { ...DEFAULT_DATA_CONTROLS, includeTitle: false, pageUrl: 'omit' }, false)[0]).toEqual({ scope: 'selection', browser: 'Chrome Desktop', capturedAt: '2026.10.21 16:05:55', selectedElementTag: 'section' });
  });
});
