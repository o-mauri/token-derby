import { setOrgWebhook } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgWebhookSetCommand(orgName: string | undefined, url: string | undefined): Promise<number> {
  if (!orgName || !url) {
    console.error('Usage: token-derby organisation webhook set <org-name> <https-url>');
    return 2;
  }
  try {
    const resp = await setOrgWebhook(orgName, { url });
    console.log('');
    console.log(`  Webhook set for ${orgName}: ${resp.webhook_url}`);
    console.log('  ╔══════════════════════════════════════════════════════════╗');
    console.log(`  ║  SECRET:  ${resp.webhook_secret.padEnd(47)}║`);
    console.log('  ╚══════════════════════════════════════════════════════════╝');
    console.log('  ⚠  Save this secret now — it will not be shown again.');
    console.log('     Your receiver verifies requests with: X-Token-Derby-Signature: sha256=<hmac(secret, raw body)>.');
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
