import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { ChromeAxTreeResponse } from '@/src/adapters/chrome/types';
// @ts-expect-error Benchmark-only alias selects the baseline or working tree.
import { normalizeChromeAxTree } from '@benchmark/normalizer';

function snapshot(size: number, framed: boolean): ChromeAxTreeResponse {
  return { nodes: [
    { nodeId: 'root', role: { value: 'RootWebArea' }, ...(framed ? { frameId: 'main' } : {}),
      childIds: Array.from({ length: size - 1 }, (_, index) => String(index)) },
    ...Array.from({ length: size - 1 }, (_, index) => ({
      nodeId: String(index), role: { value: 'button' }, name: { value: `Action ${index}` },
    })),
  ] };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

it('measures normalization time and post-GC retention without retaining snapshots in reports', async () => {
  expect(global.gc).toBeTypeOf('function');
  const originalWarning = console.warn;
  // Avoid inspector or mock-call retention of diagnostic objects in the measured heap.
  console.warn = () => {};
  try {
    const reports = [];
    for (const size of [417, 10001, 50001]) {
      for (const shape of ['unframed', 'framed', 'repeated-leaf', 'conflicting-leaf'] as const) {
        const raw = snapshot(size, shape !== 'unframed');
        if (shape === 'repeated-leaf') raw.nodes.push(structuredClone(raw.nodes.at(-1)!));
        if (shape === 'conflicting-leaf') raw.nodes.push({ ...raw.nodes.at(-1)!, name: { value: 'Different label' } });
        const run = () => normalizeChromeAxTree(raw);
        const verification = (() => {
          const result = run();
          if (shape === 'unframed' || shape === 'framed') expect(result.ok).toBe(true);
          if (shape === 'conflicting-leaf') expect(result.ok).toBe(false);
          return { ok: result.ok, hash: createHash('sha256').update(JSON.stringify(result)).digest('hex') };
        })();
        for (let index = 0; index < 10; index++) run();
        global.gc!();
        const repeats = size > 10001 ? 30 : 150;
        const durations: number[] = [];
        for (let index = 0; index < repeats; index++) {
          const start = performance.now();
          run();
          durations.push(performance.now() - start);
        }
        global.gc!();
        const initialHeap = process.memoryUsage().heapUsed;
        const samples = [];
        for (let index = 0; index < 30; index++) {
          const before = process.memoryUsage().heapUsed;
          const postCallHeapDelta = (() => {
            const result = run();
            const delta = process.memoryUsage().heapUsed - before;
            // Keep the result live until the post-call sample, then release it before GC.
            if (result.ok !== verification.ok) throw new Error('Unstable normalization result');
            return delta;
          })();
          global.gc!();
          samples.push({ postCallHeapDelta, retainedHeapDelta: process.memoryUsage().heapUsed - initialHeap });
        }
        durations.sort((a, b) => a - b);
        reports.push({ size, shape, inputRecords: raw.nodes.length, ...verification, repeats,
          medianMs: median(durations), p95Ms: repeats >= 100 ? durations[Math.ceil(repeats * .95) - 1] : null,
          medianPostCallHeapDeltaBytes: median(samples.map((sample) => sample.postCallHeapDelta)),
          retainedFirstFiveMedianBytes: median(samples.slice(0, 5).map((sample) => sample.retainedHeapDelta)),
          retainedLastFiveMedianBytes: median(samples.slice(-5).map((sample) => sample.retainedHeapDelta)), samples });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    let releasedObjectChecks = 0;
    for (let index = 0; index < 30; index++) {
      const references = (() => {
        const raw = snapshot(10001, true);
        if (index % 3 === 1) raw.nodes.push(structuredClone(raw.nodes.at(-1)!));
        if (index % 3 === 2) raw.nodes.push({ ...raw.nodes.at(-1)!, name: { value: 'Conflicting record' } });
        const result = normalizeChromeAxTree(raw);
        const references: WeakRef<object>[] = [
          new WeakRef(raw), new WeakRef(raw.nodes), new WeakRef(raw.nodes[0]!), new WeakRef(raw.nodes[1]!),
        ];
        if (result.ok) references.push(new WeakRef(result.tree), new WeakRef(result.tree.root));
        return references;
      })();
      // WeakRef targets become eligible for collection only after the current job ends.
      await new Promise((resolve) => setTimeout(resolve, 0));
      global.gc!();
      for (const reference of references) {
        expect(reference.deref(), 'A completed call retained its snapshot or output tree').toBeUndefined();
        releasedObjectChecks++;
      }
    }
    if (process.env.PERFORMANCE_REPORT) writeFileSync(process.env.PERFORMANCE_REPORT,
      `${JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
        freshSnapshotCalls: 30, releasedObjectChecks, reports }, null, 2)}\n`);
    console.info('Normalization benchmark: Node CPU and sampled heap only; no Chrome peak RAM or live debugger measurement.');
  } finally {
    console.warn = originalWarning;
  }
});
