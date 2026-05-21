import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { SetOrgWebhookRequest, SetOrgWebhookResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN, parseSemver } from '@token-derby/shared';
import { getOrganisationByName, setOrgWebhook } from '../db/organisations.js';
import { generateWebhookSecret } from '../lib/codes.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { authenticate } from '../lib/auth.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '169.254.169.254',
]);

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cli_version = readCliVersion(event);
  if (!cli_version) return err('BAD_REQUEST', 'X-Cli-Version header required — upgrade your CLI');
  if (!parseSemver(cli_version)) return err('BAD_REQUEST', `X-Cli-Version must be MAJOR.MINOR.PATCH (got "${cli_version}")`);
  if (!meetsMinimumCliVersion(cli_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const body = parseJson<SetOrgWebhookRequest>(event.body);
  if (!body || typeof body.url !== 'string') return err('BAD_REQUEST', 'url (string) is required');

  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return err('BAD_REQUEST', 'url must be a valid URL');
  }
  if (parsed.protocol !== 'https:') return err('BAD_REQUEST', 'webhook url must use https://');
  // Reject obviously-wrong hostnames up front. This is a foot-gun guard, not a
  // real SSRF defense — DNS rebinding and other resolutions can still resolve
  // to internal IPs at fetch time. The real protection is that sendOrgWebhook
  // is fire-and-forget and never returns the response body to anyone.
  if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    return err('BAD_REQUEST', 'webhook url must not point at loopback or instance metadata');
  }

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) {
    return err('NOT_ORG_OWNER', 'Only the organisation creator can manage webhooks');
  }

  const webhook_secret = generateWebhookSecret();
  await setOrgWebhook(org.org_id, parsed.toString(), webhook_secret);

  const response: SetOrgWebhookResponse = { webhook_url: parsed.toString(), webhook_secret };
  return ok(response);
};
