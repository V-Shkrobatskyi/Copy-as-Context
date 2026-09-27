import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CaptureResult, SemanticTree } from '@/src/core';

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
  storageSet: ReturnType<typeof vi.fn>;
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
  const storageSet = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal('document', {
    querySelector: <T extends Element>(selector: string): T | null =>
      (elements.get(selector) as unknown as T | undefined) ?? null,
  });
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWrite } });
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(response),
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    downloads: { download },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ 'popup-settings': options?.storedSettings }),
        set: storageSet,
      },
    },
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:popup-test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  await import('@/entrypoints/popup/main');
  return {
    app, compression, format, markdown: markdownFormat, redactSensitiveData, saveSettings,
    copy, save, status, metrics, clipboardWrite, download, storageSet,
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

  it('recovers from download failures and revokes the temporary Blob URL', async () => {
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
    expect(await blob.text()).toContain('[REDACTED]');
    expect(await blob.text()).not.toContain(SECRET);
    expect(popup.status.textContent).toContain('Unable to save');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:popup-test');
    expect(popup.copy.disabled).toBe(false);
    expect(popup.save.disabled).toBe(false);
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

});
