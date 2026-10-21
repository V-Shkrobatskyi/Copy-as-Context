// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import '../save/style.css';
import { browser } from 'wxt/browser';
import { saveContextFile } from '@/src/save-context';
import { receivePreview } from '@/src/preview-session';
import { isPreviewToken, type PreviewPayload } from '@/src/preview-message';

const status = document.querySelector<HTMLElement>('#status')!;
const token = location.hash.slice(1);
let stop = () => {};
async function close() {
  stop();
  const tab = await browser.tabs.getCurrent();
  if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
}
document.querySelector('#close')!.addEventListener('click', () => void close());
async function save(payload: PreviewPayload) {
  try {
    status.textContent = 'Choose where to save your file. Keep this tab open until saving finishes.';
    await saveContextFile(payload.content, payload.format, undefined, payload);
    await close();
  } catch {
    status.textContent = 'Unable to save the file, or saving was cancelled. Close this tab and try Save to file again.';
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) await browser.tabs.update(tab.id, { active: true }).catch(() => {});
  }
}
if (isPreviewToken(token)) stop = receivePreview(token, payload => { void save(payload); }, () => { status.textContent = 'No export was received. Close this tab and try Save again.'; });
else status.textContent = 'No export was received. Close this tab and try Save again.';
window.addEventListener('pagehide', () => stop(), { once: true });
