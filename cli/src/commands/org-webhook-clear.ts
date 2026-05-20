import { deleteOrgWebhook } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgWebhookClearCommand(orgName: string | undefined): Promise<number> {
  if (!orgName) {
    console.error('Usage: token-derby organisation webhook clear <org-name>');
    return 2;
  }
  try {
    await deleteOrgWebhook(orgName);
    console.log(`Webhook removed for ${orgName}.`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
