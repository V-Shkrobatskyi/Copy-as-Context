// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { inspectFrameOwner } from '@/src/adapters/chrome/frame-visibility';

function inspect(css: string, width = 300, height = 150, parentCss = '', top = 0) {
  const dom = new JSDOM(`<div style="${parentCss}"><iframe style="${css}"></iframe></div>`);
  try {
    const frame = dom.window.document.querySelector('iframe')!;
    frame.getBoundingClientRect = () => ({ width, height, top }) as DOMRect;
    return inspectFrameOwner.call(frame);
  } finally { dom.window.close(); }
}

describe('iframe owner selection', () => {
  it.each(['display:none', 'visibility:hidden', 'visibility:collapse', 'opacity:0', 'content-visibility:hidden'])('filters %s on owners and ancestors', (css) => {
    expect(inspect(css)).toBe('hidden');
    expect(inspect('', 300, 150, css)).toBe('hidden');
  });
  it('filters zero-area and tracking pixels, keeping small widgets and below-viewport content', () => {
    expect(inspect('', 0, 100)).toBe('hidden');
    expect(inspect('', 1, 1)).toBe('technical');
    expect(inspect('', 24, 24)).toBe('visible');
    expect(inspect('', 300, 150, '', 5000)).toBe('visible');
  });
  it('filters content entirely clipped by an overflow-hidden ancestor', () => {
    const dom = new JSDOM('<div style="overflow:hidden"><iframe></iframe></div>');
    try {
      const frame = dom.window.document.querySelector('iframe')!;
      frame.getBoundingClientRect = () => ({ width: 100, height: 100, left: 200, right: 300, top: 200, bottom: 300 }) as DOMRect;
      frame.parentElement!.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 100 }) as DOMRect;
      expect(inspectFrameOwner.call(frame)).toBe('hidden');
    } finally { dom.window.close(); }
  });
  it('does not mistake presentation attributes for CSS invisibility', () => {
    expect(inspect('opacity:0.5')).toBe('visible');
  });
});
