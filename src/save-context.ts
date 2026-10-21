// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { PolicyError } from './policy/model';
import { checkPolicy, type PolicyContext } from './policy/runtime';
import { browser } from 'wxt/browser';
import type { SupportedExportFormat } from './core';
import { contextBlob, contextDownloadOptions } from './download-context';

/** Keep the file URL alive until the browser finishes or cancels the download. */
export async function saveContextFile(content: string, format: SupportedExportFormat, signal?: AbortSignal, context?: PolicyContext): Promise<void> {
  await checkPolicy('save', context);
  if (context && context.format !== format) throw new PolicyError('Export format does not match the prepared context. Prepare the context again.');
  if (signal?.aborted) throw new Error('download-cancelled');
  const url = URL.createObjectURL(contextBlob(content, format));
  let changed: Parameters<typeof browser.downloads.onChanged.addListener>[0] | undefined;
  let erased: Parameters<typeof browser.downloads.onErased.addListener>[0] | undefined;
  let cancel!: (error: Error) => void;
  const cancelled = new Promise<never>((_resolve, reject) => { cancel = reject; });
  void cancelled.catch(() => {});
  const onCancel = () => cancel(new Error('download-cancelled'));
  signal?.addEventListener('abort', onCancel, { once: true });
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onCancel, { once: true });
  try {
    const id = await Promise.race([browser.downloads.download(contextDownloadOptions(url, format)), cancelled]);
    await Promise.race([new Promise<void>((resolve, reject) => {
      const check = (state?: string, error?: string) => {
        if (state === 'interrupted' || error) reject(new Error('download-interrupted'));
        else if (state === 'complete') resolve();
      };
      changed = delta => { if (delta.id === id) check(delta.state?.current, delta.error?.current); };
      erased = erasedId => { if (erasedId === id) reject(new Error('download-erased')); };
      browser.downloads.onChanged.addListener(changed);
      browser.downloads.onErased.addListener(erased);
      // A small local download may finish before the listener is attached.
      void browser.downloads.search({ id }).then(items => {
        if (!items[0]) reject(new Error('download-unavailable'));
        else check(items[0].state, items[0].error);
      }, reject);
    }), cancelled]);
  } finally {
    if (changed) browser.downloads.onChanged.removeListener(changed);
    if (erased) browser.downloads.onErased.removeListener(erased);
    signal?.removeEventListener('abort', onCancel);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onCancel);
    URL.revokeObjectURL(url);
  }
}
