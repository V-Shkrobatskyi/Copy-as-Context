import { COMPRESSION_LEVELS, type CaptureError, type CompressionLevel, type PreparedExport, type SupportedExportFormat } from './core';

export const CAPTURE_ACTIVE_TAB_MESSAGE = 'capture-active-tab' as const;

export interface CaptureActiveTabRequest {
  type: typeof CAPTURE_ACTIVE_TAB_MESSAGE;
  compression: CompressionLevel;
  format: SupportedExportFormat;
  redactSensitiveData: boolean;
}

export type CaptureActiveTabResponse = { ok: true; export: PreparedExport } | { ok: false; error: CaptureError };

export function isCaptureActiveTabRequest(value: unknown): value is CaptureActiveTabRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<CaptureActiveTabRequest>;
  return request.type === CAPTURE_ACTIVE_TAB_MESSAGE &&
    COMPRESSION_LEVELS.includes(request.compression as CompressionLevel) &&
    (request.format === 'semantic-text' || request.format === 'markdown') &&
    typeof request.redactSensitiveData === 'boolean';
}

export function isCaptureActiveTabResponse(value: unknown): value is CaptureActiveTabResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<CaptureActiveTabResponse>;
  if (response.ok === false) return typeof response.error?.code === 'string';
  if (response.ok !== true || !response.export) return false;
  const result = response.export;
  return typeof result.serialized?.content === 'string' &&
    (result.serialized.format === 'semantic-text' || result.serialized.format === 'markdown') &&
    result.characterCount === result.serialized.content.length &&
    Number.isFinite(result.approximateTokenCount) && Number.isFinite(result.redactionCount) &&
    (result.reductionRatio === null || Number.isFinite(result.reductionRatio));
}
