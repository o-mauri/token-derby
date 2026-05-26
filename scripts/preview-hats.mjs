#!/usr/bin/env node
// Preview every hat in the catalog, rendered on the horse sprite.
// Run from repo root:
//   node scripts/preview-hats.mjs

// ── Horse sprite (32×24) ─────────────────────────────────────────────
// B=body, M=mane, T=tail, S=saddle, E=eye, H=hoof, .=transparent
const HORSE_ROWS = [
  '................................',
  '................................',
  '..........................MMM...',
  '..........................MMM...',
  '.........................MBBEBB.',
  '.........................MBBEBB.',
  '........................MBBBBBBB',
  '........................MBBBBBBB',
  '..................MMMMMMMBBB....',
  '..................MMMMMMMBBB....',
  '....BBBBBBBBSSSSSSMMBBBBBB......',
  '...BBBBBBBBBSSSSSSMMBBBBBB......',
  '.TTBBBBBBBBBSSSSSSBBBBBBBB......',
  '.TTBBBBBBBBBSSSSSSBBBBBBBB......',
  'TTTBBBBBBBBBBBBBBBBBBBBBBB......',
  'TTTBBBBBBBBBBBBBBBBBBBBB........',
  '...BBB.BBB.....BBB.BBB..........',
  '...BBB.BBB.....BBB.BBB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '...HHH.HHH.....HHH.HHH..........',
];

// A chestnut horse. Override these to preview hats on a different palette.
const HORSE_COLORS = {
  B: '#A0522D',
  M: '#2F1B0C',
  T: '#2F1B0C',
  S: '#8B4513',
  E: '#000000',
  H: '#1F1108',
};

// ── Hats (39 total) ──────────────────────────────────────────────────
const HATS = [
  // ── COMMON (18) ────────────────────────────────────────────────────────
  { id: 'flat_cap', name: "Flat Cap", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','...........','....AAAA...','...AAAAAA..','..AAAAAAA..'], variants: [{ A: '#8B6914' }] },
  { id: 'bucket_hat', name: "Bucket Hat", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','...QQQQQ...','...AAAAA...','...AAAAA...','.AAAAAAAAA.'], variants: [{ A: '#CC2200', Q: '#FFFFFF' }] },
  { id: 'beanie', name: "Beanie", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','....AAA....','...AAAAA...','...AAAAA...','..AAAAAAA..'], variants: [{ A: '#4A7C59' }] },
  { id: 'stetson', name: "Stetson", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...AA.AA...','...AAAAA...','...AAAAA...','A..AAAAA..A','AAAAAAAAAAA','AAAAAAAAAAA'], variants: [{ A: '#C49A00' }] },
  { id: 'party_hat', name: "Party Hat", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','.....A.....','....AAA....','....AQA....','...AQAQA...','...AAAAA...'], variants: [{ A: '#FF69B4', Q: '#FFD700' }] },
  { id: 'fez', name: "Fez", rarity: 'common', width: 11, anchor_x: 22, rows: ['...........','...........','...........','...........','...........','...........','....Q......','....AAA....','....AAA....','....AAA....'], variants: [{ A: '#CC0000', Q: '#8B0000' }] },
  { id: 'sailor_hat', name: "Sailor Hat", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','...QQQQQ...','..AAAAAAA..','..QQQQQQQ..','..AAAAAAA..'], variants: [{ A: '#FFFFFF', Q: '#000080' }] },
  { id: 'newsboy_cap', name: "Newsboy Cap", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','...AAAAA...','..AAAQAAA..','..AAAAAAA..','..AAAAAA...'], variants: [{ A: '#5C4033', Q: '#3D2B1F' }] },
  { id: 'tam_o_shanter', name: "Tam O'Shanter", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','.....Q.....','....AAA....','..AAAAAAA..','..AAAAAAA..','...AAAAA...'], variants: [{ A: '#006400', Q: '#FF0000' }] },
  { id: 'trucker_cap', name: "Trucker Cap", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','...AAQQ....','...AAQQ....','..AAQQQAA..','..AAQQQAA..'], variants: [{ A: '#2196F3', Q: '#FFFFFF' }] },
  { id: 'hard_hat', name: "Hard Hat", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','....AAA....','...AAAAA...','..AAAAAAA..','..AAAAAAA..'], variants: [{ A: '#FFD600' }] },
  { id: 'chef_toque', name: "Chef's Toque", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...AAAAA...','..AAAAAAA..','...AAAAA...','...AAAAA...','...AAAAA...','...AAAAA...'], variants: [{ A: '#FFFFFF', Q: '#F0F0F0' }] },
  { id: 'bobble_hat', name: "Bobble Hat", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','.....Q.....','...AAAAA...','...AAAAA...','..AAAAAAA..'], variants: [{ A: '#C62828', Q: '#FFFFFF' }] },
  { id: 'cowboy_hat', name: "Cowboy Hat", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','...AAAAA...','...AAAAA...','A.AAAAAAA.A','.AAAAAAAAA.'], variants: [{ A: '#8B4513' }] },
  { id: 'baseball_cap', name: "Baseball Cap", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','..AAAAAA...','..AAAAAA...','..AAAAAAA..','..AAAAAAAAA'], variants: [{ A: '#1565C0' }] },
  { id: 'tinfoil_hat', name: "Tinfoil Hat", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','.....A.....','....AAA....','...AAAAA...','..AAAAAAA..'], variants: [{ A: '#B0BEC5' }] },
  { id: 'dunce_cap', name: "Dunce Cap", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','.....Q.....','....QAQ....','...QAAAQ...','...QAAAQ...','..QAAAAAQ..','..AAAAAAA..'], variants: [{ A: '#F8F8F8', Q: '#F44336' }] },
  { id: 'mini_top_hat', name: "Mini Top Hat", rarity: 'common', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...AAAAA...','...AAAAA...','...AAAAA...','..AAAAAAA..','..AAAAAAA..'], variants: [{ A: '#212121' }] },
  // ── RARE (10) ──────────────────────────────────────────────────────────
  { id: 'bicorne', name: "Bicorne", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','..AAAQQQQ..','..AAAAAAA..','..AAAAAAA..','...QQQQQ...'], variants: [{ A: '#1A237E', Q: '#FFD700' }] },
  { id: 'viking_helmet', name: "Viking Helmet", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','..A.AAA.A..','..AAAAAAA..','..AAAAAAA..','..AQQQQQA..'], variants: [{ A: '#9E9E9E', Q: '#8D6E63' }] },
  { id: 'jesters_cap', name: "Jester's Cap", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','..AQAQAQA..','..AQAQAQA..','...AAAAA...','...AAAAA...'], variants: [{ A: '#E53935', Q: '#FFD600' }] },
  { id: 'plague_doctor', name: "Plague Doctor Beak", rarity: 'rare', width: 11, anchor_x: 24, rows: ['...........','...........','...........','...........','....QQQ....','...QAAAQQ..','...QQQQQQQ.','..QQQQQ.QQQ','..QQQQ....Q','..QQQQ.....'], variants: [{ A: '#F5F5F5', Q: '#795548' }] },
  { id: 'morion', name: "Conquistador Morion", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','.....Q.....','...QQQQQ...','...QAAAQ...','.A..AAA..A.','..AAQQQAA..'], variants: [{ A: '#B0BEC5', Q: '#FFD600' }] },
  { id: 'shako', name: "Shako", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','........Q..','........Q..','........Q..','........Q..','..AAAAAAA..','..AAAAAAA..','..AAAAAAA..','..AQQQQQA..'], variants: [{ A: '#45464f', Q: '#00ff2a' }] },
  { id: 'centurion_helm', name: "Centurion Helm", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','....QQQ....','...QQQQQQ..','..QQQQQQQQ.','.QQ..A...Q.','.Q..AAA....','...AAAAA...','..AAAAAAA..','..AAAAAAA..'], variants: [{ A: '#B0BEC5', Q: '#C62828' }] },
  { id: 'papal_mitre', name: "Papal Mitre", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','....QQQ....','...QQQQQ...','...QAAAQ...','..AAAAAAA..'], variants: [{ A: '#FFFFFF', Q: '#FFD700' }] },
  { id: 'headdress', name: "Headdress", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','...........','..AQAQAQA..','..AQAQAQA..','..AAAAAAA..','...QQQQQ...'], variants: [{ A: '#FF8F00', Q: '#1565C0' }] },
  { id: 'sombrero', name: "Sombrero", rarity: 'rare', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...........','.....A.....','....AAA....','...AAAAA...','...AQAQA...','AAAAAAAAAAA'], variants: [{ A: '#F57F17', Q: '#BF360C' }] },
  // ── EPIC (6) ───────────────────────────────────────────────────────────
  { id: 'papal_tiara', name: "Papal Tiara", rarity: 'epic', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','....QQ.....','...QQQQQ...','...QAAQQ...','...QQQQQ...','..AAAAAAA..','..AQQQQQA..'], variants: [{ A: '#FFFFFF', Q: '#FFD700' }] },
  { id: 'samurai_kabuto', name: "Samurai Kabuto", rarity: 'epic', width: 11, anchor_x: 23, rows: ['....Q...Q..','....QQ.QQ..','.....QQQ...','.......Q...','...AAAAQ...','..AAAAAQQ..','..AAAAAQQ..','.AAAAAAAQ..','AAAAAAAAQ..','AAAAAAAAQ..'], variants: [{ A: '#B0BEC5', Q: '#C62828' }] },
  { id: 'gladiator_galea', name: "Gladiator Galea", rarity: 'epic', width: 11, anchor_x: 23, rows: ['...........','...........','...........','....QQQQQQ.','...QQQQQ...','...QQQQQ...','...QAAA....','..AAAAAAA..','..AAAAAAA..','..AQQQQQA..'], variants: [{ A: '#B0BEC5', Q: '#C62828' }] },
  { id: 'pharaoh_nemes', name: "Pharaoh Nemes", rarity: 'epic', width: 11, anchor_x: 23, rows: ['...........','...........','...........','..AAAAAAA..','..AAQAQAA..','..QAQAQAQ..','..QAQAQAQ..','..QQAAAQQ..','..QQAAAAA..','...QAQA....'], variants: [{ A: '#FFD700', Q: '#1565C0' }] },
  { id: 'spartan_helmet', name: "Spartan Helmet", rarity: 'epic', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','....QQQ....','...QQQQQ...','.QQQAAQQ...','.QAAAAAAA..','QQAAAAAAA..','QQAQQQQQA..'], variants: [{ A: '#B0BEC5', Q: '#B71C1C' }] },
  { id: 'conquistador_full', name: "Conquistador Helm", rarity: 'epic', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','.....A.....','....AAA....','...AAAAA...','..AAAAAAA..','...AQQQA...','...AQQQA...'], variants: [{ A: '#B0BEC5', Q: '#FFD700' }] },
  // ── LEGENDARY (5) — no variants ────────────────────────────────────────
  { id: 'rainbow_crown', name: "Rainbow Crown", rarity: 'legendary', width: 11, anchor_x: 23, rows: ['...........','...........','.....A.....','....AQA....','....AQA....','....AQA....','...AAQAA...','...AQQQA...','..AAQQQAA..','..AAAAAAA..'], colors: { A: '#FFD700', Q: '#553f3f' }, animation: { type: 'cycle', frames: ['#FF0000','#FF7F00','#FFFF00','#00FF00','#0000FF','#8B00FF'], fps: 8 } },
  { id: 'inferno_cap', name: "Inferno Cap", rarity: 'legendary', width: 11, anchor_x: 23, rows: ['...........','....AAA....','...AAAAA...','....AAA....','.....Q.....','A....Q....A','A...QQQ...A','.A..QQQ..A.','..AAAAAAA..','..AAAAAAA..'], colors: { A: '#FF4500', Q: '#FFD700' }, animation: { type: 'cycle', frames: ['#FF0000','#FF2200','#FF4500','#FF6600','#FF8C00','#FFA500'], fps: 12 } },
  { id: 'void_hood', name: "Void Hood", rarity: 'legendary', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...AAA.....','..AAAAAA...','.AAAAAAA...','.AAAAAAAA..','AAAAAAAAA..','AAAAQQQAA..','AAAAQQQAA..'], colors: { A: '#1A0033', Q: '#d9cfe3' }, animation: { type: 'cycle', frames: ['#0D0019','#1A0033','#2D004D','#3D0066','#2D004D','#1A0033'], fps: 3 } },
  { id: 'prismatic_jester', name: "Prismatic Jester", rarity: 'legendary', width: 11, anchor_x: 23, rows: ['...........','..Q.Q.Q.Q..','Q..A.A.A..Q','.Q.A.A.A.Q.','..AQAQAQA..','..AQAQAQA..','..AAAAAAA..','..AAAAAAA..','..AAAAAAA..','..AAAAAAA..'], colors: { A: '#FF0000', Q: '#0000FF' }, animation: { type: 'cycle', frames: ['#FF0000','#FF7F00','#FFFF00','#00FF00','#0000FF','#8B00FF','#FF00FF','#00FFFF'], fps: 15 } },
  { id: 'aurora_helm', name: "Aurora Helm", rarity: 'legendary', width: 11, anchor_x: 23, rows: ['...........','...........','...........','...........','...QQQQQ...','...QQQQQ...','..AAAAAAA..','..AAAAAAA..','..AQAAAQA..','..AQAAAQA..'], colors: { A: '#00CED1', Q: '#00FF7F' }, animation: { type: 'cycle', frames: ['#0000FF','#0066FF','#00BFFF','#00CED1','#00FF7F','#7CFC00','#00FF7F','#00CED1'], fps: 4 } },
];

const SPRITE_W = 32;

// ── Migration to 11×10 uniform format ──────────────────────────────
// Resolve colors for a hat + variant index. Legendary returns `hat.colors`.
function variantColors(hat, idx = 0) {
  if (hat.rarity === 'legendary') return hat.colors;
  return hat.variants[idx] ?? hat.variants[0];
}
function variantCount(hat) {
  return hat.rarity === 'legendary' ? 1 : (hat.variants?.length ?? 1);
}

// ── ANSI helpers ─────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
function rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function fg(hex) { const [r, g, b] = rgb(hex); return `\x1b[38;2;${r};${g};${b}m`; }
function bg(hex) { const [r, g, b] = rgb(hex); return `\x1b[48;2;${r};${g};${b}m`; }

// ── Compose hat + horse into a single grid of hex colors (or null) ──
// Horse sprite anatomy:
//   y=0..1 blank padding
//   y=2..3 mane (MMM at x=26..28)
//   y=4..5 top of head (the flat head body with the eye)
// We overlap the hat's bottom 4 rows with horse y=0..3. That means the hat's
// bottom edge sits flush on top of the flat head (y=4), covering the entire
// mane. Common/rare hats (4 rows) fit exactly without extending above the
// sprite; epic/legendary hats (6 rows) extend 2 rows above.
function composeGrid(hat, variantIdx = 0, hatAOverride) {
  const horseColors = HORSE_COLORS;
  const base = variantColors(hat, variantIdx);
  const hatColors = { ...base, ...(hatAOverride ? { A: hatAOverride } : {}) };
  const hatH = hat.rows.length;
  const hatW = hat.rows[0]?.length ?? 0;
  const extension = Math.max(0, hatH - 4);
  const totalH = extension + HORSE_ROWS.length;

  // Canvas widens to fit hat overhang past the 32-wide horse sprite.
  const canvasLeft = Math.min(0, hat.anchor_x);
  const canvasRight = Math.max(SPRITE_W, hat.anchor_x + hatW);
  const canvasW = canvasRight - canvasLeft;
  const horseOffsetX = -canvasLeft;

  const grid = Array.from({ length: totalH }, () => Array(canvasW).fill(null));

  // Place horse first: horse row y → grid row (y + extension), col x → x + horseOffsetX
  for (let y = 0; y < HORSE_ROWS.length; y++) {
    const row = HORSE_ROWS[y];
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const color = horseColors[ch];
      if (!color) continue;
      grid[y + extension][x + horseOffsetX] = color;
    }
  }

  // Overlay hat: bottom 4 rows of the 11×10 grid overlap horse rows 0..3.
  for (let y = 0; y < hatH; y++) {
    const row = hat.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const color = hatColors[ch];
      if (!color) continue;
      const gx = hat.anchor_x + x + horseOffsetX;
      if (gx < 0 || gx >= canvasW) continue;
      grid[y][gx] = color;
    }
  }

  return grid;
}

// ── Render a grid of hex-or-null into half-block ANSI lines ─────────
function renderGrid(grid) {
  const width = grid[0]?.length ?? 0;
  // Pad to even height
  const g = [...grid];
  if (g.length % 2) g.push(Array(width).fill(null));
  const lines = [];
  for (let y = 0; y < g.length; y += 2) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const t = g[y][x];
      const b = g[y + 1][x];
      if (t === null && b === null) line += '  ';
      else if (t !== null && b !== null) line += fg(t) + bg(b) + '▀▀' + RESET;
      else if (t !== null) line += fg(t) + '▀▀' + RESET;
      else line += fg(b) + '▄▄' + RESET;
    }
    lines.push(line);
  }
  return lines;
}

function rarityBadge(rarity) {
  const colors = { common: '#9E9E9E', rare: '#42A5F5', epic: '#AB47BC', legendary: '#FFB300' };
  return fg(colors[rarity]) + BOLD + `[${rarity.toUpperCase()}]` + RESET;
}

function printHat(hat) {
  const N = variantCount(hat);
  const variantsLabel = N === 1 ? '' : ` ${DIM}(${N} variants)${RESET}`;
  console.log(`${BOLD}${hat.name}${RESET} ${rarityBadge(hat.rarity)} ${DIM}${hat.id}${RESET}${variantsLabel}`);
  // Render every variant of this hat side-by-side
  const renders = [];
  for (let i = 0; i < N; i++) renders.push(renderGrid(composeGrid(hat, i)));
  const rowCount = renders[0].length;
  for (let r = 0; r < rowCount; r++) {
    let line = '';
    for (let i = 0; i < renders.length; i++) line += renders[i][r] + '  ';
    console.log(line);
  }
  // Variant labels below
  if (N > 1) {
    const cellW = renders[0][0]?.replace(/\x1b\[[0-9;]*m/g, '').length ?? 0;
    let labelLine = '';
    for (let i = 0; i < N; i++) labelLine += `${DIM}#${i + 1}${RESET}`.padEnd(cellW + '  '.length + 9, ' ');
    console.log(labelLine);
  }
  console.log();
}

function printLegendaryHat(hat) {
  console.log(`${BOLD}${hat.name}${RESET} ${rarityBadge(hat.rarity)} ${DIM}${hat.id} — ${hat.animation.frames.length} frames @ ${hat.animation.fps} fps${RESET}`);
  // Render every animation frame as a separate horse, side-by-side
  const renders = hat.animation.frames.map(c => renderGrid(composeGrid(hat, 0, c)));
  const rowCount = renders[0].length;
  for (let r = 0; r < rowCount; r++) {
    let line = '';
    for (let f = 0; f < renders.length; f++) line += renders[f][r] + '  ';
    console.log(line);
  }
  console.log();
}

function banner(title) {
  const bar = '═'.repeat(72);
  console.log(`\n${BOLD}${bar}\n  ${title}\n${bar}${RESET}\n`);
}

function main() {
  banner('TOKEN DERBY — HAT CATALOG  (chestnut horse, native hat colors)');

  for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
    const hats = HATS.filter(h => h.rarity === rarity);
    banner(`${rarity.toUpperCase()}  (${hats.length} hats)`);
    for (const hat of hats) {
      if (rarity === 'legendary') printLegendaryHat(hat);
      else printHat(hat);
    }
  }

  console.log(`${DIM}${HATS.length} hats total. Non-legendary hats also receive a random tint from a 17-entry pool when rolled; this script renders native colors only.${RESET}\n`);
}

main();
