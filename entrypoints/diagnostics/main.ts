// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import './style.css';
import { browser } from 'wxt/browser';
import { checkPolicy, watchPolicy } from '@/src/policy/runtime';
import { downloadBlob } from '@/src/save-context';
import type { HistorySettings } from '@/src/history/model';
import type { DataControls } from '@/src/core/data-controls';
import { validateSourceSettings } from '@/src/policy/sources';
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = get('status');
const includeLog = get<HTMLInputElement>('include-log');
const title = get<HTMLInputElement>('include-title');
const values = get<HTMLInputElement>('include-values');
const page = get<HTMLSelectElement>('page-url');
const links = get<HTMLSelectElement>('link-urls');
const level = get<HTMLSelectElement>('level');
let text = '';
let generation = 0;
let saving = false;
const request = async (action: string, data: object = {}) => {
  const result = await browser.runtime.sendMessage({ type: 'diagnostics', action, ...data });
  if (!result?.ok) throw new Error('Unable to complete this operation. Settings may be managed or storage unavailable.');
  return result;
};
async function refresh() {
  const ticket = ++generation;
  try {
    const r = await request('read', { includeLog: includeLog.checked });
    if (ticket !== generation) return;
    text = JSON.stringify(r.report, null, 2); get('report').textContent = text;
    title.checked = r.personal.includeTitle; values.checked = r.personal.includeFormValues; page.value = r.personal.pageUrl; links.value = r.personal.linkUrls;
    get('effective').textContent = JSON.stringify({ effective: r.data, source: r.sources }, null, 2);
    for (const control of [title, values, page, links, get<HTMLButtonElement>('save-data')]) control.disabled = !r.preferencesAllowed;
    level.value = r.log?.effectiveLevel ?? 'error'; level.disabled = !r.log || r.log.managed || !r.preferencesAllowed;
    get<HTMLButtonElement>('clear').disabled = r.log?.clearAllowed !== true;
    get('journal-clear-note').hidden = r.log?.clearAllowed !== false;
    get('journal-clear-note').textContent = r.log?.clearAllowed === false ? 'Technical journal retention is managed by your organization.' : '';
    get('usage').textContent = r.log ? `${r.log.events.length} events · ${r.log.bytes} bytes · limits: ${r.log.limits.events} events, ${r.log.limits.bytes} bytes, ${r.log.limits.ageHours} hours${r.log.debugUntil ? ` · Personal Debug expires ${new Date(r.log.debugUntil).toLocaleString()}` : ''}` : 'Journal storage is unavailable.';
    get('journal').textContent = r.log ? r.log.events.map((e: { time: number }) => `${new Date(e.time).toLocaleString()} ${JSON.stringify(e)}`).join('\n') || 'No events.' : 'Unavailable';
    get<HTMLButtonElement>('copy').disabled = !r.copyAllowed;
    get<HTMLButtonElement>('save').disabled = !r.saveAllowed || !r.report.capabilities.downloads || r.report.platform === 'android';
    get<HTMLButtonElement>('history-copy').disabled = !r.copyAllowed;
    get<HTMLButtonElement>('history-save').disabled = !r.saveAllowed || !r.report.capabilities.downloads || r.report.platform === 'android';
    status.textContent = r.report.policyState === 'error' ? 'Policies or data settings could not be loaded. Export remains blocked.' : 'Diagnostics ready. Nothing has been exported.';
  } catch { get<HTMLButtonElement>('clear').disabled = true; status.textContent = 'Unable to load diagnostics. Retry Refresh.'; }
}
async function act(action: () => Promise<void>) {
  if (saving) return; saving = true;
  try { await action(); } catch { status.textContent = 'Unable to complete this operation. Check organization restrictions and browser permissions, then retry.'; }
  finally { saving = false; }
}
get('data-form').addEventListener('submit', e => { e.preventDefault(); void act(async () => {
  const data: DataControls = { includeTitle: title.checked, includeFormValues: values.checked, pageUrl: page.value as DataControls['pageUrl'], linkUrls: links.value as DataControls['linkUrls'] };
  await request('data', { data }); await refresh(); status.textContent = 'Personal data settings saved. Prepare context again to apply them.';
}); });
level.addEventListener('change', () => void act(async () => { await request('level', { level: level.value }); await refresh(); }));
get('clear').addEventListener('click', () => void act(async () => { await request('clear'); await refresh(); status.textContent = 'Local journal cleared.'; }));
get('refresh').addEventListener('click', () => void refresh());
includeLog.addEventListener('change', () => { text = ''; get('report').textContent = 'Refreshing report…'; void refresh(); });
get('copy').addEventListener('click', () => void act(async () => { if (!text) return; await checkPolicy('diagnostics-copy'); await navigator.clipboard.writeText(text); status.textContent = 'Diagnostic JSON report copied.'; }));
get('save').addEventListener('click', () => void act(async () => {
  if (!text) return;
  if (import.meta.env.BROWSER === 'firefox' && !await browser.permissions.request({ permissions: ['downloads'] })) throw new Error();
  await checkPolicy('diagnostics-save');
  await downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), 'copy-as-context-diagnostics.json'); status.textContent = 'Diagnostic JSON report saved.';
}));
const stop = watchPolicy(() => { get<HTMLButtonElement>('clear').disabled = true; text = ''; get('report').textContent = ''; void refresh(); });
window.addEventListener('pagehide', () => { generation++; stop(); text = ''; });
void refresh();

let historyGeneration = 0;
async function refreshHistory() {
  const ticket = ++historyGeneration;
  try {
    const { history: h } = await request('history-read');
    if (ticket !== historyGeneration) return;
    get<HTMLInputElement>('history-enabled').checked = h.settings.enabled;
    get<HTMLInputElement>('history-days').value = String(h.settings.retentionDays);
    get<HTMLInputElement>('history-size').value = String(h.settings.maxMiB);
    for (const [id, key] of [['history-enabled', 'enabled'], ['history-days', 'retentionDays'], ['history-size', 'maxMiB']] as const) get<HTMLInputElement>(id).disabled = h.locked || h.managed[key];
    get<HTMLButtonElement>('save-history-settings').disabled = h.locked || Object.values(h.managed).every(Boolean);
    get<HTMLButtonElement>('history-clear').disabled = h.clearAllowed !== true;
    get('history-clear-note').hidden = h.clearAllowed !== false;
    get('history-clear-note').textContent = h.clearAllowed === false ? 'History retention is managed by your organization.' : '';
    get('history-status').textContent = `${h.settings.enabled ? 'Recording enabled' : 'Recording off'} · ${h.count} captures · ${h.bytes} bytes · ${h.settings.retentionDays} days / ${h.settings.maxMiB} MiB${h.locked || Object.values(h.managed).some(Boolean) ? ' · Settings managed by your organization.' : ''}`;
    const list = get('history-entries'); list.replaceChildren();
    for (const entry of h.entries) {
      const block = document.createElement('pre'); block.className = 'history-entry';
      block.textContent = `${new Date(entry.time).toLocaleString()} · ${entry.scope === 'selection' ? 'Selected element' : 'Page'}\n${JSON.stringify(entry, null, 2)}`;
      list.append(block);
    }
    if (!h.entries.length) list.textContent = 'No capture history.';
  } catch { get<HTMLButtonElement>('history-clear').disabled = true; get('history-status').textContent = 'Capture history is unavailable. Check policy and storage, then refresh.'; }
}
get('history-form').addEventListener('submit', event => { event.preventDefault(); void act(async () => {
  const settings: HistorySettings = { enabled: get<HTMLInputElement>('history-enabled').checked, retentionDays: Number(get<HTMLInputElement>('history-days').value), maxMiB: Number(get<HTMLInputElement>('history-size').value) };
  await request('history-settings', { settings }); await refreshHistory();
}); });
get('history-refresh').addEventListener('click', () => void refreshHistory());
get('history-clear').addEventListener('click', () => { if (window.confirm('Clear all local capture history? This cannot be undone.')) void act(async () => { await request('history-clear'); await refreshHistory(); }); });
get('history-copy').addEventListener('click', () => void act(async () => { const r = await request('history-export', { destination: 'copy' }); await checkPolicy('diagnostics-copy'); await navigator.clipboard.writeText(r.json); get('history-status').textContent = 'Capture history JSON copied.'; }));
get('history-save').addEventListener('click', () => void act(async () => {
  if (import.meta.env.BROWSER === 'firefox' && !await browser.permissions.request({ permissions: ['downloads'] })) throw new Error();
  const r = await request('history-export', { destination: 'save' }); await checkPolicy('diagnostics-save');
  await downloadBlob(new Blob([r.json], { type: 'application/json;charset=utf-8' }), 'copy-as-context-capture-history.json'); get('history-status').textContent = 'Capture history JSON saved.';
}));
const stopHistory = watchPolicy(() => { get<HTMLButtonElement>('history-clear').disabled = true; get('history-entries').replaceChildren(); void refreshHistory(); });
window.addEventListener('pagehide', () => { historyGeneration++; stopHistory(); get('history-entries').replaceChildren(); });
void refreshHistory();

const sourceAllowlist = get<HTMLInputElement>('sources-allowlist');
const sourceAllowed = get<HTMLTextAreaElement>('sources-allowed');
const sourceBlocked = get<HTMLTextAreaElement>('sources-blocked');
const sourceSave = get<HTMLButtonElement>('save-sources');
let sourceGeneration = 0;
let sourcePreferencesAllowed = false;
const sourceLines = (value: string) => value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
function updateSourceControls() {
  sourceAllowlist.disabled = sourceBlocked.disabled = sourceSave.disabled = !sourcePreferencesAllowed;
  sourceAllowed.disabled = !sourcePreferencesAllowed || !sourceAllowlist.checked;
  get('sources-warning').hidden = !sourceAllowlist.checked || sourceLines(sourceAllowed.value).length > 0;
}
async function refreshSources() {
  const ticket = ++sourceGeneration;
  sourcePreferencesAllowed = false; updateSourceControls();
  try {
    const result = await request('sources-read');
    if (ticket !== sourceGeneration) return;
    sourceAllowlist.checked = result.settings.allowlistEnabled;
    sourceAllowed.value = result.settings.allowed.join('\n'); sourceBlocked.value = result.settings.blocked.join('\n');
    sourcePreferencesAllowed = result.preferencesAllowed; updateSourceControls();
    const org = result.organization;
    get('sources-organization').textContent = org.allowlistEnabled || org.blockedCount ? `Organization restrictions also apply: ${org.allowlistEnabled ? `allowed list with ${org.allowedCount} patterns` : 'no allowed list'}, ${org.blockedCount} blocked patterns. Personal settings cannot permit a site blocked by your organization.` : 'No organization site restrictions.';
    get('sources-status').textContent = !result.available ? 'Saved site settings could not be loaded. Capture remains blocked. Saving valid settings replaces them.' : !sourcePreferencesAllowed ? 'Saving personal site settings is disabled by your organization.' : 'Personal site settings loaded. With no restrictions, eligible sites remain available.';
  } catch { if (ticket === sourceGeneration) get('sources-status').textContent = 'Unable to load site settings. Reload this page to retry.'; }
}
sourceAllowlist.addEventListener('change', updateSourceControls);
sourceAllowed.addEventListener('input', updateSourceControls);
get('sources-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!sourcePreferencesAllowed) return;
  let settings;
  try { settings = validateSourceSettings({ allowlistEnabled: sourceAllowlist.checked, allowed: sourceLines(sourceAllowed.value), blocked: sourceLines(sourceBlocked.value) }); }
  catch { get('sources-status').textContent = 'Invalid site settings. Use up to 500 origin patterns per list, without paths or query strings. See the examples below.'; return; }
  void act(async () => {
    await request('sources-save', { settings }); await refreshSources();
    get('sources-status').textContent = 'Personal site settings saved. Prepare context again to apply them.';
  });
});
const stopSources = watchPolicy(() => { void refreshSources(); });
window.addEventListener('pagehide', () => { sourceGeneration++; stopSources(); sourceAllowed.value = ''; sourceBlocked.value = ''; });
void refreshSources();
