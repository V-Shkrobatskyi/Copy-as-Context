// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import pageTheme from '../public/page-theme.css?raw';
import popupTheme from '../public/popup-theme.css?raw';

/** Reuse popup colors in the isolated UI without loading page-visible resources. */
export const ELEMENT_PICKER_STYLE = `${pageTheme.replaceAll(':root', ':host')}
${popupTheme.replace("@import './page-theme.css';", '').replaceAll(':root', ':host')}
  :host { background: transparent !important; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  #surface { position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; }
  #outline { position: fixed; border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); pointer-events: none; display: none; }
  #panel { position: fixed; bottom: 16px; right: 16px; max-width: calc(100vw - 32px); width: 320px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--background); color: var(--text); box-shadow: 0 6px 24px #17243a26; pointer-events: auto; font: 13px/1.35 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; direction: ltr; text-align: left; }
  #panel[data-mode="selected"] { width: 376px; padding: 16px; }
  .header { display: flex; align-items: center; gap: 10px; }
  .brand-mark { display: flex; width: 26px; height: 26px; flex: none; }
  .brand-mark svg { width: 100%; height: 100%; }
  #panel[data-mode="selected"] .brand-mark { width: 30px; height: 30px; }
  .heading { flex: 1; min-width: 0; }
  h2 { margin: 0; font: inherit; font-weight: 700; letter-spacing: -.01em; }
  #panel[data-mode="selected"] h2 { font-size: 16px; line-height: 1.25; }
  .intro { margin: 2px 0 0; font-size: 11px; color: var(--muted); }
  #status { margin: 12px 0 0; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--muted); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  #buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 12px; }
  button { min-width: 0; padding: 9px 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--accent-dark); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
  button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  button:disabled { opacity: .5; cursor: default; }
  #cancel { width: 28px; height: 28px; padding: 0; flex: none; display: grid; place-items: center; background: transparent; border-color: transparent; color: var(--muted); font-size: 21px; font-weight: 400; line-height: 1; }
  .export-actions { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  #copy { background: var(--accent); color: #fff; border-color: var(--accent); box-shadow: 0 1px 2px #263e8929; }
  button:active:not(:disabled) { background: var(--selected); border-color: var(--accent); }
  #copy:active:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
  @media (hover: hover) and (pointer: fine) {
    button:hover:not(:disabled) { background: var(--selected); border-color: var(--accent); }
    #copy:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
  }
  @media (prefers-color-scheme: dark) { #copy { color: var(--background); box-shadow: none; } }
`;
