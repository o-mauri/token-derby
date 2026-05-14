import React from 'react';
import { render } from 'ink';
import { loadActiveRace } from '../stable/active-race.js';
import { loadStable, upsertHorse, findHorse } from '../stable/stable.js';
import { spendToken } from '../api/endpoints.js';
import { rollHat } from '../hats/roll.js';
import { hatById } from '../hats/definitions.js';
import { HorseSprite } from '../ui/HorseSprite.js';
import { AnimatedHorseSprite } from '../ui/AnimatedHorseSprite.js';
import { MAIN_SPRITE } from '../ui/sprite.js';
import { ApiError } from '../api/client.js';

type RollOpts = { autoEquip?: boolean; skipPrompt?: boolean };

export async function rollCommand(joinCode: string | undefined, opts: RollOpts = {}): Promise<number> {
  if (!joinCode) {
    console.error('Usage: token-derby roll <join-code>');
    return 2;
  }

  const active = await loadActiveRace(joinCode);
  if (!active) {
    console.error(`No saved race for join code "${joinCode}". Did you join this race?`);
    return 1;
  }

  try {
    await spendToken(active.join_code, active.horse_id, active.heartbeat_token);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'INSUFFICIENT_TOKENS') {
        console.error('No loot tokens available. Win a race to earn one!');
      } else if (e.code === 'UNAUTHORIZED') {
        console.error('Token verification failed — is this the right join code?');
      } else {
        console.error(`Error: ${e.code} ${e.message}`);
      }
      return 1;
    }
    throw e;
  }

  const collected = rollHat();
  const hat = hatById(collected.id);
  if (!hat) {
    console.error('Internal error: rolled unknown hat id');
    return 1;
  }

  const stable = await loadStable();
  const horse = findHorse(stable, active.horse_name);
  if (!horse) {
    console.error(`Horse "${active.horse_name}" not found in stable — hat earned but not saved.`);
    return 1;
  }
  const updatedHorse = { ...horse, hats: [...horse.hats, collected] };
  await upsertHorse(updatedHorse);

  console.log(`\nYou rolled: ${hat.name} [${hat.rarity.toUpperCase()}]${collected.tint ? ` (tint: ${collected.tint})` : ''}\n`);

  if (!opts.skipPrompt) {
    const HatComponent = hat.animation ? AnimatedHorseSprite : HorseSprite;
    const app = render(
      React.createElement(HatComponent as any, {
        sprite: MAIN_SPRITE,
        colors: active.horse_colors,
        hat,
        tint: collected.tint,
      }),
    );
    await new Promise(r => setTimeout(r, hat.animation ? 3000 : 500));
    app.unmount();

    if (opts.autoEquip === false) {
      console.log('Hat saved to inventory. Use `stable edit` to equip it.');
      return 0;
    }

    const readline = await import('node:readline/promises');
    const { stdin, stdout } = process;
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const answer = (await rl.question('Equip now? [Y/n] ')).trim().toLowerCase();
    rl.close();

    if (!answer || answer === 'y' || answer === 'yes') {
      const newIdx = updatedHorse.hats.length - 1;
      await upsertHorse({ ...updatedHorse, equipped_hat: newIdx });
      console.log(`Equipped "${hat.name}" on ${active.horse_name}.`);
    } else {
      console.log('Hat saved to inventory. Use `stable edit` to equip it.');
    }
  }

  return 0;
}
