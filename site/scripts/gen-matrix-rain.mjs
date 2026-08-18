// Generates the rain tiles for the Matrix / Phosphor themes. These are committed
// as assets rather than built — nothing at runtime depends on this script. It
// exists so the tiles stay tunable (glyph mix, density, trail length, strength)
// instead of being unmaintainable blobs. Seeded, so a regen with unchanged
// constants is a no-op diff.
//
//   node scripts/gen-matrix-rain.mjs
//
// Two tiles, because the two places rain appears have very different shapes:
//
//   matrix-rain.svg       The page backdrop, drawn across the whole viewport.
//                         Tall (600px) so streams have room to run, and drawn
//                         full strength because the layer that uses it is
//                         dimmed by its own `opacity`.
//   matrix-rain-lane.svg  Matrix's in-lane rain. A lane is only ~60px tall and
//                         the tile is anchored to it, so this one is short
//                         (180px) — a 600px tile would show the same frozen
//                         slice in every lane. It is also wide (900px): a lane
//                         is one background layer with nothing to break up the
//                         horizontal repeat, and at 300px the eye picked out
//                         the same glyph clusters marching across. Its glyphs
//                         are small (14px on an 18px grid) so a ~60px lane
//                         holds three rows rather than two — at the backdrop's
//                         26px they read as scattered characters, not rain. And
//                         its dimming is baked in, because there is no way to
//                         set opacity on a single background layer among three.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMG = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img');

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

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tile({ w, h, cols, rows, font, strength }) {
  const colW = w / cols;
  const rowH = h / rows;          // must divide exactly, or the tile won't wrap
  const rand = rng(20260817);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // Trail length scales with the tile's row count: a 6-row tile can't carry the
  // 7–13 glyph trail a 20-row one does without the streams meeting themselves.
  const tailMin = Math.max(2, Math.round(rows * 0.35));
  const tailMax = Math.max(3, Math.round(rows * 0.65));

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    // `monospace` (not VT323): an SVG used as a background-image is an isolated
    // document and cannot pull the page's webfont, so this must be a generic family.
    `<g font-family="monospace" font-size="${font}" text-anchor="middle" fill="#00ff41">`,
  ];

  for (let c = 0; c < cols; c++) {
    const x = c * colW + colW / 2;
    const head = Math.floor(rand() * rows);
    const tail = tailMin + Math.floor(rand() * (tailMax - tailMin + 1));

    const spans = [];
    for (let i = 0; i < rows; i++) {
      // Rain falls down, so the head is the lowest glyph and the trail runs up
      // from it. Distance wraps mod rows, which is what keeps the tile seamless.
      const d = (head - i + rows) % rows;
      if (d > tail) continue;
      const y = i * rowH + font;
      const glyph = esc(pick(GLYPHS));
      if (d === 0) {
        const o = (0.95 * strength).toFixed(3);
        spans.push(`<tspan x="${x}" y="${y}" fill="#ccffd8" fill-opacity="${o}">${glyph}</tspan>`);
      } else {
        const o = ((1 - d / (tail + 1)) * 0.7 * strength).toFixed(3);
        spans.push(`<tspan x="${x}" y="${y}" fill-opacity="${o}">${glyph}</tspan>`);
      }
    }
    out.push(`<text>${spans.join('')}</text>`);
  }

  out.push('</g></svg>');
  return out.join('\n') + '\n';
}

const TILES = [
  ['matrix-rain.svg',      { w: 300, h: 600, cols: 6,  rows: 20, font: 26, strength: 1 }],
  ['matrix-rain-lane.svg', { w: 900, h: 180, cols: 30, rows: 10, font: 14, strength: 0.5 }],
];

for (const [name, cfg] of TILES) {
  if (cfg.h % cfg.rows || cfg.w % cfg.cols) throw new Error(`${name}: geometry must divide exactly`);
  const svg = tile(cfg);
  const path = join(IMG, name);
  writeFileSync(path, svg);
  console.log(`wrote ${path} — ${cfg.w}x${cfg.h}, ${svg.length} bytes`);
}
