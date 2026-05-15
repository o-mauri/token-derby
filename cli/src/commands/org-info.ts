import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisation } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgInfoCommand(name: string | undefined): Promise<number> {
  if (!name) {
    console.error('Usage: token-derby organisation info <name>');
    return 2;
  }
  if (!ORG_NAME_PATTERN.test(name)) {
    console.error('Organisation name must be 1–12 alphanumeric characters.');
    return 2;
  }
  try {
    const resp = await getOrganisation(name);
    console.log(`Organisation: ${resp.org_name}`);
    console.log(`Created:      ${resp.created_at} by ${resp.creator_user_name}`);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════╗');
    console.log(`  ║  JOIN TOKEN:  ${resp.org_join_token.padEnd(43)}║`);
    console.log('  ╚══════════════════════════════════════════════════════════╝');
    console.log('  ⚠  Treat the token as a secret — anyone with it can join.');
    console.log('');
    console.log(`  Members join with:  token-derby organisation join ${resp.org_join_token}`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
