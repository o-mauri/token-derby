import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { HorseColors } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { MAIN_SPRITE } from './sprite.js';
import { SLOTS, PALETTES, nextColor, prevColor, defaultColors, type Slot } from './palette.js';

type Props = {
  onSubmit: (name: string, colors: HorseColors) => void;
  onCancel: () => void;
  initialColors?: HorseColors;
  initialName?: string;
  lockName?: boolean;
};

export function HorseCreator({ onSubmit, onCancel, initialColors, initialName, lockName }: Props) {
  const [colors, setColors] = useState<HorseColors>(initialColors ?? defaultColors());
  const [slotIdx, setSlotIdx] = useState(0);
  const [namingMode, setNamingMode] = useState(false);
  const [name, setName] = useState(initialName ?? '');
  const [error, setError] = useState<string | null>(null);

  const slot: Slot = SLOTS[slotIdx]!;

  useInput((input, key) => {
    if (namingMode) return;
    if (key.escape) { onCancel(); return; }
    if (key.upArrow) { setSlotIdx((slotIdx - 1 + SLOTS.length) % SLOTS.length); return; }
    if (key.downArrow) { setSlotIdx((slotIdx + 1) % SLOTS.length); return; }
    if (key.leftArrow) { setColors({ ...colors, [slot]: prevColor(slot, colors[slot]) }); return; }
    if (key.rightArrow) { setColors({ ...colors, [slot]: nextColor(slot, colors[slot]) }); return; }
    if (key.return) {
      if (lockName) { onSubmit(initialName ?? '', colors); return; }
      setNamingMode(true);
      return;
    }
  });

  const handleNameSubmit = (value: string) => {
    if (!value.trim()) {
      setError('Name required');
      return;
    }
    onSubmit(value.trim(), colors);
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <HorseSprite sprite={MAIN_SPRITE} colors={colors} />
      </Box>

      <Box flexDirection="column">
        {SLOTS.map((s, i) => (
          <Text key={s}>
            {i === slotIdx ? '►' : ' '} {s.padEnd(7)} <Text color={colors[s]}>██</Text> {colors[s]}
          </Text>
        ))}
      </Box>

      {!namingMode && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>↑/↓ select slot · ←/→ cycle color · Enter accept · Esc cancel</Text>
        </Box>
      )}

      {namingMode && (
        <Box marginTop={1} flexDirection="column">
          <Text>Name your horse: </Text>
          <TextInput value={name} onChange={(v) => { setName(v); setError(null); }} onSubmit={handleNameSubmit} />
          {error && <Text color="red">{error}</Text>}
        </Box>
      )}
    </Box>
  );
}
