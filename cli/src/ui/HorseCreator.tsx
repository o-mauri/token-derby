import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { CollectedHat, HorseColors } from '@token-derby/shared';
import { hatById } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { AnimatedHorseSprite } from './AnimatedHorseSprite.js';
import { MAIN_SPRITE } from './sprite.js';
import { SLOTS, nextColor, prevColor, defaultColors, type Slot } from './palette.js';

type HatChoice = number | null; // null = unequipped; number = index into hats[]

type Props = {
  onSubmit: (name: string, colors: HorseColors, hatChoice?: HatChoice) => void;
  onCancel: () => void;
  initialColors?: HorseColors;
  initialName?: string;
  lockName?: boolean;
  initialLevel?: number;
  // When provided (and non-empty), shows a "Hat" row alongside the colors.
  hats?: CollectedHat[];
  initialEquipped?: HatChoice;
};

type Row = { kind: 'color'; slot: Slot } | { kind: 'hat' };

export function HorseCreator({
  onSubmit,
  onCancel,
  initialColors,
  initialName,
  lockName,
  initialLevel,
  hats,
  initialEquipped,
}: Props) {
  const [colors, setColors] = useState<HorseColors>(initialColors ?? defaultColors());
  const [hatChoice, setHatChoice] = useState<HatChoice>(initialEquipped ?? null);
  const [rowIdx, setRowIdx] = useState(0);
  const [namingMode, setNamingMode] = useState(false);
  const [name, setName] = useState(initialName ?? '');
  const [error, setError] = useState<string | null>(null);

  const hatRowEnabled = !!hats && hats.length > 0;
  const rows: Row[] = [
    ...SLOTS.map((s): Row => ({ kind: 'color', slot: s })),
    ...(hatRowEnabled ? [{ kind: 'hat' } as const] : []),
  ];
  const row = rows[rowIdx]!;

  // Cycle hatChoice through [Unequip, hat0, hat1, ...]
  const cycleHat = (dir: 1 | -1) => {
    if (!hats || hats.length === 0) return;
    const entries: HatChoice[] = [null, ...hats.map((_, i) => i)];
    const cur = entries.findIndex(e => e === hatChoice);
    const start = cur < 0 ? 0 : cur;
    const next = (start + dir + entries.length) % entries.length;
    setHatChoice(entries[next]!);
  };

  useInput((input, key) => {
    if (namingMode) return;
    if (key.escape) { onCancel(); return; }
    if (key.upArrow) { setRowIdx((rowIdx - 1 + rows.length) % rows.length); return; }
    if (key.downArrow) { setRowIdx((rowIdx + 1) % rows.length); return; }
    if (key.leftArrow) {
      if (row.kind === 'color') setColors({ ...colors, [row.slot]: prevColor(row.slot, colors[row.slot]) });
      else cycleHat(-1);
      return;
    }
    if (key.rightArrow) {
      if (row.kind === 'color') setColors({ ...colors, [row.slot]: nextColor(row.slot, colors[row.slot]) });
      else cycleHat(1);
      return;
    }
    if (key.return) {
      if (lockName) { submit(initialName ?? ''); return; }
      setNamingMode(true);
      return;
    }
  });

  const submit = (finalName: string) => {
    if (hatRowEnabled) onSubmit(finalName, colors, hatChoice);
    else onSubmit(finalName, colors);
  };

  const handleNameSubmit = (value: string) => {
    if (!value.trim()) {
      setError('Name required');
      return;
    }
    submit(value.trim());
  };

  const previewHat = hatRowEnabled && hatChoice !== null && hats
    ? hats[hatChoice]
    : undefined;
  const previewHatDef = previewHat ? hatById(previewHat.id) : undefined;

  return (
    <Box flexDirection="column">
      {lockName && initialName && (
        <Box marginBottom={1}>
          <Text bold>{initialName}</Text>
          {typeof initialLevel === 'number' && (
            <Text color="cyan"> [Lvl. {initialLevel}]</Text>
          )}
        </Box>
      )}

      <Box marginBottom={1}>
        {previewHatDef
          ? (previewHatDef.rarity === 'legendary'
              ? <AnimatedHorseSprite sprite={MAIN_SPRITE} colors={colors} hat={previewHatDef} />
              : <HorseSprite sprite={MAIN_SPRITE} colors={colors} hat={{ hat: previewHatDef, variant: previewHat?.variant ?? 0 }} />)
          : <HorseSprite sprite={MAIN_SPRITE} colors={colors} />}
      </Box>

      <Box flexDirection="column">
        {rows.map((r, i) => {
          const cursor = i === rowIdx ? '►' : ' ';
          if (r.kind === 'color') {
            return (
              <Text key={r.slot}>
                {cursor} {r.slot.padEnd(7)} <Text color={colors[r.slot]}>██</Text> {colors[r.slot]}
              </Text>
            );
          }
          return (
            <Text key="hat">
              {cursor} {'hat'.padEnd(7)} {renderHatLabel(hats, hatChoice, initialEquipped ?? null)}
            </Text>
          );
        })}
      </Box>

      {!namingMode && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>↑/↓ select row · ←/→ cycle · Enter accept · Esc cancel</Text>
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

function renderHatLabel(
  hats: CollectedHat[] | undefined,
  hatChoice: HatChoice,
  initialEquipped: HatChoice,
): React.ReactNode {
  if (!hats || hats.length === 0) return <Text dimColor>none</Text>;
  if (hatChoice === null) {
    const equippedMark = initialEquipped === null ? ' ✓' : '';
    return <><Text dimColor>Unequip</Text>{equippedMark}</>;
  }
  const collected = hats[hatChoice];
  if (!collected) return <Text dimColor>?</Text>;
  const hat = hatById(collected.id);
  const name = hat?.name ?? collected.id;
  const variantSuffix = hat && hat.rarity !== 'legendary' && collected.variant !== undefined
    ? ` #${collected.variant + 1}`
    : '';
  const rarityColor = hat
    ? (hat.rarity === 'legendary' ? 'yellow' : hat.rarity === 'epic' ? 'magenta' : hat.rarity === 'rare' ? 'blue' : 'gray')
    : 'gray';
  const equippedMark = initialEquipped === hatChoice ? ' ✓' : '';
  return (
    <>
      {name}{variantSuffix} <Text color={rarityColor}>[{hat?.rarity ?? '?'}]</Text>{equippedMark}
    </>
  );
}
