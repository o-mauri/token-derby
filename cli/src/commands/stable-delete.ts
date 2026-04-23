import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadStable, findHorse, removeHorse } from '../stable/stable.js';
import { listActiveRaces, loadActiveRace } from '../stable/active-race.js';

export async function stableDeleteCommand(name: string | undefined): Promise<number> {
  if (!name) {
    console.error('Usage: token-derby stable delete <name>');
    return 2;
  }
  const stable = await loadStable();
  const horse = findHorse(stable, name);
  if (!horse) {
    console.error(`No horse named "${name}" in your stable.`);
    return 1;
  }

  const codes = await listActiveRaces();
  for (const code of codes) {
    const active = await loadActiveRace(code);
    if (active?.horse_name === name) {
      console.error(`"${name}" is currently running in race ${code}. Close that terminal first.`);
      return 1;
    }
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`Delete "${name}" from your stable? [y/N] `)).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') {
    console.log('Cancelled.');
    return 1;
  }
  await removeHorse(name);
  console.log(`✓ Deleted "${name}".`);
  return 0;
}
