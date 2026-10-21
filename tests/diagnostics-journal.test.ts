// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { createJournal, DEBUG_MS, type JournalState } from '@/src/diagnostics/journal';
import { validateEvent } from '@/src/diagnostics/events';
import type { EnterprisePolicy } from '@/src/policy/model';
function fixture(policy: EnterprisePolicy = {}) {
  let state: JournalState | undefined; let time = 10000000;
  const store = { load: async () => structuredClone(state), save: async (s: JournalState) => { state = structuredClone(s); } };
  return { journal: createJournal(store, async () => policy, () => time), store, advance: (ms: number) => { time += ms; }, policy };
}
describe('private bounded technical journal', () => {
  it('rejects unknown fields, content, raw errors and unsafe identifiers at every level', () => {
    for (const extra of [{ url: 'https://private.test' }, { text: 'SECRET' }, { error: new Error('SECRET') }, { reason: 'SECRET' }, { operation: 'private-tab-id' }, { durationMs: Infinity }]) expect(validateEvent({ code: 'capture-complete', result: 'error', ...extra })).toBeUndefined();
  });
  it('defaults to errors, obeys off and aggregates a burst of identical errors', async () => {
    const f = fixture();
    await f.journal.append({ code: 'capture-complete', result: 'success' });
    await Promise.all(Array.from({ length: 20 }, () => f.journal.append({ code: 'capture-complete', result: 'error', reason: 'failed' })));
    const r = await f.journal.read(); expect(r.events).toHaveLength(1); expect(r.events[0]!.repeats).toBe(20);
    await f.journal.setLevel('off'); await f.journal.append({ code: 'policy-check', result: 'error' }); expect((await f.journal.read()).events).toHaveLength(1);
  });
  it('expires personal debug across restart and prunes old entries on read', async () => {
    const f = fixture({ LogMaxAgeHours: 1, TechnicalLogClearAllowed: false }); await f.journal.setLevel('debug');
    await f.journal.append({ code: 'capture-start', result: 'started' }); expect((await f.journal.read()).events).toHaveLength(1);
    f.advance(DEBUG_MS + 1); expect((await f.journal.read()).effectiveLevel).toBe('error');
    const restarted = createJournal(f.store, async () => f.policy, () => 10000000 + DEBUG_MS + 1); expect((await restarted.read()).effectiveLevel).toBe('error');
    f.advance(3600000); expect((await f.journal.read()).events).toHaveLength(0);
  });
  it('bounds count and bytes, serializes clear, and never restores cleared records', async () => {
    const f = fixture({ LoggingLevel: 'info', LogMaxEvents: 2, LogMaxBytes: 350 });
    for (const code of ['capture-complete', 'clipboard-complete', 'download-complete'] as const) await f.journal.append({ code, result: 'success' });
    const r = await f.journal.read(); expect(r.events.length).toBeLessThanOrEqual(2); expect(r.bytes).toBeLessThanOrEqual(350);
    await Promise.all([f.journal.append({ code: 'policy-check', result: 'error' }), f.journal.clear()]); expect((await f.journal.read()).events).toEqual([]);
    await expect(f.journal.setLevel('debug')).rejects.toThrow('managed');
  });
  it('contains storage failures and unbounded bursts without rejecting append', async () => {
    const broken = createJournal({ load: async () => { throw new Error('SECRET'); }, save: async () => { throw new Error(); } }, async () => ({}));
    await expect(Promise.all(Array.from({ length: 100 }, () => broken.append({ code: 'capture-complete', result: 'error' })))).resolves.toBeDefined();
  });
});
