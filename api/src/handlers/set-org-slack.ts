import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { SetOrgSlackRequest, GetOrgSlackResponse, OrgSlackMessages, OrgSlackDigest } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName, setOrgSlack, type OrgSlackConfig } from '../db/organisations.js';
import { ok, err, parseJson } from '../lib/http.js';
import { resolveCaller } from '../lib/auth.js';
import { isValidTimeZone } from '../lib/tz.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validMessages(m: any): m is OrgSlackMessages {
  return m && typeof m === 'object'
    && ['race_created', 'race_ended', 'league_season_ended', 'weekly_digest'].every((k) => typeof m[k] === 'boolean');
}
function validDigest(d: any): d is OrgSlackDigest {
  return d && typeof d === 'object'
    && Number.isInteger(d.weekday) && d.weekday >= 1 && d.weekday <= 7
    && typeof d.time_local === 'string' && TIME_RE.test(d.time_local)
    && typeof d.tz === 'string' && isValidTimeZone(d.tz);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const body = parseJson<SetOrgSlackRequest>(event.body);
  if (!body || typeof body.channel_id !== 'string' || body.channel_id.trim() === '') return err('BAD_REQUEST', 'channel_id (string) is required');
  if (!validMessages(body.messages)) return err('BAD_REQUEST', 'messages must set all four boolean toggles');
  if (body.digest !== undefined && !validDigest(body.digest)) return err('BAD_REQUEST', 'digest must be { weekday 1-7, time_local HH:MM, valid tz }');
  if (body.messages.weekly_digest && !body.digest) return err('BAD_REQUEST', 'digest schedule is required when weekly_digest is enabled');

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) return err('NOT_ORG_OWNER', 'Only the organisation creator can manage the Slack bot');

  // Preserve the stored token when the client omits it (editing toggles/schedule).
  const bot_token = (body.bot_token && body.bot_token.trim() !== '') ? body.bot_token.trim() : org.slack?.bot_token;
  if (!bot_token) return err('BAD_REQUEST', 'bot_token is required the first time you configure Slack');

  const config: OrgSlackConfig = {
    bot_token,
    channel_id: body.channel_id.trim(),
    messages: body.messages,
    ...(body.digest ? { digest: body.digest } : {}),
    // preserve the at-most-once marker across edits
    ...(org.slack?.digest_last_sent_date ? { digest_last_sent_date: org.slack.digest_last_sent_date } : {}),
  };
  await setOrgSlack(org.org_id, config);

  const response: GetOrgSlackResponse = {
    configured: true, channel_id: config.channel_id, messages: config.messages, digest: config.digest ?? null,
  };
  return ok(response);
};
