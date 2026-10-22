// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ api: {} as any, clearHistory: true, clearLog: true, check: vi.fn(), stop: vi.fn(), download: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: mocks.api }));
vi.mock('@/src/policy/runtime', () => ({ checkPolicy: mocks.check, watchPolicy: () => mocks.stop }));
vi.mock('@/src/save-context', () => ({ downloadBlob: mocks.download }));
let dom: JSDOM;
const defaults = { includeTitle: true, includeFormValues: true, pageUrl: 'full', linkUrls: 'full' };
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
let clipboard: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.resetModules(); mocks.clearHistory = true; mocks.clearLog = true; mocks.check.mockReset().mockResolvedValue({ policy: {} }); mocks.download.mockReset().mockResolvedValue(undefined); mocks.stop.mockReset();
  dom = new JSDOM(readFileSync('entrypoints/data-controls/index.html', 'utf8'), { url: 'chrome-extension://test/data-controls.html' });
  vi.stubGlobal('document', dom.window.document); vi.stubGlobal('window', dom.window);
  clipboard = vi.fn().mockResolvedValue(undefined); vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  mocks.api.runtime = { sendMessage: vi.fn(async (request: any) => request.action === 'sources-read' ? { ok: true, available: true, preferencesAllowed: true, settings: { allowlistEnabled: false, allowed: [], blocked: [] }, organization: { allowlistEnabled: false, allowedCount: 0, blockedCount: 0 } } : request.action === 'history-read' ? { ok: true, history: { clearAllowed: mocks.clearHistory, settings: { enabled: false, retentionDays: 60, maxMiB: 10 }, managed: { enabled: false, retentionDays: false, maxMiB: false }, locked: false, count: 0, bytes: 33, entries: [] } } : request.action === 'read' ? { ok: true, report: { reportVersion: 1, policyState: 'unmanaged', capabilities: { downloads: true }, platform: 'linux', ...(request.includeLog ? { events: [{ code: 'capture-complete' }] } : {}) }, personal: defaults, data: defaults, sources: {}, preferencesAllowed: true, copyAllowed: true, saveAllowed: true, log: { clearAllowed: mocks.clearLog, effectiveLevel: 'error', events: [], bytes: 2, limits: { events: 1000, bytes: 2097152, ageHours: 168 } } } : { ok: true }) };
  mocks.api.permissions = { request: vi.fn().mockResolvedValue(true) };
  await import('@/entrypoints/data-controls/main'); await settle();
});
afterEach(() => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); dom.window.close(); vi.unstubAllGlobals(); });
it('previews a report without journal, opts in explicitly and checks clipboard policy before copying', async () => {
  const doc = dom.window.document;
  expect(doc.querySelector('#report')!.textContent).not.toContain('events');
  const include = doc.querySelector<HTMLInputElement>('#include-log')!; expect(include.checked).toBe(false);
  include.checked = true; include.dispatchEvent(new dom.window.Event('change')); await settle();
  expect(doc.querySelector('#report')!.textContent).toContain('events');
  doc.querySelector<HTMLButtonElement>('#copy')!.click(); await settle();
  expect(mocks.check).toHaveBeenCalledWith('diagnostics-copy'); expect(clipboard).toHaveBeenCalledWith(doc.querySelector('#report')!.textContent);
  mocks.check.mockRejectedValue(new Error('Blocked')); clipboard.mockClear();
  doc.querySelector<HTMLButtonElement>('#copy')!.click(); await settle(); expect(clipboard).not.toHaveBeenCalled();
});
it('saves validated personal data choices and explicitly clears the local journal', async () => {
  const doc = dom.window.document;
  doc.querySelector<HTMLInputElement>('#include-values')!.checked = false;
  doc.querySelector<HTMLSelectElement>('#page-url')!.value = 'origin';
  doc.querySelector('#data-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  expect(mocks.api.runtime.sendMessage).toHaveBeenCalledWith({ type: 'diagnostics', action: 'data', data: { ...defaults, includeFormValues: false, pageUrl: 'origin' } });
  doc.querySelector<HTMLButtonElement>('#clear')!.click(); await settle();
  expect(mocks.api.runtime.sendMessage).toHaveBeenCalledWith({ type: 'diagnostics', action: 'clear' });
});

it('starts history off and saves manual retention and size choices independently of technical logging', async () => {
  const doc = dom.window.document;
  expect(doc.querySelector<HTMLInputElement>('#history-enabled')!.checked).toBe(false);
  doc.querySelector<HTMLInputElement>('#history-enabled')!.checked = true;
  doc.querySelector<HTMLInputElement>('#history-days')!.value = '365';
  doc.querySelector<HTMLInputElement>('#history-size')!.value = '50';
  doc.querySelector('#history-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  expect(mocks.api.runtime.sendMessage).toHaveBeenCalledWith({ type: 'diagnostics', action: 'history-settings', settings: { enabled: true, retentionDays: 365, maxMiB: 50 } });
});

it('disables clear actions with an organization explanation and restores them after refresh', async () => {
  const doc = dom.window.document;
  const refresh = async () => { doc.querySelector<HTMLButtonElement>('#refresh')!.click(); doc.querySelector<HTMLButtonElement>('#history-refresh')!.click(); await settle(); };
  mocks.clearHistory = false; mocks.clearLog = false; await refresh();
  for (const id of ['clear', 'history-clear']) expect(doc.querySelector<HTMLButtonElement>(`#${id}`)!.disabled).toBe(true);
  expect(doc.querySelector<HTMLElement>('#journal-clear-note')!.hidden).toBe(false);
  expect(doc.querySelector('#history-clear-note')!.textContent).toBe('History retention is managed by your organization.');
  mocks.api.runtime.sendMessage.mockClear();
  doc.querySelector<HTMLButtonElement>('#clear')!.click(); doc.querySelector<HTMLButtonElement>('#history-clear')!.click();
  expect(mocks.api.runtime.sendMessage).not.toHaveBeenCalled();
  mocks.clearHistory = true; mocks.clearLog = true; await refresh();
  for (const id of ['clear', 'history-clear']) expect(doc.querySelector<HTMLButtonElement>(`#${id}`)!.disabled).toBe(false);
  for (const id of ['journal-clear-note', 'history-clear-note']) expect(doc.querySelector<HTMLElement>(`#${id}`)!.hidden).toBe(true);
});

it('saves personal sites with an explicit empty-allowlist warning and rejects URL paths', async () => {
  const doc = dom.window.document;
  const allowlist = doc.querySelector<HTMLInputElement>('#sources-allowlist')!;
  expect(allowlist.checked).toBe(false);
  allowlist.checked = true; allowlist.dispatchEvent(new dom.window.Event('change'));
  expect(doc.querySelector<HTMLElement>('#sources-warning')!.hidden).toBe(false);
  doc.querySelector('#sources-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  expect(mocks.api.runtime.sendMessage).toHaveBeenCalledWith({ type: 'diagnostics', action: 'sources-save', settings: { allowlistEnabled: true, allowed: [], blocked: [] } });
  mocks.api.runtime.sendMessage.mockClear();
  doc.querySelector<HTMLTextAreaElement>('#sources-blocked')!.value = 'https://private.test/path';
  doc.querySelector('#sources-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await settle();
  expect(mocks.api.runtime.sendMessage).not.toHaveBeenCalled();
  expect(doc.querySelector('#sources-status')!.textContent).toContain('Invalid site settings');
});

it('saves the standalone journal and stops downloading when file policy changes', async () => {
  const button = dom.window.document.querySelector<HTMLButtonElement>('#journal-save')!;
  expect(button.disabled).toBe(false);
  const json = JSON.stringify({ journalVersion: 1, events: [{ code: 'capture-complete' }] });
  mocks.api.runtime.sendMessage.mockResolvedValueOnce({ ok: true, json });
  button.click(); await settle();
  expect(mocks.api.runtime.sendMessage).toHaveBeenCalledWith({ type: 'diagnostics', action: 'journal-export' });
  expect(mocks.check).toHaveBeenCalledWith('diagnostics-save');
  expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'copy-as-context-journal.json');
  expect(await mocks.download.mock.calls[0]![0].text()).toBe(json);
  mocks.download.mockClear(); mocks.check.mockRejectedValueOnce(new Error('Blocked'));
  mocks.api.runtime.sendMessage.mockResolvedValueOnce({ ok: true, json });
  button.click(); await settle();
  expect(mocks.download).not.toHaveBeenCalled();
});

it('disables journal export without file permission or journal storage', async () => {
  const response = await mocks.api.runtime.sendMessage({ action: 'read' });
  for (const restricted of [{ ...response, saveAllowed: false }, { ...response, log: undefined }, { ...response, report: { ...response.report, platform: 'android' } }]) {
    mocks.api.runtime.sendMessage.mockResolvedValueOnce(restricted);
    dom.window.document.querySelector<HTMLButtonElement>('#refresh')!.click(); await settle();
    const button = dom.window.document.querySelector<HTMLButtonElement>('#journal-save')!;
    expect(button.disabled).toBe(true);
    mocks.download.mockClear(); button.click(); await settle(); expect(mocks.download).not.toHaveBeenCalled();
  }
});
