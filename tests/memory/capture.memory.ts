// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { setImmediate } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import type { ChromeDebuggerClient } from '@/src/adapters/chrome/capture';
import { createFrameCapturer } from '@/src/adapters/chrome/capture-frames';
import type { ChromeAxTreeResponse } from '@/src/adapters/chrome/types';
import { prepareExport } from '@/src/core';

type Reference = { label: string; ref: WeakRef<object> };
type Scenario = 'success' | 'partial' | 'navigation' | 'cleanup-error' | 'timeout';

async function survivors(references: Reference[]): Promise<string[]> {
  if (!global.gc) throw new Error('Run memory tests with npm run test:memory (--expose-gc).');
  let remaining: string[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    // WeakRef construction/deref keeps targets alive until the current JS job ends.
    await setImmediate();
    global.gc();
    remaining = references.filter(({ ref }) => ref.deref() !== undefined).map(({ label }) => label);
    if (!remaining.length) return [];
  }
  return remaining;
}

function harness(scenario: Scenario) {
  const references: Reference[] = [];
  const watch = (label: string, value: object) => references.push({ label, ref: new WeakRef(value) });
  const events = new Set<Parameters<ChromeDebuggerClient['onEvent']>[0]>();
  const detaches = new Set<Parameters<ChromeDebuggerClient['onDetach']>[0]>();
  let inventories = 0;
  let attachments = 0;
  let detachments = 0;
  let late: (() => void) | undefined;
  const response = (frameId: string): ChromeAxTreeResponse => {
    const raw: ChromeAxTreeResponse = { nodes: [
      { nodeId: 'root', frameId, role: { value: 'RootWebArea' }, name: { value: `${frameId} page` },
        childIds: [...Array.from({ length: 200 }, (_, i) => String(i)), ...(frameId === 'root' ? ['owner'] : [])] },
      ...Array.from({ length: 200 }, (_, i) => ({ nodeId: String(i), role: { value: 'StaticText' }, name: { value: `Sample ${frameId} ${i}` } })),
      ...(frameId === 'root' ? [{ nodeId: 'owner', backendDOMNodeId: 10, role: { value: 'Iframe' } }] : []),
    ] };
    watch(`${frameId} raw response`, raw);
    watch(`${frameId} raw nodes`, raw.nodes);
    for (const node of raw.nodes) watch(`${frameId} raw node ${node.nodeId}`, node);
    return raw;
  };
  // Do not use vi.fn: its call history would retain callback arguments and snapshots.
  const client: ChromeDebuggerClient = {
    attach(_target, _version, done) { inventories = 0; attachments++; done(); },
    detach(_target, done) { detachments++; done(); },
    onEvent(listener) {
      watch('event listener', listener); events.add(listener);
      return () => { events.delete(listener); };
    },
    onDetach(listener) {
      watch('detach listener', listener); detaches.add(listener);
      return () => { detaches.delete(listener); };
    },
    sendCommand(target, method, done, params) {
      if (method === 'Target.setAutoAttach' && params?.autoAttach && !target.sessionId) {
        for (const event of events) event({ tabId: target.tabId }, 'Target.attachedToTarget', {
          sessionId: 'child-session', targetInfo: { type: 'iframe' },
        });
      }
      if (method === 'Page.getFrameTree') {
        if (!target.sessionId) inventories++;
        if (scenario === 'timeout' && !target.sessionId && inventories === 2) {
          watch('late command callback', done);
          late = () => { done({}); };
          return;
        }
        const id = target.sessionId ? 'child' : 'root';
        done({ frameTree: { frame: { id, loaderId: scenario === 'navigation' && inventories === 2 ? 'changed' : 'loader',
          ...(target.sessionId ? { parentId: 'root' } : {}) } } });
        return;
      }
      if (method === 'Accessibility.getFullAXTree') {
        const raw = response(params?.frameId as string);
        if (scenario === 'partial' && target.sessionId) raw.nodes[0]!.childIds = ['root'];
        done(raw); return;
      }
      if (method === 'DOM.getFrameOwner') { done({ backendNodeId: 10 }); return; }
      if (method === 'DOM.resolveNode') { done({ object: { objectId: 'owner' } }); return; }
      if (method === 'Runtime.callFunctionOn') { done({ result: { value: 'visible' } }); return; }
      done({}, scenario === 'cleanup-error' && method === 'Accessibility.disable' ? 'Disable failed' : undefined);
    },
  };
  return {
    client, references, watch,
    listenerCount: () => events.size + detaches.size,
    counts: () => ({ attachments, detachments }),
    flushLate: () => { const callback = late; late = undefined; callback?.(); },
  };
}

describe('post-capture object retention', () => {
  it('detects an intentionally retained object and its subsequent release', async () => {
    const holder: { value?: object } = { value: {} };
    const references = [{ label: 'control', ref: new WeakRef(holder.value!) }];
    expect(await survivors(references)).toEqual(['control']);
    delete holder.value;
    expect(await survivors(references)).toEqual([]);
  });

  it.each<Scenario>(['success', 'partial', 'navigation', 'cleanup-error', 'timeout'])(
    'releases snapshots, results and listeners after %s while the capturer remains live', async (scenario) => {
      const h = harness(scenario);
      const capture = createFrameCapturer(h.client);
      const repeats = scenario === 'timeout' ? 1 : 10;
      const run = async () => {
        const result = await capture(42);
        h.watch('capture result', result);
        expect(result.ok).toBe(scenario === 'success' || scenario === 'partial');
        if (!result.ok) {
          expect(result.error.code).toBe(scenario === 'navigation' ? 'page-changed' : scenario === 'timeout' ? 'capture-timeout' : 'capture-failed');
          return;
        }
        expect(Boolean(result.warnings?.includes('embedded-frames-partial'))).toBe(scenario === 'partial');
        h.watch('semantic tree', result.tree);
        const stack = [result.tree.root];
        while (stack.length) {
          const node = stack.pop()!;
          h.watch('semantic node', node); h.watch('semantic children', node.children);
          stack.push(...node.children);
        }
        for (const format of ['semantic-text', 'markdown'] as const) {
          const output = prepareExport(result.tree, 'compact', format);
          expect(output.characterCount).toBeGreaterThan(100);
          h.watch('prepared export', output); h.watch('serialized export', output.serialized);
        }
      };
      for (let i = 0; i < repeats; i++) {
        await run();
        expect(h.listenerCount()).toBe(0);
        // A browser may deliver a command callback after our deadline. Release that
        // callback before checking collection; until delivery its ownership is external.
        h.flushLate();
        expect(await survivors(h.references)).toEqual([]);
        h.references.length = 0;
      }
      // Keep the factory and client alive through GC, and verify same-tab reuse.
      await run();
      h.flushLate();
      expect(await survivors(h.references)).toEqual([]);
      expect(h.listenerCount()).toBe(0);
      expect(h.counts()).toEqual({ attachments: repeats + 1, detachments: repeats + 1 });
      expect(typeof capture).toBe('function');
    },
  );
});
