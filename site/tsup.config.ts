import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const ver = (p: string): string => JSON.parse(readFileSync(p, 'utf8')).version;

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    'preview-finished': 'src/preview-finished.ts',
    'preview-org': 'src/preview-org.ts',
    'preview-org-manager': 'src/preview-org-manager.ts',
    'preview-race': 'src/preview-race.ts',
    'preview-league': 'src/preview-league.ts',
    'preview-toasts': 'src/preview-toasts.ts',
  },
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  platform: 'browser',
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: ['@token-derby/shared'],
  minify: false,
  define: {
    __SITE_VERSION__: JSON.stringify(ver('package.json')),
    __CLI_VERSION__: JSON.stringify(ver('../cli/package.json')),
  },
});
