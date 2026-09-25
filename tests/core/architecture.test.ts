import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const coreDirectory = resolve(testDirectory, '..', '..', 'src', 'core');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith('.ts') ? [path] : [];
    }),
  );
  return nested.flat();
}

describe('core architecture boundary', () => {
  it('does not depend on browser globals, adapters, UI, or entrypoints', async () => {
    const files = await sourceFiles(coreDirectory);
    const forbidden = /\b(?:chrome|browser)\s*\.|from\s+['"][^'"]*(?:adapters|entrypoints|ui)[^'"]*['"]/;

    for (const file of files) {
      expect(await readFile(file, 'utf8'), file).not.toMatch(forbidden);
    }
  });
});
