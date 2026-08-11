import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { releaseKey, releaseOrgKey } from './keys.js';
import type { AnnounceReleaseRequest } from '@token-derby/shared';

// One record per released version. The conditional put is what makes
// announcing idempotent — a retried release posts nothing.
export async function claimRelease(rec: AnnounceReleaseRequest): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...releaseKey(rec.component, rec.version),
        ...rec,
        announced_at: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

// Releases a claim so a retry can re-announce. Only for failures that happen
// before any Slack post — never after a partial fan-out, which would duplicate.
export async function unclaimRelease(rec: AnnounceReleaseRequest): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: releaseKey(rec.component, rec.version),
  }));
}

// Per-org delivery marker. This — not the release row — is what makes the
// fan-out resumable: a retry claims only the orgs still missing the release.
export async function claimReleaseForOrg(rec: AnnounceReleaseRequest, org_id: string): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...releaseOrgKey(rec.component, rec.version, org_id),
        org_id,
        notified_at: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

// Drops a marker after a failed post so the next run retries that org.
export async function unclaimReleaseForOrg(rec: AnnounceReleaseRequest, org_id: string): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: releaseOrgKey(rec.component, rec.version, org_id),
  }));
}
