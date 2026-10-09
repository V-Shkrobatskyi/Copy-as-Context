import { openFirefoxSave } from '@/src/firefox-save';
import { installTouchButtonFeedback } from '@/src/touch-button-feedback';
import '@popup-style.css';
import { browser } from 'wxt/browser';

import {
  DEFAULT_COMPRESSION_LEVEL,
  type CompressionLevel,
  type SupportedExportFormat,
} from '@/src/core';
import { CAPTURE_ACTIVE_TAB_MESSAGE, isCaptureActiveTabResponse, type CaptureActiveTabRequest } from '@/src/capture-message';
import { wrapClipboardContext } from '@/src/clipboard-context';
import { contextBlob, contextDownloadOptions } from '@/src/download-context';

type ExportAction = 'copy' | 'save';
type StoredPopupSettings = {
  compression?: CompressionLevel;
  format?: SupportedExportFormat;
  redactSensitiveData?: boolean;
};

const POPUP_SETTINGS_KEY = 'popup-settings';

const ERROR_MESSAGES: Record<string, string> = {
  'unsupported-page': 'This browser page cannot be captured. Open a regular web page and try again.',
  'permission-denied': 'The browser denied access to this page.',
  'debugger-busy': 'Chrome debugging is already in use for this tab. Close DevTools and try again.',
  'invalid-tree': 'The browser returned an invalid semantic tree. Try again.',
  'capture-failed': 'Unable to capture this page’s semantic structure. Try again.',
  'capture-unavailable': 'Page capture is not available in this build yet.',
  'capture-limit': 'This page exceeds the capture limits. Try a smaller page.',
  'capture-timeout': 'Page capture took too long. Try again.',
  'page-changed': 'The page changed during capture. Wait for it to finish loading and try again.',
  'copy-failed': 'Unable to copy the page context. Check browser clipboard access and try again.',
  'save-failed': 'Unable to save the page context. Try again.',
};

const FORMAT_LABELS: Record<SupportedExportFormat, string> = {
  'semantic-text': 'Semantic Text',
  markdown: 'Markdown',
};

function selectedFormat(value: string): SupportedExportFormat {
  return value === 'markdown' ? 'markdown' : 'semantic-text';
}

function formatMetrics(
  characterCount: number,
  approximateTokenCount: number,
  reductionRatio: number | null,
  redactionCount: number,
  action: ExportAction,
): string {
  const reduction = reductionRatio === null ? 'reduction unavailable' : `${Math.round(reductionRatio * 100)}% smaller than Without`;
  const redactions = `${redactionCount} redaction${redactionCount === 1 ? '' : 's'}`;
  const countLabel = action === 'copy' ? 'characters copied' : 'characters';
  const reductionLabel = action === 'copy' ? `context ${reduction}` : reduction;
  return `${characterCount} ${countLabel} · ~${approximateTokenCount} tokens · ${reductionLabel} · ${redactions}.`;
}

async function saveContext(content: string, format: SupportedExportFormat): Promise<void> {
  if (firefox) {
    await openFirefoxSave(content, format);
    return;
  }
  const url = URL.createObjectURL(contextBlob(content, format));
  let changed: ((delta: { id: number; state?: { current?: string }; error?: { current?: string } }) => void) | undefined;
  try {
    const id = await browser.downloads.download(contextDownloadOptions(url, format));
    await new Promise<void>((resolve, reject) => {
      const check = (state?: string, error?: string) => {
        if (state === 'interrupted' || error) reject(new Error('download-interrupted'));
        else if (state === 'complete') resolve();
      };
      changed = (delta) => { if (delta.id === id) check(delta.state?.current, delta.error?.current); };
      browser.downloads.onChanged.addListener(changed);
      // A small local download may finish before the listener is attached.
      void browser.downloads.search({ id }).then((items) => {
        if (!items[0]) reject(new Error('download-unavailable'));
        else check(items[0].state, items[0].error);
      }, reject);
    });
  } finally {
    if (changed) browser.downloads.onChanged.removeListener(changed);
    URL.revokeObjectURL(url);
  }
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="popup" aria-labelledby="popup-title">
    <header class="popup-header">
      <img class="brand-mark" src="/icon/32.png" alt="" aria-hidden="true" />
      <div>
        <h1 id="popup-title">Copy as Context</h1>
        <p class="intro">Private page context for your next prompt.</p>
      </div>
    </header>
    <section class="settings-panel" aria-label="Export preferences">
      <fieldset class="field compression-field">
        <legend>Compression</legend>
        <div class="range-control">
          <input id="compression" name="compression" type="range" min="0" max="3" step="1" value="2" aria-describedby="compression-description" />
          <div class="range-labels" aria-hidden="true">
            <span>Without</span><span>Detailed</span><span>Compact</span><span>Maximum</span>
          </div>
        </div>
        <p id="compression-description" class="field-note">Compact removes repeated accessibility noise.</p>
        <div class="privacy-setting">
          <label class="privacy-toggle"><input id="redact-sensitive-data" type="checkbox" checked /> <span>Redact sensitive data</span></label>
          <p>Replaces detected credentials with <code>[REDACTED]</code>.</p>
        </div>
      </fieldset>
      <fieldset class="field format-field">
        <legend>Export format</legend>
        <div class="format-options">
          <label class="format-option"><input id="format-semantic-text" name="format" type="radio" value="semantic-text" checked /> <span>Semantic Text</span></label>
          <label class="format-option"><input id="format-markdown" name="format" type="radio" value="markdown" /> <span>Markdown</span></label>
        </div>
      </fieldset>
      <button id="save-settings" class="save-settings" type="button">Save preferences</button>
    </section>
    <section class="action-section" aria-label="Export page context">
      <div class="actions">
        <button class="primary-action" type="button">Copy page context</button>
        <button class="secondary-action" type="button">Save to file</button>
      </div>
    </section>
    <section class="feedback" hidden aria-label="Export result">
      <p class="status" role="status" aria-live="polite"></p>
      <p class="metrics" aria-live="polite"></p>
    </section>
    <footer class="help"><span>New here?</span> <a id="guide-link" target="_blank" rel="noopener">View the quick guide</a></footer>
  </main>
`;

const compression = document.querySelector<HTMLInputElement>('#compression')!;
const semanticTextFormat = document.querySelector<HTMLInputElement>('#format-semantic-text')!;
const markdownFormat = document.querySelector<HTMLInputElement>('#format-markdown')!;
const copyButton = document.querySelector<HTMLButtonElement>('.primary-action')!;
const saveButton = document.querySelector<HTMLButtonElement>('.secondary-action')!;
const firefox = import.meta.env.BROWSER === 'firefox';
let canSave = !firefox && typeof browser.downloads?.download === 'function';
function updateSaveAvailability(): void {
  saveButton.disabled = exportPending || !canSave;
  saveButton.textContent = canSave ? 'Save to file' : 'Save unavailable';
  saveButton.title = canSave && firefox
    ? 'Firefox asks for download permission the first time you save a file.'
    : canSave ? '' : 'Saving files is unavailable in this browser. Use Copy page context.';
}
if (!canSave) {
  saveButton.disabled = true;
  saveButton.textContent = 'Save unavailable';
  saveButton.title = 'Saving files is unavailable in this browser. Use Copy page context.';
}
const status = document.querySelector<HTMLParagraphElement>('.status')!;
const metrics = document.querySelector<HTMLParagraphElement>('.metrics')!;
const feedback = document.querySelector<HTMLElement>('.feedback')!;
const guideLink = document.querySelector<HTMLAnchorElement>('#guide-link')!;
const redactSensitiveData = document.querySelector<HTMLInputElement>('#redact-sensitive-data')!;
const saveSettingsButton = document.querySelector<HTMLButtonElement>('#save-settings')!;
installTouchButtonFeedback(saveSettingsButton, () => document.body.dataset.platform === 'android');
const controls = [
  compression, semanticTextFormat, markdownFormat, redactSensitiveData,
  saveSettingsButton, copyButton, saveButton,
];

const COMPRESSION_VALUES: readonly CompressionLevel[] = ['without', 'detailed', 'compact', 'maximum'];

guideLink.href = browser.runtime.getURL('/guide.html');

function selectedRangeCompression(value: string): CompressionLevel {
  const index = Number.parseInt(value, 10);
  return COMPRESSION_VALUES[index] ?? DEFAULT_COMPRESSION_LEVEL;
}

function updateCompressionDescription(): void {
  const descriptions: Record<CompressionLevel, string> = {
    without: 'Keeps every captured semantic node. Sensitive values are still redacted.',
    detailed: 'Removes unnamed wrappers without semantic attributes, preserving text, links and states.',
    compact: 'Removes repeated accessibility noise while retaining meaningful controls.',
    maximum: 'Packs Compact context with selective abbreviations and repeated text or structures; falls back when overhead is too high.',
  };
  const minimum = Number.parseFloat(compression.min);
  const maximum = Number.parseFloat(compression.max);
  const current = Number.parseFloat(compression.value);
  const progress = maximum > minimum
    ? ((current - minimum) / (maximum - minimum)) * 100
    : 0;
  compression.style.setProperty('--compression-progress', `${progress}%`);
  const description = document.querySelector<HTMLParagraphElement>('#compression-description')!;
  description.textContent = descriptions[selectedRangeCompression(compression.value)];
}

function readSettings(value: unknown): StoredPopupSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  return value as StoredPopupSettings;
}

async function loadSettings(): Promise<void> {
  try {
    const stored = await browser.storage.local.get(POPUP_SETTINGS_KEY);
    const settings = readSettings(stored[POPUP_SETTINGS_KEY]);
    if (settings === undefined) return;

    const compressionIndex = settings.compression === undefined
      ? -1
      : COMPRESSION_VALUES.indexOf(settings.compression);
    if (compressionIndex >= 0) compression.value = compressionIndex.toString();
    if (settings.format === 'markdown') markdownFormat.checked = true;
    if (settings.format === 'semantic-text') semanticTextFormat.checked = true;
    if (typeof settings.redactSensitiveData === 'boolean') {
      redactSensitiveData.checked = settings.redactSensitiveData;
    }
    updateCompressionDescription();
  } catch {
    // The popup remains usable with its safe defaults when storage is unavailable.
  }
}

async function saveSettings(): Promise<void> {
  const settings: Required<StoredPopupSettings> = {
    compression: selectedRangeCompression(compression.value),
    format: markdownFormat.checked ? 'markdown' : 'semantic-text',
    redactSensitiveData: redactSensitiveData.checked,
  };
  try {
    await browser.storage.local.set({ [POPUP_SETTINGS_KEY]: settings });
    showFeedback('Settings saved for future popup openings.');
  } catch {
    showFeedback('Unable to save settings. Try again.');
  }
}

function showFeedback(message: string): void {
  status.textContent = message;
  feedback.hidden = false;
}

function setPending(pending: boolean, action?: ExportAction): void {
  for (const control of controls) control.disabled = pending;
  saveButton.disabled = pending || !canSave;
  if (pending) {
    metrics.textContent = '';
    showFeedback(action === 'copy' ? 'Capturing and copying page context…' : 'Capturing and preparing download…');
  }
}

let exportPending = false;

async function exportPageContext(action: ExportAction): Promise<void> {
  if (action === 'save' && !canSave) {
    showFeedback('Saving files is unavailable in this browser. Use Copy page context.');
    return;
  }
  if (exportPending) return;
  exportPending = true;
  setPending(true, action);
  let destinationStarted = false;
  try {
    // Request from the click handler before awaiting capture, preserving the user gesture.
    if (action === 'save' && firefox) {
      const granted = await browser.permissions.request({ permissions: ['downloads'] });
      if (!granted) {
        showFeedback('Download permission was not granted. Use Copy or try Save again.');
        return;
      }
      if (typeof browser.downloads?.download !== 'function') {
        showFeedback('Saving files is unavailable in this browser. Use Copy page context.');
        return;
      }
    }
    const exportFormat = selectedFormat(markdownFormat.checked ? 'markdown' : 'semantic-text');
    const request: CaptureActiveTabRequest = {
      type: CAPTURE_ACTIVE_TAB_MESSAGE,
      compression: selectedRangeCompression(compression.value),
      format: exportFormat,
      redactSensitiveData: redactSensitiveData.checked,
    };
    const response = await browser.runtime.sendMessage(request);
    if (!isCaptureActiveTabResponse(response)) {
      showFeedback(ERROR_MESSAGES['capture-failed']!);
      return;
    }
    if (!response.ok) {
      showFeedback(ERROR_MESSAGES[response.error.code] ?? ERROR_MESSAGES['capture-failed']!);
      return;
    }

    const result = response.export;
    let characterCount = result.characterCount;
    let approximateTokenCount = result.approximateTokenCount;
    destinationStarted = true;
    if (action === 'copy') {
      const content = wrapClipboardContext(result.serialized.content, request.compression);
      await navigator.clipboard.writeText(content);
      characterCount = content.length;
      approximateTokenCount = Math.ceil(characterCount / 4);
      showFeedback(`Copied ${FORMAT_LABELS[exportFormat]}.`);
    } else {
      await saveContext(result.serialized.content, exportFormat);
      showFeedback(firefox ? 'Saving file in a separate tab.' : `Saved ${FORMAT_LABELS[exportFormat]} file.`);
    }
    const warnings = (response.warnings ?? []).map((code) => code === 'embedded-frames'
      ? 'Embedded frames are not included.' : 'Canvas content is not included.').join(' ');
    metrics.textContent = formatMetrics(
      characterCount,
      approximateTokenCount,
      result.reductionRatio,
      result.redactionCount,
      action,
    ) + (warnings ? ` ${warnings}` : '');
  } catch {
    showFeedback(ERROR_MESSAGES[
      destinationStarted ? (action === 'copy' ? 'copy-failed' : 'save-failed') : 'capture-failed'
    ]!);
  } finally {
    exportPending = false;
    setPending(false);
  }
}

copyButton.addEventListener('click', () => void exportPageContext('copy'));
saveButton.addEventListener('click', () => void exportPageContext('save'));
compression.addEventListener('input', updateCompressionDescription);
saveSettingsButton.addEventListener('click', () => {
  void saveSettings();
});
updateCompressionDescription();
void loadSettings();

async function initializeFirefoxPlatform(): Promise<void> {
  if (!firefox) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const platform = await Promise.race([
      browser.runtime.getPlatformInfo(),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 1000); }),
    ]);
    const android = platform?.os === 'android' || /Android/u.test(navigator.userAgent);
    document.body.dataset.platform = android ? 'android' : 'desktop';
    canSave = !android && ['mac', 'win', 'linux', 'cros', 'openbsd'].includes(platform?.os ?? '')
      && typeof browser.permissions?.request === 'function';
  } catch {
    // Copy remains available if local platform detection fails.
    document.body.dataset.platform = /Android/u.test(navigator.userAgent) ? 'android' : 'desktop';
  } finally {
    clearTimeout(timer);
    updateSaveAvailability();
  }
}
void initializeFirefoxPlatform();
