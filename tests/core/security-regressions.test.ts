// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { captureDomPage } from '@/src/adapters/dom/capture';
import { COMPRESSION_LEVELS, prepareExport, redactSemanticTree, type SemanticTree } from '@/src/core';
import { BUILTIN_FILTERS, defaultRedactionSettings, type RedactionSettings } from '@/src/core/privacy/settings';

const secret = 'OpaquePrivateMaterial';

describe('security audit regressions', () => {
  it.each([
    `<label for="key">API key</label><table><tr><td><input id="key" value="${secret}"></td></tr></table>`,
    `<div role="textbox" aria-label="API key"><span>${secret}</span></div>`,
    `<div contenteditable="true" aria-label="API key"><a href="https://example.test/${secret}">${secret}</a></div>`,
    `<label for="key">API key</label><table><tr><td><select id="key"><option>${secret}</option></select></td></tr></table>`,
  ])('protects field contents and duplicate names across all export profiles: %s', html => {
    const dom = new JSDOM(`${html}<p>Public sibling</p>`, { url: 'https://example.test/' });
    try {
      const captured = captureDomPage(dom.window.document);
      if (!captured.ok) throw new Error(captured.error.code);
      const original = structuredClone(captured.tree);
      for (const level of COMPRESSION_LEVELS) for (const format of ['semantic-text', 'markdown'] as const) {
        const output = prepareExport(captured.tree, level, format, true).serialized.content;
        expect(output).not.toContain(secret);
        expect(output).toContain('REDACTED');
        expect(output).toContain('Public sibling');
        expect(prepareExport(captured.tree, level, format, false).serialized.content).toContain(secret);
      }
      expect(captured.tree).toEqual(original);
      const redacted = redactSemanticTree(captured.tree);
      expect(redactSemanticTree(redacted.tree)).toEqual({ tree: redacted.tree, redactionCount: 0 });
    } finally { dom.window.close(); }
  });

  const onlyQuery = (caseSensitive = false): RedactionSettings => ({
    ...defaultRedactionSettings(), disabledBuiltins: BUILTIN_FILTERS.filter(filter => filter.id !== 'query-values').map(filter => filter.id),
    builtinCaseSensitivity: { 'query-values': caseSensitive },
  });
  const tree = (url: string): SemanticTree => ({ schemaVersion: 1, title: url, sourceUrl: url,
    root: { role: 'link', name: url, href: url, children: [] } });

  it.each(['%74oken', '%74%6f%6b%65%6e', 'api%5Fkey', 'api+key', 'api%20key'])('decodes query names once without rewriting unrelated URL text: %s', name => {
    const url = `https://example.test/path?${name}=${secret}&public=%2f+keep#anchor`;
    const expected = url.replace(secret, '[REDACTED]');
    const settings = onlyQuery();
    const result = redactSemanticTree(tree(url), settings);
    expect(result.tree).toEqual(tree(expected));
    expect(redactSemanticTree(result.tree, settings).redactionCount).toBe(0);
    for (const level of COMPRESSION_LEVELS) for (const format of ['semantic-text', 'markdown'] as const) {
      expect(prepareExport(tree(url), level, format, true, settings).serialized.content).not.toContain(secret);
    }
  });

  it('preserves case overrides, disabled filters, malformed names, empty values and one-pass decoding', () => {
    const url = `https://example.test/?%54OKEN=${secret}&token=&token=[REDACTED]&%2574oken=keep&%ZZtoken=keep`;
    expect(redactSemanticTree(tree(url), onlyQuery(true)).tree).toEqual(tree(url));
    expect(redactSemanticTree(tree(url), onlyQuery()).tree).toEqual(tree(url.replace(secret, '[REDACTED]')));
    const off = { ...onlyQuery(), disabledBuiltins: BUILTIN_FILTERS.map(filter => filter.id) };
    expect(redactSemanticTree(tree(url), off).tree).toEqual(tree(url));
    const custom: RedactionSettings = { ...off, customRules: [{ id: 'custom', name: 'Custom query', type: 'urlParameters', text: 'private key', enabled: true, caseSensitive: true }] };
    expect(redactSemanticTree(tree('?private+key=hidden&Private%20key=keep'), custom).tree.sourceUrl).toBe('?private+key=[REDACTED]&Private%20key=keep');
  });

  it('does not classify ordinary headings as fields and hides named descendants of AX fields', () => {
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'page', children: [
      { role: 'heading', name: 'API key', children: [{ role: 'StaticText', name: 'Public instructions', children: [] }] },
      { role: 'textbox', name: 'API key', children: [{ role: 'generic', name: secret, children: [
        { role: 'link', name: secret, href: secret, children: [] },
      ] }] },
    ] } };
    const output = redactSemanticTree(input).tree;
    expect(output.root.children[0]).toEqual(input.root.children[0]);
    expect(JSON.stringify(output)).not.toContain(secret);
  });

  it('masks named descendants of personal fields without a value and preserves full-hide ancestry', () => {
    const input: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Full name', children: [
      { role: 'link', name: 'Alexander', href: 'Alexander', children: [] },
    ] } };
    const masked = redactSemanticTree(input);
    expect(masked.tree.root.name).toBe('Full name');
    expect(masked.tree.root.children[0]).toMatchObject({ name: 'Ale******', href: 'Ale******' });
    expect(redactSemanticTree(masked.tree)).toEqual({ tree: masked.tree, redactionCount: 0 });
    const nested: SemanticTree = { schemaVersion: 1, root: { role: 'textbox', name: 'Passport', children: [
      { role: 'textbox', name: 'Full name', value: 'Alexander', children: input.root.children },
    ] } };
    expect(JSON.stringify(redactSemanticTree(nested).tree)).not.toContain('Alexander');
    expect(redactSemanticTree(nested).tree.root.children[0]?.value).toBe('[REDACTED]');
  });
});
