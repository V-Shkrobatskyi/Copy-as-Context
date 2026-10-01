import { describe, expect, it } from 'vitest';

import {
  createChromeAccessibilityCapturer,
  type ChromeDebuggerClient,
} from '@/src/adapters/chrome/capture';

function fakeClient(options: { attachError?: string; commandError?: string; detachError?: string; disableError?: string; enableError?: string } = {}) {
  const calls: string[] = [];
  const client: ChromeDebuggerClient = {
    attach(_target, _version, callback) {
      calls.push('attach');
      callback(options.attachError);
    },
    sendCommand(_target, method, callback) {
      calls.push(method);
      callback(
        {
          nodes: [{ nodeId: 'root', role: { value: 'RootWebArea' } }],
        },
        method === 'Accessibility.getFullAXTree' ? options.commandError
          : method === 'Accessibility.disable' ? options.disableError
            : method === 'Accessibility.enable' ? options.enableError : undefined,
      );
    },
    detach(_target, callback) {
      calls.push('detach');
      callback(options.detachError);
    },
  };
  return { client, calls };
}

describe('Chrome accessibility capture', () => {
  it('attaches, captures one AX snapshot, and always detaches after success', async () => {
    const { client, calls } = fakeClient();
    const capture = createChromeAccessibilityCapturer(client);

    await expect(capture(42)).resolves.toEqual({
      ok: true,
      tree: { schemaVersion: 1, root: { role: 'page', children: [] } },
    });
    expect(calls).toEqual([
      'attach', 'Accessibility.enable', 'Accessibility.getFullAXTree', 'Accessibility.disable', 'detach',
    ]);
  });

  it('detaches after a CDP command failure and maps debugger conflicts', async () => {
    const { client, calls } = fakeClient({ commandError: 'Another debugger is already attached to the tab' });
    const capture = createChromeAccessibilityCapturer(client);

    await expect(capture(42)).resolves.toMatchObject({
      ok: false,
      error: { code: 'debugger-busy' },
    });
    expect(calls).toEqual([
      'attach', 'Accessibility.enable', 'Accessibility.getFullAXTree', 'Accessibility.disable', 'detach',
    ]);
  });

  it('does not detach if attaching fails', async () => {
    const { client, calls } = fakeClient({ attachError: 'Cannot attach to this target.' });
    const capture = createChromeAccessibilityCapturer(client);

    await expect(capture(42)).resolves.toMatchObject({
      ok: false,
      error: { code: 'unsupported-page' },
    });
    expect(calls).toEqual(['attach']);
  });

  it('classifies Chrome internal URLs as unsupported pages', async () => {
    const { client, calls } = fakeClient({ attachError: 'Cannot access contents of url "chrome://version/".' });
    const capture = createChromeAccessibilityCapturer(client);

    await expect(capture(42)).resolves.toMatchObject({
      ok: false,
      error: { code: 'unsupported-page' },
    });
    expect(calls).toEqual(['attach']);
  });

  it('rejects a second in-flight capture for the same tab', async () => {
    let finishAttach: ((error?: string) => void) | undefined;
    const client: ChromeDebuggerClient = {
      attach(_target, _version, callback) {
        finishAttach = callback;
      },
      sendCommand(_target, _method, callback) {
        callback({ nodes: [{ nodeId: 'root', role: { value: 'page' } }] });
      },
      detach(_target, callback) {
        callback();
      },
    };
    const capture = createChromeAccessibilityCapturer(client);
    const first = capture(42);

    await expect(capture(42)).resolves.toMatchObject({
      ok: false,
      error: { code: 'capture-failed' },
    });
    finishAttach?.();
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it('cleans up before reading the snapshot for normalization', async () => {
    const { client, calls } = fakeClient();
    const send = client.sendCommand;
    client.sendCommand = (target, method, callback) => {
      if (method !== 'Accessibility.getFullAXTree') return send(target, method, callback);
      calls.push(method);
      callback({ get nodes() {
        expect(calls.at(-1)).toBe('detach');
        return [{ nodeId: 'root', role: { value: 'RootWebArea' } }];
      } });
    };
    await expect(createChromeAccessibilityCapturer(client)(42)).resolves.toMatchObject({ ok: true });
  });

  it('reports cleanup failure instead of success and still attempts detach', async () => {
    for (const options of [{ disableError: 'Synthetic disable error' }, { detachError: 'Synthetic detach error' }]) {
      const { client, calls } = fakeClient(options);
      await expect(createChromeAccessibilityCapturer(client)(42)).resolves.toMatchObject({ ok: false, error: { code: 'capture-failed' } });
      expect(calls.at(-1)).toBe('detach');
    }
  });

  it('detaches when enable fails, and releases the guard after malformed or thrown responses', async () => {
    const failedEnable = fakeClient({ enableError: 'Synthetic enable error' });
    await expect(createChromeAccessibilityCapturer(failedEnable.client)(42)).resolves.toMatchObject({ ok: false });
    expect(failedEnable.calls).toEqual(['attach', 'Accessibility.enable', 'detach']);
    const { client, calls } = fakeClient();
    const original = client.sendCommand;
    client.sendCommand = (target, method, callback) => {
      if (method === 'Accessibility.getFullAXTree') callback({ nodes: [{ nodeId: 'root' }] });
      else original(target, method, callback);
    };
    const capture = createChromeAccessibilityCapturer(client);
    await expect(capture(42)).resolves.toMatchObject({ ok: false, error: { code: 'invalid-tree' } });
    client.sendCommand = () => { throw new Error('Synthetic command failure'); };
    await expect(capture(42)).resolves.toMatchObject({ ok: false });
    client.sendCommand = original;
    await expect(capture(42)).resolves.toMatchObject({ ok: true });
    expect(calls.filter((call) => call === 'detach')).toHaveLength(3);
  });

  it('handles repeated captures with a fresh lifecycle and no stale in-flight guard', async () => {
    const { client, calls } = fakeClient();
    const capture = createChromeAccessibilityCapturer(client);
    for (let index = 0; index < 30; index++) await expect(capture(42)).resolves.toMatchObject({ ok: true });
    expect(calls.filter((call) => call === 'attach')).toHaveLength(30);
    expect(calls.filter((call) => call === 'detach')).toHaveLength(30);
  });
});
