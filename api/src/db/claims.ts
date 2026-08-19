import { PutCommand, GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { ClaimItemType } from '@token-derby/shared';
import { ddb, TABLE } from './client.js';
import { claimKey, CLAIM_PK_PREFIX } from './keys.js';

export type ClaimRecord = {
  code: string;
  item_type: ClaimItemType;
  hat_id: string;
  variant?: number;
  created_at: string;
  created_by: string;
  expires_at: string;
  redeemed_at?: string;
  redeemed_by?: string;
  redeemed_by_name?: string;
  redeemed_horse_id?: string;
  redeemed_horse_name?: string;
  outcome?: 'hat' | 'duplicate';
  xp_awarded?: number;
};

export type PutClaimInput = {
  code: string;
  item_type: ClaimItemType;
  hat_id: string;
  variant?: number;
  expires_at: string;
  created_by: string;
};

// Redeemed rows outlive expiry so the admin list stays auditable for a quarter.
const RETENTION_SECONDS = 90 * 86_400;

export async function putClaim(input: PutClaimInput): Promise<ClaimRecord> {
  const record: ClaimRecord = {
    code: input.code,
    item_type: input.item_type,
    hat_id: input.hat_id,
    created_at: new Date().toISOString(),
    created_by: input.created_by,
    expires_at: input.expires_at,
  };
  if (input.variant !== undefined) record.variant = input.variant;
  const ttl = Math.floor(Date.parse(input.expires_at) / 1000) + RETENTION_SECONDS;
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { ...claimKey(input.code), ...record, ttl },
  }));
  return record;
}

function toRecord(item: Record<string, unknown>): ClaimRecord {
  const { pk, sk, ttl, ...rest } = item;
  return rest as ClaimRecord;
}

export async function getClaim(code: string): Promise<ClaimRecord | null> {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: claimKey(code) }));
  return Item ? toRecord(Item) : null;
}

export type MarkRedeemedInput = {
  redeemed_by: string;
  redeemed_by_name?: string;
  redeemed_horse_id: string;
  redeemed_horse_name?: string;
  outcome: 'hat' | 'duplicate';
  xp_awarded?: number;
};

/**
 * Single-use gate. The conditional update is the only thing guaranteeing one
 * award per token; returns false when the row is missing or already redeemed.
 */
export async function markClaimRedeemed(
  code: string,
  input: MarkRedeemedInput,
): Promise<boolean> {
  const sets = [
    'redeemed_at = :at',
    'redeemed_by = :by',
    'redeemed_horse_id = :horse',
    'outcome = :outcome',
  ];
  const eav: Record<string, unknown> = {
    ':at': new Date().toISOString(),
    ':by': input.redeemed_by,
    ':horse': input.redeemed_horse_id,
    ':outcome': input.outcome,
  };
  if (input.redeemed_by_name !== undefined) {
    sets.push('redeemed_by_name = :byName');
    eav[':byName'] = input.redeemed_by_name;
  }
  if (input.redeemed_horse_name !== undefined) {
    sets.push('redeemed_horse_name = :horseName');
    eav[':horseName'] = input.redeemed_horse_name;
  }
  if (input.xp_awarded !== undefined) {
    sets.push('xp_awarded = :xp');
    eav[':xp'] = input.xp_awarded;
  }
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: claimKey(code),
      UpdateExpression: 'SET ' + sets.join(', '),
      ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(redeemed_at)',
      ExpressionAttributeValues: eav,
    }));
    return true;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

/** Admin listing. Claims are rare, so a filtered Scan is acceptable here. */
export async function listClaims(): Promise<ClaimRecord[]> {
  const out: ClaimRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'begins_with(pk, :p) AND sk = :sk',
      ExpressionAttributeValues: { ':p': CLAIM_PK_PREFIX, ':sk': 'META' },
      ExclusiveStartKey,
    }));
    for (const item of res.Items ?? []) out.push(toRecord(item));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
