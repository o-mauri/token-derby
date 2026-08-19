import React from 'react';
import { render } from 'ink';
import { hatById } from '@token-derby/shared';
import type { StableHorse } from '@token-derby/shared';
import { ApiError } from '../api/client.js';
import { listStable, probeClaim, redeemClaim, equipHat } from '../api/endpoints.js';
import { HorsePicker } from '../ui/HorsePicker.js';
import { promptYesNo } from '../ui/prompt.js';
import { runReveal } from '../ui/reveal.js';
import type { RollOutcome } from '../ui/RollReveal.js';

export async function claimCommand(token: string | undefined): Promise<number> {
  if (!token) {
    console.error('Usage: token-derby claim <token>');
    return 2;
  }

  // Probe first so a bad token fails before we mount any UI.
  try {
    await probeClaim(token);
  } catch (e) {
    if (e instanceof ApiError) { console.error(`Error: ${e.code} ${e.message}`); return 1; }
    throw e;
  }

  let stable;
  try {
    stable = await listStable();
  } catch (e) {
    if (e instanceof ApiError) { console.error(`Error: ${e.code} ${e.message}`); return 1; }
    throw e;
  }
  if (stable.horses.length === 0) {
    console.error('No horses in your stable. Run `token-derby stable create` first.');
    return 1;
  }

  console.log('\n🎁 A cosmetic has been awarded to you.\n');

  const picked = await new Promise<StableHorse | null>(resolve => {
    const app = render(React.createElement(HorsePicker, {
      horses: stable.horses,
      prompt: 'Which horse should receive it?',
      onPick: (h: StableHorse) => { app.unmount(); resolve(h); },
      onCancel: () => { app.unmount(); resolve(null); },
    }));
  });
  if (!picked) { console.log('Cancelled. Your token is unspent.'); return 0; }

  let result;
  try {
    result = await redeemClaim(token, { stable_horse_id: picked.stable_horse_id });
  } catch (e) {
    if (e instanceof ApiError) { console.error(`Error: ${e.code} ${e.message}`); return 1; }
    throw e;
  }

  const outcome: RollOutcome | null = (() => {
    if (result.result === 'hat') {
      const hat = hatById(result.collected.id);
      return hat ? { kind: 'hat', hat, variant: result.collected.variant } : null;
    }
    const hat = hatById(result.hat_id);
    return hat ? { kind: 'duplicate', hat, variant: result.variant } : null;
  })();
  if (!outcome) {
    console.error('Server returned an unknown hat id — catalog mismatch.');
    return 1;
  }

  await runReveal(outcome);

  if (result.result === 'hat') {
    const hat = hatById(result.collected.id)!;
    const variantSuffix = hat.rarity !== 'legendary' && result.collected.variant !== undefined
      ? ` #${result.collected.variant + 1}`
      : '';
    console.log(`\n✨ ${hat.name}${variantSuffix} [${hat.rarity.toUpperCase()}]\n`);
    if (await promptYesNo('Equip now? [Y/n] ')) {
      try {
        await equipHat(picked.stable_horse_id, { hat_index: result.hat_index });
        console.log(`Equipped on ${picked.name}.`);
      } catch (e) {
        if (e instanceof ApiError) { console.error(`Equip failed: ${e.code} ${e.message}`); }
        else throw e;
      }
    }
    return 0;
  }

  const hat = hatById(result.hat_id);
  const variantSuffix = result.variant !== undefined ? ` #${result.variant + 1}` : '';
  console.log(`\n${picked.name} already has ${hat?.name ?? result.hat_id}${variantSuffix}. +${result.xp_awarded} XP.\n`);
  return 0;
}
