// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { browser } from 'wxt/browser';
import { installElementPicker } from '../src/element-picker';
import { PICKER_PORT, PICKER_SAVE_PERMISSION, type PickerGlobal } from '../src/element-picker-protocol';
import { watchPickerTheme } from '../src/element-picker-theme';

/** Installed on demand in the main document's isolated world. */
export default defineUnlistedScript({
  main() {
    const scope = globalThis as PickerGlobal & { __copyAsContextStartPicker?: (token: string) => void };
    scope.__copyAsContextStartPicker ??= token => {
      scope.__copyAsContextPicker?.close();
      const port = browser.runtime.connect({ name: `${PICKER_PORT}${token}` });
      scope.__copyAsContextPicker = installElementPicker(document, token, {
        watchTheme: watchPickerTheme,
        send: (type, details) => port.postMessage({ type, ...details }),
        beforeSave: () => import.meta.env.BROWSER === 'firefox'
          ? browser.runtime.sendMessage({ type: PICKER_SAVE_PERMISSION, token }).then(reply => reply?.granted === true)
          : Promise.resolve(true),
        listen: listener => { port.onMessage.addListener(listener); return () => port.onMessage.removeListener(listener); },
        disconnected: listener => { port.onDisconnect.addListener(listener); return () => port.onDisconnect.removeListener(listener); },
        close: () => { port.disconnect(); delete scope.__copyAsContextPicker; },
      });
    };
  },
});
