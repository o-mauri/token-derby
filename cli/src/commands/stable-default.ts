import { ApiError } from '../api/client.js';
import { listStable } from '../api/endpoints.js';
import { loadPrefs, setDefaultHorse, clearDefaultHorse } from '../stable/prefs.js';
import { describeHorse } from '../stable/resolve-horse.js';

/**
 * `stable default [<name>|--clear]` — read, set, or clear the horse that
 * commands fall back to when none is named.
 */
export async function stableDefaultCommand(args: string[]): Promise<number> {
  const clear = args.includes('--clear');
  const name = args.find(a => !a.startsWith('--'));

  if (clear && name !== undefined) {
    console.error('Pass a name or --clear, not both.');
    return 2;
  }

  if (clear) {
    await clearDefaultHorse();
    console.log('Default horse cleared.');
    return 0;
  }

  let horses;
  try {
    horses = (await listStable()).horses;
  } catch (e) {
    if (e instanceof ApiError) { console.error(`Error: ${e.code} ${e.message}`); return 1; }
    throw e;
  }

  if (name === undefined) return showCurrent(horses);

  const found = horses.find(h => h.name === name);
  if (!found) {
    console.error(`No horse named "${name}" in your stable.`);
    if (horses.length > 0) console.error(`Your stable: ${horses.map(h => h.name).join(', ')}`);
    return 1;
  }
  await setDefaultHorse(found.stable_horse_id);
  console.log(`Default horse set: ${describeHorse(found)}`);
  return 0;
}

async function showCurrent(horses: Awaited<ReturnType<typeof listStable>>['horses']): Promise<number> {
  const { default_stable_horse_id } = await loadPrefs();
  if (default_stable_horse_id === undefined) {
    console.log('No default horse set.');
    console.log('Set one with: token-derby stable default <name>');
    return 0;
  }
  const found = horses.find(h => h.stable_horse_id === default_stable_horse_id);
  if (!found) {
    // Deleted horse, or a default set under a different account. Say so plainly
    // rather than printing a bare id the user cannot act on.
    console.log('Your default horse is no longer in your stable — it will be ignored.');
    console.log('Set a new one with: token-derby stable default <name>');
    return 0;
  }
  console.log(`Default horse: ${describeHorse(found)}`);
  return 0;
}
