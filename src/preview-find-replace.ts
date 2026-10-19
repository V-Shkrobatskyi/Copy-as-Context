// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { MAX_PREVIEW_CHARACTERS } from './preview-message';

function revealSelection(editor: HTMLTextAreaElement): void {
  if (!editor.clientWidth || !editor.clientHeight) return;
  // Textarea selections have no DOM range. Measure an inert copy with the same
  // wrapping and typography, including the actual width beside its scrollbar.
  const mirror = document.createElement('div');
  const style = getComputedStyle(editor);
  for (const property of [
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing', 'text-indent', 'text-align',
    'text-transform', 'tab-size', 'direction', 'white-space', 'overflow-wrap',
    'word-break', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  ]) mirror.style.setProperty(property, style.getPropertyValue(property));
  Object.assign(mirror.style, {
    position: 'fixed', top: '0', left: '0', visibility: 'hidden',
    pointerEvents: 'none', boxSizing: 'border-box', width: `${editor.clientWidth}px`,
  });
  mirror.setAttribute('aria-hidden', 'true');
  // The following line completes word wrapping at the match without laying out
  // the rest of a potentially large draft.
  const nextLine = editor.value.indexOf('\n', editor.selectionEnd);
  mirror.textContent = editor.value.slice(0, nextLine < 0 ? undefined : nextLine + 1);
  document.body.append(mirror);
  try {
    const text = mirror.firstChild;
    if (!text) return;
    const range = document.createRange();
    range.setStart(text, editor.selectionStart);
    range.setEnd(text, editor.selectionEnd);
    const hit = range.getClientRects()[0];
    if (!hit) return;
    const bounds = mirror.getBoundingClientRect();
    editor.scrollTop = hit.top - bounds.top - (editor.clientHeight - hit.height) / 2;
    editor.scrollLeft = Math.max(0, hit.left - bounds.left - editor.clientWidth / 2);
  } finally { mirror.remove(); }
}

/** Search stays local to the draft and never interprets queries or replacements as code. */
export function setupFindReplace(editor: HTMLTextAreaElement, available: () => boolean) {
  const find = document.querySelector<HTMLInputElement>('#find-text')!;
  const replacement = document.querySelector<HTMLInputElement>('#replace-text')!;
  const matchCase = document.querySelector<HTMLInputElement>('#match-case')!;
  const previous = document.querySelector<HTMLButtonElement>('#find-previous')!;
  const next = document.querySelector<HTMLButtonElement>('#find-next')!;
  const replace = document.querySelector<HTMLButtonElement>('#replace-one')!;
  const replaceAll = document.querySelector<HTMLButtonElement>('#replace-all')!;
  const status = document.querySelector<HTMLElement>('#find-status')!;

  function pattern(): RegExp {
    return new RegExp(find.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase.checked ? 'gu' : 'giu');
  }

  // Scan without retaining every match: large drafts may contain millions of hits.
  function scan(direction?: 'next' | 'previous', from = editor.selectionEnd) {
    let count = 0;
    let matchedLength = 0;
    let current = 0;
    let target: { start: number; end: number } | undefined;
    let first: typeof target;
    let last: typeof target;
    if (find.value) {
      for (const match of editor.value.matchAll(pattern())) {
        const hit = { start: match.index, end: match.index + match[0].length };
        count++;
        matchedLength += match[0].length;
        first ??= hit;
        last = hit;
        if (hit.start === editor.selectionStart && hit.end === editor.selectionEnd) current = count;
        if (direction === 'next' && hit.start >= from) target ??= hit;
        if (direction === 'previous' && hit.start < from) target = hit;
      }
    }
    if (direction) target ??= direction === 'next' ? first : last;
    return { count, current, target, matchedLength };
  }

  function refresh(): void {
    const { count, current } = scan();
    const disabled = !available() || !count;
    previous.disabled = next.disabled = replace.disabled = replaceAll.disabled = disabled;
    find.disabled = replacement.disabled = matchCase.disabled = !available();
    status.textContent = !find.value ? ''
      : !count ? 'No matches.' : current ? `${current} of ${count} matches.` : `${count} match${count === 1 ? '' : 'es'}.`;
  }

  function navigate(direction: 'next' | 'previous', from?: number): void {
    if (!available() || !find.value) return;
    const { target } = scan(direction, from ?? (direction === 'next' ? editor.selectionEnd : editor.selectionStart));
    if (target) {
      editor.focus();
      editor.setSelectionRange(target.start, target.end);
      revealSelection(editor);
    }
    refresh();
  }

  function apply(all: boolean): void {
    if (!available() || !find.value) return;
    const { count, current, matchedLength } = scan();
    if (!count) return;
    if (!all && !current) {
      const { target } = scan('next');
      if (!target) return;
      editor.setSelectionRange(target.start, target.end);
    }
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const length = editor.value.length + (all ? count * replacement.value.length : replacement.value.length) -
      (all ? matchedLength : end - start);
    if (length > MAX_PREVIEW_CHARACTERS) {
      status.textContent = `Replacement exceeds the ${MAX_PREVIEW_CHARACTERS.toLocaleString('en-US')}-character limit. Use a shorter replacement.`;
      return;
    }
    if (all) editor.value = editor.value.replace(pattern(), () => replacement.value);
    else editor.setRangeText(replacement.value, start, end, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    if (all) { refresh(); status.textContent = `Replaced ${count} match${count === 1 ? '' : 'es'}.`; }
    else navigate('next', start + replacement.value.length);
  }

  find.addEventListener('input', refresh);
  matchCase.addEventListener('change', refresh);
  previous.addEventListener('click', () => navigate('previous'));
  next.addEventListener('click', () => navigate('next'));
  replace.addEventListener('click', () => apply(false));
  replaceAll.addEventListener('click', () => apply(true));
  editor.addEventListener('select', refresh);
  find.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); navigate(event.shiftKey ? 'previous' : 'next'); }
  });
  function onKeyDown(event: KeyboardEvent): void {
    if (!available() || event.altKey) return;
    if ((event.ctrlKey || event.metaKey) && ['f', 'h'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
      if (selected && !/[\r\n]/u.test(selected)) find.value = selected;
      (event.key.toLowerCase() === 'h' ? replacement : find).focus();
      refresh();
    }
    if (event.key === 'Escape' && [find, replacement, matchCase].includes(document.activeElement as HTMLInputElement)) editor.focus();
  }
  document.addEventListener('keydown', onKeyDown);

  return {
    refresh,
    clear() { find.value = replacement.value = ''; matchCase.checked = false; refresh(); },
    dispose() { document.removeEventListener('keydown', onKeyDown); },
  };
}
