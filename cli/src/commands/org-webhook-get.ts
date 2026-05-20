import { getOrgWebhook } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgWebhookGetCommand(orgName: string | undefined): Promise<number> {
  if (!orgName) {
    console.error('Usage: token-derby organisation webhook get <org-name>');
    return 2;
  }
  try {
    const resp = await getOrgWebhook(orgName);
    if (resp.webhook_url) {
      console.log(`Webhook for ${orgName}: ${resp.webhook_url}`);
    } else {
      console.log(`No webhook configured for ${orgName}.`);
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
