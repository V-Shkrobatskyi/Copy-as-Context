// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

export class DownloadCancelledError extends Error {
  constructor() { super('download-cancelled'); this.name = 'DownloadCancelledError'; }
}

/** Normalize only explicit browser cancellation reasons, never general download failures. */
export function isDownloadCancellation(error: unknown): boolean {
  if (error instanceof DownloadCancelledError) return true;
  const message = error && typeof error === 'object' && 'message' in error ? error.message : undefined;
  return message === 'USER_CANCELED' || message === 'Download canceled by the user';
}
