// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { checkPolicy, type PolicyContext } from './policy/runtime';
import { browser } from 'wxt/browser';
import type { SupportedExportFormat } from './core';

export const FIREFOX_SAVE_MESSAGE = 'save-firefox-export';

export async function openFirefoxSave(content: string, format: SupportedExportFormat, context?: PolicyContext): Promise<void> {
  await checkPolicy('save', context);
  const token = crypto.randomUUID();
  const tab = await browser.tabs.create({ url: `${browser.runtime.getURL('/save.html')}#${token}`, active: false });
  try {
    // A new extension document must install its listener before receiving the export.
    for (let attempt = 0; attempt < 50; attempt++) {
      const accepted = await browser.runtime.sendMessage({ type: FIREFOX_SAVE_MESSAGE, token, content, format, context }).catch(() => undefined);
      if (accepted?.accepted === true) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('save-document-unavailable');
  } catch (error) {
    if (tab.id !== undefined) await browser.tabs.remove(tab.id).catch(() => {});
    throw error;
  }
}
