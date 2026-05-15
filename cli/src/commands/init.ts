import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  loadIdentity,
  saveIdentity,
  deleteIdentity,
  validateDisplayName,
  type Identity,
} from '../identity/identity.js';
import { initJockey, updateJockey } from '../api/endpoints.js';
import { ApiError, _resetIdentityCacheForTests } from '../api/client.js';

export async function initCommand(reset = false): Promise<number> {
  if (reset) {
    await deleteIdentity();
    _resetIdentityCacheForTests();
    console.log('Removed local identity. Creating a new one…');
  }

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
      try {
        const resp = await updateJockey({ display_name: v.name });
        const updated: Identity = { ...existing, display_name: resp.display_name };
        await saveIdentity(updated);
        console.log(`Updated jockey name to: ${updated.display_name}`);
        return 0;
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === 'UNAUTHENTICATED') {
            console.error(
              'Server does not recognise this identity. Your account may have been wiped. ' +
              'Run `token-derby init --reset` to start fresh.',
            );
          } else {
            console.error(`Error: ${e.code} ${e.message}`);
          }
          return 1;
        }
        throw e;
      }
    }

    const raw = (await rl.question('Jockey Name (use your real name please): ')).trim();
    const v = validateDisplayName(raw);
    if (!v.ok) { console.error(v.error); return 1; }

    try {
      const resp = await initJockey({ display_name: v.name });
      const identity: Identity = {
        user_id: resp.user_id,
        display_name: resp.display_name,
        secret_token: resp.secret_token,
        created_at: new Date().toISOString(),
      };
      await saveIdentity(identity);
      _resetIdentityCacheForTests();
      console.log('');
      console.log(`Welcome, ${identity.display_name}!`);
      console.log('Your identity has been created on the server.');
      console.log('You can now create a stable and join races.');
      console.log('');
      console.log('  ⚠  Your secret token is stored locally in identity.json.');
      console.log('     If you lose it, you cannot recover this account — you would');
      console.log('     need to run `token-derby init --reset` and rebuild your stable.');
      return 0;
    } catch (e) {
      if (e instanceof ApiError) {
        console.error(`Error: ${e.code} ${e.message}`);
        return 1;
      }
      throw e;
    }
  } finally {
    rl.close();
  }
}
