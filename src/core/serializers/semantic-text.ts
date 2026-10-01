import { renderExportAttribution } from './attribution';
import { createEncodingCounter } from './maximum-cost';
import type { NodeStates, SemanticNode, SemanticTree, SerializedContext } from '..';

const STATE_ORDER: readonly (keyof NodeStates)[] = [
  'checked',
  'selected',
  'expanded',
  'disabled',
  'required',
  'focusable',
  'readOnly',
  'focused',
];

const SAFE_ROLE = /^\p{L}[\p{L}\p{N}_-]*$/u;

/** Serializes an already-transformed semantic tree without changing its structure. */
export function serializeSemanticText(tree: SemanticTree, attribution = renderExportAttribution()): SerializedContext {
  const lines: string[] = [];
  render(tree, lines, undefined, attribution);
  const content = `${lines.join('\n')}\n`;
  return { format: 'semantic-text', content, characterCount: content.length };
}

/** Counts characters and estimates cost together without retaining tree lines. */
export function measureSemanticTextEncoding(tree: SemanticTree, attribution = renderExportAttribution()): { characters: number; cost: number } {
  const counter = createEncodingCounter();
  const characters = render(tree, undefined, counter.add, attribution);
  return { characters, cost: counter.total() };
}

/** Measures the exact same output without accumulating tree lines or a full string. */
export function countSemanticTextCharacters(tree: SemanticTree, attribution = renderExportAttribution()): number {
  return render(tree, undefined, undefined, attribution);
}

function render(tree: SemanticTree, lines?: string[], measure?: (line: string) => void, attribution = renderExportAttribution()): number {
  const headers = lines ?? [];
  renderSemanticTextHeader(tree, headers, attribution);
  for (const line of headers) measure?.(line);
  const headerCount = headers.reduce((count, line) => count + line.length + 1, 0);
  return headerCount + renderNode(tree.root, 0, lines, measure);
}

export function renderSemanticTextHeader(tree: SemanticTree, lines: string[], attribution = renderExportAttribution()): void {
  if (tree.sourceUrl === undefined && tree.capturedAt === undefined) return;

  lines.push(`Page: ${headerValue(tree.title, 'Untitled page')}`);
  lines.push(`URL: ${headerValue(tree.sourceUrl, 'Unavailable')}`);
  lines.push(`Captured: ${headerValue(tree.capturedAt, 'Unavailable')}`);
  lines.push(attribution, '');
}

function headerValue(value: string | undefined, fallback: string): string {
  return (value ?? fallback).replace(/\r?\n/gu, ' ');
}

function renderNode(node: SemanticNode, depth: number, lines?: string[], measure?: (line: string) => void): number {
  const fields = [renderRole(node.role)];
  if (node.name !== undefined) fields.push(quote(node.name));

  const attributes = renderAttributes(node);
  if (attributes.length > 0) fields.push(`[${attributes.join(', ')}]`);

  const line = `${'  '.repeat(depth)}${fields.join(' ')}`;
  lines?.push(line);
  measure?.(line);
  let characterCount = line.length + 1;
  for (const child of node.children) characterCount += renderNode(child, depth + 1, lines, measure);
  return characterCount;
}

function renderRole(role: string): string {
  return SAFE_ROLE.test(role) ? role : `role=${quote(role)}`;
}

function renderAttributes(node: SemanticNode): string[] {
  const attributes: string[] = [];

  if (node.value !== undefined) attributes.push(`value=${quote(node.value)}`);
  for (const state of STATE_ORDER) {
    const value = node.states?.[state];
    if (value !== undefined) attributes.push(`${renderStateName(state)}=${value}`);
  }
  if (node.level !== undefined) attributes.push(`level=${node.level}`);
  if (node.href !== undefined) attributes.push(`href=${quote(node.href)}`);

  return attributes;
}

function renderStateName(state: keyof NodeStates): string {
  return state === 'readOnly' ? 'readonly' : state;
}

function quote(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}
