import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

function loadGuide(hash = '') {
  const panels = { 'guide-en': { hidden: false }, 'guide-uk': { hidden: true } };
  const buttons = ['en', 'uk'].map((language) => ({
    dataset: { language },
    pressed: '',
    click: () => {},
    setAttribute(_name: string, value: string) { this.pressed = value; },
    addEventListener(_name: string, listener: () => void) { this.click = listener; },
  }));
  const document: {
    documentElement: { lang: string };
    title: string;
    querySelectorAll: () => typeof buttons;
    getElementById: (id: keyof typeof panels) => (typeof panels)[keyof typeof panels];
  } = {
    documentElement: { lang: 'en' },
    title: '',
    querySelectorAll: () => buttons,
    getElementById: (id: keyof typeof panels) => panels[id],
  };
  let hashchange = () => {};
  const window = {
    location: { hash },
    addEventListener: (_name: string, listener: () => void) => { hashchange = listener; },
  };
  runInNewContext(readFileSync(new URL('../public/guide.js', import.meta.url), 'utf8'), { document, window });
  return { panels, buttons, document, window, hashchange: () => hashchange() };
}

describe('guide language switch', () => {
  it('defaults to English and switches both ways with accessible selection state', () => {
    const guide = loadGuide();
    expect(guide.panels['guide-en'].hidden).toBe(false);
    expect(guide.panels['guide-uk'].hidden).toBe(true);
    guide.buttons[1]!.click();
    expect(guide.document.documentElement.lang).toBe('uk');
    expect(guide.document.title).toContain('Посібник користувача');
    expect(guide.panels['guide-en'].hidden).toBe(true);
    expect(guide.panels['guide-uk'].hidden).toBe(false);
    expect(guide.buttons.map((button) => button.pressed)).toEqual(['false', 'true']);
    guide.buttons[0]!.click();
    expect(guide.document.documentElement.lang).toBe('en');
    expect(guide.panels['guide-en'].hidden).toBe(false);
    expect(guide.panels['guide-uk'].hidden).toBe(true);
  });

  it('opens Ukrainian links and responds to history navigation with a safe fallback', () => {
    const guide = loadGuide('#uk');
    expect(guide.document.documentElement.lang).toBe('uk');
    guide.window.location.hash = '#en';
    guide.hashchange();
    expect(guide.document.documentElement.lang).toBe('en');
    guide.window.location.hash = '#unknown';
    guide.hashchange();
    expect(guide.document.documentElement.lang).toBe('en');
  });
});
