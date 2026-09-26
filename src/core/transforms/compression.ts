import type { CompressionLevel, SemanticNode, SemanticTree } from '..';
import {
  canFlattenGeneric,
  canRemoveEmptyStructuralLeaf,
  labelIsCovered,
  normalizedLabel,
} from './rules';

/**
 * Returns an independent tree for the requested compression profile.
 *
 * Detailed is lossless. Compact removes only explicitly tested structural and
 * duplicate noise; maximum currently shares Compact's conservative policy.
 */
export function compressSemanticTree(
  tree: SemanticTree,
  level: CompressionLevel,
): SemanticTree {
  if (level === 'detailed') {
    return {
      schemaVersion: tree.schemaVersion,
      root: cloneNode(tree.root),
    };
  }

  return {
    schemaVersion: tree.schemaVersion,
    root: compactRoot(tree.root),
  };
}

function compactRoot(root: SemanticNode): SemanticNode {
  // SemanticTree must retain one root even if its role would otherwise be
  // removable. Its descendants still receive the normal Compact traversal.
  const rootLabel = normalizedLabel(root.name);
  const ancestorLabels = rootLabel === undefined ? [] : [rootLabel];
  const children = root.children.flatMap((child) => compactNode(child, ancestorLabels));
  return cloneNode(root, children);
}

function compactNode(node: SemanticNode, ancestorLabels: readonly string[]): SemanticNode[] {
  if (node.role === 'InlineTextBox') return [];

  if (
    node.role === 'StaticText' &&
    (normalizedLabel(node.name) === undefined || labelIsCovered(node.name, ancestorLabels))
  ) {
    return [];
  }

  if (
    node.role === 'image' &&
    (normalizedLabel(node.name) === undefined || labelIsCovered(node.name, ancestorLabels))
  ) {
    return [];
  }

  const ownLabel = normalizedLabel(node.name);
  const childAncestorLabels = ownLabel === undefined
    ? ancestorLabels
    : [...ancestorLabels, ownLabel];
  const children: SemanticNode[] = node.children.flatMap((child) =>
    compactNode(child, childAncestorLabels),
  );
  const compacted = cloneNode(node, children);

  if (canFlattenGeneric(compacted)) return children;
  if (canRemoveEmptyStructuralLeaf(compacted)) return [];
  return [compacted];
}

function cloneNode(node: SemanticNode, children?: SemanticNode[]): SemanticNode {
  const clone: SemanticNode = {
    role: node.role,
    children: children ?? node.children.map((child) => cloneNode(child)),
  };

  if (node.id !== undefined) clone.id = node.id;
  if (node.name !== undefined) clone.name = node.name;
  if (node.value !== undefined) clone.value = node.value;
  if (node.level !== undefined) clone.level = node.level;
  if (node.href !== undefined) clone.href = node.href;
  if (node.states !== undefined) clone.states = { ...node.states };

  return clone;
}
