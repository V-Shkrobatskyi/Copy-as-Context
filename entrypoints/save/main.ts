// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import './style.css';
import { policyMessage, type PolicyContext } from '@/src/policy/runtime';
import { PolicyError } from '@/src/policy/model';
import { browser } from 'wxt/browser';
import { saveContextFile } from '@/src/save-context';
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

async function save(content: string, format: SupportedExportFormat, context?: PolicyContext): Promise<void> {
  try {
    status.textContent = 'Choose where to save your file. Keep this tab open until saving finishes.';
    await saveContextFile(content, format, undefined, context);
    status.textContent = 'File saved. You can close this tab.';
    await closeTab().catch(() => {});
  } catch (error) {
    status.textContent = error instanceof PolicyError ? policyMessage(error) : 'Unable to save the file, or saving was cancelled. Close this tab and try Save again from the extension.';
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) await browser.tabs.update(tab.id, { active: true }).catch(() => {});
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (started || sender.tab || sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/popup.html')) return;
  if (message?.type !== FIREFOX_SAVE_MESSAGE || !token || message.token !== token || typeof message.content !== 'string' || !['semantic-text', 'markdown'].includes(message.format)) return;
  started = true;
  // Acknowledge receipt before opening the picker, which may close the sending popup.
  sendResponse({ accepted: true });
  void save(message.content, message.format, message.context);
});

setTimeout(() => {
  if (!started) status.textContent = 'No export was received. Close this tab and try Save again from the extension.';
}, 6000);
