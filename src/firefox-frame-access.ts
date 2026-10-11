import { browser } from 'wxt/browser';
import { FIREFOX_FRAME_ORIGINS } from './firefox-site-permissions';

export interface FrameAccessToggle {
  readonly pending: boolean;
  setPending(pending: boolean): void;
}

/** Browser permissions are the saved setting; export actions never request site access. */
export function installFrameAccessToggle(input: HTMLInputElement, feedback: (message: string) => void,
  setBusy: (pending: boolean) => void): FrameAccessToggle {
  let exporting = false;
  let changing = false;
  let loading = true;
  let revision = 0;
  const update = (): void => {
    input.disabled = exporting || changing || loading;
    setBusy(changing || loading);
  };
  const refresh = async (): Promise<void> => {
    const current = ++revision;
    try {
      const granted = await browser.permissions.contains({ origins: FIREFOX_FRAME_ORIGINS });
      if (current === revision) input.checked = granted;
    } catch {
      if (current === revision) { input.checked = false; feedback('Unable to read site access. Reopen the popup to try again.'); }
    } finally {
      if (current === revision) { loading = false; update(); }
    }
  };
  input.checked = false;
  input.addEventListener('change', () => {
    if (changing || exporting || loading) return;
    const enabled = input.checked;
    changing = true; revision++; update();
    void (async () => {
      try {
        if (enabled) {
          // The request must run in this click's handler, before any await.
          const granted = await browser.permissions.request({ origins: FIREFOX_FRAME_ORIGINS });
          feedback(granted ? 'Other-site frames enabled. Use Copy or Save to capture again.' : 'Site access was not granted. Other-site frames remain disabled.');
        } else {
          // Remove earlier individual grants too, without touching downloads permission.
          const permissions = await browser.permissions.getAll();
          const origins = permissions.origins ?? [];
          const removed = !origins.length || await browser.permissions.remove({ origins });
          feedback(removed ? 'Other-site frames disabled and site access removed.' : 'Unable to remove all site access. Check Firefox extension permissions.');
        }
      } catch { feedback(enabled ? 'Unable to request site access.' : 'Unable to remove site access.'); }
      finally { changing = false; await refresh(); }
    })();
  });
  const changed = (): void => { if (!changing) void refresh(); };
  browser.permissions.onAdded.addListener(changed);
  browser.permissions.onRemoved.addListener(changed);
  window.addEventListener('unload', () => {
    revision++;
    browser.permissions.onAdded.removeListener(changed);
    browser.permissions.onRemoved.removeListener(changed);
  }, { once: true });
  update(); void refresh();
  return {
    get pending() { return changing || loading; },
    setPending(pending) { exporting = pending; update(); },
  };
}
