// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { COMPRESSION_LEVELS, type CaptureError, type CompressionLevel } from './core/contracts';
import type { PreparedExport, SupportedExportFormat } from './core/export';
import { isCaptureWarnings, type CaptureWarningCode } from './capture-warnings';
import { isFrameAccess } from './frame-access';

export const CAPTURE_ACTIVE_TAB_MESSAGE = 'capture-active-tab' as const;

export interface CaptureActiveTabRequest {
  type: typeof CAPTURE_ACTIVE_TAB_MESSAGE;
  compression: CompressionLevel;
  format: SupportedExportFormat;
  redactSensitiveData: boolean;
}

export type CaptureActiveTabResponse = { ok: true; export: PreparedExport; operationId?: string; policyRevision?: string; warnings?: CaptureWarningCode[]; frameAccess?: string[] } | { ok: false; error: CaptureError };

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
  if (response.operationId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(response.operationId)) return false;
  if (response.warnings !== undefined && !isCaptureWarnings(response.warnings)) return false;
  if (response.frameAccess !== undefined && !isFrameAccess(response.frameAccess)) return false;
  const result = response.export;
  return typeof result.serialized?.content === 'string' &&
    (result.serialized.format === 'semantic-text' || result.serialized.format === 'markdown') &&
    result.characterCount === result.serialized.content.length &&
    Number.isFinite(result.approximateTokenCount) && Number.isFinite(result.redactionCount) &&
    (result.reductionRatio === null || Number.isFinite(result.reductionRatio));
}
