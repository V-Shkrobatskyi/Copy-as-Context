import { browser } from 'wxt/browser';
import type { SupportedExportFormat } from './core';

export const FIREFOX_SAVE_MESSAGE = 'save-firefox-export';

export async function openFirefoxSave(content: string, format: SupportedExportFormat): Promise<void> {
  const token = crypto.randomUUID();
  const tab = await browser.tabs.create({ url: `${browser.runtime.getURL('/save.html')}#${token}`, active: false });
  try {
    // A new extension document must install its listener before receiving the export.
    for (let attempt = 0; attempt < 50; attempt++) {
      const accepted = await browser.runtime.sendMessage({ type: FIREFOX_SAVE_MESSAGE, token, content, format }).catch(() => undefined);
      if (accepted?.accepted === true) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('save-document-unavailable');
  } catch (error) {
    if (tab.id !== undefined) await browser.tabs.remove(tab.id).catch(() => {});
    throw error;
  }
}
