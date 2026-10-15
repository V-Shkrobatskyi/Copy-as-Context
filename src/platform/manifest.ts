// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import type { UserManifest } from 'wxt';

/** Keep browser capabilities separate with optional site access in Firefox. */
export function browserManifest(target: string): UserManifest {
  return {
    name: 'Copy as Context',
    description: 'Copy a compact semantic representation of the current page for LLM chats.',
    permissions: target === 'firefox'
      ? ['activeTab', 'scripting', 'clipboardWrite', 'storage']
      : ['debugger', 'clipboardWrite', 'downloads', 'storage'],
    ...(target === 'firefox' ? {} : { minimum_chrome_version: '125' }),
    ...(target === 'firefox' ? {
      optional_permissions: ['downloads'],
      optional_host_permissions: ['http://*/*', 'https://*/*'],
      browser_specific_settings: {
        gecko: {
          id: '{e97aa566-cac0-4e2c-81f7-0ab664bf86ce}',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    } : {}),
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
  };
}
