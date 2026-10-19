// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { BUILTIN_FILTERS, customRuleFromBuiltin, defaultRedactionSettings, isCustomRuleType, type CustomRedactionRule, type RedactionSettings } from '@/src/core/privacy/settings';

/** Compose built-in actions with configurable custom rules for matching/precedence tests. */
export function settingsForRules(rules: CustomRedactionRule[]): RedactionSettings {
  const builtins = BUILTIN_FILTERS.filter(filter => rules.some(rule => rule.enabled && rule.type === customRuleFromBuiltin(filter.id).type && !isCustomRuleType(rule.type)));
  return { ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.filter(filter => !builtins.includes(filter)).map(filter => filter.id), customRules: rules.filter(rule => isCustomRuleType(rule.type)) };
}
