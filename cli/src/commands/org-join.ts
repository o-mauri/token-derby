import { joinOrganisation } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgJoinCommand(token?: string): Promise<number> {
  const join_token = token?.trim();
  try {
    // The field is omitted, never sent blank: the server treats a
    // supplied-but-empty token as a malformed request, and only an absent one
    // means "join whichever org has claimed my verified email domain".
    const resp = await joinOrganisation(join_token ? { join_token } : {});
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
