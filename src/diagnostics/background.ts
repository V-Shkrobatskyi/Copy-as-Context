// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { browser } from 'wxt/browser';
import { version } from '../../package.json';
import { captureDataControls, DATA_CONTROLS_KEY, CAPTURE_SOURCES_KEY, readPolicy } from '../policy/runtime';
import { defaultSourceSettings, validateSourceSettings } from '../policy/sources';
import { resolveBrowserInfo } from '../platform/browser-info';
import { DEFAULT_DATA_CONTROLS, validateDataControls } from '../core/data-controls';
import { LOG_LEVELS, validateEvent } from './events';
import { createJournal } from './journal';
import { setTechnicalEventSink } from './client';
import { createCaptureHistory } from '../history/history';
import { sanitizeMetadataBatch } from '../history/model';
import { setCaptureHistorySink } from '../history/client';
import { loadRedactionSettings } from '../redaction-settings';
import { journalStore, localStateStore } from './store';
import { assertAction, resolvePreferences, redactionMode, formats, levels, type ExportPreferences } from '../policy/model';

const paths = ['/popup.html', '/preview.html', '/save.html', '/selection-save.html', '/filters.html', '/diagnostics.html'] as const;
export function installDiagnostics() {
  const journal = createJournal(journalStore(), async () => (await readPolicy()).policy);
  const history = createCaptureHistory(localStateStore<import('../history/history').HistoryState>('capture-history-v1'), async () => {
    const snapshot = await readPolicy();
    const required = redactionMode(snapshot.policy) === 'force-on';
    const filters = required ? await loadRedactionSettings() : undefined;
    const data = captureDataControls(snapshot);
    return { policy: snapshot.policy, sanitize: metadata => sanitizeMetadataBatch([metadata], data, required, filters)[0]!, sanitizeAll: entries => sanitizeMetadataBatch(entries, data, required, filters) };
  });
  setCaptureHistorySink(metadata => history.append(metadata));
  setTechnicalEventSink(event => journal.append(event));
  browser.runtime.onMessage.addListener((raw, sender, reply) => {
    if (!raw || raw.type !== 'diagnostics' || sender.id !== browser.runtime.id || !sender.url) return;
    const page = paths.find(path => sender.url!.split('#')[0] === browser.runtime.getURL(path));
    if (!page) return;
    if (raw.action === 'event') {
      const event = validateEvent(raw.event);
      if (event) void journal.append(event);
      reply({ ok: !!event }); return;
    }
    if (page !== '/diagnostics.html') return;
    void (async () => {
      if (raw.action === 'sources-read') {
        const { policy } = await readPolicy(false);
        let settings = defaultSourceSettings(), available = true;
        try {
          const stored = await browser.storage.local.get(CAPTURE_SOURCES_KEY);
          if (stored?.[CAPTURE_SOURCES_KEY] !== undefined) settings = validateSourceSettings(stored[CAPTURE_SOURCES_KEY]);
        } catch { available = false; }
        return { ok: true, settings, available, preferencesAllowed: policy.UserPreferencesSaveAllowed !== false,
          organization: { allowlistEnabled: policy.AllowedCaptureSources !== undefined, allowedCount: policy.AllowedCaptureSources?.length ?? 0, blockedCount: policy.BlockedCaptureSources?.length ?? 0 } };
      }
      if (raw.action === 'sources-save') {
        const { policy } = await readPolicy(false);
        if (policy.UserPreferencesSaveAllowed === false) throw new Error();
        const settings = validateSourceSettings(raw.settings);
        await browser.storage.local.set({ [CAPTURE_SOURCES_KEY]: settings }); return { ok: true };
      }
      if (raw.action === 'history-read') return { ok: true, history: await history.read() };
      if (raw.action === 'history-settings') { await history.setSettings(raw.settings); return { ok: true }; }
      if (raw.action === 'history-clear') { await history.clear(); return { ok: true }; }
      if (raw.action === 'history-export') {
        const snapshot = await readPolicy();
        if (raw.destination !== 'copy' && raw.destination !== 'save') throw new Error();
        assertAction(snapshot.policy, raw.destination === 'copy' ? 'diagnostics-copy' : 'diagnostics-save');
        return { ok: true, json: await history.export() };
      }
      if (raw.action === 'clear') { await journal.clear(); return { ok: true }; }
      if (raw.action === 'level') { if (!LOG_LEVELS.includes(raw.level)) throw new Error(); await journal.setLevel(raw.level); return { ok: true }; }
      if (raw.action === 'data') {
        const p = await readPolicy(false);
        if (p.policy.UserPreferencesSaveAllowed === false) throw new Error();
        const data = validateDataControls(raw.data);
        await browser.storage.local.set({ [DATA_CONTROLS_KEY]: data }); return { ok: true };
      }
      if (raw.action === 'export-copy' || raw.action === 'export-save') {
        const p = await readPolicy(); assertAction(p.policy, raw.action === 'export-copy' ? 'diagnostics-copy' : 'diagnostics-save'); return { ok: true };
      }
      if (raw.action !== 'read') throw new Error();
      let policyState: 'unmanaged' | 'managed' | 'error' = 'error';
      let organization: object = {};
      let data = { ...DEFAULT_DATA_CONTROLS };
      let personal = { ...DEFAULT_DATA_CONTROLS };
      let sources: Record<string, string> = {};
      let exportPreferences: object = {};
      let copyAllowed = false, saveAllowed = false, preferencesAllowed = false;
      try {
        const snapshot = await readPolicy(); const p = snapshot.policy;
        policyState = Object.values(p).some(v => v !== undefined) ? 'managed' : 'unmanaged';
        data = captureDataControls(snapshot); personal = snapshot.dataControls ?? { ...DEFAULT_DATA_CONTROLS };
        organization = { contractVersion: p.PolicyVersion ?? 1, allowedExportFormats: [...formats(p)], allowedCompressionLevels: [...levels(p)], redactionMode: redactionMode(p), userRulesAllowed: p.UserRedactionRulesAllowed !== false, preferencesSavingAllowed: p.UserPreferencesSaveAllowed !== false,
          sourceAllowlistPresent: p.AllowedCaptureSources !== undefined,
          allowedSourceCount: p.AllowedCaptureSources?.length ?? 0, blockedSourceCount: p.BlockedCaptureSources?.length ?? 0,
          requiredRuleCount: (p.ManagedRedactionRules?.length ?? 0) + (p.RequiredBuiltinFilters?.length ?? 0),
          restrictions: { picker: p.ElementPickerAllowed === false, preview: p.PreviewAllowed === false, customize: p.FilterSettingsAllowed === false, clipboard: p.ClipboardExportAllowed === false, file: p.FileExportAllowed === false } };
        for (const [key, managed] of Object.entries({ includeTitle: p.IncludePageTitle === false && !data.includeTitle, includeFormValues: p.IncludeFormValues === false && !data.includeFormValues, pageUrl: p.PageUrlMode !== undefined && data.pageUrl === p.PageUrlMode, linkUrls: p.LinkUrlMode !== undefined && data.linkUrls === p.LinkUrlMode })) sources[key] = managed ? 'organization' : personal[key as keyof typeof personal] !== DEFAULT_DATA_CONTROLS[key as keyof typeof personal] ? 'personal' : 'default';
        const stored = (await browser.storage.local.get('popup-settings'))?.['popup-settings'] as Record<string, unknown> | undefined;
        const personalExport: Partial<ExportPreferences> = {};
        if (stored && typeof stored === 'object') {
          if (stored.format === 'semantic-text' || stored.format === 'markdown') personalExport.format = stored.format;
          if (typeof stored.compression === 'string' && ['without', 'detailed', 'compact', 'maximum'].includes(stored.compression)) personalExport.compression = stored.compression as ExportPreferences['compression'];
          if (typeof stored.redactSensitiveData === 'boolean') personalExport.redactSensitiveData = stored.redactSensitiveData;
        }
        try {
          const effective = resolvePreferences(p, personalExport);
          exportPreferences = { effective, sources: {
            format: p.ForcedExportFormat ? 'organization' : personalExport.format === effective.format ? 'personal' : p.DefaultExportFormat || p.AllowedExportFormats ? 'organization' : 'default',
            compression: p.ForcedCompression ? 'organization' : personalExport.compression === effective.compression ? 'personal' : p.DefaultCompression || p.AllowedCompressionLevels ? 'organization' : 'default',
            redactSensitiveData: redactionMode(p) !== 'user-controlled' ? 'organization' : personalExport.redactSensitiveData !== undefined ? 'personal' : 'default',
          } };
        } catch { exportPreferences = { available: false, reason: 'context-export-disabled' }; }
        copyAllowed = p.ClipboardExportAllowed !== false; saveAllowed = p.FileExportAllowed !== false; preferencesAllowed = p.UserPreferencesSaveAllowed !== false;
      } catch {
        // Permit replacing broken personal settings only after independently validating managed policy.
        try { preferencesAllowed = (await readPolicy(false)).policy.UserPreferencesSaveAllowed !== false; } catch { /* Managed failures remain closed. */ }
      }
      let log;
      try { log = await journal.read(); } catch { log = undefined; }
      const platform = await browser.runtime.getPlatformInfo().catch(() => undefined);
      const runtime = browser.runtime as typeof browser.runtime & { getBrowserInfo?: () => Promise<{ name: string; version: string }> };
      const browserInfo = await resolveBrowserInfo({ getBrowserInfo: runtime.getBrowserInfo ? () => runtime.getBrowserInfo!() : undefined, userAgent: globalThis.navigator?.userAgent });
      const capabilities = { clipboard: true, downloads: typeof browser.downloads?.download === 'function', picker: platform?.os !== 'android', captureAdapter: import.meta.env.BROWSER === 'firefox' ? 'dom' : 'accessibility' };
      const report = { reportVersion: 1, generatedAt: new Date().toISOString(), extensionVersion: version, browser: browserInfo || import.meta.env.BROWSER, platform: platform?.os ?? 'unknown', capabilities, policyState, ...(policyState === 'error' ? { errorCode: 'policy-unavailable' } : { organization, effectiveDataControls: data, valueSources: sources, exportPreferences }), journal: log ? { available: true, level: log.effectiveLevel, source: log.managed ? 'organization' : log.level === 'error' ? 'default' : 'personal', bytes: log.bytes, count: log.events.length, limits: log.limits } : { available: false }, ...(raw.includeLog === true && log ? { events: log.events } : {}) };
      return { ok: true, report, personal, data, sources, copyAllowed, saveAllowed, preferencesAllowed, log: log ? { ...log, events: log.events } : undefined };
    })().then(reply, () => reply({ ok: false, error: 'Unable to complete diagnostics operation. Settings may be managed or storage unavailable.' }));
    return true;
  });
  return journal;
}
