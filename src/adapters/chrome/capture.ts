import type { CaptureErrorCode, CaptureResult } from '../../core';

import { normalizeChromeAxTree } from './normalize-ax';
import type { ChromeAxTreeResponse } from './types';

const CDP_PROTOCOL_VERSION = '1.3';

export interface ChromeDebuggerClient {
  attach(target: { tabId: number }, version: string, callback: (error?: string) => void): void;
  sendCommand(
    target: { tabId: number },
    method: string,
    callback: (response: unknown, error?: string) => void,
  ): void;
  detach(target: { tabId: number }, callback: (error?: string) => void): void;
}

function failure(code: CaptureErrorCode, message: string, details?: string): CaptureResult {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

function errorCode(message: string): CaptureErrorCode {
  const normalized = message.toLowerCase();
  if (normalized.includes('another debugger') || normalized.includes('already attached')) return 'debugger-busy';
  if (
    normalized.includes('cannot attach') ||
    normalized.includes('cannot access') ||
    normalized.includes('chrome://') ||
    normalized.includes('chrome web store') ||
    normalized.includes('not allowed') ||
    normalized.includes('restricted')
  ) {
    return 'unsupported-page';
  }
  if (normalized.includes('permission') || normalized.includes('access denied')) return 'permission-denied';
  return 'capture-failed';
}

function userMessage(code: CaptureErrorCode): string {
  switch (code) {
    case 'debugger-busy':
      return 'Chrome debugging is already in use for this tab.';
    case 'unsupported-page':
      return 'This Chrome page cannot be captured.';
    case 'permission-denied':
      return 'Chrome denied permission to capture this page.';
    default:
      return 'Unable to capture this page’s accessibility tree.';
  }
}

function isChromeAxTreeResponse(value: unknown): value is ChromeAxTreeResponse {
  return typeof value === 'object' && value !== null && Array.isArray((value as { nodes?: unknown }).nodes);
}

export function chromeDebuggerClient(): ChromeDebuggerClient {
  return {
    attach(target, version, callback) {
      chrome.debugger.attach(target, version, () => callback(chrome.runtime.lastError?.message));
    },
    sendCommand(target, method, callback) {
      chrome.debugger.sendCommand(target, method, (response) => {
        callback(response, chrome.runtime.lastError?.message);
      });
    },
    detach(target, callback) {
      chrome.debugger.detach(target, () => callback(chrome.runtime.lastError?.message));
    },
  };
}

/**
 * Creates a one-snapshot capturer. It owns no raw page data and always detaches
 * from Chrome after a successful attach.
 */
export function createChromeAccessibilityCapturer(client: ChromeDebuggerClient) {
  const inFlightTabs = new Set<number>();

  return async (tabId: number): Promise<CaptureResult> => {
    if (!Number.isInteger(tabId) || tabId < 0) {
      return failure('unsupported-page', 'This page cannot be captured.');
    }
    if (inFlightTabs.has(tabId)) {
      return failure('capture-failed', 'A capture is already running for this tab.');
    }

    inFlightTabs.add(tabId);
    const target = { tabId };
    let attached = false;
    let result: CaptureResult | undefined;

    try {
      const attachError = await new Promise<string | undefined>((resolve) => {
        client.attach(target, CDP_PROTOCOL_VERSION, resolve);
      });
      if (attachError) {
        const code = errorCode(attachError);
        return failure(code, userMessage(code), attachError);
      }
      attached = true;

      const command = await new Promise<{ response: unknown; error?: string }>((resolve) => {
        client.sendCommand(target, 'Accessibility.getFullAXTree', (response, error) => resolve({ response, error }));
      });
      if (command.error) {
        const code = errorCode(command.error);
        result = failure(code, userMessage(code), command.error);
      } else if (!isChromeAxTreeResponse(command.response)) {
        result = failure('invalid-tree', 'Chrome returned an invalid accessibility tree.');
      } else {
        result = normalizeChromeAxTree(command.response);
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const code = errorCode(details);
      result = failure(code, userMessage(code), details);
    } finally {
      if (attached) {
        let detachError: string | undefined;
        try {
          detachError = await new Promise<string | undefined>((resolve) => client.detach(target, resolve));
        } catch (error) {
          detachError = error instanceof Error ? error.message : String(error);
        }
        if (detachError && !result) {
          result = failure('capture-failed', 'Unable to finish page capture.', detachError);
        }
      }
      inFlightTabs.delete(tabId);
    }

    return result ?? failure('capture-failed', 'Unable to capture this page’s accessibility tree.');
  };
}

const captureWithChrome = createChromeAccessibilityCapturer(chromeDebuggerClient());

/** Captures one AX snapshot from a tab with the production Chrome debugger client. */
export function captureChromeAccessibilityTree(tabId: number): Promise<CaptureResult> {
  return captureWithChrome(tabId);
}
