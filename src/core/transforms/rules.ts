import type { SemanticNode } from '../model';

const EMPTY_LEAF_STRUCTURAL_ROLES = new Set(['group', 'log', 'sectionheader']);

export function normalizedLabel(label: string | undefined): string | undefined {
  if (label === undefined) return undefined;
  const normalized = label.trim().replace(/\s+/gu, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function labelIsCovered(label: string | undefined, ancestorLabels: readonly string[]): boolean {
  const normalized = normalizedLabel(label);
  return normalized !== undefined && ancestorLabels.some((ancestor) => ancestor === normalized);
}

export function hasSemanticAttributes(node: SemanticNode): boolean {
  return (
    node.name !== undefined ||
    node.value !== undefined ||
    node.level !== undefined ||
    node.href !== undefined ||
    node.states !== undefined
  );
}

export function canFlattenGeneric(node: SemanticNode): boolean {
  return node.role === 'generic' && !hasSemanticAttributes(node);
}

export function canRemoveEmptyStructuralLeaf(node: SemanticNode): boolean {
  return (
    EMPTY_LEAF_STRUCTURAL_ROLES.has(node.role) &&
    node.children.length === 0 &&
    !hasSemanticAttributes(node)
  );
}
