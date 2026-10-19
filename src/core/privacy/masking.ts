// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only

export function visibleCharacters(length: number): number {
  return Math.min(3, Math.floor(length / 2));
}

/** Mask a whole value using Unicode code points; recognize only our short visible prefixes. */
export function maskText(value: string): string {
  if (/^.{0,3}\*+$/su.test(value)) return value;
  const characters = Array.from(value);
  const visible = visibleCharacters(characters.length);
  return characters.slice(0, visible).join('') + '*'.repeat(characters.length - visible);
}

/** Formatting is preserved; existing stars count as hidden digits for repeated masking. */
export function maskPhone(value: string): string {
  const visible = visibleCharacters((value.match(/[0-9*]/gu) ?? []).length);
  let index = 0;
  return value.replace(/[0-9*]/gu, char => index++ < visible ? char : '*');
}
