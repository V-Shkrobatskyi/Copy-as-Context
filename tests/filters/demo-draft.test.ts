// @vitest-environment jsdom
// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest';
import { readFilterDemoDraft, writeFilterDemoDraft } from '@/src/filter-demo-draft';
import { defaultRedactionSettings } from '@/src/core/privacy/settings';
beforeEach(() => { sessionStorage.clear(); });
describe('tab-local filter navigation draft', () => {
  it('round-trips switches, unfinished editors and the saved conflict baseline separately from preferences', () => {
    const state = { session: 'test-session', settings: { ...defaultRedactionSettings(), customRules: [{ id: 'unfinished', name: ' ', text: '[', type: 'regex' as const, enabled: false, caseSensitive: true }] }, baseline: JSON.stringify(defaultRedactionSettings()) };
    writeFilterDemoDraft(state);
    expect(readFilterDemoDraft('test-session')).toEqual(state);
    expect(readFilterDemoDraft('another-session')).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });
  it('cannot restore automatic custom types through a temporary draft', () => {
    const state = { session: 'test-session', settings: { ...defaultRedactionSettings(), customRules: [{ id: 'auto', name: '', text: '', type: 'emailHide' as const, enabled: false, caseSensitive: false }] } };
    expect(() => writeFilterDemoDraft(state)).toThrow();
    sessionStorage.setItem('filter-demo-draft', JSON.stringify(state));
    expect(readFilterDemoDraft()).toBeUndefined();
  });
  it('ignores corrupted or unknown navigation data', () => {
    for (const json of ['{', '{}', JSON.stringify({ session: 'x', settings: { version: 99, customRules: [] } })]) {
      sessionStorage.setItem('filter-demo-draft', json);
      expect(readFilterDemoDraft()).toBeUndefined();
    }
  });
});
