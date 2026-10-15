// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { DOM_CAPTURE_LIMITS } from '../dom/limits';

export const FIREFOX_CAPTURE_LIMITS = {
  ...DOM_CAPTURE_LIMITS,
  documents: 32,
  frameDepth: 8,
  owners: 128,
  captureMs: 8_000,
  commandMs: 1_000,
  helperMs: 12_000,
} as const;
