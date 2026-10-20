// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

/** Content scripts also support HTTP, where navigator.clipboard is unavailable. */
export async function copySelectedContext(doc: Document, shadow: ShadowRoot, content: string): Promise<void> {
  if (doc.defaultView?.navigator.clipboard?.writeText) {
    try { await doc.defaultView.navigator.clipboard.writeText(content); return; }
    catch { /* Fall back for documents whose clipboard policy blocks the modern API. */ }
  }
  const field = doc.createElement('textarea');
  // Only a placeholder enters the DOM; the export is written directly to clipboardData.
  field.value = ' ';
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;opacity:0;width:1px;height:1px;pointer-events:none;';
  let copied = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault(); event.stopImmediatePropagation();
    event.clipboardData.setData('text/plain', content); copied = true;
  };
  doc.defaultView!.addEventListener('copy', onCopy, true);
  shadow.append(field);
  try {
    field.focus(); field.select();
    if (!doc.execCommand('copy') || !copied) throw new Error('Unable to copy the selected context. Try again.');
  } finally {
    doc.defaultView!.removeEventListener('copy', onCopy, true); field.remove();
  }
}
