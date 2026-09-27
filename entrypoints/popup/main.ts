import './style.css';

import {
  COMPRESSION_LEVELS,
  DEFAULT_COMPRESSION_LEVEL,
  prepareExport,
  type CaptureResult,
  type CompressionLevel,
  type SupportedExportFormat,
} from '@/src/core';
import { CAPTURE_ACTIVE_TAB_MESSAGE, type CaptureActiveTabRequest } from '@/src/capture-message';

type ExportAction = 'copy' | 'save';

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

function selectedCompression(value: string): CompressionLevel {
  return (COMPRESSION_LEVELS as readonly string[]).includes(value)
    ? value as CompressionLevel
    : DEFAULT_COMPRESSION_LEVEL;
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
    <h1 id="popup-title">Copy as Context</h1>
    <p class="intro">Capture, redact, and export the active page locally. Obvious credential-like text is replaced before export.</p>
    <div class="field">
      <label for="compression">Compression</label>
      <select id="compression" name="compression">
        <option value="detailed">Detailed</option>
        <option value="compact" selected>Compact</option>
        <option value="maximum">Maximum (currently Compact)</option>
      </select>
    </div>
    <div class="field">
      <label for="format">Export format</label>
      <select id="format" name="format">
        <option value="semantic-text" selected>Semantic Text</option>
        <option value="markdown">Markdown</option>
      </select>
    </div>
    <div class="actions">
      <button class="primary-action" type="button">Copy page context</button>
      <button class="secondary-action" type="button">Save to file</button>
    </div>
    <p class="metrics" aria-live="polite"></p>
    <p class="status" role="status" aria-live="polite"></p>
  </main>
`;

const compression = document.querySelector<HTMLSelectElement>('#compression')!;
const format = document.querySelector<HTMLSelectElement>('#format')!;
const copyButton = document.querySelector<HTMLButtonElement>('.primary-action')!;
const saveButton = document.querySelector<HTMLButtonElement>('.secondary-action')!;
const status = document.querySelector<HTMLParagraphElement>('.status')!;
const metrics = document.querySelector<HTMLParagraphElement>('.metrics')!;
const controls = [compression, format, copyButton, saveButton];

function setPending(pending: boolean, action?: ExportAction): void {
  for (const control of controls) control.disabled = pending;
  if (pending) {
    status.textContent = action === 'copy' ? 'Capturing and copying page context…' : 'Capturing and preparing download…';
    metrics.textContent = '';
  }
}

async function exportPageContext(action: ExportAction): Promise<void> {
  setPending(true, action);
  let destinationStarted = false;
  try {
    const request: CaptureActiveTabRequest = { type: CAPTURE_ACTIVE_TAB_MESSAGE };
    const response = await chrome.runtime.sendMessage(request);
    if (!isCaptureResult(response)) {
      status.textContent = ERROR_MESSAGES['capture-failed']!;
      return;
    }
    if (!response.ok) {
      status.textContent = ERROR_MESSAGES[response.error.code] ?? ERROR_MESSAGES['capture-failed']!;
      return;
    }

    const exportFormat = selectedFormat(format.value);
    const result = prepareExport(response.tree, selectedCompression(compression.value), exportFormat);
    destinationStarted = true;
    if (action === 'copy') {
      await navigator.clipboard.writeText(result.serialized.content);
      status.textContent = `Copied ${FORMAT_LABELS[exportFormat]}.`;
    } else {
      await saveContext(result.serialized.content, exportFormat);
      status.textContent = `Saved ${FORMAT_LABELS[exportFormat]} file.`;
    }
    metrics.textContent = formatMetrics(
      result.characterCount,
      result.approximateTokenCount,
      result.reductionRatio,
      result.redactionCount,
    );
  } catch {
    status.textContent = ERROR_MESSAGES[
      destinationStarted ? (action === 'copy' ? 'copy-failed' : 'save-failed') : 'capture-failed'
    ]!;
  } finally {
    setPending(false);
  }
}

copyButton.addEventListener('click', () => void exportPageContext('copy'));
saveButton.addEventListener('click', () => void exportPageContext('save'));
