import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/memory/**/*.memory.ts'],
    pool: 'forks',
    execArgv: ['--expose-gc'],
    testTimeout: 20_000,
  },
});
