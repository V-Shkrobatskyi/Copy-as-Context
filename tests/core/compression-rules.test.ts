import { describe, expect, it } from 'vitest';

import { compressSemanticTree, type SemanticTree } from '@/src/core';

function treeWith(child: SemanticTree['root']['children'][number]): SemanticTree {
  return { schemaVersion: 1, root: { role: 'page', children: [child] } };
}

describe('compact compression rules', () => {
  it('does not treat a partial ancestor label as duplicate text', () => {
    const tree = treeWith({
      role: 'button',
      name: 'Save as',
      children: [{ role: 'StaticText', name: 'Save', children: [] }],
    });

    const [button] = compressSemanticTree(tree, 'compact').root.children;
    expect(button?.children).toEqual([
      { role: 'StaticText', name: 'Save', children: [] },
    ]);
  });

  it('preserves named, stateful generic nodes', () => {
    const tree = treeWith({
      role: 'generic',
      name: 'Account summary',
      states: { expanded: false },
      children: [{ role: 'StaticText', name: 'Account summary', children: [] }],
    });

    expect(compressSemanticTree(tree, 'compact').root.children).toEqual([
      {
        role: 'generic',
        name: 'Account summary',
        states: { expanded: false },
        children: [],
      },
    ]);
  });

  it('is idempotent after structural noise has been removed', () => {
    const tree = treeWith({
      role: 'generic',
      children: [{ role: 'image', children: [] }, { role: 'button', name: 'Save', children: [] }],
    });
    const once = compressSemanticTree(tree, 'compact');

    expect(compressSemanticTree(once, 'compact')).toEqual(once);
  });

  it('retains a generic root while compacting its descendants', () => {
    const tree: SemanticTree = {
      schemaVersion: 1,
      root: {
        role: 'generic',
        children: [{
          role: 'generic',
          children: [{ role: 'button', name: 'Continue', children: [] }],
        }],
      },
    };

    expect(compressSemanticTree(tree, 'compact')).toEqual({
      schemaVersion: 1,
      root: {
        role: 'generic',
        children: [{ role: 'button', name: 'Continue', children: [] }],
      },
    });
  });
});
