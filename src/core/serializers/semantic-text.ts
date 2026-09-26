import type { NodeStates, SemanticNode, SemanticTree, SerializedContext } from '..';

const ROLE_ALIASES: Readonly<Record<string, string>> = {
  StaticText: 'text',
  textbox: 'input',
  searchbox: 'input',
};

const STATE_ORDER: readonly (keyof NodeStates)[] = [
  'checked',
  'selected',
  'expanded',
  'disabled',
  'required',
  'focusable',
];

const SAFE_ROLE = /^\p{L}[\p{L}\p{N}_-]*$/u;

/** Serializes an already-transformed semantic tree without changing its structure. */
export function serializeSemanticText(tree: SemanticTree): SerializedContext {
  const lines: string[] = [];
  renderNode(tree.root, 0, lines);
  const content = `${lines.join('\n')}\n`;

  return {
    format: 'semantic-text',
    content,
    characterCount: content.length,
  };
}

function renderNode(node: SemanticNode, depth: number, lines: string[]): void {
  const fields = [renderRole(node.role)];
  if (node.name !== undefined) fields.push(quote(node.name));

  const attributes = renderAttributes(node);
  if (attributes.length > 0) fields.push(`[${attributes.join(', ')}]`);

  lines.push(`${'  '.repeat(depth)}${fields.join(' ')}`);
  for (const child of node.children) renderNode(child, depth + 1, lines);
}

function renderRole(role: string): string {
  const alias = ROLE_ALIASES[role] ?? role;
  return SAFE_ROLE.test(alias) ? alias : `role=${quote(alias)}`;
}

function renderAttributes(node: SemanticNode): string[] {
  const attributes: string[] = [];

  if (node.value !== undefined) attributes.push(`value=${quote(node.value)}`);
  for (const state of STATE_ORDER) {
    const value = node.states?.[state];
    if (value !== undefined) attributes.push(`${state}=${value}`);
  }
  if (node.level !== undefined) attributes.push(`level=${node.level}`);
  if (node.href !== undefined) attributes.push(`href=${quote(node.href)}`);

  return attributes;
}

function quote(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}
