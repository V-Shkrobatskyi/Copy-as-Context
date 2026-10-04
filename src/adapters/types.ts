import type { CaptureError, SemanticTree } from '../core';
import type { CaptureWarningCode } from '../capture-warnings';

export type CaptureOutcome = { ok: true; tree: SemanticTree; warnings?: CaptureWarningCode[] } |
  { ok: false; error: CaptureError };
