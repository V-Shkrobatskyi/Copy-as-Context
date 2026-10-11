import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeDebuggerClient } from '@/src/adapters/chrome/capture';
import { createFrameCapturer } from '@/src/adapters/chrome/capture-frames';
import type { ChromeAxTreeResponse } from '@/src/adapters/chrome/types';
import { CHROME_CAPTURE_LIMITS } from '@/src/adapters/chrome/limits';
import { compressSemanticTree, prepareExport } from '@/src/core';

type Event = Parameters<NonNullable<ChromeDebuggerClient['onEvent']>>[0];
function harness(options: {
  hidden?: boolean; technical?: boolean; unknown?: boolean; missingOwner?: boolean; changed?: 'root' | 'child';
  childError?: boolean; nested?: boolean; invalidChild?: boolean; enableError?: boolean; cleanupError?: boolean;
  rootResponse?: unknown; password?: boolean; noFrames?: boolean;
} = {}) {
  const calls: { method: string; session?: string; params?: Record<string, unknown> }[] = [];
  let event: Event | undefined;
  let detachEvent: Parameters<NonNullable<ChromeDebuggerClient['onDetach']>>[0] | undefined;
  let inventories = 0;
  const response = (frameId: string): ChromeAxTreeResponse => ({ nodes: [
    { nodeId: 'root', frameId, role: { value: 'RootWebArea' }, name: { value: frameId === 'root' ? 'Shared label' : 'Child title' }, childIds: ['text', ...(frameId === 'root' && !options.noFrames || frameId === 'child' && options.nested ? ['owner'] : []), ...(options.password && frameId === 'child' ? ['password'] : [])] },
    { nodeId: 'text', role: { value: 'StaticText' }, name: { value: frameId === 'root' ? 'Parent text' : 'Shared label' } },
    ...(frameId === 'root' && !options.noFrames || frameId === 'child' && options.nested ? [{ nodeId: 'owner', backendDOMNodeId: 10, role: { value: 'Iframe' }, name: { value: 'Widget' }, childIds: [] }] : []),
    ...(options.password && frameId === 'child' ? [
      { nodeId: 'password', backendDOMNodeId: 20, role: { value: 'textbox' }, name: { value: 'Unlabelled' }, value: { value: 'private-password' }, childIds: ['password-text'] },
      { nodeId: 'password-text', role: { value: 'StaticText' }, name: { value: 'private-password' } },
    ] : []),
  ] });
  const client: ChromeDebuggerClient = {
    attach(_target, _version, callback) { calls.push({ method: 'attach' }); callback(); },
    detach(_target, callback) { calls.push({ method: 'detach' }); callback(); },
    onEvent(listener) { event = listener; return () => { event = undefined; }; },
    onDetach(listener) { detachEvent = listener; return () => { detachEvent = undefined; }; },
    sendCommand(target, method, callback, params) {
      calls.push({ method, session: target.sessionId, params });
      if (method === 'Target.setAutoAttach' && params?.autoAttach) {
        if (!target.sessionId && !options.noFrames) event?.({ tabId: target.tabId }, 'Target.attachedToTarget', { sessionId: 'child-session', targetInfo: { type: 'iframe' } });
        if (target.sessionId === 'child-session' && options.nested) event?.({ tabId: target.tabId, sessionId: target.sessionId }, 'Target.attachedToTarget', { sessionId: 'nested-session', targetInfo: { type: 'iframe' } });
      }
      if (method === 'Page.getFrameTree') {
        if (!target.sessionId) inventories++;
        const id = target.sessionId === 'nested-session' ? 'nested' : target.sessionId ? 'child' : 'root';
        if (inventories === 2 && options.changed) event?.({ tabId: target.tabId, sessionId: target.sessionId }, 'Page.frameNavigated', { frame: { id: options.changed } });
        callback({ frameTree: { frame: { id, loaderId: 'loader', ...(id !== 'root' ? { parentId: id === 'child' ? 'root' : 'child' } : {}) } } }); return;
      }
      if (method === 'Accessibility.getFullAXTree') {
        if (target.sessionId && options.childError) { callback(undefined, 'Frame removed'); return; }
        const id = params?.frameId as string;
        callback(!target.sessionId && options.rootResponse !== undefined ? options.rootResponse : target.sessionId && options.invalidChild ? { nodes: [] } : response(id)); return;
      }
      if (method === 'DOM.getFrameOwner') { callback(options.missingOwner ? {} : { backendNodeId: 10 }); return; }
      if (method === 'DOM.resolveNode') { callback({ object: { objectId: params?.backendNodeId === 20 ? 'password' : 'owner' } }); return; }
      if (method === 'Runtime.callFunctionOn') {
        callback({ result: { value: params?.objectId === 'password' ? true : options.hidden ? 'hidden' : options.technical ? 'technical' : options.unknown ? undefined : 'visible' } }); return;
      }
      callback({}, options.enableError && method === 'Accessibility.enable' ? 'Cannot access this page' : options.cleanupError && method === 'Accessibility.disable' ? 'Disable failed' : undefined);
    },
  };
  return { client, calls, listeners: () => [event, detachEvent], emit: (method: string, params: unknown) => event?.({ tabId: 42 }, method, params) };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Chrome embedded document coordinator', () => {
  it('merges OOPIF and nested sessions at their owners without leaking IDs', async () => {
    const h = harness({ nested: true });
    const result = await createFrameCapturer(h.client)(42);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const owner = result.tree.root.children[1]!;
    expect(owner).toMatchObject({ role: 'embedded-document', value: 'Captured', children: [{ role: 'page', children: [
      { role: 'StaticText', name: 'Shared label' }, { role: 'embedded-document', value: 'Captured', children: [{ role: 'page' }] },
    ] }] });
    expect(JSON.stringify(result)).not.toContain('child-session');
    expect(JSON.stringify(result)).not.toContain('backendDOMNodeId');
    expect(result.warnings).toBeUndefined();
    expect(h.calls.filter(c => c.method === 'attach')).toHaveLength(1);
    expect(h.calls.filter(c => c.method === 'detach')).toHaveLength(1);
    expect(h.listeners()).toEqual([undefined, undefined]);
    const compact = compressSemanticTree(result.tree, 'compact');
    const repeated: string[] = [];
    const collect = (node: typeof compact.root) => {
      if (node.role === 'StaticText' && node.name === 'Shared label') repeated.push(node.name);
      node.children.forEach(collect);
    };
    collect(compact.root);
    expect(repeated).toHaveLength(2);
    for (const level of ['without', 'detailed', 'compact', 'maximum'] as const) {
      for (const format of ['semantic-text', 'markdown'] as const) {
        const text = prepareExport(result.tree, level, format).serialized.content;
        expect(text.replaceAll('\\-', '-')).toContain('embedded-document');
        expect(text).toContain('Shared label');
      }
    }
  });

  it.each([{ hidden: true }, { technical: true }])('does not read the child AX tree for filtered owners: %j', async (options) => {
    const h = harness(options);
    const result = await createFrameCapturer(h.client)(42);
    expect(result.ok).toBe(true);
    expect(h.calls.filter(c => c.method === 'Accessibility.getFullAXTree')).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('Child title');
    if (result.ok) expect(result.warnings).toBeUndefined();
  });

  it.each([{ unknown: true }, { missingOwner: true }, { childError: true }, { invalidChild: true }])('preserves the root with a partial warning: %j', async (options) => {
    const h = harness(options);
    const result = await createFrameCapturer(h.client)(42);
    expect(result).toMatchObject({ ok: true, warnings: ['embedded-frames-partial'] });
    if (result.ok) expect(result.tree.root.children[0]?.name).toBe('Parent text');
    expect(JSON.stringify(result)).not.toContain('Child title');
    expect(h.calls.at(-1)?.method).toBe('detach');
  });

  it('drops changed child generations including nested results', async () => {
    const result = await createFrameCapturer(harness({ nested: true, changed: 'child' }).client)(42);
    expect(result).toMatchObject({ ok: true, warnings: ['embedded-frames-partial'] });
    expect(JSON.stringify(result)).not.toContain('Child title');
    expect(JSON.stringify(result)).toContain('Not captured: document changed');
  });

  it('rejects a changed root even when its URL would be unchanged', async () => {
    expect(await createFrameCapturer(harness({ changed: 'root' }).client)(42)).toMatchObject({ ok: false, error: { code: 'page-changed' } });
  });

  it('captures distinct same-process documents even when AX IDs repeat', async () => {
    const h = harness({ noFrames: true });
    const original = h.client.sendCommand;
    h.client.sendCommand = (target, method, done, params) => {
      if (method === 'Page.getFrameTree') {
        done({ frameTree: { frame: { id: 'root', loaderId: 'root-loader' }, childFrames: ['first', 'second'].map(id => ({ frame: { id, parentId: 'root', loaderId: id } })) } });
      } else if (method === 'Accessibility.getFullAXTree') {
        const id = params?.frameId;
        done({ nodes: id === 'root' ? [
          { nodeId: '1', frameId: 'root', role: { value: 'RootWebArea' }, childIds: ['a', 'b'] },
          { nodeId: 'a', backendDOMNodeId: 10, role: { value: 'Iframe' } },
          { nodeId: 'b', backendDOMNodeId: 11, role: { value: 'Iframe' } },
        ] : [
          { nodeId: '1', frameId: id, role: { value: 'RootWebArea' }, childIds: ['a'] },
          { nodeId: 'a', role: { value: 'StaticText' }, name: { value: `State of ${id}` } },
        ] });
      } else if (method === 'DOM.getFrameOwner') done({ backendNodeId: params?.frameId === 'first' ? 10 : 11 });
      else original(target, method, done, params);
    };
    const result = await createFrameCapturer(h.client)(42);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toBeUndefined();
    expect(result.tree.root.children.map(owner => owner.children[0]?.children[0]?.name)).toEqual(['State of first', 'State of second']);
  });

  it('does not label a lazy about:blank document as a fully captured source', async () => {
    const h = harness();
    const original = h.client.sendCommand;
    h.client.sendCommand = (target, method, done, params) => {
      if (method === 'Runtime.callFunctionOn' && String(params?.functionDeclaration).includes('getAttribute')) {
        done({ result: { value: true } }); return;
      }
      original(target, method, (data, error) => {
        if (method === 'Page.getFrameTree' && target.sessionId) {
          Object.assign((data as { frameTree: { frame: unknown } }).frameTree.frame as object, { url: 'about:blank' });
        }
        done(data, error);
      }, params);
    };
    const result = await createFrameCapturer(h.client)(42);
    expect(result).toMatchObject({ ok: true, warnings: ['embedded-frames-partial'] });
    expect(JSON.stringify(result)).toContain('Not captured: not loaded');
    expect(h.calls.filter(call => call.method === 'Accessibility.getFullAXTree')).toHaveLength(1);
  });

  it('detects loader changes without relying on navigation event delivery', async () => {
    const h = harness();
    const original = h.client.sendCommand;
    let rootInventories = 0;
    h.client.sendCommand = (target, method, done, params) => {
      if (method === 'Page.getFrameTree' && !target.sessionId) rootInventories++;
      original(target, method, (data, error) => {
        if (method === 'Page.getFrameTree' && target.sessionId && rootInventories > 1) {
          (data as { frameTree: { frame: { loaderId: string } } }).frameTree.frame.loaderId = 'new-loader';
        }
        done(data, error);
      }, params);
    };
    expect(await createFrameCapturer(h.client)(42)).toMatchObject({ ok: true, warnings: ['embedded-frames-partial'] });
  });

  it('handles a root debugger detach without another detach attempt', async () => {
    const h = harness({ noFrames: true });
    const original = h.client.sendCommand;
    let detached!: Parameters<ChromeDebuggerClient['onDetach']>[0];
    h.client.onDetach = listener => { detached = listener; return () => {}; };
    h.client.sendCommand = (target, method, done, params) => {
      original(target, method, done, params);
      if (method === 'Accessibility.getFullAXTree') detached({ tabId: 42 }, 'canceled_by_user');
    };
    expect(await createFrameCapturer(h.client)(42)).toMatchObject({ ok: false, error: { code: 'page-changed' } });
    expect(h.calls.filter(c => c.method === 'detach')).toHaveLength(0);
  });

  it('omits password values and repeated text even with redaction disabled', async () => {
    const result = await createFrameCapturer(harness({ password: true }).client)(42);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const format of ['semantic-text', 'markdown'] as const) expect(prepareExport(result.tree, 'without', format, false).serialized.content).not.toContain('private-password');
  });

  it.each([{ enableError: true }, { cleanupError: true }, { rootResponse: { nodes: [] } }])('cleans up unsuccessful operations: %j', async (options) => {
    const h = harness(options);
    expect((await createFrameCapturer(h.client)(42)).ok).toBe(false);
    expect(h.calls.at(-1)?.method).toBe('detach');
    expect(h.listeners()).toEqual([undefined, undefined]);
  });

  it('rejects oversized and cyclic root snapshots before recursive normalization', async () => {
    for (const nodes of [
      Array.from({ length: CHROME_CAPTURE_LIMITS.nodes + 1 }, (_, i) => ({ nodeId: String(i) })),
      [{ nodeId: 'root', frameId: 'root', role: { value: 'RootWebArea' }, childIds: ['root'] }],
    ]) expect((await createFrameCapturer(harness({ noFrames: true, rootResponse: { nodes } }).client)(42)).ok).toBe(false);
  });

  it('keeps the main document when a child exhausts the shared node budget', async () => {
    const h = harness();
    const original = h.client.sendCommand;
    h.client.sendCommand = (target, method, done, params) => {
      if (target.sessionId && method === 'Accessibility.getFullAXTree') {
        done({ nodes: Array.from({ length: CHROME_CAPTURE_LIMITS.nodes }, (_, i) => ({ nodeId: String(i) })) });
      } else original(target, method, done, params);
    };
    const result = await createFrameCapturer(h.client)(42);
    expect(result).toMatchObject({ ok: true, warnings: ['embedded-frames-partial'] });
    expect(JSON.stringify(result)).toContain('Parent text');
    expect(JSON.stringify(result)).toContain('Not captured: limit exceeded');
  });

  it('finishes the debugger lifecycle before returning the semantic tree', async () => {
    const h = harness({ noFrames: true });
    const original = h.client.sendCommand;
    h.client.sendCommand = (target, method, done, params) => {
      if (method !== 'Accessibility.getFullAXTree') return original(target, method, done, params);
      done({ nodes: [{ nodeId: 'root', frameId: 'root', role: { value: 'RootWebArea' }, name: { value: 'Synthetic' } }] });
    };
    const result = await createFrameCapturer(h.client)(42);
    expect(result.ok).toBe(true);
    expect(h.calls.at(-1)?.method).toBe('detach');
  });

  it('keeps a timed-out attach guarded until a late success has been detached', async () => {
    vi.useFakeTimers();
    const h = harness({ noFrames: true });
    let attach: ((error?: string) => void) | undefined;
    h.client.attach = (_target, _version, done) => { attach = done; };
    const capture = createFrameCapturer(h.client);
    const pending = capture(42);
    await vi.advanceTimersByTimeAsync(CHROME_CAPTURE_LIMITS.commandMs + 1);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'capture-timeout' } });
    expect(await capture(42)).toMatchObject({ ok: false, error: { code: 'capture-failed' } });
    attach!();
    expect(h.calls.at(-1)?.method).toBe('detach');
  });

  it('does not let a missing command callback retain the debugger indefinitely', async () => {
    vi.useFakeTimers();
    const h = harness({ noFrames: true });
    const original = h.client.sendCommand;
    h.client.sendCommand = (target, method, done, params) => { if (method !== 'Accessibility.getFullAXTree') original(target, method, done, params); };
    const pending = createFrameCapturer(h.client)(42);
    await vi.advanceTimersByTimeAsync(CHROME_CAPTURE_LIMITS.captureMs + CHROME_CAPTURE_LIMITS.cleanupMs);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'capture-timeout' } });
    expect(h.calls.at(-1)?.method).toBe('detach');
    expect(h.listeners()).toEqual([undefined, undefined]);
  });
});
