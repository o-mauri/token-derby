import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  loadIdentity,
  saveIdentity,
  generateUserId,
  validateDisplayName,
  type Identity,
} from '../identity/identity.js';

export async function initCommand(): Promise<number> {
  const existing = await loadIdentity();
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    if (existing) {
      console.log(`Current jockey name: ${existing.display_name}`);
      const raw = (await rl.question('New jockey name (use your real name please) [keep]: ')).trim();
      if (!raw) {
        console.log('Kept existing name.');
        return 0;
      }
      const v = validateDisplayName(raw);
      if (!v.ok) { console.error(v.error); return 1; }
      const updated: Identity = { ...existing, display_name: v.name };
      await saveIdentity(updated);
      console.log(`Updated jockey name to: ${updated.display_name}`);
      return 0;
    }

    const raw = (await rl.question('Jockey Name (use your real name please): ')).trim();
    const v = validateDisplayName(raw);
    if (!v.ok) { console.error(v.error); return 1; }

    const identity: Identity = {
      user_id: generateUserId(),
      display_name: v.name,
      created_at: new Date().toISOString(),
    };
    await saveIdentity(identity);
    console.log('');
    console.log(`Welcome, ${identity.display_name}!`);
    console.log(`Your identity is saved. You can now create a stable and join races.`);
    return 0;
  } finally {
    rl.close();
  }
}
