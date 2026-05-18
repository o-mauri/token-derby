// Small pixel horse head, cropped from the in-race sprite (cols 24-31, rows 2-7).
// Returned as inline SVG markup so it can be dropped into innerHTML templates.

const FACE_ROWS: readonly string[] = [
  '..MMM...',
  '..MMM...',
  '.MBBEBB.',
  '.MBBEBB.',
  'MBBBBBBB',
  'MBBBBBBB',
  'MBBB....',
  'MBBB....',
  'BB......',
  'BB......',
];

const COLOR: Record<string, string> = {
  B: '#8B4513', // body / face
  M: '#f5e9d3', // mane (light cream — pops against black bg)
  E: '#000000', // eye (dark, contrasts with body now that mane is light)
};

const FACE_W = 8;
const FACE_H = FACE_ROWS.length;

export function horseFaceSvg(): string {
  const rects: string[] = [];
  for (let y = 0; y < FACE_H; y++) {
    const row = FACE_ROWS[y]!;
    for (let x = 0; x < FACE_W; x++) {
      const c = row[x]!;
      const fill = COLOR[c];
      if (!fill) continue;
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`);
    }
  }
  return (
    `<svg class="horse-face" viewBox="0 0 ${FACE_W} ${FACE_H}" shape-rendering="crispEdges" aria-hidden="true">` +
    rects.join('') +
    `</svg>`
  );
}
