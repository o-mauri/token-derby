import { PutCommand, GetCommand, QueryCommand, BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgMetaKey, orgMemberKey, ORG_PK_PREFIX, MEMBER_SK_PREFIX, parseOrgId } from './keys.js';
import { getUserNamesByIds } from './users.js';
import type { Organisation, OrganisationSummary, OrgSlackMessages, OrgSlackDigest } from '@token-derby/shared';

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
type OrgRecord = Organisation & {
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

function pickOrgRecord(item: Record<string, any>): OrgRecord {
  const { pk: _pk, sk: _sk, slack_marker: _m, ...rest } = item;
  return rest as OrgRecord;
}
