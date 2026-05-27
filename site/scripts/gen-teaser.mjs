// Generates site/public/img/teaser-hats.svg.
// Renders 4 horses (one per rarity tier) using the same pixel data as the
// in-game sprite + hat catalog. Re-run after tweaking colors/layout.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const HORSE_W = 32;
const HORSE_H = 24;
const HOOF_COLOR = '#1F1108';

const HATS = {
  flat_cap: {
    rows: ['...........','...........','...........','...........','...........','...........','...........','....AAAA...','...AAAAAA..','..AAAAAAA..'],
    colors: { A: '#8B6914' },
    anchor_x: 23,
  },
  sombrero: {
    rows: ['...........','...........','...........','...........','...........','.....A.....','....AAA....','...AAAAA...','...AQAQA...','AAAAAAAAAAA'],
    colors: { A: '#F57F17', Q: '#BF360C' },
    anchor_x: 23,
  },
  pharaoh_nemes: {
    rows: ['...........','...........','...........','..AAAAAAA..','..AAQAQAA..','..QAQAQAQ..','..QAQAQAQ..','..QQAAAQQ..','..QQAAAAA..','...QAQA....'],
    colors: { A: '#FFD700', Q: '#1565C0' },
    anchor_x: 23,
  },
  rainbow_crown: {
    rows: ['...........','...........','.....A.....','....AAA....','....AQA....','....AAA....','...AAQAA...','...AAAAA...','..AAAQAAA..','..AAAAAAA..'],
    colors: { A: '#FFD700', Q: '#553f3f' },
    anchor_x: 23,
    legendary: true,
  },
};

const HORSES = [
  { hat: 'flat_cap',      label: 'COMMON',    colors: { B:'#8B4513', M:'#000000', T:'#000000', S:'#C0392B' } },
  { hat: 'sombrero',      label: 'RARE',      colors: { B:'#CD853F', M:'#FFD700', T:'#FFD700', S:'#196F3D' } },
  { hat: 'pharaoh_nemes', label: 'EPIC',      colors: { B:'#4A235A', M:'#FFFFFF', T:'#FFFFFF', S:'#EAB308' } },
  { hat: 'rainbow_crown', label: 'LEGENDARY', colors: { B:'#FFFFFF', M:'#000000', T:'#000000', S:'#1B4F72' } },
];

const RARITY_COLOR = {
  COMMON:    '#9aa3aa',
  RARE:      '#4cb3ff',
  EPIC:      '#b074ff',
  LEGENDARY: '#ffd166',
};

function renderHorse(colors) {
  const slot = { B: colors.B, M: colors.M, T: colors.T, S: colors.S, H: HOOF_COLOR, E: colors.B };
  const parts = [];
  for (let y = 0; y < HORSE_H; y++) {
    const row = HORSE_ROWS[y];
    for (let x = 0; x < HORSE_W; x++) {
      const c = row[x];
      if (c === '.') continue;
      parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${slot[c]}"/>`);
    }
  }
  return parts.join('');
}

function renderHat(hat) {
  const ext = Math.max(0, hat.rows.length - 4);
  const parts = [];
  const isLeg = !!hat.legendary;
  for (let i = 0; i < hat.rows.length; i++) {
    const row = hat.rows[i];
    for (let j = 0; j < row.length; j++) {
      const ch = row[j];
      if (ch === '.') continue;
      const x = hat.anchor_x + j;
      const y = i - ext;
      const fill = ch === 'A' ? hat.colors.A : (hat.colors.Q ?? hat.colors.A);
      const cls = isLeg && ch === 'A' ? ' class="legendary-A"' : '';
      parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"${cls}/>`);
    }
  }
  return parts.join('');
}

const W = 1200, H = 630;
const SCALE = 6;
const BLOCK_W = 35;  // 32 sprite + 3 hat overhang
const BLOCK_H = 30;  // 24 sprite + 6 hat above
const GAP = 56;
const ROW_W = BLOCK_W * SCALE * HORSES.length + GAP * (HORSES.length - 1);
const ROW_X = (W - ROW_W) / 2;
const ROW_Y = 200;

const horsesSvg = HORSES.map((h, i) => {
  const tx = ROW_X + i * (BLOCK_W * SCALE + GAP);
  const ty = ROW_Y;
  const labelY = ty + BLOCK_H * SCALE + 30;
  return `
  <g transform="translate(${tx}, ${ty}) scale(${SCALE})">
    <g transform="translate(0, 6)">
      ${renderHorse(h.colors)}
      ${renderHat(HATS[h.hat])}
    </g>
  </g>
  <text x="${tx + (BLOCK_W * SCALE)/2}" y="${labelY}" text-anchor="middle"
        fill="${RARITY_COLOR[h.label]}" font-size="20" font-weight="700"
        letter-spacing="4" font-family="ui-monospace, 'SF Mono', Menlo, monospace">${h.label}</text>`;
}).join('');

const legCenterX = ROW_X + (HORSES.length - 1) * (BLOCK_W * SCALE + GAP) + (BLOCK_W * SCALE) / 2;
const legCenterY = ROW_Y + (BLOCK_H * SCALE) / 2;

const sparkles = [
  { x: legCenterX - 110, y: legCenterY - 80, size: 26, d: 0   },
  { x: legCenterX + 100, y: legCenterY - 60, size: 22, d: 0.4 },
  { x: legCenterX - 90,  y: legCenterY + 40, size: 18, d: 0.8 },
  { x: legCenterX + 115, y: legCenterY + 70, size: 28, d: 0.2 },
  { x: legCenterX + 5,   y: legCenterY - 110,size: 20, d: 0.6 },
  { x: legCenterX - 130, y: legCenterY + 10, size: 16, d: 1.1 },
].map(s => `<text x="${s.x}" y="${s.y}" text-anchor="middle" font-size="${s.size}" fill="#fff7d6" class="sparkle" style="animation-delay:${s.d}s">✦</text>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#0c0820"/>
      <stop offset="0.55" stop-color="#1a1145"/>
      <stop offset="1"    stop-color="#2b0d2a"/>
    </linearGradient>
    <radialGradient id="spot" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd166" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ffd166" stop-opacity="0"/>
    </radialGradient>
    <style><![CDATA[
      @keyframes rainbow {
        0%   { fill: #FF0000; }
        16%  { fill: #FF7F00; }
        32%  { fill: #FFFF00; }
        48%  { fill: #00FF00; }
        64%  { fill: #0000FF; }
        80%  { fill: #8B00FF; }
        100% { fill: #FF0000; }
      }
      .legendary-A { animation: rainbow 0.75s steps(1, end) infinite; }

      @keyframes twinkle {
        0%, 100% { opacity: 0.25; transform: scale(0.7); }
        50%      { opacity: 1;    transform: scale(1.15); }
      }
      .sparkle {
        transform-origin: center;
        transform-box: fill-box;
        animation: twinkle 1.6s ease-in-out infinite;
      }
    ]]></style>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- spotlight behind legendary -->
  <ellipse cx="${legCenterX}" cy="${legCenterY + 20}" rx="260" ry="220" fill="url(#spot)"/>

  <!-- headline -->
  <text x="${W/2}" y="118" text-anchor="middle"
        fill="#ffd166" font-size="44" font-weight="700" letter-spacing="16"
        font-family="ui-monospace, 'SF Mono', Menlo, monospace">COMING 28/05</text>
  <line x1="${W/2 - 240}" y1="138" x2="${W/2 + 240}" y2="138"
        stroke="#ffd166" stroke-width="2" opacity="0.45"/>

  <!-- horses -->
  ${horsesSvg}

  <!-- sparkles -->
  ${sparkles}

  <!-- sub-headline -->
  <text x="${W/2}" y="555" text-anchor="middle"
        fill="#ffffff" font-size="72" font-weight="900" letter-spacing="8"
        font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif">HORSE HAT LOOT DROPS</text>
</svg>
`;

const outPath = `${__dirname}/../public/img/teaser-hats.svg`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, svg);
console.log('wrote', outPath, `(${svg.length} bytes)`);
