import { browser } from 'wxt/browser';
import type { CaptureTab } from '../capture';
import type { CaptureOutcome } from '../types';
import type { CaptureErrorCode } from '../../core';
import { isDomCaptureOutcome } from '../dom/validate';

const inFlight = new Set<number>();
const CAPTURE_TIMEOUT = 8_000;
const failure = (code: CaptureErrorCode, message: string): CaptureOutcome => ({ ok: false, error: { code, message } });

function injectionFailure(error: unknown): CaptureOutcome {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/missing host permission|permission|not allowed|cannot access|restricted|access denied/u.test(message)) return failure('permission-denied', 'The browser denied access to this page.');
  if (/no tab|invalid tab|tab.*closed|frame.*removed/u.test(message)) return failure('page-changed', 'The page changed before capture finished.');
  return failure('capture-failed', 'Unable to capture this page’s semantic structure.');
}

/** One on-demand isolated-world injection; no page listeners or retained trees. */
export async function captureFirefoxPage(tab: CaptureTab, capturedAt: string): Promise<CaptureOutcome> {
  if (inFlight.has(tab.id)) return failure('capture-failed', 'A capture is already running for this tab.');
  inFlight.add(tab.id);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let navigation = false;
  let finished = false;
  const updated = (id: number, info: { status?: string; url?: string }): void => {
    if (id === tab.id && (info.status === 'loading' || info.url !== undefined)) navigation = true;
  };
  const removed = (id: number): void => { if (id === tab.id) navigation = true; };
  try {
    browser.tabs.onUpdated.addListener(updated);
    browser.tabs.onRemoved.addListener(removed);
    const operation = async (): Promise<CaptureOutcome> => {
      const result = await browser.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['/dom-capture.js'], world: 'ISOLATED' });
      if (finished) return failure('capture-timeout', 'Page capture took too long. Try again.');
      if (navigation) return failure('page-changed', 'The page changed before capture finished.');
      if (result.length !== 1 || result[0]?.frameId !== 0 || !isDomCaptureOutcome(result[0].result)) return failure('invalid-tree', 'The page returned an invalid semantic tree.');
      const captured = result[0].result;
      if (!captured.ok) return failure(captured.error.code, captured.error.code === 'capture-limit' ? 'This page exceeds the capture limits.' : 'Unable to capture this page’s semantic structure.');
      const current = await browser.tabs.get(tab.id);
      if (navigation || current.url !== undefined && current.url !== captured.tree.sourceUrl || tab.url !== undefined && tab.url !== captured.tree.sourceUrl) return failure('page-changed', 'The page changed before capture finished.');
      return { ...captured, tree: { ...captured.tree, capturedAt } };
    };
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('capture-timeout')), CAPTURE_TIMEOUT); }),
    ]);
  } catch (error) {
    if (navigation) return failure('page-changed', 'The page changed before capture finished.');
    if (error instanceof Error && error.message === 'capture-timeout') return failure('capture-timeout', 'Page capture took too long. Try again.');
    return injectionFailure(error);
  } finally {
    finished = true;
    if (timer !== undefined) clearTimeout(timer);
    browser.tabs.onUpdated.removeListener(updated);
    browser.tabs.onRemoved.removeListener(removed);
    inFlight.delete(tab.id);
  }
}
