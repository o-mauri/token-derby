const RESET = '\x1b[0m';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function ansiFg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function ansiBg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}

/**
 * Convert a hex-colored grid (null = transparent) into half-block ANSI lines.
 * Two adjacent grid rows become one terminal line via the ▀ character.
 */
export function hexGridToHalfBlocks(grid: (string | null)[][]): string[] {
  const W = grid[0]?.length ?? 0;
  const padded = grid.length % 2 === 0 ? grid : [...grid, Array<string | null>(W).fill(null)];
  const lines: string[] = [];
  for (let y = 0; y < padded.length; y += 2) {
    let line = '';
    for (let x = 0; x < W; x++) {
      const top = padded[y]![x] ?? null;
      const bot = padded[y + 1]![x] ?? null;
      if (top === null && bot === null) line += ' ';
      else if (top !== null && bot !== null) line += ansiFg(top) + ansiBg(bot) + '▀' + RESET;
      else if (top !== null) line += ansiFg(top) + '▀' + RESET;
      else line += ansiFg(bot!) + '▄' + RESET;
    }
    lines.push(line);
  }
  return lines;
}
