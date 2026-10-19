// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only

import { isCustomRuleType, REDACTION_LIMITS, validateRedactionSettings, type RedactionSettings, type CustomRedactionRule } from './core/privacy/settings';

const KEY = 'filter-demo-draft';
export interface FilterDemoDraft { session: string; settings: RedactionSettings; baseline?: string }

function validateDraft(value: unknown): FilterDemoDraft {
  if (!value || typeof value !== 'object') throw new Error('invalid-draft');
  const state = value as FilterDemoDraft;
  if (typeof state.session !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/u.test(state.session) || !state.settings || !Array.isArray(state.settings.customRules) || state.settings.customRules.length > REDACTION_LIMITS.rules) throw new Error('invalid-draft');
  const rules: CustomRedactionRule[] = state.settings.customRules.map(rule => {
    if (!rule || typeof rule !== 'object' || typeof rule.name !== 'string' || rule.name.length > REDACTION_LIMITS.name || typeof rule.text !== 'string' || rule.text.length > REDACTION_LIMITS.regex || !isCustomRuleType(rule.type)) throw new Error('invalid-draft');
    return { id: rule.id, name: rule.name, text: rule.text, type: rule.type, caseSensitive: rule.caseSensitive, enabled: rule.enabled };
  });
  // Preserve unfinished disabled editors while validating IDs, types, switches and limits.
  const settings = validateRedactionSettings({ ...state.settings, customRules: rules.map(rule => ({ ...rule, name: rule.name.trim() ? rule.name : 'Untitled', text: 'synthetic' })) });
  if (state.baseline !== undefined) {
    if (typeof state.baseline !== 'string' || state.baseline.length > REDACTION_LIMITS.json) throw new Error('invalid-baseline');
    validateRedactionSettings(JSON.parse(state.baseline));
  }
  return { session: state.session, settings: { ...settings, customRules: rules }, ...(state.baseline !== undefined ? { baseline: state.baseline } : {}) };
}

/** This tab's temporary navigation state is separate from saved extension preferences. */
export function writeFilterDemoDraft(state: FilterDemoDraft): void {
  const json = JSON.stringify(validateDraft(state));
  if (json.length > REDACTION_LIMITS.json) throw new Error('draft-too-large');
  sessionStorage.setItem(KEY, json);
}

export function readFilterDemoDraft(session?: string): FilterDemoDraft | undefined {
  try {
    const json = sessionStorage.getItem(KEY);
    if (!json || json.length > REDACTION_LIMITS.json) return;
    const state = validateDraft(JSON.parse(json));
    return session === undefined || state.session === session ? state : undefined;
  } catch { return; }
}
