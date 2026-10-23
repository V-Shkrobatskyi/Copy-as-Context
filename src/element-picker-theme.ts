// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { browser } from 'wxt/browser';

const key = 'page-as-context:theme';

/** Read extension-owned preferences and release the listener with the picker. */
export function watchPickerTheme(listener: (preference: unknown) => void): () => void {
  let stopped = false;
  let changed = false;
  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !Object.hasOwn(changes, key)) return;
    changed = true;
    if (!stopped) listener(changes[key]?.newValue);
  };
  browser.storage.onChanged.addListener(onChanged);
  void browser.storage.local.get(key).then(values => {
    // A newer change or closed picker must win over a delayed initial read.
    if (!stopped && !changed) listener(values[key]);
  }).catch(() => { /* Keep the system default if storage is unavailable. */ });
  return () => { stopped = true; browser.storage.onChanged.removeListener(onChanged); };
}
