import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(['complete', 'interrupted'] as const)('keeps the Firefox save document alive until the download is %s', async state => {
  vi.useFakeTimers();
  vi.resetModules();
  let receive: (message: unknown, sender: unknown, respond: (value: unknown) => void) => void;
  let changed: (delta: unknown) => void;
  const status = { textContent: '' };
  const removeTab = vi.fn().mockResolvedValue(undefined);
  const updateTab = vi.fn().mockResolvedValue(undefined);
  const download = vi.fn().mockResolvedValue(9);
  const removeListener = vi.fn();
  const createUrl = vi.fn().mockReturnValue('blob:save-document');
  const revokeUrl = vi.fn();
  class SaveURL extends URL {
    static override createObjectURL = createUrl;
    static override revokeObjectURL = revokeUrl;
  }
  vi.stubGlobal('URL', SaveURL);
  vi.stubGlobal('location', { hash: '#synthetic-token' });
  vi.stubGlobal('document', { querySelector: (selector: string) => selector === '#status' ? status : { addEventListener: vi.fn() } });
  vi.doMock('wxt/browser', () => ({ browser: {
    runtime: { id: 'extension-id', getURL: (path: string) => `moz-extension://id${path}`, onMessage: { addListener: (listener: typeof receive) => { receive = listener; } } },
    tabs: { getCurrent: vi.fn().mockResolvedValue({ id: 7 }), remove: removeTab, update: updateTab },
    downloads: { download, search: vi.fn().mockResolvedValue([{ state: 'in_progress' }]), onChanged: { addListener: (listener: typeof changed) => { changed = listener; }, removeListener } },
  } }));
  await import('../entrypoints/save/main');
  const message = { type: 'save-firefox-export', token: 'synthetic-token', content: 'Synthetic context 🙂 Україна', format: 'markdown' };
  const sender = { id: 'extension-id', url: 'moz-extension://id/popup.html' };
  const respond = vi.fn();
  // A tab or mismatched token cannot inject export content into the save page.
  receive!(message, { ...sender, tab: { id: 3 } }, respond);
  receive!({ ...message, token: 'wrong-token' }, sender, respond);
  expect(download).not.toHaveBeenCalled();
  receive!(message, sender, respond);
  await vi.advanceTimersByTimeAsync(0);
  expect(respond).toHaveBeenCalledWith({ accepted: true });
  expect(await (createUrl.mock.calls[0]![0] as Blob).text()).toBe(message.content);
  expect(download).toHaveBeenCalledWith(expect.objectContaining({ url: 'blob:save-document', saveAs: true, filename: expect.stringMatching(/\.md$/) }));
  expect(removeTab).not.toHaveBeenCalled();
  expect(revokeUrl).not.toHaveBeenCalled();
  receive!(message, sender, respond);
  expect(download).toHaveBeenCalledOnce();
  changed!({ id: 8, state: { current: 'complete' } });
  await vi.advanceTimersByTimeAsync(0);
  expect(revokeUrl).not.toHaveBeenCalled();
  changed!({ id: 9, state: { current: state } });
  await vi.advanceTimersByTimeAsync(0);
  expect(revokeUrl).toHaveBeenCalledWith('blob:save-document');
  expect(removeListener).toHaveBeenCalledWith(changed!);
  if (state === 'complete') expect(removeTab).toHaveBeenCalledWith(7);
  else {
    expect(removeTab).not.toHaveBeenCalled();
    expect(updateTab).toHaveBeenCalledWith(7, { active: true });
    expect(status.textContent).toContain('Unable to save');
  }
  expect(status.textContent).not.toContain(message.content);
});
