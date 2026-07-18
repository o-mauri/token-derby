import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

const root = import.meta.dirname;

// Renders the popover/app-window UI from src/, and (in dev only) bundles the
// electron main + preload entrypoints so `vite`/`vite dev` can hot-reload them.
// Production main/preload builds go through `tsc -p tsconfig.node.json` instead
// (see package.json `build:main`), which is the source of truth for `dist-electron`.
export default defineConfig({
  root: 'src',
  plugins: [
    react(),
    electron({
      main: {
        entry: path.join(root, 'electron/main.ts'),
        vite: {
          build: {
            outDir: path.join(root, 'dist-electron'),
            rollupOptions: { external: ['electron'] },
          },
        },
      },
      preload: {
        input: path.join(root, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: path.join(root, 'dist-electron'),
            rollupOptions: { external: ['electron'] },
          },
        },
      },
    }),
  ],
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
  },
});
