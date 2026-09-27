import type { SemanticNode, SemanticTree } from '..';

/** A value-only summary that never retains a matched secret. */
export interface RedactionResult {
  tree: SemanticTree;
  redactionCount: number;
}

const SENSITIVE_FIELD_NAME = /\b(?:password|passcode|secret|token|api[ _-]?key|authorization)\b/iu;
const AUTHORIZATION_VALUE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gu;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/gu;
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu;
const AWS_ACCESS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu;
const OPENAI_STYLE_KEY = /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/gu;
const ASSIGNED_SECRET = /\b((?:api[ _-]?key|token|secret|password)\s*[:=]\s*)((?!\[REDACTED\])[^\s&"',;]{8,})/giu;
const SECRET_QUERY_VALUE = /([?&](?:api[ _-]?key|token|secret|password)=)((?!\[REDACTED\])[^&#\s]+)/giu;

/**
 * Returns an independent semantic tree with common credential-shaped text redacted.
 *
 * This is intentionally a local heuristic, not a general DLP or PII detector. It
 * must run before every serializer and never exposes the original matched values.
 */
export function redactSemanticTree(tree: SemanticTree): RedactionResult {
  let redactionCount = 0;

  const redactText = (value: string): string => {
    let redacted = value;
    const replace = (pattern: RegExp, replacement: string | ((...args: any[]) => string)) => {
      redacted = redacted.replace(pattern, (...args: any[]) => {
        redactionCount += 1;
        return typeof replacement === 'function' ? replacement(...args) : replacement;
      });
    };

    replace(AUTHORIZATION_VALUE, (_match, scheme: string) => `${scheme} [REDACTED]`);
    replace(JWT, '[REDACTED]');
    replace(GITHUB_TOKEN, '[REDACTED]');
    replace(AWS_ACCESS_KEY, '[REDACTED]');
    replace(OPENAI_STYLE_KEY, '[REDACTED]');
    replace(ASSIGNED_SECRET, (_match, prefix: string) => `${prefix}[REDACTED]`);
    replace(SECRET_QUERY_VALUE, (_match, prefix: string) => `${prefix}[REDACTED]`);
    return redacted;
  };

  const redactNode = (node: SemanticNode): SemanticNode => {
    const result: SemanticNode = {
      role: node.role,
      children: node.children.map(redactNode),
    };
    if (node.id !== undefined) result.id = node.id;
    if (node.name !== undefined) result.name = redactText(node.name);
    if (node.value !== undefined) {
      if (SENSITIVE_FIELD_NAME.test(node.name ?? '') && node.value !== '[REDACTED]') {
        redactionCount += 1;
        result.value = '[REDACTED]';
      } else {
        result.value = redactText(node.value);
      }
    }
    if (node.level !== undefined) result.level = node.level;
    if (node.href !== undefined) result.href = redactText(node.href);
    if (node.states !== undefined) result.states = { ...node.states };
    return result;
  };

  const result: SemanticTree = {
    schemaVersion: tree.schemaVersion,
    root: redactNode(tree.root),
  };
  if (tree.title !== undefined) result.title = redactText(tree.title);
  if (tree.sourceUrl !== undefined) result.sourceUrl = redactText(tree.sourceUrl);
  if (tree.capturedAt !== undefined) result.capturedAt = tree.capturedAt;

  return { tree: result, redactionCount };
}
