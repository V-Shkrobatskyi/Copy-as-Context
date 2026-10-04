import { renderExportAttribution } from './attribution';
import { createEncodingCounter } from './maximum-cost';
import type { NodeStates, SemanticNode, SemanticTree, SerializedContext } from '..';

const STATE_ORDER: readonly (keyof NodeStates)[] = [
  'checked', 'selected', 'expanded', 'disabled', 'required', 'focusable', 'readOnly', 'focused',
];

/** Serializes an already-transformed semantic tree into stable, escaped Markdown. */
export function serializeMarkdown(tree: SemanticTree, attribution = renderExportAttribution()): SerializedContext {
  const lines: string[] = [];
  render(tree, lines, undefined, attribution);
  const content = `${lines.join('\n')}\n`;
  return { format: 'markdown', content, characterCount: content.length };
}

/** Counts characters and estimates cost together without retaining tree lines. */
export function measureMarkdownEncoding(tree: SemanticTree, attribution = renderExportAttribution()): { characters: number; cost: number } {
  const counter = createEncodingCounter();
  const characters = render(tree, undefined, counter.add, attribution);
  return { characters, cost: counter.total() };
}

/** Measures the exact same output without accumulating tree lines or a full string. */
export function countMarkdownCharacters(tree: SemanticTree, attribution = renderExportAttribution()): number {
  return render(tree, undefined, undefined, attribution);
}

function render(tree: SemanticTree, lines?: string[], measure?: (line: string) => void, attribution = renderExportAttribution()): number {
  const headers = lines ?? [];
  renderMarkdownHeader(tree, headers, attribution);
  for (const line of headers) measure?.(line);
  const headerCount = headers.reduce((count, line) => count + line.length + 1, 0);
  return headerCount + renderNode(tree.root, 0, lines, measure);
}

export function renderMarkdownHeader(tree: SemanticTree, lines: string[], attribution = renderExportAttribution()): void {
  if (tree.sourceUrl === undefined && tree.capturedAt === undefined) {
    if (tree.title !== undefined) lines.push(`# ${escapeText(tree.title)}`, '');
    return;
  }

  lines.push(`**Page:** ${escapeText(tree.title ?? 'Untitled page')}`);
  lines.push(`**URL:** ${code(tree.sourceUrl ?? 'Unavailable')}`);
  lines.push(`**Browser:** ${escapeText(tree.browser ?? 'Unavailable')}`);
  lines.push(`**Captured:** ${escapeText(tree.capturedAt ?? 'Unavailable')}`);
  lines.push(attribution, '');
}

function renderNode(node: SemanticNode, depth: number, lines?: string[], measure?: (line: string) => void): number {
  const attributes: string[] = [];
  if (node.value !== undefined) attributes.push(`value=${code(node.value)}`);
  for (const state of STATE_ORDER) {
    const value = node.states?.[state];
    if (value !== undefined) attributes.push(`${state === 'readOnly' ? 'readonly' : state}=${value}`);
  }
  if (node.level !== undefined) attributes.push(`level=${node.level}`);
  if (node.href !== undefined) attributes.push(`href=${code(node.href)}`);

  const label = node.name === undefined ? '' : ` — ${escapeText(node.name)}`;
  const detail = attributes.length === 0 ? '' : ` (${attributes.join(', ')})`;
  const line = `${'  '.repeat(depth)}- **${escapeRole(node.role)}**${label}${detail}`;
  lines?.push(line);
  measure?.(line);
  let characterCount = line.length + 1;
  for (const child of node.children) characterCount += renderNode(child, depth + 1, lines, measure);
  return characterCount;
}

function escapeRole(value: string): string {
  return escapeText(value);
}

function escapeText(value: string): string {
  return value.replace(/[\\`*_{}\[\]()<>#+\-.!|]/gu, '\\$&').replace(/\r?\n/gu, ' ');
}

function code(value: string): string {
  return `\`${value.replace(/`/gu, '\\`').replace(/\r?\n/gu, ' ')}\``;
}
