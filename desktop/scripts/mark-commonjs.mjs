// Post-build step for `tsc -p tsconfig.node.json`.
//
// The electron main/preload build emits CommonJS (`require`/`__dirname`) so
// `windows.ts`'s `path.join(__dirname, ...)` works at runtime. But the
// workspace `package.json` declares `"type": "module"`, and Node picks a
// file's module system from the *nearest* package.json — so without an
// override, `dist-electron/*.js` would be loaded as ESM and crash on
// `require`/`__dirname`. This drops a local package.json into dist-electron
// to pin that directory back to CommonJS, and copies the tray icon asset
// next to the compiled main/tray/preload output.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distElectronDir = path.join(desktopDir, 'dist-electron');
const assetsSrc = path.join(desktopDir, 'electron', 'assets');
const assetsDest = path.join(distElectronDir, 'assets');

if (!existsSync(distElectronDir)) {
  mkdirSync(distElectronDir, { recursive: true });
}

writeFileSync(path.join(distElectronDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

if (existsSync(assetsSrc)) {
  cpSync(assetsSrc, assetsDest, { recursive: true });
}
