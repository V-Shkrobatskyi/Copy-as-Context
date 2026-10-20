// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { isCaptureActiveTabRequest, CAPTURE_ACTIVE_TAB_MESSAGE, type CaptureActiveTabRequest } from './capture-message';
import { isPreviewToken } from './preview-message';

export const PICKER_START = 'element-picker-start-v1';
export const PICKER_SAVE_PERMISSION = 'element-picker-save-permission-v1';
export const PICKER_PORT = 'element-picker-v1:';
export const PICKER_TTL = 5 * 60_000;
export type PickerPreferences = Omit<CaptureActiveTabRequest, 'type'>;
export type PickerAction = 'preview' | 'copy' | 'save';
export const selectionAttribute = (token: string): string => `data-cac-selection-${token}`;

export function isPickerStart(value: unknown): value is PickerPreferences & { type: typeof PICKER_START } {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === PICKER_START &&
    isCaptureActiveTabRequest({ ...value, type: CAPTURE_ACTIVE_TAB_MESSAGE });
}

export interface PickerHandle {
  token: string;
  root(): Element | undefined;
  close(): void;
}
export interface PickerGlobal { __copyAsContextPicker?: PickerHandle }

/** Serialized into the isolated world. Keep independent of imports and closures. */
export function selectedElementInfo(token: string): { tagName: string } | undefined {
  const picker = (globalThis as PickerGlobal).__copyAsContextPicker;
  const root = picker?.token === token ? picker.root() : undefined;
  if (!root?.isConnected || !root.hasAttribute(`data-cac-selection-${token}`)) return undefined;
  return { tagName: root.localName };
}

export function pickerToken(name: string): string | undefined {
  const token = name.startsWith(PICKER_PORT) ? name.slice(PICKER_PORT.length) : '';
  return isPreviewToken(token) ? token : undefined;
}
