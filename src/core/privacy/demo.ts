// Copyright (c) 2026 Vitalii Shkrobatskyi; SPDX-License-Identifier: GPL-3.0-only

import type { SemanticNode, SemanticTree } from '../model';
import { redactSemanticTree } from './redact';
import { filterExample, testRules } from './test-filters';
import { validateRedactionSettings, customRuleTerms, type RedactionSettings, type RuleType } from './settings';

export interface DemoExample {
  key: string;
  ruleKey: string;
  ruleName: string;
  type: RuleType;
  sample: string;
  fieldLabel: string;
  link: boolean;
  output: string;
  labelOutput?: string;
}
export interface FilterDemo {
  enabledCount: number;
  redactionCount: number;
  examples: DemoExample[];
  unavailable: { key: string; name: string }[];
}

/** Evaluate all demo samples in one original-text pass with the full enabled configuration. */
export function buildFilterDemo(settings: RedactionSettings): FilterDemo {
  const config = validateRedactionSettings(settings);
  const rules = testRules(config).filter(item => item.rule.enabled);
  const unavailable: FilterDemo['unavailable'] = [];
  const examples: DemoExample[] = [];
  for (const item of rules) {
    try {
      const samples = item.rule.type === 'personalFieldsMask' || item.rule.type === 'personalFieldsHide' ? [
        { sample: 'Alexander', fieldLabel: 'Full name' }, { sample: '123 Example Street', fieldLabel: 'Address' },
        { sample: 'person@example.test', fieldLabel: 'Email' }, { sample: '050 123 4567', fieldLabel: 'Phone' },
        { sample: 'SYNTHETIC-12345', fieldLabel: 'Passport' }, { sample: '123', fieldLabel: 'CVV' },
      ] : [filterExample(item)];
      if (item.rule.type === 'urlParameters') {
        const term = customRuleTerms(item.rule).find(term => {
          const url = `https://example.test/?${term}=synthetic-value`;
          try { return new URL(url).href === url; } catch { return false; }
        });
        if (term) samples[0] = { sample: `https://example.test/?${term}=synthetic-value`, fieldLabel: '' };
      }
      for (const [index, sample] of samples.entries()) examples.push({
        key: `${item.key}:${index}`, ruleKey: item.key, ruleName: item.rule.name, type: item.rule.type!, ...sample,
        link: item.rule.type === 'urlParameters' && new URL(sample.sample).href === sample.sample, output: '',
      });
    } catch { unavailable.push({ key: item.key, name: item.rule.name }); }
  }
  const children: SemanticNode[] = examples.map(example => example.fieldLabel
    ? { role: 'textbox', name: example.fieldLabel, value: example.sample, children: [] }
    : example.link ? { role: 'link', href: example.sample, children: [] } : { role: 'text', name: example.sample, children: [] });
  const tree: SemanticTree = { schemaVersion: 1, root: { role: 'page', children } };
  const result = redactSemanticTree(tree, config);
  result.tree.root.children.forEach((node, index) => {
    const example = examples[index]!;
    example.output = (example.fieldLabel ? node.value : example.link ? node.href : node.name) ?? '';
    if (example.fieldLabel) example.labelOutput = node.name;
  });
  return { enabledCount: rules.length, redactionCount: result.redactionCount, examples, unavailable };
}
