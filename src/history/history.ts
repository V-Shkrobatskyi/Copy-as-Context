// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { DEFAULT_HISTORY_SETTINGS, MIB, resolveHistorySettings, validateHistorySettings, validateMetadata, type CaptureMetadata, type HistoryEntry, type HistoryPolicy, type HistorySettings } from './model';
export interface HistoryState { version: 1; settings: HistorySettings; entries: HistoryEntry[] }
export interface HistoryStore { load(): Promise<unknown>; save(state: HistoryState): Promise<void> }
export interface HistoryContext { policy: HistoryPolicy & { UserPreferencesSaveAllowed?: boolean }; sanitize(entry: CaptureMetadata): CaptureMetadata; sanitizeAll?(entries: CaptureMetadata[]): CaptureMetadata[] }
export const historyJSON = (entries: HistoryEntry[]) => JSON.stringify({ historyVersion: 1, entries });
const encodedBytes = (s: string) => new TextEncoder().encode(s).length;
/** The single background owner bounds writes, validates records and removes oldest entries first. */
export function createCaptureHistory(store: HistoryStore, context: () => Promise<HistoryContext>, now = Date.now) {
  let tail: Promise<unknown> = Promise.resolve(); let queued = 0;
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    if (queued >= 32) return Promise.reject(new Error('Capture history busy.'));
    queued++; const next = tail.then(work); tail = next.catch(() => {}).finally(() => { queued--; }); return next;
  };
  const load = async () => {
    const raw = await store.load() as Partial<HistoryState> | undefined;
    const state: HistoryState = { version: 1, settings: { ...DEFAULT_HISTORY_SETTINGS }, entries: [] };
    if (raw?.settings) { try { state.settings = validateHistorySettings(raw.settings); } catch { /* Invalid personal settings fall back to recording off. */ } }
    if (Array.isArray(raw?.entries) && raw.entries.length <= 100000) for (const entry of raw.entries) {
      if (!entry || typeof entry !== 'object') continue;
      const { id, time, ...metadata } = entry; const safe = validateMetadata(metadata);
      if (safe && typeof id === 'string' && /^[a-f0-9-]{36}$/u.test(id) && Number.isSafeInteger(time) && time >= 0 && time <= now()) state.entries.push({ ...safe, id, time });
    }
    return state;
  };
  const trim = (s: HistoryState, c: HistoryContext) => {
    const settings = resolveHistorySettings(c.policy, s.settings);
    const retained = s.entries.filter(e => now() - e.time < settings.retentionDays * 86400000).slice(-100000);
    const sanitized = c.sanitizeAll ? c.sanitizeAll(retained) : retained.map(c.sanitize);
    s.entries = retained.map((e, i) => ({ ...sanitized[i]!, id: e.id, time: e.time }));
    let bytes = encodedBytes(historyJSON([])); let first = s.entries.length;
    for (let i = s.entries.length - 1; i >= 0; i--) {
      const size = encodedBytes(JSON.stringify(s.entries[i])) + (i === s.entries.length - 1 ? 0 : 1);
      if (bytes + size > settings.maxMiB * MIB) break;
      bytes += size; first = i;
    }
    s.entries = s.entries.slice(first);
    return { settings, bytes };
  };
  return {
    append(raw: CaptureMetadata): Promise<void> {
      const metadata = validateMetadata(raw); if (!metadata) return Promise.resolve();
      return run(async () => {
        const c = await context(); const s = await load();
        if (resolveHistorySettings(c.policy, s.settings).enabled) s.entries.push({ ...metadata, id: crypto.randomUUID(), time: now() });
        trim(s, c);
        await store.save(s);
      }).catch(() => {});
    },
    read: () => run(async () => {
      const c = await context(); const s = await load(); const summary = trim(s, c); await store.save(s);
      return { ...summary, count: s.entries.length, entries: s.entries.slice(-10).reverse(), personal: s.settings,
        clearAllowed: c.policy.CaptureHistoryClearAllowed !== false,
        locked: c.policy.CaptureHistorySettingsLocked === true || c.policy.UserPreferencesSaveAllowed === false,
        managed: { enabled: c.policy.CaptureHistoryEnabled !== undefined, retentionDays: c.policy.CaptureHistoryRetentionDays !== undefined, maxMiB: c.policy.CaptureHistoryMaxMiB !== undefined } };
    }),
    export: () => run(async () => { const c = await context(); const s = await load(); trim(s, c); await store.save(s); return historyJSON(s.entries); }),
    clear: () => run(async () => {
      const c = await context();
      if (c.policy.CaptureHistoryClearAllowed === false) throw new Error('History retention is managed by your organization.');
      const s = await load(); s.entries = []; await store.save(s);
    }),
    setSettings: (raw: unknown) => {
      const settings = validateHistorySettings(raw);
      return run(async () => {
        const c = await context(); if (c.policy.CaptureHistorySettingsLocked || c.policy.UserPreferencesSaveAllowed === false) throw new Error('Capture history settings are managed.');
        const s = await load();
        // Preserve personal choices behind forced fields so policy removal restores them.
        s.settings = { enabled: c.policy.CaptureHistoryEnabled === undefined ? settings.enabled : s.settings.enabled,
          retentionDays: c.policy.CaptureHistoryRetentionDays === undefined ? settings.retentionDays : s.settings.retentionDays,
          maxMiB: c.policy.CaptureHistoryMaxMiB === undefined ? settings.maxMiB : s.settings.maxMiB };
        trim(s, c); await store.save(s);
      });
    },
  };
}
