import type { UserManifest } from 'wxt';

/** Keep browser capabilities separate without requesting persistent site access. */
export function browserManifest(target: string, androidProbe = false): UserManifest {
  return {
    name: 'Copy as Context',
    description: 'Copy a compact semantic representation of the current page for LLM chats.',
    permissions: target === 'firefox'
      ? ['activeTab', 'scripting', 'clipboardWrite', 'storage', ...(!androidProbe ? ['downloads'] : [])]
      : ['debugger', 'clipboardWrite', 'downloads', 'storage'],
    ...(target === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: '{e97aa566-cac0-4e2c-81f7-0ab664bf86ce}',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        ...(androidProbe ? { gecko_android: { strict_min_version: '142.0' } } : {}),
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
