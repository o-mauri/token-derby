import React from 'react';
import { render } from 'ink';
import { HATS } from '@token-derby/shared';
import type { Hat } from '@token-derby/shared';
import { RollReveal, printClosedBox, type RollOutcome } from '../ui/RollReveal.js';

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

/** Two-stage reveal: closed box (Enter to open) → animation. */
async function runReveal(outcome: RollOutcome): Promise<void> {
  printClosedBox();
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('Press Enter to open the box… ');
  rl.close();

  await new Promise<void>(resolve => {
    const app = render(React.createElement(RollReveal, {
      outcome,
      onDone: () => { app.unmount(); resolve(); },
    }));
  });
}

async function play(d: Demo): Promise<void> {
  switch (d.kind) {
    case 'no_hat': {
      console.log('\n\x1b[1m── No hat ──────────────────────────────────────────\x1b[0m');
      await runReveal({ kind: 'no_hat' });
      console.log('\nNo hat this time. +12 XP toward your next level.\n');
      break;
    }
    case 'duplicate': {
      console.log('\n\x1b[1m── Duplicate ───────────────────────────────────────\x1b[0m');
      await runReveal({ kind: 'duplicate', hat: d.hat, variant: d.variant });
      const xpByRarity = { common: 6, rare: 12, epic: 21, legendary: 30 } as const;
      const xp = xpByRarity[d.hat.rarity];
      console.log(`\nYou already have ${d.hat.name}${variantLabel(d.hat, d.variant)}. +${xp} XP.\n`);
      break;
    }
    case 'hat': {
      console.log(`\n\x1b[1m── Fresh hat (${d.hat.rarity}) ─────────────────────────────\x1b[0m`);
      await runReveal({ kind: 'hat', hat: d.hat, variant: d.variant });
      console.log(`\n✨ ${d.hat.name}${variantLabel(d.hat, d.variant)} [${d.hat.rarity.toUpperCase()}]\n`);
      break;
    }
  }
}

/**
 * Walks through every roll outcome type once, in order, so you can eyeball
 * the reveals (box open, confetti, hat sprite, legendary animations).
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
  console.log('Press Enter to open each box; then press Enter again to advance to the next.\n');

  for (let i = 0; i < demos.length; i++) {
    await play(demos[i]!);
    if (i < demos.length - 1) await pause();
  }

  console.log('\nDemo complete.\n');
  return 0;
}
