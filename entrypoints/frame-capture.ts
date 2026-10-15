// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { browser } from 'wxt/browser';
import { createFrameHandler } from '../src/adapters/firefox/frame-helper';
import type { FrameGlobal } from '../src/adapters/firefox/frame-contract';

/** Install an idempotent dispatcher in the extension's isolated world, on demand. */
export default defineUnlistedScript({
  include: ['firefox'],
  main() {
    const scope = globalThis as FrameGlobal;
    const runtime = browser.runtime as typeof browser.runtime & { getFrameId(target: Element | Window): number };
    scope.__copyAsContextFrames ??= createFrameHandler(document, target => runtime.getFrameId(target));
  },
});
