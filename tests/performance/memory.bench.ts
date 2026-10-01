import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import type { HeapProfiler } from 'node:inspector';
import { expect, it } from 'vitest';
import type { SemanticTree } from '@/src/core';
// @ts-expect-error Benchmark-only alias selects HEAD or the working tree.
import { prepareExport } from '@benchmark/core';

it('reports sampled post-export heap and retained heap after 30 synthetic captures', async () => {
  expect(global.gc).toBeTypeOf('function');
  const tree: SemanticTree = { schemaVersion: 1, root: { role: 'page', children: Array.from({ length: 10000 }, (_, i) => ({
    role: 'button', name: `Action ${i}`, children: [{ role: 'StaticText', name: `Action ${i}`, children: [] }],
  })) } };
  const reports = [];
  for (const profile of ['without', 'compact'] as const) {
    for (let index = 0; index < 5; index++) prepareExport(tree, profile, 'semantic-text', true);
    global.gc!();
    const initial = process.memoryUsage().heapUsed;
    const profiler = new Session();
    profiler.connect();
    const sampling = { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true };
    await profiler.post('HeapProfiler.startSampling', sampling);
    const samples: { postExportHeapDelta: number; retainedHeapDelta: number }[] = [];
    for (let index = 0; index < 30; index++) {
      const before = process.memoryUsage().heapUsed;
      const measure = () => {
        const output = prepareExport(tree, profile, 'semantic-text', true);
        const delta = process.memoryUsage().heapUsed - before;
        expect(output.characterCount).toBeGreaterThan(0);
        return delta;
      };
      const postExportHeapDelta = measure();
      global.gc!();
      samples.push({ postExportHeapDelta, retainedHeapDelta: process.memoryUsage().heapUsed - initial });
    }
    const deltas = samples.map((sample) => sample.postExportHeapDelta).sort((a, b) => a - b);
    const allocation = await profiler.post('HeapProfiler.stopSampling');
    profiler.disconnect();
    const total = (node: HeapProfiler.SamplingHeapProfileNode): number => node.selfSize + node.children.reduce((sum, child) => sum + total(child), 0);
    const sampledAllocationBytes = total(allocation.profile.head);
    expect(sampledAllocationBytes).toBeGreaterThan(1_000_000);
    reports.push({ profile, sampledAllocationBytes, medianPostExportHeapDeltaBytes: deltas[15], maxPostExportHeapDeltaBytes: deltas[29], samples });
  }
  if (process.env.PERFORMANCE_REPORT) writeFileSync(process.env.PERFORMANCE_REPORT, `${JSON.stringify({ node: process.version, reports }, null, 2)}\n`);
  console.info('Heap samples are Node post-export deltas, not peak allocations or total Chrome RAM.');
});
