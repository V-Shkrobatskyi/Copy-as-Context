// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import type { CaptureMetadata } from './model';
let sink: ((metadata: CaptureMetadata) => Promise<void>) | undefined;
/** Set only by background. There is deliberately no content-script recording message. */
export function setCaptureHistorySink(value: (metadata: CaptureMetadata) => Promise<void>): void { sink = value; }
export function recordCaptureHistory(metadata: CaptureMetadata): void {
  try { void sink?.(metadata).catch(() => {}); } catch { /* History failure never changes capture/export. */ }
}
