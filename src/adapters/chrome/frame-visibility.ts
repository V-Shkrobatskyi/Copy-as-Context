/** Executed against the iframe owner, without reading page text or form values. */
export function inspectFrameOwner(this: Element): 'visible' | 'hidden' | 'technical' | 'unknown' {
  if (!this.isConnected || !this.ownerDocument.defaultView) return 'unknown';
  const view = this.ownerDocument.defaultView;
  const rect = this.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return 'unknown';
  for (let ancestor: Element | null = this; ancestor; ) {
    const style = view.getComputedStyle(ancestor);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
        style.contentVisibility === 'hidden' || Number(style.opacity) === 0) return 'hidden';
    if (ancestor !== this) {
      const clip = ancestor.getBoundingClientRect();
      const clipsX = ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflow);
      const clipsY = ['hidden', 'clip'].includes(style.overflowY) || ['hidden', 'clip'].includes(style.overflow);
      if (clipsX && (clip.right <= rect.left || clip.left >= rect.right) ||
          clipsY && (clip.bottom <= rect.top || clip.top >= rect.bottom)) return 'hidden';
    }
    // Continue through shadow hosts as well as ordinary DOM parents.
    const root = ancestor.getRootNode();
    ancestor = ancestor.parentElement ?? (root instanceof view.ShadowRoot ? root.host : null);
  }
  if (rect.width <= 0 || rect.height <= 0) return 'hidden';
  if (rect.width <= 1 && rect.height <= 1 || this.clientWidth === 1 && this.clientHeight === 1) return 'technical';
  // A frame below the viewport is still part of the user's scrollable document.
  return 'visible';
}
