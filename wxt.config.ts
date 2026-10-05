import { defineConfig } from 'wxt';
import { browserManifest } from './src/platform/manifest';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// noinspection JSUnusedGlobalSymbols
export default defineConfig({
  manifestVersion: 3,
  // Firefox uses platform-scoped responsive styles in one Desktop/Android package.
  vite: ({ browser }) => ({
    resolve: {
      alias: {
        '@popup-style.css': fileURLToPath(new URL(
          browser === 'firefox'
            ? './entrypoints/popup/firefox.css'
            : './entrypoints/popup/style.css',
          import.meta.url,
        )),
      },
    },
  }),
  manifest: ({ browser }) => browserManifest(browser),
  zip: {
    includeSources: [
      'package.json', 'package-lock.json', 'wxt.config.ts', 'tsconfig.json', 'vitest.config.ts',
      'README.md', 'CONTRIBUTING.md', 'LICENSE', 'BUILDING.md', 'CHANGELOG.md', 'PRIVACY.md', '.nvmrc',
      'entrypoints/**', 'src/**', 'public/**', 'scripts/**', 'tests/fixtures/**',
      'tests/helpers/**', 'tests/manual/**', 'tests/performance/**', 'docs/**',
    ],
    excludeSources: ['**/dev_notes/**', '**/.env*', '**/node_modules/**', '**/.DS_Store', '**/*.log'],
  },
  hooks: {
    'build:done': async (wxt) => { await copyFile(join(wxt.config.root, 'LICENSE'), join(wxt.config.outDir, 'LICENSE')); },
  },
});
