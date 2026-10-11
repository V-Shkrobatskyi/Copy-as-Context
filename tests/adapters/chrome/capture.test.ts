import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeDebuggerClient, createChromeAccessibilityCapturer, type ChromeDebuggerClient } from '@/src/adapters/chrome/capture';

function fakeClient(options: { attachError?: string; commandError?: string; detachError?: string } = {}) {
  const calls: string[] = [];
  const client: ChromeDebuggerClient = {
    attach(_target, _version, done) { calls.push('attach'); done(options.attachError); },
    sendCommand(_target, method, done) {
      calls.push(method);
      done(method === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'root', loaderId: 'loader' } } }
        : { nodes: [{ nodeId: 'root', frameId: 'root', role: { value: 'RootWebArea' } }] }, method === 'Accessibility.getFullAXTree' ? options.commandError : undefined);
    },
    detach(_target, done) { calls.push('detach'); done(options.detachError); },
    onEvent() { return () => {}; },
    onDetach() { return () => {}; },
  };
  return { client, calls };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Chrome accessibility capture transport', () => {
  it('forwards command parameters and child sessions and removes listeners', () => {
    const onEvent = { addListener: vi.fn(), removeListener: vi.fn() };
    const onDetach = { addListener: vi.fn(), removeListener: vi.fn() };
    const sendCommand = vi.fn((_target, _method, _params, done) => done({ nodes: [] }));
    vi.stubGlobal('chrome', { runtime: { lastError: undefined }, debugger: { sendCommand, onEvent, onDetach } });
    const client = chromeDebuggerClient();
    const done = vi.fn();
    client.sendCommand({ tabId: 42, sessionId: 'child' }, 'Accessibility.getFullAXTree', done, { frameId: 'embedded' });
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 42, sessionId: 'child' }, 'Accessibility.getFullAXTree', { frameId: 'embedded' }, expect.any(Function));
    expect(done).toHaveBeenCalledWith({ nodes: [] }, undefined);
    const listener = vi.fn();
    client.onEvent(listener)(); client.onDetach(listener)();
    expect(onEvent.removeListener).toHaveBeenCalledWith(listener);
    expect(onDetach.removeListener).toHaveBeenCalledWith(listener);
  });

  it('uses one root attach/detach and releases the guard across repeated captures', async () => {
    const { client, calls } = fakeClient();
    const capture = createChromeAccessibilityCapturer(client);
    for (let i = 0; i < 30; i++) expect(await capture(42)).toEqual({ ok: true, tree: { schemaVersion: 1, root: { role: 'page', children: [] } } });
    expect(calls.filter(c => c === 'attach')).toHaveLength(30);
    expect(calls.filter(c => c === 'detach')).toHaveLength(30);
    expect(calls.at(-1)).toBe('detach');
  });

  it.each([
    ['Another debugger is already attached to the tab', 'debugger-busy'],
    ['Cannot access contents of url "chrome://version/"', 'unsupported-page'],
    ['Permission denied', 'permission-denied'],
  ])('maps attach failure without exposing protocol details: %s', async (attachError, code) => {
    const { client, calls } = fakeClient({ attachError });
    expect(await createChromeAccessibilityCapturer(client)(42)).toMatchObject({ ok: false, error: { code } });
    expect(calls).toEqual(['attach']);
  });

  it('detaches after a root AX command failure', async () => {
    const { client, calls } = fakeClient({ commandError: 'Synthetic private error' });
    const result = await createChromeAccessibilityCapturer(client)(42);
    expect(result).toMatchObject({ ok: false, error: { code: 'capture-failed' } });
    expect(JSON.stringify(result)).not.toContain('Synthetic private error');
    expect(calls.at(-1)).toBe('detach');
  });

  it('rejects concurrent capture of the same tab without another attach', async () => {
    const { client, calls } = fakeClient();
    let finishAttach: ((error?: string) => void) | undefined;
    client.attach = (_target, _version, done) => { finishAttach = done; calls.push('attach'); };
    const capture = createChromeAccessibilityCapturer(client);
    const first = capture(42);
    expect(await capture(42)).toMatchObject({ ok: false, error: { code: 'capture-failed' } });
    finishAttach!();
    expect((await first).ok).toBe(true);
    expect(calls.filter(c => c === 'attach')).toHaveLength(1);
  });
});
