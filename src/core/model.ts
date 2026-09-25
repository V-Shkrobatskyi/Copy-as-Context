/** A browser-independent state extracted from an accessible UI node. */
export interface NodeStates {
  checked?: boolean | 'mixed';
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  required?: boolean;
  focusable?: boolean;
}

/** A normalized semantic node. It intentionally contains no browser/CDP details. */
export interface SemanticNode {
  id?: string;
  role: string;
  name?: string;
  value?: string;
  level?: number;
  href?: string;
  states?: NodeStates;
  children: SemanticNode[];
}

/** The versioned document-level representation consumed by transformations and serializers. */
export interface SemanticTree {
  schemaVersion: 1;
  root: SemanticNode;
}
