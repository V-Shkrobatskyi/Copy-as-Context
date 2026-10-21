// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { COMPRESSION_LEVELS, type CompressionLevel } from './core/contracts';
import type { SupportedExportFormat } from './core/export';
import { isCaptureWarnings, type CaptureWarningCode } from './capture-warnings';

export const PREVIEW_PORT_PREFIX = 'preview-v1:';
export const PREVIEW_TIMEOUT_MS = 8_000;
// Covers the 1M-character capture budget plus JSON escaping and 20K indented nodes.
export const MAX_PREVIEW_CHARACTERS = 16_000_000;

export interface PreviewPayload {
  operationId?: string;
  policyRevision?: string;
  scope?: 'selection';
  content: string;
  compression: CompressionLevel;
  format: SupportedExportFormat;
  redactSensitiveData: boolean;
  redactionCount: number;
  reductionRatio: number | null;
  warnings: CaptureWarningCode[];
}

export function isPreviewToken(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}

export function isPreviewPayload(value: unknown): value is PreviewPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Partial<PreviewPayload>;
  return (payload.operationId === undefined || isPreviewToken(payload.operationId)) && (payload.policyRevision === undefined || typeof payload.policyRevision === 'string' && /^[a-f0-9]{64}$/u.test(payload.policyRevision)) &&
    (payload.scope === undefined || payload.scope === 'selection') && typeof payload.content === 'string' && payload.content.length <= MAX_PREVIEW_CHARACTERS &&
    COMPRESSION_LEVELS.includes(payload.compression as CompressionLevel) &&
    (payload.format === 'semantic-text' || payload.format === 'markdown') &&
    typeof payload.redactSensitiveData === 'boolean' &&
    Number.isSafeInteger(payload.redactionCount) && payload.redactionCount! >= 0 &&
    (payload.reductionRatio === null || (typeof payload.reductionRatio === 'number' &&
      Number.isFinite(payload.reductionRatio) && payload.reductionRatio >= 0 && payload.reductionRatio <= 1)) &&
    isCaptureWarnings(payload.warnings);
}

export function captureWarningText(warnings: readonly CaptureWarningCode[]): string {
  const frameHint = import.meta.env.BROWSER === 'firefox'
    ? ' To capture frames from other sites, enable "Include frames from other sites" in the extension popup, then capture again. Some frames may still be unavailable.'
    : '';
  return warnings.map(code => code === 'source-policy-omitted' ? 'Some embedded documents were excluded by site restrictions.' : code === 'embedded-frames'
    ? 'Embedded frames are not included.' : code === 'embedded-frames-partial'
      ? `Some embedded documents could not be captured.${frameHint}` : 'Canvas content is not included.').join(' ');
}
