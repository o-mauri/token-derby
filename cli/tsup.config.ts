import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkgUrl = new URL('./package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), 'utf8')) as { version: string };

export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: ['@token-derby/shared'],
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
