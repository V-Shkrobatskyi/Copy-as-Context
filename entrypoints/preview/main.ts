// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import './style.css';
import { checkPolicy, watchPolicy, policyMessage, type PolicyContext, type PolicySnapshot } from '@/src/policy/runtime';
import { redactionMode, PolicyError } from '@/src/policy/model';
import { browser } from 'wxt/browser';
import { wrapClipboardContext } from '@/src/clipboard-context';
import { captureWarningText, isPreviewToken, MAX_PREVIEW_CHARACTERS, type PreviewPayload } from '@/src/preview-message';
import { receivePreview } from '@/src/preview-session';
import { saveContextFile } from '@/src/save-context';
import { setupFindReplace } from '@/src/preview-find-replace';

const editor = document.querySelector<HTMLTextAreaElement>('#context')!;
const panel = document.querySelector<HTMLElement>('#editor-panel')!;
const status = document.querySelector<HTMLElement>('#status')!;
const metrics = document.querySelector<HTMLElement>('#metrics')!;
const edited = document.querySelector<HTMLElement>('#edited')!;
const copy = document.querySelector<HTMLButtonElement>('#copy')!;
const save = document.querySelector<HTMLButtonElement>('#save')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
let policyContext: PolicyContext | undefined;
let policySnapshot: PolicySnapshot | undefined;
let policyReady = false;
let policyGeneration = 0;
let original: string | undefined;
let compression: PreviewPayload['compression'] = 'compact';
let format: PreviewPayload['format'] = 'semantic-text';
let reductionRatio: PreviewPayload['reductionRatio'] = null;
const firefox = import.meta.env.BROWSER === 'firefox';
let canSave = !firefox && typeof browser.downloads?.download === 'function';
let pending = false;
let leaving = false;
let metricTimer: ReturnType<typeof setTimeout> | undefined;
let stopReceiving: (() => void) | undefined;
const findReplace = setupFindReplace(editor, () => original !== undefined && !pending && policyReady && !!policySnapshot && redactionMode(policySnapshot.policy) !== 'force-on');

function dirty(): boolean { return original !== undefined && editor.value !== original; }

function update(): void {
  const length = editor.value.length;
  const changed = dirty();
  edited.hidden = !changed;
  const locked = !policyReady || !!policySnapshot && redactionMode(policySnapshot.policy) === 'force-on';
  editor.readOnly = pending || locked;
  reset.disabled = pending || locked || !changed;
  copy.disabled = !policyReady || policySnapshot?.policy.ClipboardExportAllowed === false || pending || !editor.value.trim() || length > MAX_PREVIEW_CHARACTERS;
  save.disabled = !policyReady || policySnapshot?.policy.FileExportAllowed === false || !canSave || pending || !editor.value.trim() || length > MAX_PREVIEW_CHARACTERS;
  save.textContent = canSave ? 'Save to file' : 'Save unavailable';
  save.title = policySnapshot?.policy.FileExportAllowed === false ? 'File export is disabled by your administrator.' : canSave ? '' : 'Saving files is unavailable in this browser. Use Copy.';
  copy.title = policySnapshot?.policy.ClipboardExportAllowed === false ? 'Copying is disabled by your administrator.' : '';
  copy.ariaDescription = copy.title || null; save.ariaDescription = save.title || null;
  editor.ariaDescription = locked ? 'This preview is read-only while organization policies are loading or require redaction.' : null;
  findReplace.refresh();
  const copiedLength = wrapClipboardContext(editor.value, compression).length;
  metrics.textContent = `${copiedLength} characters to copy · ~${Math.ceil(copiedLength / 4)} tokens (including boundaries). ` +
    `File/editor: ${length} characters · ~${Math.ceil(length / 4)} tokens (without boundaries).` +
    (length > MAX_PREVIEW_CHARACTERS ? ` Text exceeds the ${MAX_PREVIEW_CHARACTERS.toLocaleString('en-US')}-character limit. Remove text before copying or saving.` : '');
  document.querySelector('#compression-metrics')!.textContent = reductionRatio === null
    ? 'Original context: compression reduction unavailable.'
    : `Original context: ${Math.round(reductionRatio * 100)}% smaller than Without (before manual edits; boundaries excluded).`;
}

async function refreshPolicy(): Promise<void> {
  const generation = ++policyGeneration;
  policyReady = false; update();
  try {
    const snapshot = await checkPolicy('preview', policyContext);
    if (generation !== policyGeneration || !policyContext) return;
    panel.hidden = false; document.querySelector<HTMLElement>('#editor-actions')!.hidden = false; reset.hidden = false;
    policySnapshot = snapshot; policyReady = true;
    const retry = document.querySelector<HTMLElement>('#retry-policy'); if (retry) retry.hidden = true;
    status.textContent = 'Preview ready. Nothing has been copied.';
    const note = document.querySelector<HTMLElement>('#organization-policy');
    if (note) {
      note.hidden = !snapshot.revision;
      note.textContent = snapshot.revision ? (redactionMode(snapshot.policy) === 'force-on' ? 'Managed by your organization. Required redaction makes this preview read-only.' : 'Managed by your organization') : '';
    }
    if (redactionMode(snapshot.policy) === 'force-on' && original !== undefined) editor.value = original;
    update();
  } catch (error) {
    if (generation === policyGeneration) {
      panel.hidden = true; document.querySelector<HTMLElement>('#editor-actions')!.hidden = true; reset.hidden = true;
      status.textContent = policyMessage(error);
      const retry = document.querySelector<HTMLElement>('#retry-policy'); if (retry) retry.hidden = false;
      update();
    }
  }
}
const stopPolicy = watchPolicy(() => { policyReady = false; update(); void refreshPolicy(); });
document.querySelector('#retry-policy')?.addEventListener('click', () => void refreshPolicy());
function accept(payload: PreviewPayload): void {
  policyContext = { format: payload.format, compression: payload.compression, redactSensitiveData: payload.redactSensitiveData, policyRevision: payload.policyRevision };
  if (payload.scope === 'selection') {
    document.querySelector('h1')!.textContent = 'Selected element context';
    document.title = 'Selected element context — Copy as Context';
  }
  original = payload.content;
  compression = payload.compression;
  format = payload.format;
  reductionRatio = payload.reductionRatio;
  editor.value = original;
  // The initial transfer may fill the entire budget; user edits are checked without truncation.
  const formatLabel = payload.format === 'markdown' ? 'Markdown' : 'Semantic Text';
  const level = compression[0]!.toUpperCase() + compression.slice(1);
  document.querySelector('#settings')!.textContent = `${formatLabel} · ${level} · Redaction ${payload.redactSensitiveData ? 'on' : 'off'} · ${payload.redactionCount} automatic redaction${payload.redactionCount === 1 ? '' : 's'} in the original export.`;
  const warnings = document.querySelector<HTMLElement>('#warnings')!;
  warnings.textContent = captureWarningText(payload.warnings);
  warnings.hidden = !warnings.textContent;
  document.querySelector<HTMLElement>('#maximum-note')!.hidden = compression !== 'maximum';
  panel.hidden = true;
  document.querySelector<HTMLElement>('#editor-actions')!.hidden = true;
  reset.hidden = true;
  status.textContent = 'Preview ready. Nothing has been copied.';
  update();
  void refreshPolicy();
}

editor.addEventListener('input', () => {
  status.textContent = '';
  // Dirty state must be current even if the tab is closed before debounced metrics update.
  edited.hidden = !dirty();
  reset.disabled = pending || !dirty();
  clearTimeout(metricTimer);
  metricTimer = setTimeout(update, 120);
});

copy.addEventListener('click', () => {
  if (pending || !policyReady || original === undefined) return;
  const content = editor.value;
  if (!content.trim()) { status.textContent = 'Enter some context before copying.'; update(); return; }
  if (content.length > MAX_PREVIEW_CHARACTERS) { status.textContent = 'The context is too large. Remove text before copying.'; update(); return; }
  const changed = content !== original;
  const wrapped = wrapClipboardContext(content, compression);
  pending = true;
  editor.readOnly = true;
  update();
  status.textContent = 'Copying…';
  // Recheck current policy before handing content to the clipboard.
  void (async () => {
    try {
      const snapshot = await checkPolicy('copy', policyContext);
      if (redactionMode(snapshot.policy) === 'force-on' && content !== original) throw new PolicyError('Required redaction makes this preview read-only. Prepare the context again.');
      await navigator.clipboard.writeText(wrapped);
      status.textContent = `${changed ? 'Copied edited context.' : 'Copied page context.'} ${wrapped.length} characters copied · ~${Math.ceil(wrapped.length / 4)} tokens (including boundaries).`;
    } catch (error) {
      status.textContent = error instanceof PolicyError ? policyMessage(error) : 'Unable to copy the page context. Check browser clipboard access and try again.';
    } finally {
      pending = false;
      editor.readOnly = false;
      update();
    }
  })();
});

save.addEventListener('click', () => {
  if (pending || !policyReady || !canSave || original === undefined) return;
  const content = editor.value;
  if (!content.trim() || content.length > MAX_PREVIEW_CHARACTERS) { update(); return; }
  const changed = content !== original;
  pending = true;
  editor.readOnly = true;
  update();
  status.textContent = 'Saving…';
  void (async () => {
    try {
      // Request permission within the click gesture; the editor remains open for the picker.
      if (firefox && !await browser.permissions.request({ permissions: ['downloads'] })) {
        status.textContent = 'Download permission was not granted. Use Copy or try Save again.';
        return;
      }
      const snapshot = await checkPolicy('save', policyContext);
      if (redactionMode(snapshot.policy) === 'force-on' && content !== original) throw new PolicyError('Required redaction makes this preview read-only. Prepare the context again.');
      await saveContextFile(content, format, undefined, policyContext);
      status.textContent = `${changed ? 'Saved edited context.' : 'Saved page context.'} ${content.length} characters saved · ~${Math.ceil(content.length / 4)} tokens (without boundaries).`;
    } catch (error) {
      status.textContent = error instanceof PolicyError ? policyMessage(error) : 'Unable to save the file, or saving was cancelled. Your edits are still here. Try Save again.';
    } finally {
      pending = false;
      editor.readOnly = false;
      update();
    }
  })();
});

reset.addEventListener('click', () => {
  if (pending || !policyReady || editor.readOnly || original === undefined || !dirty() || !window.confirm('Discard your edits?')) return;
  editor.value = original;
  status.textContent = 'Original context restored.';
  update();
});

document.querySelector('#close')!.addEventListener('click', () => {
  if (dirty() && !window.confirm('Discard your edits and close this tab?')) return;
  leaving = true;
  void browser.tabs.getCurrent().then(tab => tab?.id === undefined ? undefined : browser.tabs.remove(tab.id))
    .catch(() => { leaving = false; status.textContent = 'Unable to close this tab. Close it using your browser.'; });
});

window.addEventListener('beforeunload', event => {
  if (!leaving && dirty()) { event.preventDefault(); event.returnValue = ''; }
});

function unavailable(): void {
  status.textContent = 'No preview was received. Open the extension on the page you want to capture and choose Preview again. Reloading this tab cannot restore a draft.';
}
const token = location.hash.slice(1);
if (isPreviewToken(token)) stopReceiving = receivePreview(token, accept, unavailable);
else unavailable();
void refreshPolicy();

async function initializeSaving(): Promise<void> {
  if (!firefox) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const platform = await Promise.race([
      browser.runtime.getPlatformInfo(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 1000); }),
    ]);
    canSave = !/Android/u.test(navigator.userAgent) && ['mac', 'win', 'linux', 'cros', 'openbsd'].includes(platform?.os ?? '') &&
      typeof browser.permissions?.request === 'function';
  } catch { canSave = false; }
  finally { clearTimeout(timer); if (original !== undefined) update(); }
}
void initializeSaving();

window.addEventListener('pagehide', () => {
  stopPolicy(); policyGeneration++; policyReady = false; policyContext = undefined;
  stopReceiving?.();
  clearTimeout(metricTimer);
  original = undefined;
  editor.value = '';
  findReplace.clear();
  findReplace.dispose();
  panel.hidden = true;
  document.querySelector<HTMLElement>('#editor-actions')!.hidden = true;
  reset.hidden = true;
});
window.addEventListener('pageshow', event => { if (event.persisted) unavailable(); });
