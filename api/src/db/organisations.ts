import { PutCommand, GetCommand, QueryCommand, BatchGetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgMetaKey, orgMemberKey, ORG_PK_PREFIX, MEMBER_SK_PREFIX, parseOrgId } from './keys.js';
import { getUserNamesByIds } from './users.js';
import { normaliseDomain } from './org-domains.js';
import { generateOrgJoinToken } from '../lib/codes.js';
import type { Organisation, OrganisationSummary, OrgSlackMessages, OrgSlackDigest, OrgAccessSettings } from '@token-derby/shared';

// Sparse index over org meta rows that have Slack configured. Only those rows
// carry `slack_marker`, so the index holds one entry per Slack-enabled org.
export const SLACK_ORGS_INDEX = 'SlackOrgsIndex';
const SLACK_MARKER = 'SLACK';

export type OrgSlackConfig = {
  bot_token: string;
  channel_id: string;
  messages: OrgSlackMessages;
  digest?: OrgSlackDigest;
  digest_last_sent_date?: string;
};

// `org_join_token`, `webhook_secret`, and `slack.bot_token` are secrets. Never
// include this record directly in an HTTP response — handlers must
// cherry-pick the safe fields.
//
// The four access-control fields are declared required here (unlike on
// `Organisation`, where they're optional) because every reader below funnels
// through `pickOrgRecord`, which fills in Phase 3 defaults for rows that
// predate this change. Callers of getOrganisationBy* can rely on them always
// being present.
type OrgRecord = Omit<Organisation, keyof OrgAccessSettings> &
  OrgAccessSettings & {
    org_join_token: string;
    webhook_url?: string;
    webhook_secret?: string;
    slack?: OrgSlackConfig;
  };

export async function putOrganisation(org: Organisation, org_join_token: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...orgMetaKey(org.org_id),
      ...org,
      org_join_token,
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function getOrganisationById(org_id: string): Promise<OrgRecord | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: orgMetaKey(org_id),
  }));
  return Item ? pickOrgRecord(Item) : null;
}

export async function getOrganisationByName(org_name: string): Promise<OrgRecord | null> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'OrgNameIndex',
    KeyConditionExpression: 'org_name = :n',
    ExpressionAttributeValues: { ':n': org_name },
    Limit: 1,
  }));
  const item = Items[0];
  return item ? pickOrgRecord(item) : null;
}

export async function getOrganisationByJoinToken(join_token: string): Promise<OrgRecord | null> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'OrgJoinTokenIndex',
    KeyConditionExpression: 'org_join_token = :t',
    ExpressionAttributeValues: { ':t': join_token },
    Limit: 1,
  }));
  const item = Items[0];
  return item ? pickOrgRecord(item) : null;
}

export async function addMember(
  org_id: string,
  user_id: string,
  joined_at: string,
): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...orgMemberKey(org_id, user_id),
      member_user_id: user_id,
      joined_at,
    },
  }));
}

export async function isMember(org_id: string, user_id: string): Promise<boolean> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: orgMemberKey(org_id, user_id),
    ProjectionExpression: 'member_user_id',
  }));
  return !!Item;
}

// Hard delete, not a soft-delete flag. isMember gates create-race, join-race,
// get-organisation, list-org-members and join-organisation — removing the
// MEMBER# row revokes all of them with zero read-path changes. A flag would
// need filtering added in isMember, listOrgMembers, listOrganisationsForUser
// AND admin-scan, and one missed filter would silently grant access back.
// Returns false (rather than throwing) for a non-member, so the caller can
// tell "removed" from "there was nothing to remove".
export async function removeMember(org_id: string, user_id: string): Promise<boolean> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: orgMemberKey(org_id, user_id),
      ConditionExpression: 'attribute_exists(pk)',
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

// Writes all four access fields together, never one at a time: the settings
// are validated as a set (restrict_to_allowed_domains with an empty
// allowed_domains locks everyone out), so a writer that could land half of a
// validated pair would be able to reach a combination nothing validated.
// Attribute names go through ExpressionAttributeNames because several of these
// words are DynamoDB reserved words.
export async function setOrgAccess(org_id: string, access: OrgAccessSettings): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: orgMetaKey(org_id),
    UpdateExpression: 'SET #ad = :ad, #jte = :jte, #dje = :dje, #rad = :rad',
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeNames: {
      '#ad': 'allowed_domains',
      '#jte': 'join_token_enabled',
      '#dje': 'domain_join_enabled',
      '#rad': 'restrict_to_allowed_domains',
    },
    ExpressionAttributeValues: {
      ':ad': access.allowed_domains,
      ':jte': access.join_token_enabled,
      ':dje': access.domain_join_enabled,
      ':rad': access.restrict_to_allowed_domains,
    },
  }));
}

// `org_join_token` is queried through OrgJoinTokenIndex (see
// getOrganisationByJoinToken above), so this UpdateCommand write is what
// invalidates the old token: once the indexed attribute changes, the old
// value simply has no row projecting into that index for it anymore.
export async function rotateJoinToken(org_id: string): Promise<string> {
  const org_join_token = generateOrgJoinToken();
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: orgMetaKey(org_id),
    UpdateExpression: 'SET org_join_token = :t',
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeValues: { ':t': org_join_token },
  }));
  return org_join_token;
}

export async function listOrganisationsForUser(user_id: string): Promise<OrganisationSummary[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'OrgMembershipIndex',
    KeyConditionExpression: 'member_user_id = :u',
    ExpressionAttributeValues: { ':u': user_id },
  }));
  const org_ids = Items
    .map(it => parseOrgId(String(it.pk ?? '')))
    .filter((x): x is string => !!x);
  if (org_ids.length === 0) return [];

  // BatchGet is limited to 100 items per request — chunk to be safe.
  const summaries: OrganisationSummary[] = [];
  for (let i = 0; i < org_ids.length; i += 100) {
    const chunk = org_ids.slice(i, i + 100);
    const { Responses } = await ddb.send(new BatchGetCommand({
      RequestItems: {
        [TABLE]: {
          Keys: chunk.map(id => orgMetaKey(id)),
          ProjectionExpression: 'org_id, org_name',
        },
      },
    }));
    const rows = Responses?.[TABLE] ?? [];
    for (const row of rows) {
      if (row.org_id && row.org_name) {
        summaries.push({ org_id: String(row.org_id), org_name: String(row.org_name) });
      }
    }
  }
  summaries.sort((a, b) => a.org_name.localeCompare(b.org_name));
  return summaries;
}

export type OrgMember = { user_id: string; user_name: string; joined_at: string };

// Membership-only lookup — no name resolution, no BatchGet. Use this when all
// a caller needs is "is this user a member", not display names.
export async function listOrgMemberIds(org_id: string): Promise<string[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :mp)',
    ExpressionAttributeValues: {
      ':pk': `${ORG_PK_PREFIX}${org_id}`,
      ':mp': MEMBER_SK_PREFIX,
    },
    ProjectionExpression: 'member_user_id',
  }));
  return Items
    .map(it => String(it.member_user_id ?? ''))
    .filter(id => id !== '');
}

export async function listOrgMembers(org_id: string): Promise<OrgMember[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :mp)',
    ExpressionAttributeValues: {
      ':pk': `${ORG_PK_PREFIX}${org_id}`,
      ':mp': MEMBER_SK_PREFIX,
    },
    ProjectionExpression: 'member_user_id, joined_at',
  }));
  const rows = Items
    .map(it => ({
      user_id: String(it.member_user_id ?? ''),
      joined_at: String(it.joined_at ?? ''),
    }))
    .filter(m => m.user_id !== '');

  // Names come from the user rows, never from the member row — a copy there
  // would go stale on rename.
  const names = await getUserNamesByIds(rows.map(r => r.user_id));
  return rows.map(r => ({ user_id: r.user_id, user_name: names.get(r.user_id) ?? '', joined_at: r.joined_at }));
}

// Stable for tests. Not used in handler paths.
export async function listMembersForOrg(org_id: string): Promise<string[]> {
  return listOrgMemberIds(org_id);
}

export async function setOrgWebhook(
  org_id: string,
  webhook_url: string,
  webhook_secret: string,
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: orgMetaKey(org_id),
    UpdateExpression: 'SET webhook_url = :u, webhook_secret = :s',
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeValues: {
      ':u': webhook_url,
      ':s': webhook_secret,
    },
  }));
}

export async function clearOrgWebhook(org_id: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: orgMetaKey(org_id),
    UpdateExpression: 'REMOVE webhook_url, webhook_secret',
    ConditionExpression: 'attribute_exists(pk)',
  }));
}

export async function setOrgSlack(org_id: string, config: OrgSlackConfig): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: orgMetaKey(org_id),
    UpdateExpression: 'SET slack = :s, slack_marker = :m',
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeValues: { ':s': config, ':m': SLACK_MARKER },
  }));
}

export async function clearOrgSlack(org_id: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: orgMetaKey(org_id),
    UpdateExpression: 'REMOVE slack, slack_marker',
    ConditionExpression: 'attribute_exists(pk)',
  }));
}

// At-most-once digest claim for a given local date. Returns true only for the
// caller that first advances slack.digest_last_sent_date to `localDate`.
export async function markDigestSent(org_id: string, localDate: string): Promise<boolean> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: orgMetaKey(org_id),
      UpdateExpression: 'SET slack.digest_last_sent_date = :d',
      ConditionExpression: 'attribute_exists(slack) AND (attribute_not_exists(slack.digest_last_sent_date) OR slack.digest_last_sent_date <> :d)',
      ExpressionAttributeValues: { ':d': localDate },
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

// Queries the sparse index rather than scanning the table: only Slack-enabled
// org meta rows carry `slack_marker`, so this reads one entry per such org.
// Every org that reaches here was written by setOrgSlack, which maintains the
// marker — a row with `slack` but no marker is invisible to this path.
async function listSlackOrgs(match: (org: OrgRecord) => boolean): Promise<OrgRecord[]> {
  const out: OrgRecord[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: SLACK_ORGS_INDEX,
      KeyConditionExpression: 'slack_marker = :m',
      ExpressionAttributeValues: { ':m': SLACK_MARKER },
      ExclusiveStartKey,
    }));
    for (const it of res.Items ?? []) {
      const org = pickOrgRecord(it);
      if (match(org)) out.push(org);
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

export async function listOrgsWithSlackDigest(): Promise<OrgRecord[]> {
  return listSlackOrgs((org) => Boolean(org.slack?.messages.weekly_digest && org.slack.digest));
}

export async function listOrgsWithSlackRelease(): Promise<OrgRecord[]> {
  return listSlackOrgs((org) => Boolean(org.slack?.messages.release_published));
}

// Every org row created before Phase 3 (org access control) has none of the
// four fields below. This is the single place that fills in their defaults,
// because getOrganisationById/ByName/ByJoinToken all funnel through here —
// applying the defaults anywhere else would leave one of those three doors
// returning `undefined`, and a downstream falsy check would then treat a
// legacy org's join token as disabled.
//
// Each default is written as an explicit `?? true` / `?? false`, never `||`
// and never a bare truthy check: `false || true` evaluates to `true`, which
// would silently re-enable a token an admin explicitly disabled, and reading
// an absent `restrict_to_allowed_domains` as truthy would lock every existing
// org out of its own (empty) allow-list.
function pickOrgRecord(item: Record<string, any>): OrgRecord {
  const { pk: _pk, sk: _sk, slack_marker: _m, ...rest } = item;
  return {
    ...rest,
    allowed_domains: normaliseAllowedDomains(rest.allowed_domains),
    join_token_enabled: rest.join_token_enabled ?? true,
    domain_join_enabled: rest.domain_join_enabled ?? false,
    restrict_to_allowed_domains: rest.restrict_to_allowed_domains ?? false,
  } as OrgRecord;
}

// Defensively re-normalises on read too, so an allow-list written elsewhere
// (or by hand) can't make restriction checks depend on how a domain was
// typed. Mirrors the normalisation in org-domains.ts.
function normaliseAllowedDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(d => normaliseDomain(String(d)));
}
