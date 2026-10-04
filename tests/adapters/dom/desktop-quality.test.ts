import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { captureDomPage } from '@/src/adapters/dom/capture';
import { assertDesktopQuality, assertDesktopUpdate, updateDesktopFixture } from '../../helpers/desktop-quality';

it('preserves the independent Desktop holdout contract across profiles, formats, privacy and SPA updates', () => {
  const dom = new JSDOM(readFileSync('tests/fixtures/quality/desktop-holdout.html', 'utf8'), { url: 'https://example.test/', runScripts: 'dangerously' });
  try {
    let passwordReads = 0;
    Object.defineProperty(dom.window.document.querySelector('input[type="password"]'), 'value', { get() { passwordReads++; throw new Error('Password read'); } });
    const initial = captureDomPage(dom.window.document);
    expect(initial.ok).toBe(true);
    if (!initial.ok) throw new Error(initial.error.code);
    assertDesktopQuality(initial.tree);
    dom.window.eval(updateDesktopFixture);
    const updated = captureDomPage(dom.window.document);
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error(updated.error.code);
    assertDesktopUpdate(updated.tree);
    expect(passwordReads).toBe(0);
  } finally { dom.window.close(); }
});
