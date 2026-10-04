import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareExport, type CaptureResult, type SemanticTree } from '@/src/core';
import type { CaptureActiveTabRequest } from '@/src/capture-message';

class FakeElement {
  value = '';
  min = '0';
  max = '3';
  disabled = false;
  checked = false;
  textContent = '';
  innerHTML = '';
  readonly style = { setProperty: vi.fn() };
  private readonly listeners = new Map<string, () => void>();

  // noinspection JSUnusedGlobalSymbols
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  click(): void {
    this.listeners.get('click')?.();
  }
}

interface PopupHarness {
  app: FakeElement;
  compression: FakeElement;
  format: FakeElement;
  markdown: FakeElement;
  redactSensitiveData: FakeElement;
  saveSettings: FakeElement;
  copy: FakeElement;
  save: FakeElement;
  status: FakeElement;
  metrics: FakeElement;
  clipboardWrite: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  downloadSearch: ReturnType<typeof vi.fn>;
  downloadChanged: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  storageSet: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
}

const SECRET = 'synthetic-popup-password-value';

function successfulCapture(): CaptureResult {
  const tree: SemanticTree = {
    schemaVersion: 1,
    root: {
      role: 'page',
      children: [{ role: 'textbox', name: 'Password', value: SECRET, children: [] }],
    },
  };
  return { ok: true, tree };
}

async function loadPopup(response: CaptureResult | unknown, options?: {
  clipboardError?: boolean;
  downloadError?: boolean;
  storedSettings?: unknown;
  firefox?: boolean;
  downloadsUnavailable?: boolean;
}): Promise<PopupHarness> {
  const app = new FakeElement();
  const compression = new FakeElement();
  const format = new FakeElement();
  const copy = new FakeElement();
  const save = new FakeElement();
  const status = new FakeElement();
  const metrics = new FakeElement();
  const semanticTextFormat = format;
  const markdownFormat = new FakeElement();
  const feedback = new FakeElement();
  const compressionDescription = new FakeElement();
  const guideLink = new FakeElement();
  const redactSensitiveData = new FakeElement();
  const saveSettings = new FakeElement();
  compression.value = '2';
  semanticTextFormat.value = 'semantic-text';
  semanticTextFormat.checked = true;
  markdownFormat.value = 'markdown';
  redactSensitiveData.checked = true;
  const elements = new Map<string, FakeElement>([
    ['#app', app], ['#compression', compression], ['#format', format],
    ['#format-semantic-text', semanticTextFormat], ['#format-markdown', markdownFormat],
    ['.primary-action', copy], ['.secondary-action', save], ['.status', status], ['.metrics', metrics],
    ['.feedback', feedback], ['#compression-description', compressionDescription], ['#guide-link', guideLink],
    ['#redact-sensitive-data', redactSensitiveData], ['#save-settings', saveSettings],
  ]);
  const clipboardWrite = vi.fn().mockImplementation(async () => {
    if (options?.clipboardError) throw new Error('clipboard denied');
  });
  const download = vi.fn().mockImplementation(async () => {
    if (options?.downloadError) throw new Error('download denied');
    return 1;
  });
  const downloadSearch = vi.fn().mockResolvedValue([{ id: 1, state: 'complete' }]);
  const downloadChanged = { addListener: vi.fn(), removeListener: vi.fn() };
  const storageSet = vi.fn().mockResolvedValue(undefined);
  const sendMessage = vi.fn().mockImplementation(async (request: CaptureActiveTabRequest) => {
    if (typeof response === 'object' && response !== null && 'ok' in response && response.ok === true && 'tree' in response) {
      return { ok: true, export: prepareExport(response.tree as SemanticTree, request.compression, request.format, request.redactSensitiveData) };
    }
    return response;
  });

  vi.stubGlobal('document', {
    querySelector: <T extends Element>(selector: string): T | null =>
      (elements.get(selector) as unknown as T | undefined) ?? null,
  });
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWrite } });
  const extensionApi = {
    runtime: {
      sendMessage,
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    downloads: options?.downloadsUnavailable ? undefined : {
      download, search: downloadSearch, onChanged: downloadChanged,
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ 'popup-settings': options?.storedSettings }),
        set: storageSet,
      },
    },
  };
  vi.stubGlobal('chrome', extensionApi);
  const firefoxApi = {
      ...extensionApi,
      runtime: {
        id: 'synthetic-firefox-id',
        sendMessage,
        getURL: (path: string) => `moz-extension://test/${path}`,
      },
  };
  vi.doMock('wxt/browser', () => ({ browser: options?.firefox ? firefoxApi : extensionApi }));
  if (options?.firefox) {
    vi.stubGlobal('browser', firefoxApi);
    vi.stubGlobal('chrome', undefined);
  }
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:popup-test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  await import('@/entrypoints/popup/main');
  return {
    app, compression, format, markdown: markdownFormat, redactSensitiveData, saveSettings,
    copy, save, status, metrics, clipboardWrite, download, downloadSearch, downloadChanged, storageSet, sendMessage,
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('popup export flow', () => {
  it('shows validated scope warnings after a successful export and blocks concurrent actions', async () => {
    const result = successfulCapture();
    if (!result.ok) throw new Error('Expected fixture');
    const popup = await loadPopup(result);
    let finish!: (value: unknown) => void;
    popup.sendMessage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    popup.copy.click(); popup.copy.click(); popup.save.click();
    expect(popup.sendMessage).toHaveBeenCalledOnce();
    finish({ ok: true, export: prepareExport(result.tree, 'compact', 'semantic-text'), warnings: ['embedded-frames', 'canvas-content'] });
    await settle();
    expect(popup.clipboardWrite).toHaveBeenCalledOnce();
    expect(popup.download).not.toHaveBeenCalled();
    expect(popup.metrics.textContent).toContain('Embedded frames are not included.');
    expect(popup.metrics.textContent).toContain('Canvas content is not included.');
    expect(popup.copy.disabled).toBe(false);
  });

  it('rejects an unknown warning rather than displaying arbitrary content', async () => {
    const result = successfulCapture();
    if (!result.ok) throw new Error('Expected fixture');
    const popup = await loadPopup({ ok: true, export: prepareExport(result.tree, 'compact', 'semantic-text'), warnings: ['synthetic-private-detail'] });
    popup.copy.click(); await settle();
    expect(popup.clipboardWrite).not.toHaveBeenCalled();
    expect(popup.status.textContent).not.toContain('synthetic-private-detail');
  });
  it('uses native Firefox APIs for preferences and reports unfinished capture without exporting', async () => {
    const popup = await loadPopup({
      ok: false,
      error: { code: 'capture-unavailable', message: 'synthetic private details' },
    }, { firefox: true });
    await settle();
    popup.saveSettings.click();
    await settle();
    expect(popup.storageSet).toHaveBeenCalledOnce();
    for (const action of [popup.copy, popup.save]) {
      action.click();
      await settle();
      expect(popup.status.textContent).toBe('Page capture is not available in this build yet.');
      expect(action.disabled).toBe(false);
    }
    expect(popup.clipboardWrite).not.toHaveBeenCalled();
    expect(popup.download).not.toHaveBeenCalled();
  });
  it.each(['semantic-text', 'markdown'] as const)('wraps Copy and preserves Save across all profiles and privacy settings in %s', async (format) => {
    const capture = successfulCapture();
    if (!capture.ok) throw new Error('Expected successful fixture');
    for (const [index, compression] of (['without', 'detailed', 'compact', 'maximum'] as const).entries()) {
      for (const privacy of [true, false]) {
        vi.resetModules();
        const popup = await loadPopup(capture);
        await settle();
        popup.compression.value = String(index);
        popup.markdown.checked = format === 'markdown';
        popup.redactSensitiveData.checked = privacy;
        const result = prepareExport(capture.tree, compression, format, privacy);
        const opening = compression === 'maximum' ? '**' : '<web_page>';
        const closing = compression === 'maximum' ? '**' : '</web_page>';
        const expected = `${opening}\n${result.serialized.content}${closing}\n`;

        popup.copy.click();
        await settle();
        expect(popup.clipboardWrite).toHaveBeenCalledExactlyOnceWith(expected);
        expect(popup.metrics.textContent).toContain(`${expected.length} characters copied`);
        expect(popup.metrics.textContent).toContain(`~${Math.ceil(expected.length / 4)} tokens`);
        expect(popup.metrics.textContent).toContain(`context ${Math.round(result.reductionRatio! * 100)}% smaller than Without`);
        expect(popup.download).not.toHaveBeenCalled();

        popup.save.click();
        await settle();
        const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0] as Blob;
        expect(await blob.text()).toBe(result.serialized.content);
        expect(popup.status.textContent).toBe(`Saved ${format === 'markdown' ? 'Markdown' : 'Semantic Text'} file.`);
        expect(popup.metrics.textContent).toContain(`${result.characterCount} characters ·`);
        expect(popup.clipboardWrite).toHaveBeenCalledOnce();
      }
    }
  });

  it('renders Compact Semantic Text defaults and accessible export controls', async () => {
    const popup = await loadPopup(successfulCapture());

    expect(popup.compression.value).toBe('2');
    expect(popup.format.value).toBe('semantic-text');
    expect(popup.app.innerHTML).toContain('type="range"');
    expect(popup.app.innerHTML).toContain('Without');
    expect(popup.app.innerHTML).toContain('type="radio"');
    expect(popup.app.innerHTML).toContain('Redact sensitive data');
    expect(popup.app.innerHTML).toContain('Save preferences');
    expect(popup.app.innerHTML).toContain('Copy page context');
    expect(popup.app.innerHTML).toContain('Save to file');
  });

  it('copies only redacted content and never places page content in popup UI', async () => {
    const popup = await loadPopup(successfulCapture());

    popup.copy.click();
    expect(popup.copy.disabled).toBe(true);
    expect(popup.save.disabled).toBe(true);
    await settle();

    expect(popup.sendMessage).toHaveBeenCalledWith({ type: 'capture-active-tab', compression: 'compact', format: 'semantic-text', redactSensitiveData: true });
    expect(popup.clipboardWrite).toHaveBeenCalledOnce();
    const copied = popup.clipboardWrite.mock.calls[0]?.[0] as string;
    expect(copied).toContain('[REDACTED]');
    expect(copied).not.toContain(SECRET);
    expect(popup.status.textContent).toBe('Copied Semantic Text.');
    expect(popup.metrics.textContent).toContain('1 redaction');
    expect(`${popup.app.innerHTML}${popup.status.textContent}${popup.metrics.textContent}`).not.toContain(SECRET);
    expect(popup.copy.disabled).toBe(false);
    expect(popup.save.disabled).toBe(false);
  });

  it('recovers from capture and clipboard failures without exposing error details', async () => {
    const captureFailure: CaptureResult = {
      ok: false,
      error: { code: 'unsupported-page', message: 'synthetic internal page details' },
    };
    const capturePopup = await loadPopup(captureFailure);
    capturePopup.copy.click();
    await settle();
    expect(capturePopup.status.textContent).toContain('cannot be captured');
    expect(capturePopup.status.textContent).not.toContain('synthetic internal page details');
    expect(capturePopup.copy.disabled).toBe(false);

    vi.resetModules();
    const clipboardPopup = await loadPopup(successfulCapture(), { clipboardError: true });
    clipboardPopup.copy.click();
    await settle();
    expect(clipboardPopup.status.textContent).toContain('Unable to copy');
    expect(clipboardPopup.copy.disabled).toBe(false);
  });

  it('recovers from download initiation failures and releases the unused Blob URL', async () => {
    const popup = await loadPopup(successfulCapture(), { downloadError: true });
    popup.markdown.checked = true;

    popup.save.click();
    expect(popup.save.disabled).toBe(true);
    await settle();

    expect(popup.download).toHaveBeenCalledOnce();
    expect(popup.download.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      filename: expect.stringMatching(/^\d{4}\.\d{2}\.\d{2}_\d{6}\.md$/u),
      saveAs: true,
    }));
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    const content = await blob.text();
    expect(content).toContain('[REDACTED]');
    expect(content).not.toContain(SECRET);
    expect(popup.status.textContent).toContain('Unable to save');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:popup-test');
    expect(popup.copy.disabled).toBe(false);
    expect(popup.save.disabled).toBe(false);
  });

  it.each(['complete', 'interrupted'])('retains the Blob until download %s and cleans up its listener', async (state) => {
    const popup = await loadPopup(successfulCapture(), { firefox: true });
    popup.downloadSearch.mockResolvedValue([{ id: 1, state: 'in_progress' }]);
    popup.save.click();
    await settle();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(popup.save.disabled).toBe(true);
    expect(popup.status.textContent).not.toContain('Saved');
    const listener = popup.downloadChanged.addListener.mock.calls[0]?.[0];
    listener({ id: 2, state: { current: 'complete' } });
    await settle();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    listener({ id: 1, state: { current: state } });
    await settle();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(popup.downloadChanged.removeListener).toHaveBeenCalledWith(listener);
    expect(popup.status.textContent).toContain(state === 'complete' ? 'Saved' : 'Unable to save');
    expect(popup.save.disabled).toBe(false);
  });

  it('keeps Save unavailable after Copy when the browser has no downloads API', async () => {
    const popup = await loadPopup(successfulCapture(), { firefox: true, downloadsUnavailable: true });
    expect(popup.save.disabled).toBe(true);
    expect(popup.save.textContent).toBe('Save unavailable');
    popup.copy.click();
    await settle();
    expect(popup.clipboardWrite).toHaveBeenCalledOnce();
    expect(popup.save.disabled).toBe(true);
    popup.save.click();
    await settle();
    expect(popup.sendMessage).toHaveBeenCalledOnce();
    expect(popup.download).not.toHaveBeenCalled();
    expect(popup.status.textContent).toContain('Saving files is unavailable');
  });

  it('persists settings and allows an explicitly unredacted export', async () => {
    const popup = await loadPopup(successfulCapture());
    popup.markdown.checked = true;
    popup.redactSensitiveData.checked = false;
    popup.saveSettings.click();
    await settle();

    expect(popup.storageSet).toHaveBeenCalledWith({
      'popup-settings': { compression: 'compact', format: 'markdown', redactSensitiveData: false },
    });
    expect(popup.status.textContent).toContain('Settings saved');

    popup.copy.click();
    await settle();
    expect(popup.clipboardWrite).toHaveBeenCalledWith(expect.stringContaining(SECRET));
    expect(popup.metrics.textContent).toContain('0 redactions');
  });

  it('restores previously saved settings when the popup opens', async () => {
    const popup = await loadPopup(successfulCapture(), {
      storedSettings: { compression: 'maximum', format: 'markdown', redactSensitiveData: false },
    });
    await settle();

    expect(popup.compression.value).toBe('3');
    expect(popup.markdown.checked).toBe(true);
    expect(popup.redactSensitiveData.checked).toBe(false);
  });

  it('rejects malformed prepared exports without copying content', async () => {
    const popup = await loadPopup({ ok: true, export: { serialized: { content: 'invalid' } } });
    popup.copy.click();
    await settle();
    expect(popup.clipboardWrite).not.toHaveBeenCalled();
    expect(popup.status.textContent).toContain('Unable to capture');
    expect(popup.copy.disabled).toBe(false);
  });

});
