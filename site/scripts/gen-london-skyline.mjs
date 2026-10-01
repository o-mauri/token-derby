// Generates the London theme's backdrop art. Committed as assets rather than
// built — nothing at runtime depends on this script. It exists so the skyline
// stays tunable (which landmarks, how tall, where the lit windows fall) instead
// of being three unmaintainable blobs of <rect>.
//
//   node scripts/gen-london-skyline.mjs
//
// Three files, because the backdrop has three jobs:
//
//   london-skyline.svg   The landmarks, drawn once and centred. NOT tiled: the
//                        whole point is Tower Bridge, the Gherkin, St Paul's,
//                        the Shard, the Eye and Big Ben, and a viewport-wide
//                        repeat would put two Big Bens on screen.
//   london-rooftops.svg  Generic blocks that DO tile, filling the width either
//                        side of the centrepiece so the skyline runs off both
//                        edges instead of ending in mid-air.
//   london-bus.svg       A Routemaster, driven across the page by CSS.
//
// Everything is drawn on an integer grid and emitted as axis-aligned rects, so
// it reads as pixel art at any size — the page renders SVG at its display size,
// so `image-rendering: pixelated` (which the rest of the site leans on) does
// nothing here and the pixels have to be real. Curves — the Eye's rim, St
// Paul's dome — are rasterised to that same grid rather than drawn as arcs.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMG = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img');

/* Two silhouette depths and two window tints. The silhouettes are only a few
   steps off the theme's --bg (#0b0f14): this is a city seen through rain at
   night, so the shapes want to be barely-there masses that the lit windows
   pick out, not black cut-outs on a lighter sky. */
const PALETTE = {
  1: '#1d2735', // near — the landmarks
  2: '#141b26', // far — generic rooftops
  3: '#f0b45a', // lit window, warm
  4: '#9fc4e8', // lit window, cold (offices left on)
  5: '#ffd9a0', // Big Ben's clock face
  // The bridge underfoot sits a few steps lighter than the distant city — it is
  // the one structure you are standing on, and without the separation its
  // parapet merges into the skyline behind it.
  12: '#2f3e51',
  13: '#41536a', // its coping and edge lines
};

/** A painter's-order grid of palette indices. Everything draws into one of
 *  these and is run-length encoded into rects at the end, so overlapping shapes
 *  resolve the way they were painted and the output has no hidden geometry. */
function canvas(w, h) {
  const cells = new Uint8Array(w * h);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const plot = (x, y, c) => {
    if (inside(x, y)) cells[y * w + x] = c;
  };
  const box = (x, y, bw, bh, c) => {
    for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) plot(xx, yy, c);
  };
  const at = (x, y) => (inside(x, y) ? cells[y * w + x] : 0);
  /** Paint only where `base` is already showing — every lit window goes through
   *  here so that a window grid laid over a tapered or curved building is
   *  clipped to the silhouette instead of spraying into the sky beside it. */
  const plotOn = (x, y, c, base) => {
    if (at(x, y) === base) plot(x, y, c);
  };

  /** Narrows from wBottom to wTop over the height, in `step`-tall bands — the
   *  Shard, every spire, the Gherkin's nose. Bands rather than a true diagonal
   *  keep the edge on the grid and reading as pixel art. */
  const taper = (cx, yTop, yBottom, wTop, wBottom, c, step = 3) => {
    for (let y = yTop; y < yBottom; y += step) {
      const t = (y - yTop) / Math.max(1, yBottom - yTop - step);
      const width = Math.max(1, Math.round(wTop + (wBottom - wTop) * t));
      box(cx - (width >> 1), y, width, Math.min(step, yBottom - y), c);
    }
  };

  /** Filled disc, optionally clipped to a half — St Paul's dome is the top half
   *  of one, the Eye's hub a small whole one. */
  const disc = (cx, cy, r, c, half = 'both') => {
    for (let y = cy - r; y <= cy + r; y++) {
      if (half === 'top' && y > cy) continue;
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) plot(x, y, c);
      }
    }
  };

  const ring = (cx, cy, r, thickness, c) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r && d > r - thickness) plot(x, y, c);
      }
    }
  };

  const line = (x0, y0, x1, y1, c) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      plot(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c);
    }
  };

  /** Lit windows on a grid, clipped to whatever silhouette they are laid over.
   *  `lit` is the fraction left on, drawn from the shared seeded RNG so a regen
   *  with unchanged constants is a no-op diff. */
  const windows = (x, y, cols, rows, gapX, gapY, c, lit, rand, base = 1, wpx = 1, hpx = 2) => {
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (rand() > lit) continue;
        for (let yy = 0; yy < hpx; yy++) {
          for (let xx = 0; xx < wpx; xx++) plotOn(x + col * gapX + xx, y + r * gapY + yy, c, base);
        }
      }
    }
  };

  /** Run-length encoding, horizontally and then vertically. The vertical pass
   *  matters more than it looks: a building is a column of identical runs, and
   *  without it the skyline emits one rect per row and lands at ~120KB instead
   *  of ~12KB. */
  const toRects = () => {
    const runs = [];
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const c = cells[y * w + x];
        if (!c) { x++; continue; }
        let end = x;
        while (end < w && cells[y * w + end] === c) end++;
        runs.push({ x, y, w: end - x, h: 1, c });
        x = end;
      }
    }
    // Grow each run downwards through identical runs on the rows below, marking
    // the ones it swallows so they are not emitted twice.
    const key = (r) => `${r.x}:${r.w}:${r.c}`;
    const byRow = new Map();
    for (const r of runs) {
      if (!byRow.has(r.y)) byRow.set(r.y, new Map());
      byRow.get(r.y).set(key(r), r);
    }
    const out = [];
    for (const r of runs) {
      if (r.merged) continue;
      for (let y = r.y + 1; y < h; y++) {
        const below = byRow.get(y)?.get(key(r));
        if (!below || below.merged) break;
        below.merged = true;
        r.h++;
      }
      out.push(r);
    }
    return out;
  };

  /** Mirror in place — the two ends of the bridge are the same piece facing
   *  opposite ways, and a background layer cannot be transformed. */
  const flip = () => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w >> 1; x++) {
        const a = y * w + x, b = y * w + (w - 1 - x);
        const t = cells[a]; cells[a] = cells[b]; cells[b] = t;
      }
    }
  };

  return { plot, plotOn, box, taper, disc, ring, line, windows, flip, toRects, w, h };
}

function toSvg(c, crop) {
  const x0 = crop?.x ?? 0;
  const w = crop?.w ?? c.w;
  const byColour = new Map();
  for (const r of c.toRects()) {
    if (!byColour.has(r.c)) byColour.set(r.c, []);
    byColour.get(r.c).push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`);
  }
  const groups = [...byColour.entries()]
    .map(([idx, rects]) => `<g fill="${PALETTE[idx]}">${rects.join('')}</g>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${c.h}" viewBox="${x0} 0 ${w} ${c.h}" shape-rendering="crispEdges">\n${groups}\n</svg>\n`;
}

// Mulberry32 — same generator the rain tiles use, for the same reason: seeded,
// so the committed art only changes when the constants above do.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The distant city ───────────────────────────────────────────────────────
// What you see from London Bridge, Tower Bridge included — it is one bridge
// downriver, and it is the one everybody actually wants to look at.
//
// Laid out west-to-east the way the river runs, which puts the two tallest
// silhouettes (the Shard, the Eye) between the Gherkin and Big Ben rather than
// stacked at one end.
function skyline() {
  const W = 520, H = 180, GROUND = H;
  const c = canvas(W, H);
  const rand = rng(20260914);
  const NEAR = 1, WARM = 3, COLD = 4, CLOCK = 5;

  // — Tower Bridge, x 0..140 —
  // The thing that kept making this look wrong was scale, not detail. Tower
  // Bridge is 65m; Big Ben is 96m and everything else here is taller still, so
  // drawn to the same spire height as Big Ben it came out as two spindly towers
  // with a thread between them. It is a LOW, WIDE, heavy bridge, and it only
  // reads once it is drawn that way: tops at y46 against Big Ben's y12, towers
  // 2.5x their own width rather than 3.5x, and the roadway high enough that the
  // opening below the walkways is a gap rather than a void.
  //
  // The tower silhouette is a pyramid roof flanked by two corner turrets that
  // rise past the shaft. Drawn as a plain tapered block it reads as a church.
  const DECK = 142;
  c.box(0, DECK, 140, 6, NEAR);                     // roadway
  c.box(0, 134, 10, GROUND - 134, NEAR);            // abutments
  c.box(130, 134, 10, GROUND - 134, NEAR);

  // Side-span chains with hangers down to the roadway. Shallow: these are stiff
  // steel links carrying a deck, not a slack rope.
  for (const [fx, fy, tx2, ty] of [[22, 96, 4, 132], [118, 96, 136, 132]]) {
    const span = Math.abs(tx2 - fx);
    for (let i = 0; i <= span; i++) {
      const t = i / span;
      const x = fx + (tx2 - fx) * t;
      const y = Math.round(fy + (ty - fy) * t + 4 * Math.sin(Math.PI * t));
      c.box(x, y, 1, 2, NEAR);
      if (i % 6 === 3) c.box(x, y + 2, 1, DECK - y - 2, NEAR);
    }
  }

  // High-level walkways, boxed by end posts, slung just under the tower roofs.
  c.box(48, 80, 44, 5, NEAR);
  c.box(48, 94, 44, 4, NEAR);
  c.box(48, 85, 3, 9, NEAR);
  c.box(89, 85, 3, 9, NEAR);
  c.windows(53, 87, 7, 1, 5, 0, WARM, 0.5, rand);

  for (const tx of [22, 92]) {
    c.box(tx, 78, 26, DECK - 78, NEAR);             // shaft
    for (const cx of [tx - 3, tx + 23]) {           // corner turrets, past the shaft
      c.box(cx, 64, 6, DECK - 64, NEAR);
      c.taper(cx + 3, 56, 64, 2, 6, NEAR, 2);
    }
    c.taper(tx + 13, 52, 78, 4, 20, NEAR, 4);       // pyramid roof between them
    c.box(tx + 12, 46, 2, 6, NEAR);                 // finial

    c.box(tx + 5, 118, 16, DECK - 118, 0);          // road arch through the base
    c.disc(tx + 13, 118, 8, 0, 'top');

    c.windows(tx + 1, 84, 2, 4, 6, 11, WARM, 0.5, rand);
    c.windows(tx + 17, 84, 2, 4, 6, 11, WARM, 0.5, rand);
  }
  c.box(22, DECK, 26, GROUND - DECK, NEAR);         // piers into the water
  c.box(92, DECK, 26, GROUND - DECK, NEAR);

  // — 30 St Mary Axe, x 156..184 —
  // A bullet: near-vertical through the middle, pinched at both ends, with the
  // lattice drawn as two crossing diagonal families of lit panes.
  const bands = [[54, 8], [60, 14], [68, 20], [78, 26], [96, 28], [130, 26], [156, 22]];
  for (let i = 0; i < bands.length - 1; i++) {
    const [y0, w0] = bands[i], [y1, w1] = bands[i + 1];
    c.taper(170, y0, y1, w0, w1, NEAR, 3);
  }
  c.box(159, 156, 22, GROUND - 156, NEAR);
  c.box(168, 48, 4, 8, NEAR);                       // the little cap
  // Two crossing families of diagonals — the tower's actual diagrid — as lit
  // panes, drawn per-pixel through plotOn so they stop at the curved edge.
  for (let y = 56; y < 170; y++) {
    for (let x = 154; x < 188; x++) {
      const onDiagrid = (x + y) % 6 === 0 || (x - y + 300) % 6 === 0;
      if (onDiagrid && rand() > 0.78) c.plotOn(x, y, COLD, NEAR);
    }
  }

  // — St Paul's, x 194..252 —
  c.box(194, 142, 58, GROUND - 142, NEAR);          // nave
  c.box(206, 112, 34, 30, NEAR);                    // drum
  c.disc(223, 112, 17, NEAR, 'top');                // dome
  c.box(219, 84, 8, 12, NEAR);                      // lantern
  c.box(221, 74, 3, 10, NEAR);                      // cross
  c.box(218, 77, 9, 2, NEAR);
  for (const tx of [196, 244]) {                    // the two west towers
    c.box(tx, 120, 8, 22, NEAR);
    c.taper(tx + 4, 110, 120, 2, 8, NEAR, 3);
  }
  c.windows(210, 120, 6, 2, 5, 8, WARM, 0.5, rand);
  c.windows(198, 150, 10, 2, 5, 8, WARM, 0.45, rand);

  // — The Shard, x 260..294 —
  c.taper(277, 18, GROUND, 3, 34, NEAR, 6);
  for (let y = 30; y < 168; y += 7) {
    const halfWidth = Math.round((1 + ((y - 18) / 150) * 16));
    c.windows(277 - halfWidth + 1, y, Math.max(1, halfWidth), 1, 4, 0, COLD, 0.4, rand);
  }

  // — The London Eye, x 296..382 —
  // Rim, capsules, spokes, hub and the A-frame. The spokes stop short of the
  // rim so the capsules read as sitting on the outside of the wheel.
  const EX = 339, EY = 92, ER = 42;
  c.line(EX, EY, 322, GROUND, NEAR);                // A-frame
  c.line(EX, EY, 323, GROUND, NEAR);
  c.line(EX, EY, 358, GROUND, NEAR);
  c.line(EX, EY, 357, GROUND, NEAR);
  c.box(300, GROUND - 6, 78, 6, NEAR);              // the boarding platform
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    c.line(EX + Math.cos(a) * 6, EY + Math.sin(a) * 6, EX + Math.cos(a) * (ER - 3), EY + Math.sin(a) * (ER - 3), NEAR);
  }
  c.ring(EX, EY, ER, 2, NEAR);
  c.disc(EX, EY, 5, NEAR);
  for (let i = 0; i < 20; i++) {                    // capsules
    const a = (i / 20) * Math.PI * 2;
    const cx = Math.round(EX + Math.cos(a) * (ER + 1));
    const cy = Math.round(EY + Math.sin(a) * (ER + 1));
    c.box(cx - 1, cy - 1, 3, 3, rand() > 0.45 ? WARM : NEAR);
  }

  // — Big Ben and the Palace of Westminster, x 392..520 —
  c.box(392, 126, 128, GROUND - 126, NEAR);         // the river frontage
  for (let x = 396; x < 520; x += 10) {             // pinnacles along the roof
    c.box(x, 118, 3, 8, NEAR);
  }
  c.windows(396, 136, 24, 3, 5, 9, WARM, 0.4, rand);

  c.box(398, 46, 24, GROUND - 46, NEAR);            // Elizabeth Tower
  c.box(396, 38, 28, 8, NEAR);                      // belfry
  c.taper(410, 12, 38, 2, 28, NEAR, 4);             // spire
  c.box(402, 56, 16, 16, NEAR);                     // clock stage
  c.disc(410, 64, 6, CLOCK);                        // clock face
  c.box(409, 59, 2, 6, NEAR);                       // hands, at ten past ten
  c.box(410, 63, 5, 2, NEAR);
  c.windows(402, 86, 4, 4, 5, 11, WARM, 0.35, rand);

  c.box(494, 82, 26, GROUND - 82, NEAR);            // Victoria Tower
  for (let x = 494; x < 520; x += 6) c.box(x, 76, 3, 6, NEAR); // crenellations
  c.windows(498, 92, 5, 6, 5, 11, WARM, 0.3, rand);

  return toSvg(c);
}

// ── Generic rooftops ───────────────────────────────────────────────────────
// Tiles, so it has to meet itself at the seam: the base strip runs the full
// width and every block is drawn wholly inside the tile, which leaves the join
// as flat roofline against flat roofline.
function rooftops() {
  const W = 220, H = 96;
  const c = canvas(W, H);
  const rand = rng(88101);
  const FAR = 2, WARM = 3, COLD = 4;

  c.box(0, 74, W, H - 74, FAR);
  let x = 2;
  while (x < W - 12) {
    const bw = 10 + Math.floor(rand() * 18);
    const bh = 14 + Math.floor(rand() * 40);
    const y = 74 - bh;
    c.box(x, y, Math.min(bw, W - 2 - x), bh, FAR);
    if (rand() > 0.7) c.box(x + (bw >> 1), y - 9, 2, 9, FAR); // aerial or chimney
    c.windows(x + 2, y + 4, Math.max(1, (bw - 4) / 5) | 0, Math.max(1, (bh - 8) / 8) | 0,
      5, 8, rand() > 0.6 ? COLD : WARM, 0.3, rand, FAR);
    x += bw + 2 + Math.floor(rand() * 6);
  }
  return toSvg(c);
}


// ── Tower Bridge ───────────────────────────────────────────────────────────
// The race runs on the bridge, so the bridge is not part of the skyline tile —
// it is a frame. Two pieces:
//
//   london-bridge-tower.svg  One tower. The same file is anchored hard left and
//                            hard right, so the pair straddles the viewport at
//                            any width and the horses run between them.
//   london-bridge-span.svg   A narrow tile carrying the two high walkways, the
//                            struts between them and the roadway deck. It
//                            repeats across the whole width; the towers are
//                            painted over its ends, so the span is only ever
//                            seen doing the one thing it should — bridging the
//                            gap between them.
//
// Both are 124 tall on a shared vertical grid, so the walkways meet the towers
// and the deck meets the piers whatever the gap between them:
//
//   y   0..26   roof and finial      y  34..40   upper walkway
//   y  48..53   lower walkway        y  78..116  the road arch's opening
//   y 116..124  roadway deck
function roadway() {
  // Five lamp columns and one phone box per tile. The tile is deliberately five
  // lamp-spacings wide rather than one: it is the only way to guarantee the box
  // never lands on a lamp. Positioned as its own background layer at some
  // percentage of the width it eventually collides with one, because the lamp
  // grid and the percentage have nothing to do with each other. In here they
  // are the same image and cannot drift apart.
  const W = 600, H = 124, SPACING = 120;
  const c = canvas(W, H);
  const BRIDGE = 12, COPING = 13, WARM = 3;

  // Drawn before the parapet so the wall covers its plinth — it stands ON the
  // bridge, behind the wall, not on top of it.
  drawPhoneBox(c, 20, 108);

  // Parapet. London Bridge is a plain post-war box girder — no towers, no
  // chains, no ornament; a flat wall and a line of lamp columns is the whole of
  // it. That plainness is the point: it is the bridge nobody photographs, one
  // upstream from the one everybody does, which is sitting in the skyline tile
  // behind it.
  //
  // Kept low on purpose: the parapet occludes the foot of everything behind it,
  // and a tall one cuts the piers and deck off Tower Bridge downriver.
  c.box(0, 106, W, H - 106, BRIDGE);
  c.box(0, 104, W, 3, COPING);                // coping course along the top
  c.box(0, 116, W, 1, COPING);                // the girder's shadow line

  for (let i = 0; i < W / SPACING; i++) {
    const x = i * SPACING;
    c.box(x + 118, 108, 1, 12, COPING);       // expansion joint
    c.box(x + 58, 72, 3, 34, BRIDGE);         // lamp column
    c.box(x + 56, 66, 7, 6, BRIDGE);
    c.box(x + 57, 68, 5, 3, WARM);
  }
  return toSvg(c);
}

// A K6, drawn into whatever tile wants one with its base at `yBase`. Smaller
// than it was when it lived in its own file: this is a bridge away, and what
// survives at that size is the stepped dome, the sign band and the lit panes.
function drawPhoneBox(c, x, yBase) {
  const RED = 16, GLASS = 17, BASE = 18, SIGN = 19;
  Object.assign(PALETTE, {
    16: '#a8161d', // darker than the bus — these read as a deeper red at night
    17: '#ffcf86', // lit from the inside
    18: '#241a1c',
    19: '#fff1d2', // the TELEPHONE panel
  });
  const y = yBase - 38;

  c.box(x + 5, y, 4, 2, RED);                 // crown
  c.box(x + 2, y + 2, 10, 2, RED);            // stepped dome
  c.box(x, y + 4, 14, 3, RED);                // roof slab
  c.box(x, y + 7, 14, 3, RED);                // sign band
  c.box(x + 2, y + 8, 10, 2, SIGN);
  c.box(x, y + 10, 14, 24, RED);              // body
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 5; row++) {
      c.box(x + 2 + col * 4, y + 12 + row * 4, 3, 3, GLASS);
    }
  }
  c.box(x, y + 34, 14, 4, BASE);              // plinth
}

// ── Rain ───────────────────────────────────────────────────────────────────
// One tile of streaks, shown at three scales in the shared .rain-backdrop the
// Matrix theme also uses. Two things make it tile seamlessly:
//
//   - Every streak wraps in BOTH axes (the modulo on plot), so one that runs
//     off an edge comes back on the opposite one and the tile has no border.
//   - The slope is exactly 1 across for 4 down, which is the same ratio as the
//     tile's width to its height. The layer travels one tile width sideways per
//     tile height down, so the streaks move ALONG their own axis. Get this
//     wrong and the rain visibly crabs sideways as it falls.
function rainTile() {
  const W = 120, H = 480;
  const c = canvas(W, H);
  const rand = rng(5150);
  // Three shades rather than one: near drops read brighter than far ones, and
  // a single flat colour makes the sheet look like a screen door.
  const SHADES = [20, 21, 22];
  Object.assign(PALETTE, { 20: '#7e97b5', 21: '#aac1da', 22: '#d7e5f4' });

  for (let i = 0; i < 30; i++) {
    const x0 = Math.floor(rand() * W);
    const y0 = Math.floor(rand() * H);
    const len = 16 + Math.floor(rand() * 30);
    const shade = SHADES[Math.floor(rand() * SHADES.length)];
    for (let k = 0; k < len; k++) {
      c.plot((((x0 - ((k / 4) | 0)) % W) + W) % W, (y0 + k) % H, shade);
    }
  }
  return toSvg(c);
}

// ── Victorian street lamps ─────────────────────────────────────────────────
// A tile holding one lamp, repeated along the near kerb. The tile's width IS
// the spacing between lamps, and it is deliberately wide: these stand in FRONT
// of the racing surface, so a close rhythm would have a horse behind a post
// more often than not.
//
// Drawn as near-black ironwork rather than in the silhouette colours the rest
// of the art uses — everything else in this theme is distance, and this is the
// one thing nearer the viewer than the track.
function streetLamps() {
  const W = 260, H = 116, X = 128;
  const c = canvas(W, H);
  const IRON = 14, GLASS = 15, WARM = 3;
  Object.assign(PALETTE, { 14: '#10151c', 15: '#ffcf86' });

  c.box(X - 7, 110, 15, 6, IRON);        // plinth
  c.box(X - 5, 104, 11, 6, IRON);
  c.box(X - 3, 100, 7, 4, IRON);
  c.box(X - 2, 46, 5, 54, IRON);         // column
  c.box(X - 3, 74, 7, 3, IRON);          // collar rings
  c.box(X - 3, 60, 7, 3, IRON);
  c.box(X - 10, 42, 21, 3, IRON);        // the lamplighter's ladder bar
  c.box(X - 11, 40, 2, 5, IRON);         // and its end knobs
  c.box(X + 10, 40, 2, 5, IRON);

  c.box(X - 7, 24, 15, 18, IRON);        // lantern
  c.box(X - 5, 27, 11, 13, GLASS);
  c.box(X - 1, 27, 1, 13, IRON);         // glazing bar
  c.taper(X, 16, 24, 3, 17, IRON, 2);    // lantern roof
  c.box(X - 1, 11, 3, 5, IRON);          // finial
  c.box(X - 1, 9, 3, 2, WARM);

  return toSvg(c);
}

// ── A Routemaster ──────────────────────────────────────────────────────────
// Facing right, since CSS drives it left-to-right.
//
// The body is ONE rectangle, rear to front, both decks flush. An earlier pass
// cut the open rear platform straight out of the silhouette, which left the
// bottom half visibly shorter than the top half and read as a bus with its back
// end chopped off. A real Routemaster's platform is an opening in the side
// panel, not a missing corner: the rear pillar, the platform floor and the
// skirt all continue around it, so here it is drawn as a dark recess inside an
// outline that stays square.
function bus() {
  const W = 58, H = 28;
  const c = canvas(W, H);
  const RED = 6, CREAM = 7, GLASS = 8, TYRE = 9, HUB = 10, INSIDE = 11, BLIND = 3;
  Object.assign(PALETTE, {
    6: '#c8202a', // Routemaster red, dulled for a night scene
    7: '#e8dcc4', // the between-decks band
    // Lit, not dark: at this size the two rows of glowing windows are what say
    // "double-decker" before the shape has a chance to. Dark glass just reads
    // as two holes punched in a red box.
    8: '#ffca7a',
    9: '#0c1016', // tyre
    10: '#59636f', // hub
    11: '#3d1418', // the unlit inside of the rear platform
  });

  // Body: roof, both decks, skirt — one square outline.
  c.box(4, 1, 50, 2, RED);
  c.box(2, 3, 54, 21, RED);

  // Upper deck.
  c.box(5, 5, 44, 6, GLASS);
  for (let i = 0; i <= 5; i++) c.box(5 + i * 8, 5, 1, 6, RED); // pillars
  c.box(50, 5, 5, 4, BLIND);                                   // destination blind

  c.box(2, 12, 54, 3, CREAM);

  // Lower deck: saloon windows, then the cab set apart by its own pillar.
  c.box(11, 17, 32, 4, GLASS);
  for (let i = 0; i <= 3; i++) c.box(11 + i * 8, 17, 1, 4, RED);
  c.box(46, 17, 8, 4, GLASS);

  // The open rear platform — recess, floor, and the pillar that carries the
  // upper deck over it.
  c.box(3, 16, 6, 5, INSIDE);
  c.box(3, 21, 6, 1, RED);
  c.box(9, 16, 1, 6, RED);

  // Wheels, sat under a continuous skirt so they hang off the body rather than
  // floating beneath it.
  c.box(2, 22, 54, 2, RED);
  for (const wx of [11, 41]) {
    c.box(wx, 23, 8, 5, TYRE);
    c.box(wx + 2, 25, 4, 2, HUB);
  }

  c.box(56, 18, 2, 2, BLIND); // headlamp

  return toSvg(c);
}

writeFileSync(join(IMG, 'london-skyline.svg'), skyline());
writeFileSync(join(IMG, 'london-bridge.svg'), roadway());
writeFileSync(join(IMG, 'london-lamp.svg'), streetLamps());
writeFileSync(join(IMG, 'london-rain.svg'), rainTile());
writeFileSync(join(IMG, 'london-rooftops.svg'), rooftops());
writeFileSync(join(IMG, 'london-bus.svg'), bus());
console.log('wrote london-skyline, -bridge, -lamp, -rain, -rooftops, -bus');
