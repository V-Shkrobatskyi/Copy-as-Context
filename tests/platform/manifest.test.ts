import { describe, expect, it } from 'vitest';
import { browserManifest } from '@/src/platform/manifest';

describe('browser capabilities', () => {
  it('keeps Chrome debugger permissions and omits Firefox settings', () => {
    const manifest = browserManifest('chrome');
    expect(manifest.permissions).toEqual(['debugger', 'clipboardWrite', 'downloads', 'storage']);
    expect(manifest.browser_specific_settings).toBeUndefined();
    expect(manifest.host_permissions).toBeUndefined();
  });

  it('uses on-demand Firefox capabilities without debugger or broad host access', () => {
    const manifest = browserManifest('firefox');
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'clipboardWrite', 'storage', 'downloads']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.browser_specific_settings?.gecko).toEqual({
      id: '{e97aa566-cac0-4e2c-81f7-0ab664bf86ce}',
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'] },
    });
    expect(manifest.browser_specific_settings?.gecko_android).toBeUndefined();
  });

  it('enables Android only in the explicit copy-only probe without unsupported downloads permission', () => {
    const manifest = browserManifest('firefox', true);
    expect(manifest.browser_specific_settings?.gecko_android).toEqual({ strict_min_version: '142.0' });
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'clipboardWrite', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });
});
