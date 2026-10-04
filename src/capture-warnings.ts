export const CAPTURE_WARNING_CODES = ['embedded-frames', 'canvas-content'] as const;
export type CaptureWarningCode = (typeof CAPTURE_WARNING_CODES)[number];

export function isCaptureWarnings(value: unknown): value is CaptureWarningCode[] {
  return Array.isArray(value) && value.length <= CAPTURE_WARNING_CODES.length &&
    value.every((code) => CAPTURE_WARNING_CODES.includes(code)) && new Set(value).size === value.length;
}
