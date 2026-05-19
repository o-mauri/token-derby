import { PutCommand, GetCommand, QueryCommand, BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgMetaKey, orgMemberKey, ORG_PK_PREFIX, MEMBER_SK_PREFIX, parseOrgId } from './keys.js';
import type { Organisation, OrganisationSummary } from '@token-derby/shared';

type OrgRecord = Organisation & {
  org_join_token: string;
  webhook_url?: string;
  webhook_secret?: string;
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
  user_name: string,
  joined_at: string,
): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...orgMemberKey(org_id, user_id),
      member_user_id: user_id,
      user_name,
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

// Stable for tests. Not used in handler paths.
export async function listMembersForOrg(org_id: string): Promise<string[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :mp)',
    ExpressionAttributeValues: {
      ':pk': `${ORG_PK_PREFIX}${org_id}`,
      ':mp': MEMBER_SK_PREFIX,
    },
  }));
  return Items.map(it => String(it.member_user_id ?? ''));
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

function pickOrgRecord(item: Record<string, any>): OrgRecord {
  const { pk: _pk, sk: _sk, ...rest } = item;
  return rest as OrgRecord;
}
