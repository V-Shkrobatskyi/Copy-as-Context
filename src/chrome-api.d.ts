/**
 * Minimal Chrome extension API surface used by this project. Keeping it local
 * avoids a broad ambient dependency while preserving strict types at the browser
 * boundary. Add only APIs that production code actually calls.
 */
interface ChromeTab {
  id?: number;
  url?: string;
}

interface ChromeApi {
  runtime: {
    lastError: { message?: string } | undefined;
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void,
        ) => boolean | void,
      ): void;
    };
    sendMessage(message: unknown): Promise<unknown>;
  };
  debugger: {
    attach(target: { tabId: number }, requiredVersion: string, callback: () => void): void;
    sendCommand(
      target: { tabId: number },
      method: string,
      callback: (result: unknown) => void,
    ): void;
    detach(target: { tabId: number }, callback: () => void): void;
  };
  tabs: {
    query(queryInfo: { active: boolean; lastFocusedWindow: boolean }): Promise<ChromeTab[]>;
  };
}

declare const chrome: ChromeApi;
