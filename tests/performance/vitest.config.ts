import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const source = process.env.PERFORMANCE_BASELINE_ROOT || fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
  resolve: { alias: { '@benchmark/core': resolve(source, 'src/core/index.ts'), '@benchmark/normalizer': resolve(source, 'src/adapters/chrome/normalize-ax.ts') } },
  test: {
    environment: 'node',
    include: [process.env.PERFORMANCE_DOM ? 'tests/performance/dom.bench.ts' : process.env.PERFORMANCE_NORMALIZATION ? 'tests/performance/normalization.bench.ts'
      : process.env.PERFORMANCE_MEMORY ? 'tests/performance/memory.bench.ts' : 'tests/performance/pipeline.bench.ts'],
    testTimeout: 180_000,
    ...(process.env.PERFORMANCE_DOM || process.env.PERFORMANCE_MEMORY || process.env.PERFORMANCE_NORMALIZATION
      ? { pool: 'forks', execArgv: ['--expose-gc'] } : {}),
  },
});
