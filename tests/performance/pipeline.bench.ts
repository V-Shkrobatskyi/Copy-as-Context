import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SemanticNode, SemanticTree } from '@/src/core';
// @ts-expect-error Benchmark-only aliases select either HEAD or the working tree.
import { compressSemanticTree, prepareExport } from '@benchmark/core';
// @ts-expect-error Benchmark-only alias; never included in extension entrypoints.
import { normalizeChromeAxTree } from '@benchmark/normalizer';

// Opt-in synthetic benchmark. It is excluded from regular tests and extension builds.
function wide(nodes: number): SemanticTree {
  return { schemaVersion: 1, title: 'Synthetic *benchmark* 🙂', sourceUrl: 'https://example.test/?token=synthetic-secret',
    capturedAt: '2026.10.01 00:00:00', root: { role: 'page', children: Array.from({ length: nodes / 5 }, (_, index) => ({
      role: 'row', children: [
        { role: 'link', name: `Resource ${index}`, href: `https://example.test/${index}`, children: [] },
        { role: 'button', name: 'Save resource', children: [
          { role: 'StaticText', name: 'Save', children: [] },
          { role: 'StaticText', name: 'resource', children: [] },
        ] },
        { role: 'textbox', name: 'Password', value: 'synthetic-benchmark-secret', states: { readOnly: true }, children: [] },
      ],
    })) } };
}

function deep(): SemanticTree {
  let root: SemanticNode = { role: 'StaticText', name: 'Label 0', children: [] };
  for (let index = 0; index < 200; index++) root = { role: 'group', name: `Label ${index}`, children: [root] };
  return { schemaVersion: 1, root };
}

function measure(run: () => unknown, repeats: number) {
  for (let index = 0; index < 5; index++) run();
  const durations: number[] = [];
  for (let index = 0; index < repeats; index++) {
    const start = performance.now();
    run();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return { repeats, medianMs: durations[Math.floor(repeats / 2)],
    p95Ms: repeats >= 100 ? durations[Math.ceil(repeats * .95) - 1] : null };
}

describe('synthetic performance baseline', () => {
  it('measures export and normalization without retaining page content in reports', async () => {
    const previous = process.env.PERFORMANCE_COMPARE
      ? JSON.parse(readFileSync(process.env.PERFORMANCE_COMPARE, 'utf8')) as { results: Record<string, { hash?: string }> }
      : undefined;
    const results: Record<string, unknown> = {};
    for (const [scenario, tree] of Object.entries({ small: wide(1000), medium: wide(10000), large: wide(50000), deep: deep() })) {
      if (process.env.PERFORMANCE_SCENARIOS && !process.env.PERFORMANCE_SCENARIOS.split(',').includes(scenario)) continue;
      for (const level of ['without', 'detailed', 'compact', 'maximum'] as const) {
        for (const format of ['semantic-text', 'markdown'] as const) {
          for (const privacy of [true, false]) {
            const key = `${scenario}/${level}/${format}/${privacy}`;
            const output = prepareExport(tree, level, format, privacy);
            const hash = createHash('sha256').update(JSON.stringify(output)).digest('hex');
            if (previous) expect(hash, key).toBe(previous.results[key]?.hash);
            results[key] = { ...measure(() => prepareExport(tree, level, format, privacy), scenario === 'large' ? 20 : Number(process.env.PERFORMANCE_REPEATS || 100)),
              hash, outputBytes: Buffer.byteLength(output.serialized.content) };
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }
      results[`${scenario}/compression`] = measure(() => compressSemanticTree(tree, 'compact'), 100);
    }
    const raw = { nodes: [{ nodeId: 'root', role: { value: 'RootWebArea' }, childIds: Array.from({ length: 10000 }, (_, i) => String(i)) },
      ...Array.from({ length: 10000 }, (_, i) => ({ nodeId: String(i), role: { value: 'button' }, name: { value: `Action ${i}` } }))] };
    expect(normalizeChromeAxTree(raw).ok).toBe(true);
    results.normalization = measure(() => normalizeChromeAxTree(raw), 100);
    const report = { node: process.version, platform: process.platform, arch: process.arch, results };
    if (process.env.PERFORMANCE_REPORT) writeFileSync(process.env.PERFORMANCE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
    console.info('Synthetic benchmark complete:', Object.keys(results).length, 'cases; no live Chrome or peak RAM measurement.');
  });
});
