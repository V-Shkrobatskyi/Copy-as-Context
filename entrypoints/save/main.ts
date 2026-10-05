import { browser } from 'wxt/browser';
import { contextBlob, contextDownloadOptions } from '@/src/download-context';
import { FIREFOX_SAVE_MESSAGE } from '@/src/firefox-save';
import type { SupportedExportFormat } from '@/src/core';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const token = location.hash.slice(1);
let started = false;

async function closeTab(): Promise<void> {
  const tab = await browser.tabs.getCurrent();
  if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
}
document.querySelector('#close')!.addEventListener('click', () => void closeTab());

async function save(content: string, format: SupportedExportFormat): Promise<void> {
  const url = URL.createObjectURL(contextBlob(content, format));
  let changed: Parameters<typeof browser.downloads.onChanged.addListener>[0] | undefined;
  try {
    status.textContent = 'Choose where to save your file. Keep this tab open until saving finishes.';
    const id = await browser.downloads.download(contextDownloadOptions(url, format));
    await new Promise<void>((resolve, reject) => {
      const check = (state?: string, error?: string) => {
        if (state === 'interrupted' || error) reject(new Error('download-interrupted'));
        else if (state === 'complete') resolve();
      };
      changed = delta => { if (delta.id === id) check(delta.state?.current, delta.error?.current); };
      browser.downloads.onChanged.addListener(changed);
      void browser.downloads.search({ id }).then(items => {
        if (!items[0]) reject(new Error('download-unavailable'));
        else check(items[0].state, items[0].error);
      }, reject);
    });
    status.textContent = 'File saved. You can close this tab.';
    await closeTab().catch(() => {});
  } catch {
    status.textContent = 'Unable to save the file, or saving was cancelled. Close this tab and try Save again from the extension.';
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) await browser.tabs.update(tab.id, { active: true }).catch(() => {});
  } finally {
    if (changed) browser.downloads.onChanged.removeListener(changed);
    URL.revokeObjectURL(url);
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (started || sender.tab || sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/popup.html')) return;
  if (message?.type !== FIREFOX_SAVE_MESSAGE || !token || message.token !== token || typeof message.content !== 'string' || !['semantic-text', 'markdown'].includes(message.format)) return;
  started = true;
  // Acknowledge receipt before opening the picker, which may close the sending popup.
  sendResponse({ accepted: true });
  void save(message.content, message.format);
});

setTimeout(() => {
  if (!started) status.textContent = 'No export was received. Close this tab and try Save again from the extension.';
}, 6000);
