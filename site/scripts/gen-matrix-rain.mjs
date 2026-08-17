// Generates the Matrix theme's rain tile, which is committed as an asset rather
// than built — nothing at runtime depends on this script. It exists so the tile
// stays tunable (glyph mix, density, trail length) instead of being an
// unmaintainable blob. Seeded, so a regen with unchanged constants is a no-op
// diff.
//
//   node scripts/gen-matrix-rain.mjs
//
// The CSS pairs it with three background layers at different scales; see the
// `[data-theme="matrix"]` block in public/styles.css.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT =
  process.argv[2] ??
  join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img', 'matrix-rain.svg');

const W = 300, H = 600;
const COLS = 6, COL_W = W / COLS;      // 50
const ROWS = 20, ROW_H = H / ROWS;     // 30 — divides H exactly, so the tile wraps seamlessly
const FONT = 26;

// Token-flavoured glyphs: mostly digits (a horse's length *is* a token count)
// with code punctuation mixed in.
const GLYPHS = [...'0123456789', ...'0123456789', ...'{}<>/\\=;()[]$*+-_|!?#%&^~'];

// Mulberry32 — small, seeded, good enough for glyph scatter.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260817);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const out = [];
out.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
);
// `monospace` (not VT323): an SVG used as a background-image is an isolated
// document and cannot pull the page's webfont, so this must be a generic family.
out.push(
  `<g font-family="monospace" font-size="${FONT}" text-anchor="middle" fill="#00ff41">`,
);

for (let c = 0; c < COLS; c++) {
  const x = c * COL_W + COL_W / 2;
  const head = Math.floor(rand() * ROWS);
  const tail = 7 + Math.floor(rand() * 7);   // 7–13 glyphs of visible trail

  const spans = [];
  for (let i = 0; i < ROWS; i++) {
    // Rain falls down, so the head is the lowest glyph and the trail runs up
    // from it. Distance wraps mod ROWS, which is what keeps the tile seamless.
    const d = (head - i + ROWS) % ROWS;
    if (d > tail) continue;
    const y = i * ROW_H + FONT;
    if (d === 0) {
      spans.push(`<tspan x="${x}" y="${y}" fill="#ccffd8" fill-opacity="0.95">${esc(pick(GLYPHS))}</tspan>`);
    } else {
      const o = (1 - d / (tail + 1)) * 0.7;
      spans.push(`<tspan x="${x}" y="${y}" fill-opacity="${o.toFixed(3)}">${esc(pick(GLYPHS))}</tspan>`);
    }
  }
  out.push(`<text>${spans.join('')}</text>`);
}

out.push('</g></svg>');
const svg = out.join('\n') + '\n';
writeFileSync(OUT, svg);
console.log(`wrote ${OUT} — ${svg.length} bytes`);
