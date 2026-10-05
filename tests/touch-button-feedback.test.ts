import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { installTouchButtonFeedback } from '@/src/touch-button-feedback';

function touch(button: HTMLButtonElement, window: JSDOM['window'], type: string): void {
  const event = new window.Event(type);
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  button.dispatchEvent(event);
}

it('shows Android contact and clears immediately on release without a click flash', () => {
  const dom = new JSDOM('<button>Save preferences</button>');
  const button = dom.window.document.querySelector('button')!;
  installTouchButtonFeedback(button, () => true);
  touch(button, dom.window, 'pointerdown');
  expect(button.classList.contains('is-pressed')).toBe(true);
  touch(button, dom.window, 'pointerup');
  expect(button.classList.contains('is-pressed')).toBe(false);
  button.click();
  expect(button.classList.contains('is-pressed')).toBe(false);
  touch(button, dom.window, 'pointerdown');
  expect(button.classList.contains('is-pressed')).toBe(true);
  touch(button, dom.window, 'pointercancel');
  expect(button.classList.contains('is-pressed')).toBe(false);
  dom.window.close();
});

it('leaves Desktop and disabled controls unchanged', () => {
  const dom = new JSDOM('<button>Save preferences</button>');
  const button = dom.window.document.querySelector('button')!;
  installTouchButtonFeedback(button, () => false);
  touch(button, dom.window, 'pointerdown');
  expect(button.classList.contains('is-pressed')).toBe(false);
  button.disabled = true;
  installTouchButtonFeedback(button, () => true);
  touch(button, dom.window, 'pointerdown');
  expect(button.classList.contains('is-pressed')).toBe(false);
  dom.window.close();
});
