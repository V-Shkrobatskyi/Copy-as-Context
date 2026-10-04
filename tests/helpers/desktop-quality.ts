import assert from 'node:assert/strict';
import { COMPRESSION_LEVELS, compressSemanticTree, prepareExport, type SemanticNode, type SemanticTree } from '../../src/core';

/** Independent semantic requirements shared by DOM tests and native browser probes. */
const required = [
  { role: 'heading', name: 'Workspace settings', level: 1 },
  { role: 'textbox', name: 'Workspace name', value: 'Synthetic workspace', ancestor: 'Project details' },
  { role: 'checkbox', name: 'Mixed permission', states: { checked: 'mixed' } },
  { role: 'checkbox', name: 'Enable notifications', states: { checked: true } },
  { role: 'button', name: 'Unavailable action', states: { disabled: true } },
  { role: 'tab', name: 'Overview', states: { selected: true }, ancestor: 'Workspace tabs' },
  { role: 'tab', name: 'Security', states: { selected: false }, ancestor: 'Workspace tabs' },
  { role: 'button', name: 'Advanced options', states: { expanded: false } },
  { role: 'menuitem', name: 'Archive workspace', ancestor: 'Workspace actions' },
  { role: 'menuitemcheckbox', name: 'Pin workspace', states: { checked: false }, ancestor: 'Workspace actions' },
  { role: 'button', name: 'Confirm removal', ancestor: 'Confirm removal' },
  { role: 'rowheader', name: 'Synthetic resource', ancestor: 'Resource inventory' },
  { role: 'button', name: 'Open resource', ancestor: 'Resource inventory' },
  { role: 'button', name: 'Offscreen action' },
  { role: 'button', name: 'Зберегти 🙂 東京' },
  { role: 'button', name: 'Slotted action', ancestor: 'Shadow controls' },
  { role: 'button', name: 'Hidden reference name' },
] as const;
const forbidden = ['Hidden forbidden action', 'ARIA forbidden action', 'Inert forbidden action', 'Rotate credentials'];

export function flattenWithAncestors(root: SemanticNode): { node: SemanticNode; ancestors: SemanticNode[] }[] {
  const result: { node: SemanticNode; ancestors: SemanticNode[] }[] = [];
  const stack = [{ node: root, ancestors: [] as SemanticNode[] }];
  while (stack.length) {
    const item = stack.pop()!;
    result.push(item);
    for (const node of item.node.children.toReversed()) stack.push({ node, ancestors: [...item.ancestors, item.node] });
  }
  return result;
}

export function assertDesktopQuality(tree: SemanticTree): void {
  for (const profile of COMPRESSION_LEVELS) {
    const nodes = flattenWithAncestors(compressSemanticTree(tree, profile).root);
    for (const requirement of required) {
      // Chromium exposes native summary as DisclosureTriangle; the DOM adapter uses button.
      const found = nodes.find(({ node }) => (node.role === requirement.role || requirement.name === 'Advanced options' && node.role === 'DisclosureTriangle') && node.name === requirement.name);
      assert.ok(found, `${profile}: missing ${requirement.role} ${requirement.name}`);
      if ('value' in requirement) assert.equal(found.node.value, requirement.value);
      if ('level' in requirement) assert.equal(found.node.level, requirement.level);
      if ('states' in requirement) for (const [state, value] of Object.entries(requirement.states)) assert.equal(found.node.states?.[state as keyof NonNullable<SemanticNode['states']>], value, `${profile}: ${requirement.name}/${state}`);
      if ('ancestor' in requirement) assert.ok(found.ancestors.some((node) => node.name === requirement.ancestor), `${profile}: lost hierarchy for ${requirement.name}`);
    }
    assert.equal(nodes.filter(({ node }) => node.role === 'button' && node.name === 'Slotted action').length, 1);
    for (const name of forbidden) assert.ok(!nodes.some(({ node }) => node.name === name), `${profile}: included ${name}`);
    for (const format of ['semantic-text', 'markdown'] as const) {
      const result = prepareExport(tree, profile, format, true);
      const exported = result.serialized.content.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/gu, '$1');
      for (const [index, secret] of ['synthetic-password-never-export', 'synthetic-api-key-never-share', 'abcdefghijklmnopqrstuvwxyz1234567890'].entries()) assert.ok(!exported.includes(secret), `${profile}/${format}: credential sentinel ${index} leaked`);
      assert.ok(result.redactionCount > 0);
      assert.ok(exported.includes('Зберегти 🙂 東京'));
      const unredacted = prepareExport(tree, profile, format, false).serialized.content.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/gu, '$1');
      assert.ok(!unredacted.includes('synthetic-password-never-export'));
      assert.ok(unredacted.includes('synthetic-api-key-never-share'));
    }
  }
}

export const updateDesktopFixture = `(() => {
  document.querySelector('#workspace').value = 'Updated workspace';
  document.querySelector('#mixed').indeterminate = false;
  document.querySelector('#mixed').checked = true;
  document.querySelector('details').open = true;
  document.querySelector('#spa').textContent = 'Updated workspace status';
  for (const tab of document.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected', String(tab.textContent === 'Security'));
})()`;

export function assertDesktopUpdate(tree: SemanticTree): void {
  const nodes = flattenWithAncestors(tree.root).map(({ node }) => node);
  assert.equal(nodes.find((node) => node.role === 'textbox' && node.name === 'Workspace name')?.value, 'Updated workspace');
  assert.equal(nodes.find((node) => node.role === 'checkbox' && node.name === 'Mixed permission')?.states?.checked, true);
  assert.equal(nodes.find((node) => node.role === 'tab' && node.name === 'Security')?.states?.selected, true);
  assert.ok(nodes.some((node) => node.role === 'button' && node.name === 'Rotate credentials'));
  assert.ok(nodes.some((node) => node.name === 'Updated workspace status'));
  assert.ok(!nodes.some((node) => node.name === 'Initial workspace status'));
}
