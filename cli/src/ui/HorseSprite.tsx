import React from 'react';
import { Box, Text } from 'ink';
import type { HorseColors, Hat } from '@token-derby/shared';
import { renderSprite, type Cell } from './sprite-render.js';
import type { SlotTag } from './sprite.js';
import { composeHatGrid } from '../hats/render.js';
import { ansiFg, ansiBg, hexGridToHalfBlocks } from './half-blocks.js';

type Props = {
  sprite: readonly (readonly SlotTag[])[];
  colors: HorseColors;
  hat?: { hat: Hat; variant?: number };
};

export function HorseSprite({ sprite, colors, hat }: Props) {
  if (!hat) {
    const grid = renderSprite(sprite, colors);
    return (
      <Box flexDirection="column">
        {grid.map((row, y) => (
          <Text key={y}>{rowToAnsi(row)}</Text>
        ))}
      </Box>
    );
  }

  const { grid } = composeHatGrid(sprite, hat.hat, hat.variant ?? 0, colors);
  const lines = hexGridToHalfBlocks(grid);
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}

const RESET = '\x1b[0m';

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
