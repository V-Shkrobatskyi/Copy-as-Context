// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { setImmediate } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createFirefoxCapturer, type FirefoxFrameClient } from '@/src/adapters/firefox/capture-frames';
import type { FrameSnapshot } from '@/src/adapters/firefox/frame-contract';
import { prepareExport } from '@/src/core';

type Scenario = 'success' | 'partial' | 'navigation' | 'timeout';
async function survivors(refs: WeakRef<object>[]): Promise<number> {
  if (!global.gc) throw Error('Run with --expose-gc.');
  let count = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    await setImmediate(); global.gc(); count = refs.filter(ref => ref.deref()).length;
    if (!count) return 0;
  }
  return count;
}
function harness(scenario: Scenario) {
  const refs: WeakRef<object>[] = [];
  const updated = new Set<Parameters<FirefoxFrameClient['onUpdated']>[0]>();
  const removed = new Set<Parameters<FirefoxFrameClient['onRemoved']>[0]>();
  let late: (() => void) | undefined;
  let releases = 0;
  const watch = (value: object): void => { refs.push(new WeakRef(value)); };
  const snapshot = (operation: string, frameId: number): FrameSnapshot => {
    const root = { role: 'page', children: [
      ...Array.from({ length: 100 }, (_, index) => ({ role: 'StaticText', name: `Synthetic ${index}`, children: [] })),
      ...(frameId === 0 ? [{ role: 'embedded-document', value: 'Not captured: unavailable', children: [] }] : []),
    ] };
    const result: FrameSnapshot = { operation, generation: `doc-${frameId}`,
      outcome: { ok: true, tree: { schemaVersion: 1, title: 'Synthetic', ...(frameId === 0 ? { sourceUrl: 'https://example.test/' } : {}), root } },
      owners: frameId === 0 ? [{ frameId: 1, path: [100], visibility: 'visible', source: 'https://child.test/*', pending: false }] : [],
      work: { nodes: root.children.length + 1, visited: 200, nameWork: 10, characters: 2000, milliseconds: 1 },
    };
    watch(result); watch(root); watch(root.children); for (const node of root.children) watch(node);
    return result;
  };
  const client: FirefoxFrameClient = {
    async execute(details) {
      const id = details.target.frameIds[0]!;
      if ('files' in details) {
        if (scenario === 'partial' && id === 1) throw Error('Missing host permission');
        return [{ frameId: id }];
      }
      const command = details.args[0];
      if (command.mode === 'release') { releases++; return [{ frameId: id, result: true }]; }
      if (command.mode === 'capture') {
        if (scenario === 'timeout' && id === 0) return new Promise(resolve => { late = () => resolve([{ frameId: id, result: snapshot(command.operation, id) }]); });
        return [{ frameId: id, result: snapshot(command.operation, id) }];
      }
      return [{ frameId: id, result: { operation: command.operation, generation: command.generation, valid: scenario !== 'navigation', inventoryChanged: false,
        owners: id === 0 ? [{ frameId: 1, visibility: 'visible', changed: false, pending: false }] : [] } }];
    },
    async getTab() { return { url: 'https://example.test/' }; },
    onUpdated(callback) { watch(callback); updated.add(callback); return () => { updated.delete(callback); }; },
    onRemoved(callback) { watch(callback); removed.add(callback); return () => { removed.delete(callback); }; },
  };
  return { client, refs, watch, flush() { const value = late; late = undefined; value?.(); }, count: () => updated.size + removed.size, releases: () => releases };
}

describe('Firefox capture object retention', () => {
  it.each<Scenario>(['success', 'partial', 'navigation', 'timeout'])('releases snapshots, trees and listeners after %s', async scenario => {
    const fixture = harness(scenario);
    const capture = createFirefoxCapturer(fixture.client);
    const run = async (): Promise<void> => {
      const result = await capture({ id: 42, url: 'https://example.test/' }, '2026.10.11 12:00:00');
      fixture.watch(result);
      if (result.ok) {
        expect(['success', 'partial']).toContain(scenario);
        const exported = prepareExport(result.tree, 'maximum', 'semantic-text', true); fixture.watch(exported);
      } else expect(['navigation', 'timeout']).toContain(scenario);
    };
    for (let n = 0; n < 2; n++) {
      await run();
      fixture.flush(); await setImmediate();
    }
    expect(fixture.count()).toBe(0);
    expect(fixture.releases()).toBeGreaterThanOrEqual(2);
    expect(await survivors(fixture.refs)).toBe(0);
    // Keep the same coordinator/client alive during collection, without call-history retention.
    expect(typeof capture).toBe('function');
  });
});
