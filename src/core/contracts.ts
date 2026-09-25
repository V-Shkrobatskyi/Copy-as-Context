import type { SemanticTree } from './model';

export const COMPRESSION_LEVELS = ['detailed', 'compact', 'maximum'] as const;
export type CompressionLevel = (typeof COMPRESSION_LEVELS)[number];
export const DEFAULT_COMPRESSION_LEVEL: CompressionLevel = 'compact';

export const EXPORT_FORMATS = [
  'semantic-text',
  'markdown',
  'json',
  'raw-debug',
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const CAPTURE_ERROR_CODES = [
  'unsupported-page',
  'permission-denied',
  'debugger-busy',
  'capture-failed',
  'invalid-tree',
] as const;
export type CaptureErrorCode = (typeof CAPTURE_ERROR_CODES)[number];

export interface CaptureError {
  code: CaptureErrorCode;
  message: string;
  details?: string;
}

export type CaptureResult =
  | { ok: true; tree: SemanticTree }
  | { ok: false; error: CaptureError };

export interface SerializedContext {
  format: ExportFormat;
  content: string;
  characterCount: number;
}
