import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { CollectedHat, HorseColors } from '@token-derby/shared';
import { hatById } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { AnimatedHorseSprite } from './AnimatedHorseSprite.js';
import { MAIN_SPRITE } from './sprite.js';

type Props = {
  hats: CollectedHat[];
  equipped: number | null | undefined;
  colors: HorseColors;
  onPick: (idx: number | null) => void;
  onCancel: () => void;
};

// Build a flat list with an "Unequip" virtual entry at position 0,
// then the hats themselves (preserving their inventory indices).
type Entry =
  | { kind: 'unequip' }
  | { kind: 'hat'; idx: number; collected: CollectedHat };

export function HatPicker({ hats, equipped, colors, onPick, onCancel }: Props) {
  const entries: Entry[] = [
    { kind: 'unequip' },
    ...hats.map((c, idx) => ({ kind: 'hat' as const, idx, collected: c })),
  ];
  const [cursor, setCursor] = useState(0);
  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.upArrow)   { setCursor((cursor - 1 + entries.length) % entries.length); return; }
    if (key.downArrow) { setCursor((cursor + 1) % entries.length); return; }
    if (key.return) {
      const e = entries[cursor]!;
      onPick(e.kind === 'unequip' ? null : e.idx);
      return;
    }
  });

  const focused = entries[cursor]!;

  return (
    <Box flexDirection="column">
      <Text>Pick a hat to equip:</Text>
      {entries.map((e, i) => {
        const isCursor = i === cursor;
        if (e.kind === 'unequip') {
          const isEquipped = equipped == null;
          return (
            <Box key="unequip" flexDirection="row">
              <Text>{isCursor ? '►' : ' '} <Text dimColor>Unequip</Text>{isEquipped ? ' ✓' : ''}</Text>
            </Box>
          );
        }
        const hat = hatById(e.collected.id);
        const name = hat?.name ?? e.collected.id;
        const variantSuffix = hat && hat.rarity !== 'legendary' && e.collected.variant !== undefined
          ? ` #${e.collected.variant + 1}`
          : '';
        const isEquipped = equipped === e.idx;
        const rarityColor = hat
          ? (hat.rarity === 'legendary' ? 'yellow' : hat.rarity === 'epic' ? 'magenta' : hat.rarity === 'rare' ? 'blue' : 'gray')
          : 'gray';
        return (
          <Box key={`hat-${e.idx}`} flexDirection="row">
            <Text>
              {isCursor ? '►' : ' '} {name}{variantSuffix}{' '}
              <Text color={rarityColor}>[{hat?.rarity ?? '?'}]</Text>
              {isEquipped ? ' ✓' : ''}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>Preview:</Text>
      </Box>
      <PreviewArea focused={focused} colors={colors} />

      <Box marginTop={1}>
        <Text dimColor>↑/↓ choose · Enter pick · Esc cancel</Text>
      </Box>
    </Box>
  );
}

function PreviewArea({ focused, colors }: { focused: Entry; colors: HorseColors }) {
  if (focused.kind === 'unequip') {
    return <HorseSprite sprite={MAIN_SPRITE} colors={colors} />;
  }
  const hat = hatById(focused.collected.id);
  if (!hat) return <HorseSprite sprite={MAIN_SPRITE} colors={colors} />;
  if (hat.rarity === 'legendary') {
    return <AnimatedHorseSprite sprite={MAIN_SPRITE} colors={colors} hat={hat} />;
  }
  return <HorseSprite sprite={MAIN_SPRITE} colors={colors} hat={{ hat, variant: focused.collected.variant ?? 0 }} />;
}
