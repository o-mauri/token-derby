import React from 'react';
import { Box, Text } from 'ink';
import type { HorseColors } from '@token-derby/shared';
import { renderSprite } from './sprite-render.js';
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
        <Text key={y}>
          {row.map((cell, x) => {
            if (cell.top === null && cell.bottom === null) return ' ';
            if (cell.top !== null && cell.bottom !== null) {
              return (
                <Text key={x} color={cell.top} backgroundColor={cell.bottom}>
                  ▀
                </Text>
              );
            }
            if (cell.top !== null) {
              return (
                <Text key={x} color={cell.top}>
                  ▀
                </Text>
              );
            }
            return (
              <Text key={x} color={cell.bottom!}>
                ▄
              </Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
}
