import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
// The one definition of the pixel art, imported rather than copied so the logo
// cannot drift from the site header. Needs Node >= 22.18 (or >= 23.6) for the
// built-in .ts type stripping; no build step and no dependency.
import { FACE_ROWS, COLOR } from '../site/src/horse-face.ts';

const BG = '#000000'; // site --bg; the cream mane is designed to pop against it

const W = 8, H = FACE_ROWS.length;   // 8 x 10 source art
const SCALE = 10;                    // -> 80 x 100, integer scale keeps edges crisp
const SIZE = 120;                    // Google wants square 120x120
const offX = (SIZE - W * SCALE) / 2; // 20
const offY = (SIZE - H * SCALE) / 2; // 10

const rects = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const fill = COLOR[FACE_ROWS[y][x]];
    if (!fill) continue;
    rects.push(
      `<rect x="${offX + x * SCALE}" y="${offY + y * SCALE}" width="${SCALE}" height="${SCALE}" fill="${fill}"/>`
    );
  }
}

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" ` +
  `viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">` +
  `<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>` +
  rects.join('') +
  `</svg>`;

const here = path.dirname(fileURLToPath(import.meta.url));
const svgPath = process.argv[2] ?? path.join(here, 'token-derby-logo.svg');
writeFileSync(svgPath, svg);
console.log(`svg written: ${svgPath} — ${SIZE}x${SIZE}, art ${W * SCALE}x${H * SCALE} at (${offX},${offY}), ${rects.length} pixels`);

// The PNGs Google actually consumes are rasterised from that SVG. rsvg-convert
// is external and optional: without it the SVG is still regenerated, and the
// stale PNGs are reported rather than silently left behind.
if (process.argv[2]) process.exit(0);
for (const px of [120, 240]) {
  const out = path.join(here, `token-derby-logo-${px}.png`);
  const r = spawnSync('rsvg-convert', ['-w', String(px), '-h', String(px), svgPath, '-o', out], { stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    console.error(`png NOT written: ${out} — needs rsvg-convert on PATH (brew install librsvg).`);
    process.exitCode = 1;
    continue;
  }
  console.log(`png written: ${out} — ${px}x${px}`);
}
