import { clearOrgSchedule } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgScheduleClearCommand(orgName: string | undefined): Promise<number> {
  if (!orgName) {
    console.error('Usage: token-derby organisation schedule clear <org-name>');
    return 2;
  }
  try {
    await clearOrgSchedule(orgName);
    console.log(`Schedule removed for ${orgName}.`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
