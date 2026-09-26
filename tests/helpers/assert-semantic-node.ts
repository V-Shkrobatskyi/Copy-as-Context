import { expect } from 'vitest';

import type { SemanticNode } from '@/src/core';

const STATE_KEYS = new Set([
  'checked',
  'disabled',
  'expanded',
  'selected',
  'required',
  'focusable',
]);

export function assertSemanticNode(node: unknown): asserts node is SemanticNode {
  expect(node).toEqual(expect.any(Object));
  const candidate = node as Record<string, unknown>;
  expect(candidate.role).toEqual(expect.any(String));
  expect(Array.isArray(candidate.children)).toBe(true);

  if (candidate.name !== undefined) expect(candidate.name).toEqual(expect.any(String));
  if (candidate.value !== undefined) expect(candidate.value).toEqual(expect.any(String));
  if (candidate.level !== undefined) expect(candidate.level).toEqual(expect.any(Number));
  if (candidate.href !== undefined) expect(candidate.href).toEqual(expect.any(String));

  if (candidate.states !== undefined) {
    expect(candidate.states).toEqual(expect.any(Object));
    for (const [key, value] of Object.entries(candidate.states as Record<string, unknown>)) {
      expect(STATE_KEYS.has(key)).toBe(true);
      if (key === 'checked') expect([true, false, 'mixed']).toContain(value);
      else expect(typeof value).toBe('boolean');
    }
  }

  for (const child of candidate.children as unknown[]) assertSemanticNode(child);
}
