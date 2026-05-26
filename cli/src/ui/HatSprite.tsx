import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { Hat } from '@token-derby/shared';
import { hexGridToHalfBlocks } from './half-blocks.js';

type Props = {
  hat: Hat;
  variant?: number;
  /** When set, the hat is centered within an N×M scene (in pixels, pre-half-block). */
  centerIn?: { w: number; h: number };
};

/**
 * Render just the hat pixels — no horse. Used for roll reveals where we want
 * to show the prize on its own before equipping it. For legendary hats with
 * an animation block, see AnimatedHatSprite below.
 */
export function HatSprite({ hat, variant, centerIn }: Props) {
  const colors = hatColorsFor(hat, variant ?? 0);
  const grid = makeHatGrid(hat, colors, centerIn);
  const lines = hexGridToHalfBlocks(grid);
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}

/**
 * Same as HatSprite but cycles the legendary animation frames over the A
 * color in place. Non-legendary hats fall through to a single static render.
 */
export function AnimatedHatSprite({ hat, variant, centerIn }: Props) {
  if (hat.rarity !== 'legendary') {
    return <HatSprite hat={hat} variant={variant} centerIn={centerIn} />;
  }
  const frames = hat.animation.frames;
  const fps = hat.animation.fps;
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (frames.length <= 1) return;
    const interval = setInterval(
      () => setIdx(i => (i + 1) % frames.length),
      Math.max(1, Math.round(1000 / fps)),
    );
    return () => clearInterval(interval);
  }, [frames.length, fps]);
  const framed: Hat = { ...hat, colors: { ...hat.colors, A: frames[idx]! } };
  return <HatSprite hat={framed} variant={variant} centerIn={centerIn} />;
}

function hatColorsFor(hat: Hat, variantIdx: number): { A: string; Q?: string } {
  if (hat.rarity === 'legendary') return hat.colors;
  return hat.variants[variantIdx] ?? hat.variants[0]!;
}

function makeHatGrid(
  hat: Hat,
  colors: { A: string; Q?: string },
  centerIn: { w: number; h: number } | undefined,
): (string | null)[][] {
  const w = centerIn?.w ?? hat.width;
  const h = centerIn?.h ?? hat.rows.length;
  // Center the hat within the requested canvas. If no centerIn, the grid is
  // hat-sized and the hat starts at (0, 0).
  const offX = Math.floor((w - hat.width) / 2);
  const offY = Math.floor((h - hat.rows.length) / 2);
  const grid: (string | null)[][] = Array.from({ length: h }, () => Array(w).fill(null));
  for (let y = 0; y < hat.rows.length; y++) {
    const row = hat.rows[y]!;
    for (let x = 0; x < hat.width; x++) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) continue;
      const gx = x + offX;
      const gy = y + offY;
      if (gx < 0 || gx >= w || gy < 0 || gy >= h) continue;
      grid[gy]![gx] = ch === 'A' ? colors.A : (colors.Q ?? colors.A);
    }
  }
  return grid;
}
