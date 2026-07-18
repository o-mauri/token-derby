// Post-build step for `tsc -p tsconfig.node.json`.
//
// `tsc` only emits compiled JS, it doesn't copy static assets — this copies
// `electron/assets/` (the tray icon) next to the compiled main/tray/preload
// output so `tray.ts`'s relative `assets/trayTemplate.png` path resolves.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distElectronDir = path.join(desktopDir, 'dist-electron');
const assetsSrc = path.join(desktopDir, 'electron', 'assets');
const assetsDest = path.join(distElectronDir, 'assets');

if (!existsSync(distElectronDir)) {
  mkdirSync(distElectronDir, { recursive: true });
}

if (existsSync(assetsSrc)) {
  cpSync(assetsSrc, assetsDest, { recursive: true });
}
