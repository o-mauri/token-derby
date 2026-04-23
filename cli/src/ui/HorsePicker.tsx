import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { HorseSprite } from './HorseSprite.js';
import { MINI_SPRITE } from './sprite.js';
import type { StableHorse } from '../stable/stable.js';

type Props = {
  horses: StableHorse[];
  onPick: (horse: StableHorse) => void;
  onCancel: () => void;
};

export function HorsePicker({ horses, onPick, onCancel }: Props) {
  const [idx, setIdx] = useState(0);

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (horses.length === 0) return;
    if (key.upArrow) { setIdx((idx - 1 + horses.length) % horses.length); return; }
    if (key.downArrow) { setIdx((idx + 1) % horses.length); return; }
    if (key.return) { onPick(horses[idx]!); return; }
  });

  if (horses.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No horses in your stable.</Text>
        <Text dimColor>Run `token-derby stable create` to make one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>Pick a horse to race:</Text>
      {horses.map((h, i) => (
        <Box key={h.name} flexDirection="column">
          <Box flexDirection="row">
            <Text>{i === idx ? '►' : ' '} {h.name}</Text>
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
