// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import type { SemanticTree } from '../core/model';
import type { CompressionLevel } from '../core/contracts';
import { version } from '../../package.json';
import { renderExportSettings } from '../core/serializers/attribution';
import { applyDataControls, DEFAULT_DATA_CONTROLS, type DataControls } from '../core/data-controls';
import { redactSemanticTree, type RedactionSettings } from '../core/privacy';
export const MIB = 1048576;
export const HISTORY_MAX_DAYS = 365;
export const HISTORY_MAX_MIB = 50;
export interface HistorySettings { enabled: boolean; retentionDays: number; maxMiB: number }
export const DEFAULT_HISTORY_SETTINGS: Readonly<HistorySettings> = { enabled: false, retentionDays: 60, maxMiB: 10 };
export interface HistoryPolicy {
  CaptureHistoryEnabled?: boolean;
  CaptureHistoryRetentionDays?: number;
  CaptureHistoryMaxMiB?: number;
  CaptureHistorySettingsLocked?: boolean;
  CaptureHistoryClearAllowed?: boolean;
}
export function validateHistorySettings(raw: unknown): HistorySettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid capture history settings.');
  const v = raw as HistorySettings;
  if (Object.keys(v).some(k => !['enabled', 'retentionDays', 'maxMiB'].includes(k)) || typeof v.enabled !== 'boolean' || !Number.isSafeInteger(v.retentionDays) || v.retentionDays < 1 || v.retentionDays > HISTORY_MAX_DAYS || !Number.isSafeInteger(v.maxMiB) || v.maxMiB < 1 || v.maxMiB > HISTORY_MAX_MIB) throw new Error('Invalid capture history settings.');
  return { enabled: v.enabled, retentionDays: v.retentionDays, maxMiB: v.maxMiB };
}
export function resolveHistorySettings(p: HistoryPolicy, personal: HistorySettings = DEFAULT_HISTORY_SETTINGS): HistorySettings {
  const fallback = p.CaptureHistorySettingsLocked ? DEFAULT_HISTORY_SETTINGS : personal;
  return { enabled: p.CaptureHistoryEnabled ?? fallback.enabled, retentionDays: p.CaptureHistoryRetentionDays ?? fallback.retentionDays, maxMiB: p.CaptureHistoryMaxMiB ?? fallback.maxMiB };
}
export interface CaptureMetadata {
  scope: 'page' | 'selection';
  title?: string;
  sourceUrl?: string;
  browser?: string;
  capturedAt?: string;
  selectedElementTag?: string;
  extensionVersion?: string;
  exportSettings?: string;
}
export interface HistoryEntry extends CaptureMetadata { id: string; time: number }
/** Only the header is copied. No content/tree reference enters an asynchronous queue. */
export function captureMetadata(tree: SemanticTree, data: DataControls, redact: boolean, filters?: RedactionSettings, compression?: CompressionLevel): CaptureMetadata {
  const header = applyDataControls({ schemaVersion: 1, title: tree.title, sourceUrl: tree.sourceUrl, browser: tree.browser, capturedAt: tree.capturedAt, selectedElementTag: tree.selectedElementTag, root: { role: 'page', children: [] } }, data);
  const safe = redact ? redactSemanticTree(header, filters).tree : header;
  let sourceUrl = safe.sourceUrl;
  if (sourceUrl) {
    try { const url = new URL(sourceUrl); url.username = ''; url.password = ''; sourceUrl = url.href; } catch { sourceUrl = undefined; }
  }
  return { scope: tree.selectedElementTag ? 'selection' : 'page',
    ...(compression !== undefined ? { extensionVersion: version, exportSettings: renderExportSettings(compression, redact, filters) } : {}),
    ...(safe.title ? { title: safe.title.slice(0, 2048) } : {}),
    ...(sourceUrl && sourceUrl.length <= 8192 ? { sourceUrl } : {}),
    ...(safe.browser ? { browser: safe.browser.slice(0, 256) } : {}),
    ...(safe.capturedAt ? { capturedAt: safe.capturedAt.slice(0, 32) } : {}),
    ...(safe.selectedElementTag && /^[a-z][a-z0-9._-]{0,127}$/u.test(safe.selectedElementTag) ? { selectedElementTag: safe.selectedElementTag } : {}) };
}
export function validateMetadata(raw: unknown): CaptureMetadata | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const v = raw as CaptureMetadata;
  if (Object.keys(v).some(k => !['scope', 'title', 'sourceUrl', 'browser', 'capturedAt', 'selectedElementTag', 'extensionVersion', 'exportSettings'].includes(k)) || !['page', 'selection'].includes(v.scope)) return;
  for (const [key, max] of [['title', 2048], ['sourceUrl', 8192], ['browser', 256], ['capturedAt', 32], ['selectedElementTag', 128], ['extensionVersion', 64], ['exportSettings', 16]] as const) if (v[key] !== undefined && (typeof v[key] !== 'string' || v[key].length > max)) return;
  if (v.extensionVersion !== undefined && !/^\d+\.\d+\.\d+(?:[.-][a-zA-Z0-9.-]+)?$/u.test(v.extensionVersion)) return;
  if (v.exportSettings !== undefined && !/^\/[0-7](?:\/[dm])?$/u.test(v.exportSettings)) return;
  if (v.selectedElementTag !== undefined && !/^[a-z][a-z0-9._-]{0,127}$/u.test(v.selectedElementTag)) return;
  return { ...v };
}

/** Compile required detectors once when sanitizing a retained history batch. */
export function sanitizeMetadataBatch(entries: CaptureMetadata[], data: DataControls, redact: boolean, filters?: RedactionSettings): CaptureMetadata[] {
  const tree = applyDataControls({ schemaVersion: 1, root: { role: 'page', children: entries.map(entry => ({ role: 'page', name: entry.title, href: entry.sourceUrl, children: [] })) } }, data);
  const safe = redact ? redactSemanticTree(tree, filters).tree : tree;
  return entries.map((entry, index) => {
    const node = safe.root.children[index]!;
    return { ...captureMetadata({ schemaVersion: 1, title: node.name, sourceUrl: node.href, browser: entry.browser, capturedAt: entry.capturedAt, selectedElementTag: entry.selectedElementTag, root: { role: 'page', children: [] } }, DEFAULT_DATA_CONTROLS, false), scope: entry.scope,
      ...(entry.extensionVersion !== undefined ? { extensionVersion: entry.extensionVersion } : {}),
      ...(entry.exportSettings !== undefined ? { exportSettings: entry.exportSettings } : {}) };
  });
}
