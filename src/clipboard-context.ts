import type { CompressionLevel } from '@/src/core';

/** Adds clipboard-only boundaries without changing the serialized page context. */
export function wrapClipboardContext(content: string, compression: CompressionLevel): string {
  const opening = compression === 'maximum' ? '**' : '<web_page>';
  const closing = compression === 'maximum' ? '**' : '</web_page>';
  const separator = content.length === 0 || /\r?\n$/u.test(content) ? '' : '\n';
  return `${opening}\n${content}${separator}${closing}\n`;
}
