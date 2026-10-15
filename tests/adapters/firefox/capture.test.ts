// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFirefoxCapturer, type FrameInjection } from '@/src/adapters/firefox/capture-frames';
import type { FrameSnapshot } from '@/src/adapters/firefox/frame-contract';
import type { SemanticNode } from '@/src/core';

const node = (name: string): SemanticNode => ({ role: 'StaticText', name, children: [] });
const owner = (name: string): SemanticNode => ({ role: 'embedded-document', name, value: 'Not captured: unavailable', children: [] });
export function snapshot(operation: string, id: number, owners: number[] = []): FrameSnapshot {
  return { operation, generation: `document-${id}`, outcome: { ok: true, tree: { schemaVersion: 1, title: `Document ${id}`,
    ...(id === 0 ? { sourceUrl: 'https://example.test/' } : {}), root: { role: 'page', children: [node(`Content ${id}`), ...owners.map(child => owner(`Frame ${child}`)), node(`Tail ${id}`)] } } },
    owners: owners.map((frameId, index) => ({ frameId, path: [index + 1], visibility: 'visible', source: 'https://child.test/*', pending: false })),
    work: { nodes: 3 + owners.length, visited: 5, nameWork: 1, characters: 100, milliseconds: 1 } };
}
function setup(frames = new Map([[0, [1]], [1, [2]], [2, []]]), crossOrigin = true) {
  const updated = new Set<(id: number, info: { status?: string; url?: string }) => void>();
  const removed = new Set<(id: number) => void>();
  const execute = vi.fn(async (details: FrameInjection): Promise<{ frameId: number; result?: unknown }[]> => {
    const id = details.target.frameIds[0]!;
    if ('files' in details) return [{ frameId: id }];
    const command = details.args[0];
    if (command.mode === 'capture') return [{ frameId: id, result: snapshot(command.operation, id, frames.get(id)) }];
    if (command.mode === 'release') return [{ frameId: id, result: true }];
    return [{ frameId: id, result: { operation: command.operation, generation: command.generation, valid: true, inventoryChanged: false,
      owners: (frames.get(id) ?? []).map(frameId => ({ frameId, visibility: 'visible', changed: false, pending: false })) } }];
  });
  const getTab = vi.fn(async () => ({ url: 'https://example.test/' }));
  const capture = createFirefoxCapturer({ execute, getTab, allowCrossOrigin: async () => crossOrigin,
    onUpdated(callback) { updated.add(callback); return () => updated.delete(callback); },
    onRemoved(callback) { removed.add(callback); return () => removed.delete(callback); },
  });
  return { execute, getTab, updated, removed, run: () => capture({ id: 42, url: 'https://example.test/' }, '2026.10.11 12:00:00') };
}
afterEach(() => { vi.useRealTimers(); });

describe('Firefox iframe coordinator', () => {
  it('passes an origin restriction to every child when broad site access is absent', async () => {
    const fixture = setup(undefined, false);
    expect((await fixture.run()).ok).toBe(true);
    const commands = fixture.execute.mock.calls.flatMap(([details]) => 'args' in details && details.args[0].mode === 'capture' ? [details.args[0]] : []);
    expect(commands[0]?.allowedOrigin).toBeUndefined();
    expect(commands.slice(1).map(command => command.allowedOrigin)).toEqual(['https://example.test', 'https://example.test']);
  });

  it('merges nested documents in owner positions, applies one decreasing budget and releases every lease', async () => {
    const fixture = setup();
    const result = await fixture.run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tree.root.children.map(n => n.name)).toEqual(['Content 0', 'Frame 1', 'Tail 0']);
    expect(result.tree.root.children[1]?.children[0]?.children[1]?.children[0]?.name).toBe('Document 2');
    expect(result.warnings).toBeUndefined();
    expect(result.tree.capturedAt).toBe('2026.10.11 12:00:00');
    expect(JSON.stringify(result)).not.toContain('document-');
    const calls = fixture.execute.mock.calls.map(([details]) => details);
    expect(calls.every(details => !('allFrames' in details.target))).toBe(true);
    const budgets = calls.filter(details => 'args' in details && details.args[0].mode === 'capture');
    expect(budgets.map(details => 'args' in details && details.args[0].mode === 'capture' ? details.args[0].limits.maxNodes : 0)).toEqual([20000, 19996, 19992]);
    expect(calls.filter(details => 'args' in details && details.args[0].mode === 'release')).toHaveLength(3);
    expect(fixture.updated.size + fixture.removed.size).toBe(0);
  });
  it('keeps main content and offers a query-free host candidate when a child lacks permission', async () => {
    const fixture = setup(); const execute = fixture.execute.getMockImplementation()!;
    fixture.execute.mockImplementation(details => details.target.frameIds[0] === 1 && 'files' in details
      ? Promise.reject(Error('Missing host permission: private-detail')) : execute(details));
    const result = await fixture.run();
    expect(result).toMatchObject({ ok: true, warnings: ['embedded-frames-partial'], frameAccess: ['https://child.test/*'] });
    expect(JSON.stringify(result)).not.toContain('private-detail');
    if (result.ok) expect(result.tree.root.children[1]).toMatchObject({ value: 'Not captured: unavailable', children: [] });
  });
  it.each(['unknown', 'pending', 'limit'])('does not inject child content for %s owners', async reason => {
    const fixture = setup(); const execute = fixture.execute.getMockImplementation()!;
    fixture.execute.mockImplementation(async details => {
      const result = await execute(details);
      if ('args' in details && details.args[0].mode === 'capture' && details.target.frameIds[0] === 0) {
        const value = result[0]!.result as FrameSnapshot;
        if (reason === 'unknown') value.owners[0]!.visibility = 'unknown';
        if (reason === 'pending') value.owners[0]!.pending = true;
        if (reason === 'limit') value.work.visited = 99999;
      }
      return result;
    });
    const result = await fixture.run();
    expect(result).toMatchObject({ ok: true, warnings: ['embedded-frames-partial'] });
    expect(fixture.execute.mock.calls.filter(([details]) => 'files' in details && details.target.frameIds[0] !== 0)).toHaveLength(0);
  });
  it('drops stale children after navigation and removes owners that become hidden', async () => {
    const fixture = setup(new Map([[0, [1, 2]], [1, []], [2, []]])); const execute = fixture.execute.getMockImplementation()!;
    let rootVerifications = 0;
    fixture.execute.mockImplementation(async details => {
      const response = await execute(details);
      if ('args' in details && details.args[0].mode === 'verify' && details.target.frameIds[0] === 0 && ++rootVerifications === 3) {
        const verification = response[0]!.result as { owners: { changed: boolean; visibility: string }[] };
        verification.owners[0]!.changed = true; verification.owners[1]!.visibility = 'hidden';
      }
      return response;
    });
    const result = await fixture.run();
    if (!result.ok) throw Error(JSON.stringify(result));
    expect(result.tree.root.children.map(n => n.name)).toEqual(['Content 0', 'Frame 1', 'Tail 0']);
    expect(result.tree.root.children[1]).toMatchObject({ value: 'Not captured: document changed', children: [] });
    expect(JSON.stringify(result)).not.toContain('Content 1');
  });
  it.each(['wrong-frame', 'duplicate-owner', 'bad-path', 'wrong-operation'])('rejects malformed producer data: %s', async reason => {
    const fixture = setup(); const execute = fixture.execute.getMockImplementation()!;
    fixture.execute.mockImplementation(async details => {
      const response = await execute(details);
      if ('args' in details && details.args[0].mode === 'capture') {
        const value = response[0]!.result as FrameSnapshot;
        if (reason === 'wrong-frame') response[0]!.frameId = 500;
        if (reason === 'duplicate-owner') value.owners.push(value.owners[0]!);
        if (reason === 'bad-path') value.owners[0]!.path = [999];
        if (reason === 'wrong-operation') value.operation = 'old-operation';
      }
      return response;
    });
    expect(await fixture.run()).toMatchObject({ ok: false, error: { code: 'invalid-tree' } });
    expect(fixture.updated.size).toBe(0);
  });
  it('rejects same-URL main reload and permits a fresh capture afterwards', async () => {
    const fixture = setup(); const execute = fixture.execute.getMockImplementation()!;
    fixture.execute.mockImplementationOnce(async details => {
      for (const listener of fixture.updated) listener(42, { status: 'loading' });
      return execute(details);
    });
    expect(await fixture.run()).toMatchObject({ ok: false, error: { code: 'page-changed' } });
    expect((await fixture.run()).ok).toBe(true);
  });
  it('times out, blocks overlap, cleans up late capture by token, and recovers', async () => {
    vi.useFakeTimers();
    const fixture = setup(); const execute = fixture.execute.getMockImplementation()!;
    let finish!: (value: { frameId: number; result?: unknown }[]) => void;
    let operation = '';
    fixture.execute.mockImplementation(details => {
      if ('args' in details && details.args[0].mode === 'capture' && !operation) {
        operation = details.args[0].operation;
        return new Promise(resolve => { finish = resolve; });
      }
      return execute(details);
    });
    const pending = fixture.run(); await vi.advanceTimersByTimeAsync(0);
    expect(await fixture.run()).toMatchObject({ ok: false, error: { code: 'capture-failed' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'capture-timeout' } });
    expect((await fixture.run()).ok).toBe(true);
    finish([{ frameId: 0, result: snapshot(operation, 0) }]); await vi.advanceTimersByTimeAsync(0);
    expect(fixture.execute.mock.calls.filter(([details]) => 'args' in details && details.args[0].mode === 'release' && details.args[0].operation === operation)).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
