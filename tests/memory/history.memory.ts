// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { setImmediate } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { captureMetadata } from '@/src/history/model';
import { createCaptureHistory } from '@/src/history/history';
import { DEFAULT_DATA_CONTROLS } from '@/src/core/data-controls';
it('retains only header scalars after recording, never the captured semantic tree', async () => {
  const refs: WeakRef<object>[] = [];
  const history = createCaptureHistory({ load: async () => undefined, save: async () => {} }, async () => ({ policy: { CaptureHistoryEnabled: true }, sanitize: m => m }));
  const run = async () => {
    const tree = { schemaVersion: 1 as const, title: 'Example', sourceUrl: 'https://example.test', root: { role: 'page', children: [{ role: 'StaticText', name: 'PRIVATE-CONTENT', children: [] }] } };
    refs.push(new WeakRef(tree), new WeakRef(tree.root), new WeakRef(tree.root.children));
    await history.append(captureMetadata(tree, DEFAULT_DATA_CONTROLS, false));
  };
  for (let index = 0; index < 5; index++) await run();
  let remaining = refs.length;
  for (let index = 0; index < 12 && remaining; index++) { await setImmediate(); global.gc!(); remaining = refs.filter(ref => ref.deref()).length; }
  expect(remaining).toBe(0);
});
