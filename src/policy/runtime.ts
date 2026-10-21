// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { browser } from 'wxt/browser';
import { assertAction, isManaged, PolicyError, resolvePreferences, validatePolicy, type EnterprisePolicy, type ExportPreferences, type PolicyAction } from './model';

export interface PolicySnapshot { policy: EnterprisePolicy; revision?: string }
export interface PolicyContext extends ExportPreferences { policyRevision?: string }

/** Read on every operation; never replace a failed read with cached permissive values. */
export async function readPolicy(): Promise<PolicySnapshot> {
  let raw: unknown = {};
  try {
    if (browser.storage?.managed?.get) raw = await browser.storage.managed.get(null);
  } catch (error) {
    // Firefox reports an absent native manifest this way on ordinary installations.
    if (!(import.meta.env.BROWSER === 'firefox' && error instanceof Error && error.message === 'Managed storage manifest not found')) {
      throw new PolicyError('Unable to load organization policies. Retry or contact your administrator.');
    }
  }
  const policy = validatePolicy(raw);
  if (!isManaged(policy)) return { policy };
  const bytes = new TextEncoder().encode(JSON.stringify(policy));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const revision = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  return { policy, revision };
}

export async function checkPolicy(action: PolicyAction, context?: PolicyContext): Promise<PolicySnapshot> {
  const snapshot = await readPolicy();
  assertAction(snapshot.policy, action);
  if (context) {
    if (snapshot.revision !== context.policyRevision) throw new PolicyError('Organization policies changed. Prepare the context again.');
    const effective = resolvePreferences(snapshot.policy, context);
    if (effective.format !== context.format || effective.compression !== context.compression || effective.redactSensitiveData !== context.redactSensitiveData) {
      throw new PolicyError('Export preferences are restricted by your administrator. Prepare the context again.');
    }
  } else if (snapshot.revision && (action === 'copy' || action === 'save')) {
    throw new PolicyError('Prepare the context again using the current organization policies.');
  }
  return snapshot;
}

/** Unsubscribe with the owning document/session to avoid retaining captured content. */
export function watchPolicy(changed: () => void): () => void {
  const listener = (_changes: unknown, area: string) => { if (area === 'managed') changed(); };
  browser.storage?.onChanged?.addListener(listener);
  return () => browser.storage?.onChanged?.removeListener(listener);
}

export function policyMessage(error: unknown): string {
  return error instanceof PolicyError ? error.message : 'Unable to apply organization policies. Retry or contact your administrator.';
}
