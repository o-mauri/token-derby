import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { CollectedHat, HorseColors } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { AnimatedHorseSprite } from './AnimatedHorseSprite.js';
import { MAIN_SPRITE } from './sprite.js';
import { hatById } from '../hats/definitions.js';

type Props = {
  hats: CollectedHat[];
  colors: HorseColors;
  equippedIdx: number | undefined;
  onDone: (equippedIdx: number | undefined) => void;
};

export function HatPicker({ hats, colors, equippedIdx, onDone }: Props) {
  const [idx, setIdx] = useState<number>(equippedIdx ?? -1);

  useInput((_, key) => {
    if (key.escape)      { onDone(equippedIdx); return; }
    if (key.leftArrow)   { setIdx(i => Math.max(-1, i - 1)); return; }
    if (key.rightArrow)  { setIdx(i => Math.min(hats.length - 1, i + 1)); return; }
    if (key.return)      { onDone(idx < 0 ? undefined : idx); return; }
  });

  if (hats.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No hats in inventory. Win a race and use <Text bold>token-derby roll</Text> to earn one.</Text>
        <Text dimColor>Press Enter or Esc to continue.</Text>
      </Box>
    );
  }

  const collected = idx >= 0 ? hats[idx] : undefined;
  const hat = collected ? hatById(collected.id) : undefined;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        {hat ? (
          hat.animation ? (
            <AnimatedHorseSprite sprite={MAIN_SPRITE} colors={colors} hat={hat} />
          ) : (
            <HorseSprite sprite={MAIN_SPRITE} colors={colors} hat={hat} tint={collected?.tint} />
          )
        ) : (
          <HorseSprite sprite={MAIN_SPRITE} colors={colors} />
        )}
      </Box>

      <Text>
        {idx < 0 ? '(no hat)' : `${hat?.name ?? collected?.id} [${hat?.rarity?.toUpperCase()}]`}
        {collected?.tint ? <Text color={collected.tint}> ■ {collected.tint}</Text> : null}
      </Text>

      <Text dimColor>←/→ cycle hats · Enter confirm · Esc cancel</Text>
      <Text dimColor>{idx + 2} / {hats.length + 1} (including bare)</Text>
    </Box>
  );
}
