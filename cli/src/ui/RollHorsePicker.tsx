import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { HorseSprite } from './HorseSprite.js';
import { MINI_SPRITE } from './sprite.js';
import type { StableHorse } from '@token-derby/shared';
import { levelFromXp } from '@token-derby/shared';

type Pending = StableHorse & { pending: number };

type Props = {
  horses: Pending[];
  onPick: (horse: StableHorse) => void;
  onCancel: () => void;
};

export function RollHorsePicker({ horses, onPick, onCancel }: Props) {
  const [idx, setIdx] = useState(0);
  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (horses.length === 0) return;
    if (key.upArrow) { setIdx((idx - 1 + horses.length) % horses.length); return; }
    if (key.downArrow) { setIdx((idx + 1) % horses.length); return; }
    if (key.return) { onPick(horses[idx]!); return; }
  });

  return (
    <Box flexDirection="column">
      <Text>Pick a horse to roll for:</Text>
      {horses.map((h, i) => (
        <Box key={h.stable_horse_id} flexDirection="column">
          <Box flexDirection="row">
            <Text>
              {i === idx ? '►' : ' '} {h.name}{' '}
              <Text color="cyan">[Lvl. {levelFromXp(h.xp)}]</Text>{' '}
              <Text color="yellow">— {h.pending} roll{h.pending === 1 ? '' : 's'}</Text>
            </Text>
          </Box>
          <Box flexDirection="row">
            <Text>  </Text>
            <HorseSprite sprite={MINI_SPRITE} colors={h.colors} />
          </Box>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ choose · Enter pick · Esc cancel</Text>
      </Box>
    </Box>
  );
}
