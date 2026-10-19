// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { browser } from 'wxt/browser';
import type { SupportedExportFormat } from './core';
import { contextBlob, contextDownloadOptions } from './download-context';

/** Keep the file URL alive until the browser finishes or cancels the download. */
export async function saveContextFile(content: string, format: SupportedExportFormat): Promise<void> {
  const url = URL.createObjectURL(contextBlob(content, format));
  let changed: Parameters<typeof browser.downloads.onChanged.addListener>[0] | undefined;
  try {
    const id = await browser.downloads.download(contextDownloadOptions(url, format));
    await new Promise<void>((resolve, reject) => {
      const check = (state?: string, error?: string) => {
        if (state === 'interrupted' || error) reject(new Error('download-interrupted'));
        else if (state === 'complete') resolve();
      };
      changed = delta => { if (delta.id === id) check(delta.state?.current, delta.error?.current); };
      browser.downloads.onChanged.addListener(changed);
      // A small local download may finish before the listener is attached.
      void browser.downloads.search({ id }).then(items => {
        if (!items[0]) reject(new Error('download-unavailable'));
        else check(items[0].state, items[0].error);
      }, reject);
    });
  } finally {
    if (changed) browser.downloads.onChanged.removeListener(changed);
    URL.revokeObjectURL(url);
  }
}
