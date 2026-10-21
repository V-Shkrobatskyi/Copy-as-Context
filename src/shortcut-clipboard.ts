// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

/** Self-contained for isolated-world injection; never place exported text in the page DOM. */
export async function copyShortcutContext(content: string, sourceUrl: string): Promise<boolean> {
  if (location.href !== sourceUrl || !document.hasFocus()) return false;
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(content); return true; }
    catch { /* HTTP pages and clipboard policies may require the legacy API. */ }
  }
  const previous = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const field = document.createElement('textarea');
  field.value = ' ';
  field.setAttribute('aria-hidden', 'true');
  shadow.append(field);
  let copied = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault(); event.stopImmediatePropagation();
    event.clipboardData.setData('text/plain', content);
    copied = true;
  };
  window.addEventListener('copy', onCopy, true);
  document.documentElement.append(host);
  try {
    field.focus({ preventScroll: true }); field.select();
    return document.execCommand('copy') && copied;
  } finally {
    window.removeEventListener('copy', onCopy, true);
    host.remove();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); for (const range of ranges) selection.addRange(range); }
  }
}
