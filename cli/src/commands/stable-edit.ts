import React from 'react';
import { render } from 'ink';
import { HorseCreator } from '../ui/HorseCreator.js';
import { HatPicker } from '../ui/HatPicker.js';
import { upsertHorse, loadStable, findHorse } from '../stable/stable.js';
import type { HorseColors } from '@token-derby/shared';

export async function stableEditCommand(name: string | undefined): Promise<number> {
  if (!name) {
    console.error('Usage: token-derby stable edit <name>');
    return 2;
  }
  const stable = await loadStable();
  const existing = findHorse(stable, name);
  if (!existing) {
    console.error(`No horse named "${name}" in your stable.`);
    return 1;
  }

  // Phase 1: colour editor
  let savedColors: HorseColors = existing.colors;
  let cancelled = false;

  const colorApp = render(
    React.createElement(HorseCreator, {
      initialColors: existing.colors,
      initialName: existing.name,
      lockName: true,
      onSubmit: (_name, colors) => { savedColors = colors; colorApp.unmount(); },
      onCancel: () => { cancelled = true; colorApp.unmount(); },
    }),
  );
  await colorApp.waitUntilExit();

  if (cancelled) {
    console.log('Cancelled.');
    return 1;
  }

  // Phase 2: hat picker (only when horse has hats)
  let equippedIdx = existing.equipped_hat;

  // Esc in HatPicker calls onDone(existing.equipped_hat), preserving the prior selection.
  if (existing.hats.length > 0) {
    const hatApp = render(
      React.createElement(HatPicker, {
        hats: existing.hats,
        colors: savedColors,
        equippedIdx: existing.equipped_hat,
        onDone: (idx) => { equippedIdx = idx; hatApp.unmount(); },
      }),
    );
    await hatApp.waitUntilExit();
  }

  await upsertHorse({
    name: existing.name,
    colors: savedColors,
    created_at: existing.created_at,
    hats: existing.hats,
    equipped_hat: equippedIdx,
  });

  console.log(`✓ Updated "${existing.name}".`);
  return 0;
}
