import { listOrganisations } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgListCommand(): Promise<number> {
  try {
    const resp = await listOrganisations();
    if (resp.organisations.length === 0) {
      console.log('You are not in any organisations.');
      console.log('Create one with:  token-derby organisation create');
      console.log('Or join one with: token-derby organisation join <token>');
      return 0;
    }
    console.log(`Your organisations (${resp.organisations.length}):`);
    for (const o of resp.organisations) {
      console.log(`  • ${o.org_name}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
