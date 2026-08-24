import { writeFileSync } from 'node:fs';

// Same pixel data as site/src/horse-face.ts, kept in sync deliberately.
const FACE_ROWS = [
  '..MMM...', '..MMM...', '.MBBEBB.', '.MBBEBB.', 'MBBBBBBB',
  'MBBBBBBB', 'MBBB....', 'MBBB....', 'BB......', 'BB......',
];
const COLOR = { B: '#8B4513', M: '#f5e9d3', E: '#000000' };
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

writeFileSync(process.argv[2], svg);
console.log(`svg written: ${SIZE}x${SIZE}, art ${W * SCALE}x${H * SCALE} at (${offX},${offY}), ${rects.length} pixels`);
