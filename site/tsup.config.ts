import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/main.ts', 'preview-finished': 'src/preview-finished.ts' },
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  platform: 'browser',
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: ['@token-derby/shared'],
  minify: false,
});
