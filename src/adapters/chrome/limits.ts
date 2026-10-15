// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

/** Shared per-capture budgets; AX responses are checked before recursive normalization. */
export const CHROME_CAPTURE_LIMITS = {
  documents: 32,
  frameDepth: 8,
  nodeDepth: 128,
  nodes: 20_000,
  characters: 1_000_000,
  rawBytes: 8_000_000,
  captureMs: 8_000,
  commandMs: 2_000,
  cleanupMs: 2_000,
} as const;
