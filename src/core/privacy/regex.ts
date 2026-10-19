// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { RE2JS } from 're2js';

/** Use a non-backtracking engine for user-supplied expressions in every export. */
export function compileRegex(source: string, caseSensitive: boolean): RE2JS {
  let pattern: RE2JS;
  try {
    pattern = RE2JS.compile(source, caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE);
  } catch {
    throw new Error('Invalid Regex. Use a supported expression without / delimiters or flags. Lookarounds and backreferences are not supported.');
  }
  if (pattern.programSize() > 10_000) throw new Error('Regex is too complex. Simplify the expression or split it into separate rules.');
  return pattern;
}

export const REGEX_EXAMPLES = [
  { id: 'emails', label: 'Email addresses', pattern: String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`, sample: 'Contact person@example.test for details.', nearMiss: 'Contact person at example.test for details.', note: 'Matches common email formats; unusual or internationalized addresses may need a different expression.' },
  { id: 'github', label: 'GitHub tokens', pattern: String.raw`\b(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}\b`, sample: 'ghp_abcdefghijklmnopqrst', nearMiss: 'ghp_short', note: 'Matches recognized prefixes followed by at least 20 letters, digits or underscores.' },
  { id: 'aws', label: 'AWS keys', pattern: String.raw`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b`, sample: 'AKIA0123456789ABCDEF', nearMiss: 'AKIA0123456789ABCDE', note: 'Matches exactly 16 letters or digits after the prefix. Enable Case sensitive to require uppercase.' },
  { id: 'openai', label: 'OpenAI keys', pattern: String.raw`\b(?:sk-|sk-proj-)[A-Za-z0-9_-]{16,}\b`, sample: 'sk-proj-abcdefghijklmnop', nearMiss: 'sk-short', note: 'Matches at least 16 letters, digits, underscores or hyphens after the prefix.' },
  { id: 'order', label: 'Order IDs', pattern: String.raw`\bORDER-[0-9]{6}\b`, sample: 'Order ORDER-123456 is ready.', nearMiss: 'Order ORDER-12345 is ready.', note: 'Example of a custom prefix followed by exactly six digits.' },
] as const;
