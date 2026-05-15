import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ORG_NAME_PATTERN, ORG_NAME_MAX_LENGTH } from '@token-derby/shared';
import { createOrganisation } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgCreateCommand(): Promise<number> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const name = (await rl.question(`Organisation name (1–${ORG_NAME_MAX_LENGTH} alphanumeric chars): `)).trim();
    if (!ORG_NAME_PATTERN.test(name)) {
      console.error(`Name must be 1–${ORG_NAME_MAX_LENGTH} alphanumeric characters (no spaces or symbols).`);
      return 1;
    }
    const resp = await createOrganisation({ name });

    console.log('');
    console.log(`  Organisation created: ${resp.org_name}`);
    console.log('  ╔══════════════════════════════════════════════════════════╗');
    console.log(`  ║  JOIN TOKEN:  ${resp.org_join_token.padEnd(43)}║`);
    console.log('  ╚══════════════════════════════════════════════════════════╝');
    console.log('  ⚠  Share this token to invite members. Treat it as a secret.');
    console.log('');
    console.log(`  Members join with:  token-derby organisation join ${resp.org_join_token}`);
    console.log(`  Create org races:   token-derby create --organisation ${resp.org_name}`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  } finally {
    rl.close();
  }
}
