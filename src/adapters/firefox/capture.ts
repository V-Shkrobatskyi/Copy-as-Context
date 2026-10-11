import { browser } from 'wxt/browser';
import { createFirefoxCapturer } from './capture-frames';
import { FIREFOX_FRAME_ORIGINS } from '../../firefox-site-permissions';

export const captureFirefoxPage = createFirefoxCapturer({
  allowCrossOrigin: () => browser.permissions.contains({ origins: FIREFOX_FRAME_ORIGINS }),
  execute(details) {
    if ('files' in details) return browser.scripting.executeScript({ target: details.target, world: details.world, files: ['/frame-capture.js'] });
    return browser.scripting.executeScript(details);
  },
  getTab: tabId => browser.tabs.get(tabId),
  onUpdated(listener) {
    browser.tabs.onUpdated.addListener(listener);
    return () => browser.tabs.onUpdated.removeListener(listener);
  },
  onRemoved(listener) {
    browser.tabs.onRemoved.addListener(listener);
    return () => browser.tabs.onRemoved.removeListener(listener);
  },
});
