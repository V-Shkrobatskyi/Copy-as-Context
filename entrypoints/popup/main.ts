import './style.css';

import {
  DEFAULT_COMPRESSION_LEVEL,
  prepareExport,
  type CaptureResult,
  type CompressionLevel,
  type SupportedExportFormat,
} from '@/src/core';
import { CAPTURE_ACTIVE_TAB_MESSAGE, type CaptureActiveTabRequest } from '@/src/capture-message';

type ExportAction = 'copy' | 'save';
type StoredPopupSettings = {
  compression?: CompressionLevel;
  format?: SupportedExportFormat;
  redactSensitiveData?: boolean;
};

const POPUP_SETTINGS_KEY = 'popup-settings';

const ERROR_MESSAGES: Record<string, string> = {
  'unsupported-page': 'This Chrome page cannot be captured. Open a regular web page and try again.',
  'permission-denied': 'Chrome denied access to this page.',
  'debugger-busy': 'Chrome debugging is already in use for this tab. Close DevTools and try again.',
  'invalid-tree': 'Chrome returned an invalid accessibility tree. Try again.',
  'capture-failed': 'Unable to capture the accessibility tree. Try again.',
  'copy-failed': 'Unable to copy the page context. Check Chrome clipboard access and try again.',
  'save-failed': 'Unable to save the page context. Try again.',
};

const FORMAT_LABELS: Record<SupportedExportFormat, string> = {
  'semantic-text': 'Semantic Text',
  markdown: 'Markdown',
};

function isCaptureResult(value: unknown): value is CaptureResult {
  return typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean';
}

function selectedFormat(value: string): SupportedExportFormat {
  return value === 'markdown' ? 'markdown' : 'semantic-text';
}

function formatMetrics(
  characterCount: number,
  approximateTokenCount: number,
  reductionRatio: number | null,
  redactionCount: number,
): string {
  const reduction = reductionRatio === null ? 'reduction unavailable' : `${Math.round(reductionRatio * 100)}% smaller than Detailed`;
  const redactions = `${redactionCount} redaction${redactionCount === 1 ? '' : 's'}`;
  return `${characterCount} characters · ~${approximateTokenCount} tokens · ${reduction} · ${redactions}.`;
}

function downloadFilename(format: SupportedExportFormat): string {
  const now = new Date();
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${timestamp}.${format === 'markdown' ? 'md' : 'txt'}`;
}

async function saveContext(content: string, format: SupportedExportFormat): Promise<void> {
  const blob = new Blob([content], {
    type: format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename: downloadFilename(format), saveAs: true });
  } finally {
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
const status = document.querySelector<HTMLParagraphElement>('.status')!;
const metrics = document.querySelector<HTMLParagraphElement>('.metrics')!;
const feedback = document.querySelector<HTMLElement>('.feedback')!;
const guideLink = document.querySelector<HTMLAnchorElement>('#guide-link')!;
const redactSensitiveData = document.querySelector<HTMLInputElement>('#redact-sensitive-data')!;
const saveSettingsButton = document.querySelector<HTMLButtonElement>('#save-settings')!;
const controls = [
  compression, semanticTextFormat, markdownFormat, redactSensitiveData,
  saveSettingsButton, copyButton, saveButton,
];

const COMPRESSION_VALUES: readonly CompressionLevel[] = ['without', 'detailed', 'compact', 'maximum'];

guideLink.href = chrome.runtime.getURL('guide.html');

function selectedRangeCompression(value: string): CompressionLevel {
  const index = Number.parseInt(value, 10);
  return COMPRESSION_VALUES[index] ?? DEFAULT_COMPRESSION_LEVEL;
}

function updateCompressionDescription(): void {
  const descriptions: Record<CompressionLevel, string> = {
    without: 'Keeps every captured semantic node. Sensitive values are still redacted.',
    detailed: 'Preserves the full semantic structure for inspection.',
    compact: 'Removes repeated accessibility noise while retaining meaningful controls.',
    maximum: 'Uses the strongest currently safe reduction; it matches Compact today.',
  };
  const description = document.querySelector<HTMLParagraphElement>('#compression-description')!;
  description.textContent = descriptions[selectedRangeCompression(compression.value)];
}

function readSettings(value: unknown): StoredPopupSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  return value as StoredPopupSettings;
}

async function loadSettings(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(POPUP_SETTINGS_KEY);
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
    await chrome.storage.local.set({ [POPUP_SETTINGS_KEY]: settings });
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
  if (pending) {
    metrics.textContent = '';
    showFeedback(action === 'copy' ? 'Capturing and copying page context…' : 'Capturing and preparing download…');
  }
}

async function exportPageContext(action: ExportAction): Promise<void> {
  setPending(true, action);
  let destinationStarted = false;
  try {
    const request: CaptureActiveTabRequest = { type: CAPTURE_ACTIVE_TAB_MESSAGE };
    const response = await chrome.runtime.sendMessage(request);
    if (!isCaptureResult(response)) {
      showFeedback(ERROR_MESSAGES['capture-failed']!);
      return;
    }
    if (!response.ok) {
      showFeedback(ERROR_MESSAGES[response.error.code] ?? ERROR_MESSAGES['capture-failed']!);
      return;
    }

    const exportFormat = selectedFormat(markdownFormat.checked ? 'markdown' : 'semantic-text');
    const result = prepareExport(
      response.tree,
      selectedRangeCompression(compression.value),
      exportFormat,
      redactSensitiveData.checked,
    );
    destinationStarted = true;
    if (action === 'copy') {
      await navigator.clipboard.writeText(result.serialized.content);
      showFeedback(`Copied ${FORMAT_LABELS[exportFormat]}.`);
    } else {
      await saveContext(result.serialized.content, exportFormat);
      showFeedback(`Saved ${FORMAT_LABELS[exportFormat]} file.`);
    }
    metrics.textContent = formatMetrics(
      result.characterCount,
      result.approximateTokenCount,
      result.reductionRatio,
      result.redactionCount,
    );
  } catch {
    showFeedback(ERROR_MESSAGES[
      destinationStarted ? (action === 'copy' ? 'copy-failed' : 'save-failed') : 'capture-failed'
    ]!);
  } finally {
    setPending(false);
  }
}

copyButton.addEventListener('click', () => void exportPageContext('copy'));
saveButton.addEventListener('click', () => void exportPageContext('save'));
compression.addEventListener('input', updateCompressionDescription);
saveSettingsButton.addEventListener('click', () => void saveSettings());
void loadSettings();
