/**
 * Minimal Chromium DevTools Protocol-shaped input used by the future Chrome adapter.
 * It stays adapter-local so CDP identifiers and properties cannot leak into the core.
 */
export interface ChromeAxValue {
  type?: string;
  value?: string | number | boolean;
}

export interface ChromeAxProperty {
  name: string;
  value?: ChromeAxValue;
}

export interface ChromeAxNode {
  nodeId: string;
  childIds?: string[];
  role?: ChromeAxValue;
  name?: ChromeAxValue;
  value?: ChromeAxValue;
  properties?: ChromeAxProperty[];
}

export interface ChromeAxTreeResponse {
  nodes: ChromeAxNode[];
}
