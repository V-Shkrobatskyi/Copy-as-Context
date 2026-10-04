import { describe, expect, it } from 'vitest';
import { resolveBrowserInfo } from '../../src/platform/browser-info';

describe('browser metadata', () => {
  it.each(['android', 'mac'])('uses Firefox runtime identity and %s platform', async (os) => {
    expect(await resolveBrowserInfo({ getBrowserInfo: async () => ({ name: 'Firefox', version: '157.0' }), getPlatformInfo: async () => ({ os }) }))
      .toBe(`Firefox ${os === 'android' ? 'Android' : 'Desktop'} 157.0`);
  });
  it('uses full Chrome hints and ignores GREASE', async () => {
    expect(await resolveBrowserInfo({ userAgentData: { platform: 'macOS', getHighEntropyValues: async () => ({ fullVersionList: [{ brand: 'Not_A Brand', version: '99' }, { brand: 'Chromium', version: '154.0.8037.97' }, { brand: 'Google Chrome', version: '154.0.8037.97' }] }) } }))
      .toBe('Chrome Desktop 154.0.8037.97');
  });
  it('preserves an explicit derivative brand', async () => {
    expect(await resolveBrowserInfo({ userAgent: 'Windows Chrome/154.0.0.0 Edg/154.0.1.2', userAgentData: { brands: [{ brand: 'Google Chrome', version: '154' }] } })).toBe('Edge Desktop 154.0.1.2');
    expect(await resolveBrowserInfo({ userAgent: 'X11 Chrome/154.0.0.0 OPR/120.0.1' })).toBe('Opera Desktop 120.0.1');
  });
  it('does not claim Chrome or a full version from reduced UA', async () => {
    expect(await resolveBrowserInfo({ userAgent: 'Macintosh Chrome/154.0.0.0' })).toBe('Chromium Desktop 154');
  });
  it('handles missing data, rejection and timeout', async () => {
    expect(await resolveBrowserInfo({})).toBe('Unavailable');
    expect(await resolveBrowserInfo({ getBrowserInfo: async () => { throw Error('Unavailable'); }, userAgent: 'Android Firefox/157.0' })).toBe('Firefox Android 157.0');
    expect(await resolveBrowserInfo({ getBrowserInfo: () => new Promise(() => {}), userAgent: 'X11 Chrome/154.0.0.0' }, 5)).toBe('Chromium Desktop 154');
  });
  it('cleans metadata and omits invalid versions and unknown platform', async () => {
    expect(await resolveBrowserInfo({ getBrowserInfo: async () => ({ name: 'Firefox\nTest', version: '157.0\nInjected' }) })).toBe('Firefox Test');
  });
});
