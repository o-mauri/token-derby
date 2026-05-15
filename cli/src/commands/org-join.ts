import { joinOrganisation } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgJoinCommand(token: string | undefined): Promise<number> {
  if (!token) {
    console.error('Usage: token-derby organisation join <join-token>');
    return 2;
  }
  try {
    const resp = await joinOrganisation({ join_token: token });
    console.log(`Joined organisation: ${resp.org_name}`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
