// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { setImmediate } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { createJournal } from '@/src/diagnostics/journal';
import type { EventInput } from '@/src/diagnostics/events';
it('never retains rejected content or accepted event input in its writer queue after completion', async () => {
  const journal = createJournal({ load: async () => undefined, save: async () => {} }, async () => ({ LoggingLevel: 'debug' }));
  const refs: WeakRef<object>[] = [];
  const run = async () => {
    const tree = { root: { role: 'page', name: 'SYNTHETIC-PRIVATE-CONTENT', children: [] } };
    const unsafe = { code: 'capture-complete', result: 'error', tree };
    const safe: EventInput = { code: 'capture-complete', result: 'success', operation: crypto.randomUUID() };
    refs.push(new WeakRef(tree), new WeakRef(unsafe), new WeakRef(safe));
    await journal.append(unsafe as EventInput); await journal.append(safe);
  };
  for (let index = 0; index < 5; index++) await run();
  let retained = refs.length;
  for (let index = 0; index < 12 && retained; index++) { await setImmediate(); global.gc!(); retained = refs.filter(ref => ref.deref()).length; }
  expect(retained).toBe(0);
});
