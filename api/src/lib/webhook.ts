import { createHmac, randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 2000;

export type OrgWithWebhook = {
  org_id: string;
  org_name: string;
  webhook_url?: string;
  webhook_secret?: string;
};

export type SendOrgWebhookOptions = { timeoutMs?: number };

export async function sendOrgWebhook(
  org: OrgWithWebhook,
  event_type: 'race.created' | 'race.ended' | 'league.season.ended',
  payload: object,
  opts: SendOrgWebhookOptions = {},
): Promise<void> {
  if (!org.webhook_url || !org.webhook_secret) return;

  const delivery_id = randomUUID();
  const body = JSON.stringify(payload);
  const signature = 'sha256=' + createHmac('sha256', org.webhook_secret).update(body).digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(org.webhook_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'token-derby-webhook/1',
        'x-token-derby-event': event_type,
        'x-token-derby-delivery': delivery_id,
        'x-token-derby-signature': signature,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn('webhook delivery non-2xx', {
        org_id: org.org_id,
        event_type,
        delivery_id,
        status: res.status,
      });
    }
  } catch (error) {
    console.warn('webhook delivery failed', {
      org_id: org.org_id,
      event_type,
      delivery_id,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}
