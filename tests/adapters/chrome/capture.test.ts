import { describe, expect, it } from 'vitest';

import {
  createChromeAccessibilityCapturer,
  type ChromeDebuggerClient,
} from '@/src/adapters/chrome/capture';

function fakeClient(options: { attachError?: string; commandError?: string; detachError?: string } = {}) {
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
        options.commandError,
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
    expect(calls).toEqual(['attach', 'Accessibility.getFullAXTree', 'detach']);
  });

  it('detaches after a CDP command failure and maps debugger conflicts', async () => {
    const { client, calls } = fakeClient({ commandError: 'Another debugger is already attached to the tab' });
    const capture = createChromeAccessibilityCapturer(client);

    await expect(capture(42)).resolves.toMatchObject({
      ok: false,
      error: { code: 'debugger-busy' },
    });
    expect(calls).toEqual(['attach', 'Accessibility.getFullAXTree', 'detach']);
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
});
