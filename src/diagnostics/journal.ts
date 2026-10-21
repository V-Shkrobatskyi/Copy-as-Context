// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import type { EnterprisePolicy } from '../policy/model';
import { LOG_LEVELS, eventComponent, validateEvent, type EventInput, type LogEvent, type LogLevel } from './events';
export interface JournalState { version: 1; events: LogEvent[]; level: LogLevel; debugUntil?: number }
export interface JournalStore { load(): Promise<unknown>; save(state: JournalState): Promise<void> }
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
export const DEBUG_MS = 30 * 60 * 1000;
/** One background owner serializes updates; only small, validated events enter its bounded queue. */
export function createJournal(store: JournalStore, policy: () => Promise<EnterprisePolicy>, now = Date.now) {
  let tail: Promise<unknown> = Promise.resolve();
  let queued = 0;
  let batch: { inputs: EventInput[]; work: Promise<void> } | undefined;
  const run = <T>(task: () => Promise<T>): Promise<T> => {
    if (queued >= 64) return Promise.reject(new Error('Journal busy.'));
    queued++;
    const work = tail.then(task);
    tail = work.catch(() => {}).finally(() => { queued--; });
    return work;
  };
  const load = async (): Promise<JournalState> => {
    const raw = await store.load() as Partial<JournalState> | undefined;
    const state: JournalState = { version: 1, events: [], level: raw && LOG_LEVELS.includes(raw.level!) ? raw.level! : 'error' };
    if (state.level === 'debug') {
      if (typeof raw?.debugUntil === 'number' && raw.debugUntil > now() && raw.debugUntil <= now() + DEBUG_MS) state.debugUntil = raw.debugUntil;
      else state.level = 'error';
    }
    if (Array.isArray(raw?.events) && raw.events.length <= 1000) {
      for (const event of raw.events) {
        const { version, time, level, repeats, component, ...input } = event ?? {};
        const safe = validateEvent(input);
        if (safe && version === 1 && Number.isSafeInteger(time) && time <= now() && ['error', 'info', 'debug'].includes(level) && Number.isSafeInteger(repeats) && repeats > 0) state.events.push({ ...safe, component: eventComponent(safe.code), version: 1, time, level, repeats: Math.min(repeats, 1000000) });
      }
    }
    return state;
  };
  const trim = (s: JournalState, p: EnterprisePolicy) => {
    s.events = s.events.filter(e => now() - e.time < (p.LogMaxAgeHours ?? 168) * 3600000).slice(-(p.LogMaxEvents ?? 1000));
    while (s.events.length && bytes(s.events) > (p.LogMaxBytes ?? 2097152)) s.events.shift();
  };
  return {
    append(raw: EventInput): Promise<void> {
      const input = validateEvent(raw);
      if (!input) return Promise.resolve();
      if (batch && batch.inputs.length >= 32) return Promise.resolve();
      if (!batch) {
        const inputs: EventInput[] = [];
        const work = run(async () => {
          if (batch?.inputs === inputs) batch = undefined;
          const p = await policy();
          const s = await load(); trim(s, p);
          const level = p.LoggingLevel ?? s.level;
          for (const event of inputs) {
            if (level === 'off' || level === 'error' && event.result !== 'error') continue;
            const eventLevel = event.result === 'error' ? 'error' : event.result === 'started' ? 'debug' : 'info';
            if (LOG_LEVELS.indexOf(eventLevel) > LOG_LEVELS.indexOf(level)) continue;
            const last = s.events.at(-1);
            if (last && last.code === event.code && last.result === event.result && last.reason === event.reason && now() - last.time < 60000) last.repeats = Math.min(1000000, last.repeats + 1);
            else s.events.push({ ...event, component: eventComponent(event.code), version: 1, time: now(), level: eventLevel, repeats: 1 });
          }
          trim(s, p); await store.save(s);
        }).catch(() => { if (batch?.inputs === inputs) batch = undefined; });
        batch = { inputs, work };
      }
      batch.inputs.push(input);
      return batch.work;
    },
    read: () => run(async () => {
      const p = await policy(); const s = await load(); trim(s, p); await store.save(s);
      return { ...s, clearAllowed: p.TechnicalLogClearAllowed !== false, effectiveLevel: p.LoggingLevel ?? s.level, managed: p.LoggingLevel !== undefined, bytes: bytes(s.events), limits: { events: p.LogMaxEvents ?? 1000, bytes: p.LogMaxBytes ?? 2097152, ageHours: p.LogMaxAgeHours ?? 168 } };
    }),
    clear: () => run(async () => {
      const p = await policy();
      if (p.TechnicalLogClearAllowed === false) throw new Error('Technical journal retention is managed by your organization.');
      const s = await load(); s.events = []; await store.save(s);
    }),
    setLevel: (level: LogLevel) => run(async () => {
      if (!LOG_LEVELS.includes(level)) throw new Error('Invalid log level.');
      const p = await policy();
      if (p.LoggingLevel !== undefined || p.UserPreferencesSaveAllowed === false) throw new Error('Logging preferences are managed by your organization.');
      const s = await load(); s.level = level; s.debugUntil = level === 'debug' ? now() + DEBUG_MS : undefined; await store.save(s);
    }),
  };
}
