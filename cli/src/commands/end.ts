import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { endRace } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function endCommand(adminCode: string | undefined): Promise<number> {
  if (!adminCode) {
    console.error('Usage: token-derby end <admin-code>');
    return 2;
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question('End the race now and freeze final tokens? [y/N] ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') {
    console.log('Cancelled.');
    return 1;
  }
  try {
    await endRace(adminCode);
    console.log('✓ Race ended.');
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'RACE_NOT_FOUND') console.error('No race with that admin code.');
      else console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
