import { defineConfig } from 'wxt';
import { browserManifest } from './src/platform/manifest';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// noinspection JSUnusedGlobalSymbols
export default defineConfig({
  manifestVersion: 3,
  // Select popup styles at build time so mobile sizing cannot affect Desktop.
  vite: ({ browser, mode }) => ({
    resolve: {
      alias: {
        '@popup-style.css': fileURLToPath(new URL(
          browser === 'firefox' && mode === 'android-test'
            ? './entrypoints/popup/android.css'
            : './entrypoints/popup/style.css',
          import.meta.url,
        )),
      },
    },
  }),
  manifest: ({ browser, mode }) => browserManifest(browser, mode === 'android-test'),
  zip: {
    includeSources: [
      'package.json', 'package-lock.json', 'wxt.config.ts', 'tsconfig.json', 'vitest.config.ts',
      'README.md', 'CONTRIBUTING.md', 'LICENSE', 'BUILDING.md',
      'entrypoints/**', 'src/**', 'public/**', 'scripts/**', 'tests/fixtures/**',
      'tests/helpers/**', 'tests/manual/**', 'tests/performance/**', 'docs/**',
    ],
    excludeSources: ['**/dev_notes/**', '**/.env*', '**/node_modules/**', '**/.DS_Store', '**/*.log'],
  },
  hooks: {
    'build:done': async (wxt) => { await copyFile(join(wxt.config.root, 'LICENSE'), join(wxt.config.outDir, 'LICENSE')); },
  },
});
