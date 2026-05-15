import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { listStable, deleteStableHorse } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function stableDeleteCommand(name: string | undefined): Promise<number> {
  if (!name) {
    console.error('Usage: token-derby stable delete <name>');
    return 2;
  }

  let horses;
  try {
    horses = (await listStable()).horses;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  const horse = horses.find(h => h.name === name);
  if (!horse) {
    console.error(`No horse named "${name}" in your stable.`);
    return 1;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`Delete "${name}" from your stable? [y/N] `)).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') {
    console.log('Cancelled.');
    return 1;
  }

  try {
    await deleteStableHorse(horse.stable_horse_id);
    console.log(`✓ Deleted "${name}".`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
