import { writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { captureDomPage } from '../../src/adapters/dom/capture';
import { DOM_CAPTURE_LIMITS } from '../../src/adapters/dom/limits';

it('releases successful and rejected DOM snapshots across repeated captures', async () => {
  expect(global.gc).toBeTypeOf('function');
  const dom = new JSDOM(`<main>${'<button>Review configuration</button><input aria-label="Enabled" type="checkbox">'.repeat(200)}</main>`, { url: 'https://example.test/' });
  const reports = [];
  try {
    for (const overflow of [false, true]) {
      const samples = [];
      const references: WeakRef<object>[] = [];
      for (let iteration = 0; iteration < 30; iteration++) {
        const measure = () => {
          const start = performance.now();
          const result = captureDomPage(dom.window.document, overflow ? { ...DOM_CAPTURE_LIMITS, maxNodes: 2 } : DOM_CAPTURE_LIMITS);
          expect(result.ok).toBe(!overflow);
          if (!result.ok) expect(result.error.code).toBe('capture-limit');
          const durationMs = performance.now() - start;
          const payloadBytes = Buffer.byteLength(JSON.stringify(result));
          references.push(new WeakRef(result));
          if (result.ok) references.push(new WeakRef(result.tree));
          return { durationMs, payloadBytes };
        };
        const sample = measure();
        await new Promise<void>((resolve) => setImmediate(resolve));
        global.gc!();
        samples.push({ ...sample, retainedHeapBytes: process.memoryUsage().heapUsed });
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
      global.gc!();
      expect(references.filter((reference) => reference.deref() !== undefined)).toHaveLength(0);
      reports.push({ overflow, snapshotsCollected: references.length, samples });
    }
    if (process.env.PERFORMANCE_REPORT) writeFileSync(process.env.PERFORMANCE_REPORT, `${JSON.stringify({ node: process.version, reports, scope: 'Node/jsdom snapshot retention, not Gecko renderer memory or peak RAM' }, null, 2)}\n`);
  } finally { dom.window.close(); }
}, 60_000);
