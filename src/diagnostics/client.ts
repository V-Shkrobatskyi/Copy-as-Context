// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only
import { browser } from 'wxt/browser';
import type { EventInput } from './events';
let sink: ((event: EventInput) => Promise<void>) | undefined;
export function setTechnicalEventSink(value: (event: EventInput) => Promise<void>): void { sink = value; }
/** Best effort; callers pass enums and scalars, never content, errors or closures. */
export function technicalEvent(event: EventInput): void {
  if (sink) { void sink(event).catch(() => {}); return; }
  try { void browser.runtime.sendMessage({ type: 'diagnostics', action: 'event', event }).catch(() => {}); } catch { /* Logging never changes the user's operation. */ }
}
