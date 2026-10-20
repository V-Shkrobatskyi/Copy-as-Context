// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import type { ChromeAxNode, ChromeAxTreeResponse } from './types';
import { CHROME_CAPTURE_LIMITS as LIMITS } from './limits';

/** Executed by CDP in the page world. Only the opaque marker is read. */
export function findMarkedElement(attribute: string): Element | null {
  const pending: (Document | ShadowRoot)[] = [document];
  let found: Element | null = null;
  let visited = 0;
  while (pending.length) {
    const root = pending.pop()!;
    for (const element of root.querySelectorAll('*')) {
      if (++visited > 100_000) throw new Error('Selection lookup exceeded the node limit.');
      if (element.hasAttribute(attribute)) {
        if (found) throw new Error('Ambiguous selection.');
        found = element;
      }
      if (element.shadowRoot) pending.push(element.shadowRoot);
    }
  }
  return found;
}

interface DomDescription {
  backendNodeId: number;
  nodeName?: string;
  children?: DomDescription[];
  shadowRoots?: (DomDescription & { shadowRootType?: string })[];
  distributedNodes?: { backendNodeId: number }[];
}

/** Read the composed subtree only, including assigned slot contents, with finite budgets. */
export async function selectedDomIds(
  root: unknown,
  describe: (id: number) => Promise<unknown>,
): Promise<Set<number>> {
  const ids = new Set<number>();
  let bytes = 0;
  const add = (raw: unknown, depth: number): { node: DomDescription; depth: number } => {
    bytes += JSON.stringify(raw).length;
    if (bytes > LIMITS.rawBytes || depth > LIMITS.nodeDepth) throw new Error('Selection exceeds the DOM capture limit.');
    if (!raw || typeof raw !== 'object' || !Number.isInteger((raw as DomDescription).backendNodeId)) throw new Error('Invalid selection DOM.');
    return { node: raw as DomDescription, depth };
  };
  const pending = [add(root, 0)];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (ids.has(node.backendNodeId)) continue;
    ids.add(node.backendNodeId);
    if (ids.size > LIMITS.nodes || depth > LIMITS.nodeDepth) throw new Error('Selection exceeds the DOM capture limit.');
    if (node.nodeName === 'SLOT' && node.distributedNodes?.length) {
      for (const assigned of node.distributedNodes) pending.push(add(await describe(assigned.backendNodeId), depth + 1));
    } else {
      const shadow = node.shadowRoots?.find(item => item.shadowRootType === 'open');
      for (const child of shadow ? [shadow] : node.children ?? []) pending.push({ node: child, depth: depth + 1 });
    }
  }
  return ids;
}

/** Promote selected descendants through ignored/outside AX wrappers without copying their names. */
export function selectChromeAxTree(snapshot: ChromeAxTreeResponse, ids: ReadonlySet<number>): ChromeAxTreeResponse {
  const root = snapshot.nodes.find(node => node.role?.value === 'RootWebArea');
  if (!root) throw new Error('Missing document root.');
  const byId = new Map(snapshot.nodes.map(node => [node.nodeId, node]));
  const output: ChromeAxNode[] = [];
  const seen = new Set<string>();
  const visit = (node: ChromeAxNode, inside: boolean, depth: number): string[] => {
    if (depth > LIMITS.nodeDepth || seen.has(node.nodeId)) throw new Error('Invalid selection AX graph.');
    seen.add(node.nodeId);
    const included = node !== root && (node.backendDOMNodeId === undefined ? inside : ids.has(node.backendDOMNodeId));
    const children = (node.childIds ?? []).flatMap(id => {
      const child = byId.get(id);
      return child ? visit(child, included, depth + 1) : [];
    });
    if (!included) return children;
    output.push({ ...node, parentId: undefined, childIds: children });
    return [node.nodeId];
  };
  const children = visit(root, false, 0);
  if (!children.length) throw new Error('The selected element has no accessible content.');
  return { nodes: [{ ...root, childIds: children }, ...output] };
}
