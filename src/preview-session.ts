// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { browser } from 'wxt/browser';

import { isPreviewPayload, PREVIEW_PORT_PREFIX, PREVIEW_TIMEOUT_MS, type PreviewPayload } from './preview-message';

type PreviewPort = ReturnType<typeof browser.runtime.connect>;

/** Transfer to one authenticated document, then activate it after receipt. */
export async function openPreview(payload: PreviewPayload, signal?: AbortSignal): Promise<void> {
  return openExportDocument(payload, '/preview.html', true, signal);
}

/** Downloads own their blob in an extension document, independently of the source page. */
export async function openSelectionSave(payload: PreviewPayload, signal?: AbortSignal): Promise<void> {
  return openExportDocument(payload, '/selection-save.html', false, signal);
}

async function openExportDocument(payload: PreviewPayload, path: '/preview.html' | '/selection-save.html', activate: boolean, signal?: AbortSignal): Promise<void> {
  if (!isPreviewPayload(payload)) throw new Error('invalid-preview');
  if (signal?.aborted) throw new Error('preview-cancelled');
  const token = crypto.randomUUID();
  const url = `${browser.runtime.getURL(path)}#${token}`;
  let tabId: number | undefined;
  let port: PreviewPort | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let accepted = false;
  let cancelled = false;
  let finish!: () => void;
  let fail!: (reason: Error) => void;
  const received = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  // Attach the rejection handler immediately, including while tabs.create is pending.
  void received.catch(() => {});
  const onMessage = (message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const reply = message as { type?: string; token?: string };
    if (reply.type !== 'preview-accepted-v1' || reply.token !== token || accepted) return;
    accepted = true;
    finish();
  };
  const onDisconnect = () => {
    // Read lastError so a closed receiver does not produce an unchecked API error.
    void browser.runtime.lastError;
    if (!accepted) fail(new Error('preview-disconnected'));
  };
  const onConnect = (candidate: PreviewPort) => {
    if (candidate.name !== `${PREVIEW_PORT_PREFIX}${token}`) return;
    if (candidate.sender?.id !== browser.runtime.id || tabId === undefined ||
      candidate.sender.tab?.id !== tabId || candidate.sender.url !== url || port) {
      candidate.disconnect();
      return;
    }
    port = candidate;
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    try { port.postMessage({ type: 'preview-content-v1', token, payload }); }
    catch { fail(new Error('preview-delivery-failed')); }
  };
  const onPageHide = () => fail(new Error('preview-cancelled'));
  browser.runtime.onConnect.addListener(onConnect);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);
  signal?.addEventListener('abort', onPageHide, { once: true });
  timer = setTimeout(() => fail(new Error('preview-timeout')), PREVIEW_TIMEOUT_MS);
  try {
    const creation = browser.tabs.create({ url, active: false });
    // A late tabs.create response must not leave an orphan after timeout/unload.
    void creation.then(tab => {
      if (cancelled && tab.id !== undefined) void browser.tabs.remove(tab.id).catch(() => {});
    }, () => {});
    const tab = await Promise.race([
      creation,
      received.then(() => { throw new Error('preview-tab-unavailable'); }),
    ]);
    tabId = tab.id;
    if (tabId === undefined) throw new Error('preview-tab-unavailable');
    await received;
    if (signal?.aborted) throw new Error('preview-cancelled');
    // Release the payload and listeners before activation can close the popup.
    cleanup();
    if (activate) await browser.tabs.update(tabId, { active: true });
    if (signal?.aborted) throw new Error('preview-cancelled');
  } catch (error) {
    cancelled = true;
    if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => {});
    throw error;
  } finally {
    cleanup();
  }

  function cleanup(): void {
    clearTimeout(timer);
    browser.runtime.onConnect.removeListener(onConnect);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
    signal?.removeEventListener('abort', onPageHide);
    if (port) {
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      port.disconnect();
      port = undefined;
    }
  }
}

/** The editor initiates a private port; content is never broadcast via runtime messages. */
export function receivePreview(
  token: string,
  accept: (payload: PreviewPayload) => void,
  unavailable: () => void,
): () => void {
  let port: PreviewPort | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const deadline = setTimeout(() => { stop(); unavailable(); }, PREVIEW_TIMEOUT_MS);
  const onMessage = (message: unknown) => {
    if (stopped || typeof message !== 'object' || message === null) return;
    const data = message as { type?: string; token?: string; payload?: unknown };
    if (data.type !== 'preview-content-v1' || data.token !== token || !isPreviewPayload(data.payload)) return;
    accept(data.payload);
    port?.postMessage({ type: 'preview-accepted-v1', token });
    stop();
  };
  const disconnected = () => {
    void browser.runtime.lastError;
    detach();
    if (!stopped) retry = setTimeout(connect, 100);
  };
  function detach(): void {
    if (!port) return;
    port.onMessage.removeListener(onMessage);
    port.onDisconnect.removeListener(disconnected);
    port.disconnect();
    port = undefined;
  }
  function connect(): void {
    if (stopped) return;
    try {
      port = browser.runtime.connect({ name: `${PREVIEW_PORT_PREFIX}${token}` });
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(disconnected);
    } catch { retry = setTimeout(connect, 100); }
  }
  function stop(): void {
    stopped = true;
    clearTimeout(deadline);
    clearTimeout(retry);
    detach();
  }
  connect();
  return stop;
}
