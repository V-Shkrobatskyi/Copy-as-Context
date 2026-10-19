// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only

export const DEMO_CAPTURE = 'filter-demo-capture';
export const DEMO_CAPTURE_TIMEOUT = 10_000;

/** Only this packaged page may opt in to self-capture; other extension pages stay blocked. */
export function isOwnFilterDemo(url: unknown, demoUrl: string): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (!['chrome-extension:', 'moz-extension:'].includes(parsed.protocol)) return false;
    if (parsed.hash && !/^#[a-zA-Z0-9_-]{1,64}$/u.test(parsed.hash)) return false;
    parsed.hash = '';
    return parsed.href === demoUrl && parsed.pathname === '/demo.html';
  } catch { return false; }
}
