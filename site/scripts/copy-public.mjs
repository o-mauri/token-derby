import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', 'public');
const dst = path.resolve(here, '..', 'dist');

await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`copied public/* → ${dst}`);
