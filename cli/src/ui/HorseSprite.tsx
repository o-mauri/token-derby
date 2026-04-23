import React from 'react';
import { Box, Text } from 'ink';
import type { HorseColors } from '@token-derby/shared';
import { renderSprite, type Cell } from './sprite-render.js';
import type { SlotTag } from './sprite.js';

type Props = {
  sprite: readonly (readonly SlotTag[])[];
  colors: HorseColors;
};

export function HorseSprite({ sprite, colors }: Props) {
  const grid = renderSprite(sprite, colors);
  return (
    <Box flexDirection="column">
      {grid.map((row, y) => (
        <Text key={y}>{rowToAnsi(row)}</Text>
      ))}
    </Box>
  );
}

function rowToAnsi(row: Cell[]): string {
  let out = '';
  for (const cell of row) {
    if (cell.top === null && cell.bottom === null) {
      out += ' ';
    } else if (cell.top !== null && cell.bottom !== null) {
      out += ansiFg(cell.top) + ansiBg(cell.bottom) + '▀' + RESET;
    } else if (cell.top !== null) {
      out += ansiFg(cell.top) + '▀' + RESET;
    } else {
      out += ansiFg(cell.bottom!) + '▄' + RESET;
    }
  }
  return out;
}

const RESET = '\x1b[0m';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function ansiFg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function ansiBg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}
