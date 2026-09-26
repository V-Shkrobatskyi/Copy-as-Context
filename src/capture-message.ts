import type { CaptureResult } from './core';

export const CAPTURE_ACTIVE_TAB_MESSAGE = 'capture-active-tab' as const;

export interface CaptureActiveTabRequest {
  type: typeof CAPTURE_ACTIVE_TAB_MESSAGE;
}

export type CaptureActiveTabResponse = CaptureResult;
