// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

export type FrameVisibility = 'visible' | 'hidden' | 'technical' | 'unknown';

/** Inspect only the owner and its ancestors before reading an embedded document. */
export function frameVisibility(element: Element): FrameVisibility {
  const view = element.ownerDocument.defaultView;
  if (!element.isConnected || !view) return 'unknown';
  const rect = element.getBoundingClientRect();
  if (![rect.width, rect.height, rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)) return 'unknown';
  for (let ancestor: Element | null = element; ancestor;) {
    const style = view.getComputedStyle(ancestor);
    if (ancestor.hasAttribute('hidden') || ancestor.hasAttribute('inert') || ancestor.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
      style.contentVisibility === 'hidden' || Number(style.opacity || '1') === 0 ||
      ancestor.localName === 'dialog' && !ancestor.hasAttribute('open') ||
      ancestor.localName === 'details' && !ancestor.hasAttribute('open') && !ancestor.querySelector('summary')?.contains(element)) return 'hidden';
    if (ancestor !== element) {
      const clip = ancestor.getBoundingClientRect();
      const clipsX = ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflow);
      const clipsY = ['hidden', 'clip'].includes(style.overflowY) || ['hidden', 'clip'].includes(style.overflow);
      if (clipsX && (clip.right <= rect.left || clip.left >= rect.right) || clipsY && (clip.bottom <= rect.top || clip.top >= rect.bottom)) return 'hidden';
    }
    const root = ancestor.getRootNode();
    ancestor = ancestor.parentElement ?? (root instanceof view.ShadowRoot ? root.host : null);
  }
  if (rect.width <= 0 || rect.height <= 0) return 'hidden';
  if (rect.width <= 1 && rect.height <= 1 || element.clientWidth === 1 && element.clientHeight === 1) return 'technical';
  return 'visible';
}
