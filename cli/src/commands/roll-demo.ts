import React from 'react';
import { render } from 'ink';
import { hatById, HATS } from '@token-derby/shared';
import type { Hat } from '@token-derby/shared';
import { RollReveal } from '../ui/RollReveal.js';

type Demo =
  | { kind: 'no_hat' }
  | { kind: 'duplicate'; hat: Hat; variant?: number }
  | { kind: 'hat'; hat: Hat; variant?: number };

function pickFirst(rarity: Hat['rarity']): Hat {
  const hat = HATS.find(h => h.rarity === rarity);
  if (!hat) throw new Error(`no ${rarity} hat in catalog`);
  return hat;
}

function variantLabel(hat: Hat, variant: number | undefined): string {
  if (hat.rarity === 'legendary' || variant === undefined) return '';
  return ` #${variant + 1}`;
}

async function pause(): Promise<void> {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('\nPress Enter for the next reveal… ');
  rl.close();
}

async function showNoHat(): Promise<void> {
  console.log(`\n\x1b[1m── No hat ──────────────────────────────────────────\x1b[0m`);
  console.log('\nNo hat this time. +12 XP toward your next level.\n');
}

async function showDuplicate(hat: Hat, variant: number | undefined, xp: number): Promise<void> {
  console.log(`\n\x1b[1m── Duplicate ───────────────────────────────────────\x1b[0m`);
  console.log(`\nYou already have ${hat.name}${variantLabel(hat, variant)}. +${xp} XP.\n`);
}

async function showHat(hat: Hat, variant: number | undefined): Promise<void> {
  const rarityTag = `[${hat.rarity.toUpperCase()}]`;
  console.log(`\n\x1b[1m── Fresh hat (${hat.rarity}) ─────────────────────────────\x1b[0m\n`);

  await new Promise<void>(resolve => {
    const app = render(React.createElement(RollReveal, {
      hat,
      variant,
      onDone: () => { app.unmount(); resolve(); },
    }));
  });
  console.log(`\n✨ ${hat.name}${variantLabel(hat, variant)} ${rarityTag}\n`);
}

/**
 * Walks through every roll outcome type once, in order, so you can eyeball
 * the reveals (banner copy, sprite preview, legendary animation timing).
 * Hits no API — uses hardcoded picks from the catalog.
 */
export async function rollDemoCommand(): Promise<number> {
  const common = pickFirst('common');
  const rare = pickFirst('rare');
  const epic = pickFirst('epic');
  const legendary1 = HATS.find(h => h.id === 'rainbow_crown') ?? pickFirst('legendary');
  const legendary2 = HATS.find(h => h.id === 'inferno_cap');

  const demos: Demo[] = [
    { kind: 'no_hat' },
    { kind: 'duplicate', hat: common, variant: 0 },
    { kind: 'hat', hat: common, variant: 0 },
    { kind: 'hat', hat: rare, variant: 0 },
    { kind: 'hat', hat: epic, variant: 0 },
    { kind: 'hat', hat: legendary1 },
  ];
  if (legendary2 && legendary2.id !== legendary1.id) {
    demos.push({ kind: 'hat', hat: legendary2 });
  }

  console.log('\nroll-demo: walking through each reveal type. No API calls.');
  console.log('Pauses between each — press Enter to advance.\n');

  for (let i = 0; i < demos.length; i++) {
    const d = demos[i]!;
    if (d.kind === 'no_hat') {
      await showNoHat();
    } else if (d.kind === 'duplicate') {
      // Use rarity-appropriate consolation XP for demo flavor.
      const xpByRarity = { common: 6, rare: 12, epic: 21, legendary: 30 } as const;
      const xp = xpByRarity[d.hat.rarity];
      await showDuplicate(d.hat, d.variant, xp);
    } else {
      await showHat(d.hat, d.variant);
    }
    if (i < demos.length - 1) await pause();
  }

  console.log('\nDemo complete.\n');
  return 0;
}
