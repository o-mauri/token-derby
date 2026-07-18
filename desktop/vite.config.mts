import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

const root = import.meta.dirname;

// `tsc` isn't in this build's pipeline, so the tray PNG needs its own copy
// step here too — otherwise a bare `npm run dev` (no prior `build:main`)
// starts Electron with no icon file next to the compiled main process.
function copyTrayAssets(): Plugin {
  return {
    name: 'copy-tray-assets',
    closeBundle() {
      const src = path.join(root, 'electron/assets');
      const dest = path.join(root, 'dist-electron/assets');
      if (existsSync(src)) cpSync(src, dest, { recursive: true });
    },
  };
}

// Renders the popover/app-window UI from src/, and (in dev only) bundles the
// electron main + preload entrypoints so `vite`/`vite dev` can hot-reload them.
// Production main/preload builds go through `tsc -p tsconfig.node.json` instead
// (see package.json `build:main`), which is the source of truth for `dist-electron`.
//
// Both paths must agree on module format: main.ts/tray.ts/windows.ts use
// `__dirname`, which only exists under CommonJS. `format: 'cjs'` +
// `entryFileNames` pin this build to the same CJS `main.js`/`preload.js`
// output as the `tsc` build, regardless of the package's own module type.
const cjsOutput = (entryName: string) => ({
  format: 'cjs' as const,
  entryFileNames: `${entryName}.js`,
});

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
            rollupOptions: { external: ['electron'], output: cjsOutput('main') },
          },
          plugins: [copyTrayAssets()],
        },
      },
      preload: {
        input: path.join(root, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: path.join(root, 'dist-electron'),
            rollupOptions: { external: ['electron'], output: cjsOutput('preload') },
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
