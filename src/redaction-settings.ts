// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { readPolicy } from './policy/runtime';
import { assertAction, mergeManagedFilters, PolicyError } from './policy/model';
import { browser } from 'wxt/browser';
import { defaultRedactionSettings, validateRedactionSettings, type RedactionSettings } from './core/privacy/settings';

export const REDACTION_SETTINGS_KEY = 'redaction-filters-v1';

/** Missing settings use defaults; unreadable or invalid saved rules must never be silently bypassed. */
export async function loadPersonalRedactionSettings(): Promise<RedactionSettings> {
  const stored = await browser.storage.local.get(REDACTION_SETTINGS_KEY);
  return stored[REDACTION_SETTINGS_KEY] === undefined
    ? defaultRedactionSettings() : validateRedactionSettings(stored[REDACTION_SETTINGS_KEY]);
}

export async function saveRedactionSettings(settings: RedactionSettings): Promise<void> {
  const { policy } = await readPolicy();
  assertAction(policy, 'customize');
  if (policy.UserPreferencesSaveAllowed === false || policy.UserRedactionRulesAllowed === false) throw new PolicyError('Saving personal filters is disabled by your administrator.');
  await browser.storage.local.set({ [REDACTION_SETTINGS_KEY]: validateRedactionSettings(settings) });
}

/** Corporate rules are merged only at execution, never written to personal storage. */
export async function loadRedactionSettings(): Promise<RedactionSettings> {
  const { policy } = await readPolicy();
  const personal = policy.UserRedactionRulesAllowed === false ? defaultRedactionSettings() : await loadPersonalRedactionSettings();
  return mergeManagedFilters(policy, personal);
}
