import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { releaseKey } from './keys.js';
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
