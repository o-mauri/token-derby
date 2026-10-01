import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { Hat, HorseColors } from '@token-derby/shared';
import { isAnimatedHat } from '@token-derby/shared';
import type { SlotTag } from './sprite.js';
import { composeHatGrid } from '../hats/render.js';
import { hexGridToHalfBlocks } from './half-blocks.js';

type Props = {
  sprite: readonly (readonly SlotTag[])[];
  colors: HorseColors;
  /** A legendary hat. Non-legendaries should use HorseSprite. */
  hat: Hat;
};

export function AnimatedHorseSprite({ sprite, colors, hat }: Props) {
  const animated = isAnimatedHat(hat);
  const frames = animated ? hat.animation.frames : [];
  const fps = animated ? hat.animation.fps : 1;

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!animated || frames.length <= 1) return;
    const interval = setInterval(
      () => setIdx(i => (i + 1) % frames.length),
      Math.max(1, Math.round(1000 / fps)),
    );
    return () => clearInterval(interval);
  }, [animated, frames.length, fps]);

  // For legendaries, override hat.colors.A with the current frame.
  const renderedHat: Hat = animated && frames[idx]
    ? { ...hat, colors: { ...hat.colors, A: frames[idx]! } }
    : hat;

  const { grid } = composeHatGrid(sprite, renderedHat, 0, colors);
  const lines = hexGridToHalfBlocks(grid);
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}
