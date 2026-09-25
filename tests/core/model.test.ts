import { describe, expect, it } from 'vitest';

import {
  CAPTURE_ERROR_CODES,
  COMPRESSION_LEVELS,
  DEFAULT_COMPRESSION_LEVEL,
  EXPORT_FORMATS,
  type CaptureResult,
  type NodeStates,
} from '../../src/core';

describe('semantic core contracts', () => {
  it('uses Compact as the default compression level', () => {
    expect(COMPRESSION_LEVELS).toEqual(['detailed', 'compact', 'maximum']);
    expect(DEFAULT_COMPRESSION_LEVEL).toBe('compact');
  });

  it('exposes the planned export formats and capture error codes', () => {
    expect(EXPORT_FORMATS).toEqual(['semantic-text', 'markdown', 'json', 'raw-debug']);
    expect(CAPTURE_ERROR_CODES).toContain('debugger-busy');
  });

  it('supports a mixed checked state without requiring unrelated states', () => {
    const states: NodeStates = { checked: 'mixed' };
    expect(states).toEqual({ checked: 'mixed' });
  });

  it('represents capture failure as a domain result', () => {
    const result: CaptureResult = {
      ok: false,
      error: { code: 'unsupported-page', message: 'The page cannot be captured.' },
    };

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unsupported-page');
  });
});
