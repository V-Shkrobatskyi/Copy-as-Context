// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only

import { visibleCharacters } from './masking';
import { compileRegex } from './regex';

/** Common ASCII email addresses; boundary checks prevent partial address matches. */
const EMAIL = compileRegex(/[A-Za-z0-9._%+'*-]+@(?:[A-Za-z0-9*](?:[A-Za-z0-9*-]*[A-Za-z0-9*])?(?:\.[A-Za-z0-9*](?:[A-Za-z0-9*-]*[A-Za-z0-9*])?)+|\*{3})/u.source, true);

function maskPart(part: string): string {
  if (part.includes('*')) return part;
  const visible = visibleCharacters(part.length);
  return part.slice(0, visible) + '*'.repeat(part.length - visible);
}

export function isEmailType(type: unknown): type is 'emailMask' | 'emailHide' | 'emailMaskDomain' {
  return type === 'emailMask' || type === 'emailHide' || type === 'emailMaskDomain';
}

export function* emailMatches(value: string): Generator<{ start: number; end: number; masked: string; maskedDomain: string }> {
  if (!value.includes('@')) return;
  const matcher = EMAIL.matcher(value);
  while (matcher.find()) {
    const address = matcher.group()!;
    const start = matcher.start(); const end = matcher.end();
    // Do not accept suffixes of unsupported address forms.
    if (/[\p{L}\p{N}._%+'*@-]/u.test(value[start - 1] ?? '') || /[\p{L}\p{N}_@*-]/u.test(value[end] ?? '')) continue;
    if (address.endsWith('@***') && value[end] === '.' && /[\p{L}\p{N}*-]/u.test(value[end + 1] ?? '')) continue;
    const at = address.indexOf('@');
    const local = address.slice(0, at);
    if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) continue;
    const maskedLocal = maskPart(local);
    const labels = address.slice(at + 1).split('.');
    // Preserve the final domain label; mask each preceding label independently.
    const maskedDomain = labels.map((label, index) => index === labels.length - 1 ? label : maskPart(label)).join('.');
    yield { start, end, masked: maskedLocal + address.slice(at), maskedDomain: maskedLocal + '@' + maskedDomain };
  }
}
