import type { CaptureResult, NodeStates, SemanticNode, SemanticTree } from '../../core';

import type { ChromeAxNode, ChromeAxProperty, ChromeAxTreeResponse, ChromeAxValue } from './types';

const STATE_PROPERTIES = new Set<keyof NodeStates>([
  'checked',
  'disabled',
  'expanded',
  'selected',
  'required',
  'focusable',
]);

function invalidTree(details: string): CaptureResult {
  return {
    ok: false,
    error: { code: 'invalid-tree', message: 'Chrome returned an invalid accessibility tree.', details },
  };
}

function stringValue(value: ChromeAxValue | undefined): string | undefined {
  return typeof value?.value === 'string' && value.value.length > 0 ? value.value : undefined;
}

function numberValue(value: ChromeAxValue | undefined): number | undefined {
  return typeof value?.value === 'number' && Number.isFinite(value.value) ? value.value : undefined;
}

function booleanValue(value: ChromeAxValue | undefined): boolean | undefined {
  return typeof value?.value === 'boolean' ? value.value : undefined;
}

function propertiesByName(properties: ChromeAxProperty[] | undefined): Map<string, ChromeAxValue | undefined> {
  return new Map(properties?.map((property) => [property.name, property.value]));
}

function statesFrom(properties: Map<string, ChromeAxValue | undefined>): NodeStates | undefined {
  const states: NodeStates = {};

  for (const property of STATE_PROPERTIES) {
    const value = properties.get(property);
    if (property === 'checked' && value?.value === 'mixed') {
      states.checked = 'mixed';
      continue;
    }

    const boolean = booleanValue(value);
    if (boolean !== undefined) states[property] = boolean;
  }

  return Object.keys(states).length > 0 ? states : undefined;
}

function rootNode(nodes: ChromeAxNode[], nodeIds: Set<string>): ChromeAxNode | undefined {
  const referencedIds = new Set(nodes.flatMap((node) => node.childIds ?? []));
  const roots = nodes.filter((node) => !referencedIds.has(node.nodeId));

  if (roots.length !== 1) return undefined;
  const candidate = roots[0];
  return candidate && nodeIds.has(candidate.nodeId) ? candidate : undefined;
}

/** Converts a complete Chrome CDP accessibility response into the browser-neutral core model. */
export function normalizeChromeAxTree(response: ChromeAxTreeResponse): CaptureResult {
  if (!Array.isArray(response.nodes) || response.nodes.length === 0) {
    return invalidTree('The response contains no AX nodes.');
  }

  const nodesById = new Map<string, ChromeAxNode>();
  for (const node of response.nodes) {
    if (!node.nodeId || nodesById.has(node.nodeId)) {
      return invalidTree('AX node IDs must be present and unique.');
    }
    nodesById.set(node.nodeId, node);
  }

  const childReferences = new Set<string>();
  for (const node of response.nodes) {
    for (const childId of node.childIds ?? []) {
      if (!nodesById.has(childId)) {
        return invalidTree(`AX node ${node.nodeId} references a missing child.`);
      }
      if (childReferences.has(childId)) {
        return invalidTree(`AX node ${childId} has more than one parent.`);
      }
      childReferences.add(childId);
    }
  }

  const root = rootNode(response.nodes, new Set(nodesById.keys()));
  if (!root) return invalidTree('The response must have exactly one root AX node.');

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const normalizeNode = (node: ChromeAxNode): SemanticNode | undefined => {
    if (visiting.has(node.nodeId)) return undefined;
    visiting.add(node.nodeId);

    const role = stringValue(node.role);
    if (!role) return undefined;

    const properties = propertiesByName(node.properties);
    const children: SemanticNode[] = [];
    for (const childId of node.childIds ?? []) {
      const child = nodesById.get(childId)!;
      const normalizedChild = normalizeNode(child);
      if (!normalizedChild) return undefined;
      children.push(normalizedChild);
    }

    visiting.delete(node.nodeId);
    visited.add(node.nodeId);

    const normalized: SemanticNode = {
      role: role === 'RootWebArea' ? 'page' : role,
      children,
    };
    const name = stringValue(node.name);
    const value = stringValue(node.value);
    const level = numberValue(properties.get('level'));
    const href = stringValue(properties.get('url'));
    const states = statesFrom(properties);
    if (name !== undefined) normalized.name = name;
    if (value !== undefined) normalized.value = value;
    if (level !== undefined) normalized.level = level;
    if (href !== undefined) normalized.href = href;
    if (states !== undefined) normalized.states = states;
    return normalized;
  };

  const normalizedRoot = normalizeNode(root);
  if (!normalizedRoot || visited.size !== response.nodes.length) {
    return invalidTree('The AX node graph is cyclic, disconnected, or has a node without a role.');
  }

  const tree: SemanticTree = { schemaVersion: 1, root: normalizedRoot };
  return { ok: true, tree };
}
