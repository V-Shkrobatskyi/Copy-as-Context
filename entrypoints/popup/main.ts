// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { readPolicy, checkPolicy, watchPolicy, policyMessage, type PolicyContext, type PolicySnapshot } from '@/src/policy/runtime';
import { assertAction, formats, levels, redactionMode, resolvePreferences, PolicyError } from '@/src/policy/model';
import { openPreview } from '@/src/preview-session';
import { PICKER_START } from '@/src/element-picker-protocol';
import { captureWarningText } from '@/src/preview-message';
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
import { saveContextFile } from '@/src/save-context';
import { installFrameAccessToggle, type FrameAccessToggle } from '@/src/firefox-frame-access';

type ExportAction = 'copy' | 'save' | 'preview';
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
  'preview-failed': 'Unable to open the preview. Keep the popup open until the editor is ready and try again.',
  'redaction-settings': 'Unable to load redaction filters. Open Customize to reload or restore them.',
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

async function saveContext(content: string, format: SupportedExportFormat, context: PolicyContext): Promise<void> {
  if (firefox) {
    await openFirefoxSave(content, format, context);
    return;
  }
  await saveContextFile(content, format, undefined, context);
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
    <p id="organization-policy" class="field-note" role="status" hidden></p>
    <button id="retry-policy" type="button" hidden>Retry organization policies</button>
    <section class="action-section" aria-label="Export page context">
      <div class="actions">
        <button id="preview" class="preview-action" type="button">Preview &amp; edit</button>
        <button class="primary-action" type="button">Copy page context</button>
        <button class="secondary-action" type="button">Save to file</button>
        <button id="select-element" class="preview-action" type="button">Select element</button>
      </div>
    </section>
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
          <div class="privacy-setting-header">
            <label class="privacy-toggle"><input id="redact-sensitive-data" type="checkbox" checked /> <span>Redact sensitive data</span></label>
            <button id="customize" class="customize-action" type="button" title="Customize redaction filters">Customize</button>
          </div>
          <p>Replaces matching credentials and custom text with <code>[REDACTED]</code>.</p>
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
    ${import.meta.env.BROWSER === 'firefox' ? `<section class="privacy-setting frame-access-setting" aria-label="Site access">
      <label class="privacy-toggle"><input id="include-other-site-frames" type="checkbox" disabled aria-describedby="other-site-frames-note" /> <span>Include frames from other sites</span></label>
      <p id="other-site-frames-note">Applies immediately. Requires access to all sites; off revokes it.</p>
    </section>` : ''}
    <section class="feedback" hidden aria-label="Export result">
      <p class="status" role="status" aria-live="polite"></p>
      <p class="metrics" aria-live="polite"></p>
    </section>
    <footer class="help"><span>New here?</span> <a id="guide-link" target="_blank" rel="noopener">View the quick guide</a> · <a id="license-link" href="/license.html" target="_blank" rel="noopener">License</a></footer>

  </main>
`;

const compression = document.querySelector<HTMLInputElement>('#compression')!;
const semanticTextFormat = document.querySelector<HTMLInputElement>('#format-semantic-text')!;
const markdownFormat = document.querySelector<HTMLInputElement>('#format-markdown')!;
const copyButton = document.querySelector<HTMLButtonElement>('.primary-action')!;
const saveButton = document.querySelector<HTMLButtonElement>('.secondary-action')!;
const previewButton = document.querySelector<HTMLButtonElement>('#preview')!;
const selectElementButton = document.querySelector<HTMLButtonElement>('#select-element')!;
const customizeButton = document.querySelector<HTMLButtonElement>('#customize')!;
const firefox = import.meta.env.BROWSER === 'firefox';
let canSave = !firefox && typeof browser.downloads?.download === 'function';
function updateSaveAvailability(): void {
  saveButton.disabled = exportPending || !canSave;
  saveButton.textContent = canSave ? 'Save to file' : 'Save unavailable';
  saveButton.title = canSave && firefox
    ? 'Firefox asks for download permission the first time you save a file.'
    : canSave ? '' : 'Saving files is unavailable in this browser. Use Copy page context.';
  applyPolicyControls();
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
  saveSettingsButton, copyButton, saveButton, previewButton, selectElementButton, customizeButton,
];

let policySnapshot: PolicySnapshot | undefined;
let personalSettings: StoredPopupSettings = {};
let policyGeneration = 0;
let policyLoadFailed = false;

function applyPolicyControls(): void {
  if (!policySnapshot) { for (const control of controls) control.disabled = true; return; }
  const p = policySnapshot.policy;
  const busy = exportPending || !!frameAccessToggle?.pending;
  for (const control of controls) { control.disabled = busy; control.title = ''; control.ariaDescription = null; }
  const blocked = (control: HTMLInputElement | HTMLButtonElement, disabled: boolean, reason: string) => {
    control.disabled ||= disabled;
    if (disabled) { control.title = reason; control.ariaDescription = reason; }
  };
  const unavailable = !formats(p).length || !levels(p).length || p.FileExportAllowed === false && p.ClipboardExportAllowed === false;
  blocked(copyButton, unavailable || p.ClipboardExportAllowed === false, 'Copying is disabled by your administrator.');
  blocked(saveButton, unavailable || !canSave || p.FileExportAllowed === false, p.FileExportAllowed === false ? 'File export is disabled by your administrator.' : 'Saving files is unavailable.');
  blocked(previewButton, unavailable || p.PreviewAllowed === false, p.PreviewAllowed === false ? 'Preview is disabled by your administrator.' : 'Export is disabled by your administrator.');
  blocked(customizeButton, p.FilterSettingsAllowed === false, 'Filter settings are disabled by your administrator.');
  blocked(selectElementButton, unavailable || p.ElementPickerAllowed === false, 'Element selection is disabled by your administrator.');
  blocked(compression, !!p.ForcedCompression || levels(p).length <= 1, 'Compression is managed by your organization.');
  blocked(semanticTextFormat, !!p.ForcedExportFormat || !formats(p).includes('semantic-text') || formats(p).length <= 1, 'Export format is managed by your organization.');
  blocked(markdownFormat, !!p.ForcedExportFormat || !formats(p).includes('markdown') || formats(p).length <= 1, 'Export format is managed by your organization.');
  blocked(redactSensitiveData, redactionMode(p) !== 'user-controlled', 'Redaction is managed by your organization.');
  const editable = (!p.ForcedCompression && levels(p).length > 1) || (!p.ForcedExportFormat && formats(p).length > 1) || redactionMode(p) === 'user-controlled';
  blocked(saveSettingsButton, p.UserPreferencesSaveAllowed === false || !editable, 'Saving preferences is managed by your organization.');
}
async function refreshPolicy(): Promise<void> {
  const generation = ++policyGeneration;
  try {
    const snapshot = await readPolicy();
    if (generation !== policyGeneration) return;
    policySnapshot = snapshot;
    if (policyLoadFailed) showFeedback('Organization policies loaded. Try your action again.');
    policyLoadFailed = false;
    const note = document.querySelector<HTMLElement>('#organization-policy');
    if (note) { note.hidden = !snapshot.revision; note.textContent = snapshot.revision ? 'Managed by your organization · Policy version 1' : ''; }
    const retry = document.querySelector<HTMLElement>('#retry-policy'); if (retry) retry.hidden = true;
    if (formats(snapshot.policy).length && levels(snapshot.policy).length) {
      const effective = resolvePreferences(snapshot.policy, personalSettings);
      compression.value = String(COMPRESSION_VALUES.indexOf(effective.compression));
      semanticTextFormat.checked = effective.format === 'semantic-text'; markdownFormat.checked = effective.format === 'markdown';
      redactSensitiveData.checked = effective.redactSensitiveData;
      updateCompressionDescription();
    }
    applyPolicyControls();
  } catch (error) {
    if (generation !== policyGeneration) return;
    policySnapshot = undefined; policyLoadFailed = true; applyPolicyControls(); showFeedback(policyMessage(error));
    const retry = document.querySelector<HTMLElement>('#retry-policy'); if (retry) retry.hidden = false;
  }
}
function rememberSelection(): void {
  if (!policySnapshot) return;
  const p = policySnapshot.policy;
  if (!p.ForcedCompression && levels(p).length > 1) personalSettings.compression = selectedRangeCompression(compression.value);
  if (!p.ForcedExportFormat && formats(p).length > 1) personalSettings.format = selectedFormat(markdownFormat.checked ? 'markdown' : 'semantic-text');
  if (redactionMode(p) === 'user-controlled') personalSettings.redactSensitiveData = redactSensitiveData.checked;
  const effective = resolvePreferences(p, personalSettings);
  compression.value = String(COMPRESSION_VALUES.indexOf(effective.compression)); updateCompressionDescription();
}
for (const control of [compression, semanticTextFormat, markdownFormat, redactSensitiveData]) control.addEventListener('change', rememberSelection);

const COMPRESSION_VALUES: readonly CompressionLevel[] = ['without', 'detailed', 'compact', 'maximum'];

guideLink.href = browser.runtime.getURL('/guide.html');
const licenseLink = document.querySelector<HTMLAnchorElement>('#license-link')!;
licenseLink.href = browser.runtime.getURL('/license.html');
for (const [link, path] of [[guideLink, '/guide.html'], [licenseLink, '/license.html']] as const) {
  link.addEventListener('click', event => {
    event.preventDefault();
    void browser.tabs.create({ url: browser.runtime.getURL(path), active: true })
      .then(() => window.close())
      .catch(() => showFeedback('Unable to open this page. Try again.'));
  });
}

function selectedRangeCompression(value: string): CompressionLevel {
  const index = Number.parseInt(value, 10);
  return COMPRESSION_VALUES[index] ?? DEFAULT_COMPRESSION_LEVEL;
}

function updateCompressionDescription(): void {
  const descriptions: Record<CompressionLevel, string> = {
    without: 'Keeps every captured semantic node.',
    detailed: 'Removes unnamed wrappers without semantic attributes, preserving text, links and states.',
    compact: 'Removes repeated accessibility noise while retaining meaningful controls.',
    maximum: 'Packs Compact context with selective abbreviations and reusable shared structures when they save space.',
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
    personalSettings = settings ?? {};
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
    const { policy } = await readPolicy();
    if (policy.UserPreferencesSaveAllowed === false) throw new PolicyError('Saving preferences is disabled by your administrator.');
    const previous = await browser.storage.local.get(POPUP_SETTINGS_KEY);
    const saved = { ...readSettings(previous[POPUP_SETTINGS_KEY]) };
    if (!policy.ForcedCompression && levels(policy).length > 1) saved.compression = settings.compression;
    if (!policy.ForcedExportFormat && formats(policy).length > 1) saved.format = settings.format;
    if (redactionMode(policy) === 'user-controlled') saved.redactSensitiveData = settings.redactSensitiveData;
    await browser.storage.local.set({ [POPUP_SETTINGS_KEY]: saved });
    personalSettings = saved;
    showFeedback('Settings saved for future popup openings.');
  } catch (error) {
    showFeedback(error instanceof PolicyError ? policyMessage(error) : 'Unable to save settings. Try again.');
  }
}

function showFeedback(message: string): void {
  status.textContent = message;
  feedback.hidden = false;
}

function setPending(pending: boolean, action?: ExportAction): void {
  for (const control of controls) control.disabled = pending;
  saveButton.disabled = pending || !canSave;
  applyPolicyControls();
  if (pending) {
    metrics.textContent = '';
    showFeedback(action === 'preview' ? 'Preparing preview…' : action === 'copy' ? 'Capturing and copying page context…' : 'Capturing and preparing download…');
  }
}

let exportPending = false;
let frameAccessToggle: FrameAccessToggle | undefined;
const otherSiteFrames = firefox ? document.querySelector<HTMLInputElement>('#include-other-site-frames') : null;
if (otherSiteFrames) frameAccessToggle = installFrameAccessToggle(otherSiteFrames, showFeedback, pending => {
  for (const control of controls) control.disabled = pending || exportPending;
  saveButton.disabled = pending || exportPending || !canSave;
  applyPolicyControls();
});

async function exportPageContext(action: ExportAction): Promise<void> {
  if (action === 'save' && !canSave) {
    showFeedback('Saving files is unavailable in this browser. Use Copy page context.');
    return;
  }
  if (exportPending || frameAccessToggle?.pending) return;
  try {
    if (!policySnapshot) throw new PolicyError('Organization policies are not ready. Retry loading them.');
    assertAction(policySnapshot.policy, action);
  } catch (error) { showFeedback(policyMessage(error)); return; }
  exportPending = true;
  frameAccessToggle?.setPending(true);
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
    const context = { ...request, policyRevision: policySnapshot?.revision };
    await checkPolicy(action, context);
    const response = await browser.runtime.sendMessage(request);
    if (!isCaptureActiveTabResponse(response)) {
      showFeedback(ERROR_MESSAGES['capture-failed']!);
      return;
    }
    if (!response.ok) {
      showFeedback(response.error.code === 'policy-blocked' ? response.error.message : ERROR_MESSAGES[response.error.code] ?? ERROR_MESSAGES['capture-failed']!);
      return;
    }

    context.policyRevision = response.policyRevision;
    await checkPolicy(action, context);
    const result = response.export;
    let characterCount = result.characterCount;
    let approximateTokenCount = result.approximateTokenCount;
    destinationStarted = true;
    if (action === 'preview') {
      await openPreview({
        policyRevision: response.policyRevision, content: result.serialized.content, compression: request.compression, format: exportFormat,
        redactSensitiveData: request.redactSensitiveData, redactionCount: result.redactionCount,
        reductionRatio: result.reductionRatio,
        warnings: response.warnings ?? [],
      });
      showFeedback('Preview opened. Nothing has been copied.');
      window.close();
      return;
    }
    if (action === 'copy') {
      const content = wrapClipboardContext(result.serialized.content, request.compression);
      await navigator.clipboard.writeText(content);
      characterCount = content.length;
      approximateTokenCount = Math.ceil(characterCount / 4);
      showFeedback(`Copied ${FORMAT_LABELS[exportFormat]}.`);
    } else {
      await saveContext(result.serialized.content, exportFormat, context);
      showFeedback(firefox ? 'Saving file in a separate tab.' : `Saved ${FORMAT_LABELS[exportFormat]} file.`);
    }
    const warnings = captureWarningText(response.warnings ?? []);
    metrics.textContent = formatMetrics(
      characterCount,
      approximateTokenCount,
      result.reductionRatio,
      result.redactionCount,
      action,
    ) + (warnings ? ` ${warnings}` : '');
  } catch (error) {
    showFeedback(error instanceof PolicyError ? policyMessage(error) : ERROR_MESSAGES[
      destinationStarted ? (action === 'preview' ? 'preview-failed' : action === 'copy' ? 'copy-failed' : 'save-failed') : 'capture-failed'
    ]!);
  } finally {
    exportPending = false;
    frameAccessToggle?.setPending(false);
    setPending(false);
  }
}

customizeButton.addEventListener('click', () => {
  if (exportPending || frameAccessToggle?.pending) return;
  void (async () => {
    try {
      await checkPolicy('customize');
      await browser.tabs.create({ url: browser.runtime.getURL('/filters.html'), active: true });
      window.close();
    } catch (error) { showFeedback(error instanceof PolicyError ? policyMessage(error) : 'Unable to open filter settings. Try again.'); }
  })();
});
previewButton.addEventListener('click', () => void exportPageContext('preview'));
selectElementButton.addEventListener('click', async () => {
  if (exportPending || frameAccessToggle?.pending) return;
  exportPending = true; setPending(true); frameAccessToggle?.setPending(true);
  showFeedback('Starting element selection…');
  try {
    if (!policySnapshot) throw new PolicyError('Organization policies are not ready. Retry loading them.');
    await checkPolicy('picker', { compression: selectedRangeCompression(compression.value), format: selectedFormat(markdownFormat.checked ? 'markdown' : 'semantic-text'), redactSensitiveData: redactSensitiveData.checked, policyRevision: policySnapshot.revision });
    const response = await browser.runtime.sendMessage({ type: PICKER_START,
      compression: selectedRangeCompression(compression.value),
      format: selectedFormat(markdownFormat.checked ? 'markdown' : 'semantic-text'),
      redactSensitiveData: redactSensitiveData.checked,
    });
    if (response?.ok === true) window.close();
    else showFeedback(typeof response?.error?.message === 'string' ? response.error.message : 'Unable to start element selection. Try again.');
  } catch (error) { showFeedback(error instanceof PolicyError ? policyMessage(error) : 'Unable to start element selection. Try again.'); }
  finally { exportPending = false; frameAccessToggle?.setPending(false); setPending(false); }
});
copyButton.addEventListener('click', () => void exportPageContext('copy'));
saveButton.addEventListener('click', () => void exportPageContext('save'));
compression.addEventListener('input', () => { rememberSelection(); updateCompressionDescription(); });
saveSettingsButton.addEventListener('click', () => {
  void saveSettings();
});
updateCompressionDescription();
setPending(false);
void loadSettings().then(refreshPolicy);
const stopPolicy = watchPolicy(() => { policySnapshot = undefined; applyPolicyControls(); void refreshPolicy(); });
window.addEventListener('pagehide', stopPolicy, { once: true });
document.querySelector('#retry-policy')?.addEventListener('click', () => void refreshPolicy());

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
    selectElementButton.hidden = android;
    canSave = !android && ['mac', 'win', 'linux', 'cros', 'openbsd'].includes(platform?.os ?? '')
      && typeof browser.permissions?.request === 'function';
  } catch {
    // Copy remains available if local platform detection fails.
    document.body.dataset.platform = /Android/u.test(navigator.userAgent) ? 'android' : 'desktop';
    selectElementButton.hidden = document.body.dataset.platform === 'android';
  } finally {
    clearTimeout(timer);
    updateSaveAvailability();
  }
}
void initializeFirefoxPlatform();
