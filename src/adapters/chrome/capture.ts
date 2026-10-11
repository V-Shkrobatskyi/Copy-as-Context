import type { CaptureOutcome } from '../types';
import { createFrameCapturer } from './capture-frames';

export interface ChromeDebuggerSession {
  tabId: number;
  sessionId?: string;
}

/** Minimal transport shared by the production extension and deterministic CDP mocks. */
export interface ChromeDebuggerClient {
  attach(target: { tabId: number }, version: string, callback: (error?: string) => void): void;
  sendCommand(
    target: ChromeDebuggerSession,
    method: string,
    callback: (response: unknown, error?: string) => void,
    params?: Record<string, unknown>,
  ): void;
  detach(target: { tabId: number }, callback: (error?: string) => void): void;
  onEvent(listener: (source: { tabId?: number; sessionId?: string }, method: string, params: unknown) => void): () => void;
  onDetach(listener: (source: { tabId?: number }, reason: string) => void): () => void;
}

export function chromeDebuggerClient(): ChromeDebuggerClient {
  return {
    attach(target, version, callback) {
      chrome.debugger.attach(target, version, () => callback(chrome.runtime.lastError?.message));
    },
    sendCommand(target, method, callback, params) {
      chrome.debugger.sendCommand(target, method, params ?? {}, (response) => {
        callback(response, chrome.runtime.lastError?.message);
      });
    },
    detach(target, callback) {
      chrome.debugger.detach(target, () => callback(chrome.runtime.lastError?.message));
    },
    onEvent(listener) {
      chrome.debugger.onEvent.addListener(listener);
      return () => chrome.debugger.onEvent.removeListener(listener);
    },
    onDetach(listener) {
      chrome.debugger.onDetach.addListener(listener);
      return () => chrome.debugger.onDetach.removeListener(listener);
    },
  };
}

export const createChromeAccessibilityCapturer = createFrameCapturer;
const captureWithChrome = createChromeAccessibilityCapturer(chromeDebuggerClient());

/** Captures a tab and eligible embedded documents, then releases all debugger sessions. */
export function captureChromeAccessibilityTree(tabId: number): Promise<CaptureOutcome> {
  return captureWithChrome(tabId);
}
