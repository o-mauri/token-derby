import { PutCommand, GetCommand, ScanCommand, TransactWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ClaimItemType, ClaimEntry, AdminClaimRedemption } from '@token-derby/shared';
import { ddb, TABLE } from './client.js';
import { claimKey, CLAIM_PK_PREFIX, claimRedemptionKey, CLAIM_REDEMPTION_SK_PREFIX } from './keys.js';

export type ClaimRecord = {
  code: string;
  item_type: ClaimItemType;
  entries: ClaimEntry[];
  max_redemptions: number;
  redeemed_count: number;
  created_at: string;
  created_by: string;
  expires_at: string;
  // Present only on pre-pack rows; read by the normaliser, never written.
  hat_id?: string;
  variant?: number;
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
  entries: ClaimEntry[];
  max_redemptions: number;
  expires_at: string;
  created_by: string;
};

// Redeemed rows outlive expiry so the admin list stays auditable for a quarter.
const RETENTION_SECONDS = 90 * 86_400;

export function claimTtl(expires_at: string): number {
  return Math.floor(Date.parse(expires_at) / 1000) + RETENTION_SECONDS;
}

export async function putClaim(input: PutClaimInput): Promise<ClaimRecord> {
  const record: ClaimRecord = {
    code: input.code,
    item_type: input.item_type,
    entries: input.entries,
    max_redemptions: input.max_redemptions,
    redeemed_count: 0,
    created_at: new Date().toISOString(),
    created_by: input.created_by,
    expires_at: input.expires_at,
  };
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { ...claimKey(input.code), ...record, ttl: claimTtl(input.expires_at) },
  }));
  return record;
}

// Pre-pack rows carry a single hat_id and a single-use redeemed_at stamp.
// They are normalised on read rather than migrated.
function toRecord(item: Record<string, unknown>): ClaimRecord {
  const { pk, sk, ttl, ...rest } = item;
  const r = rest as ClaimRecord;
  if (!Array.isArray(r.entries)) {
    r.entries = r.hat_id
      ? [r.variant !== undefined ? { hat_id: r.hat_id, variant: r.variant } : { hat_id: r.hat_id }]
      : [];
  }
  if (typeof r.max_redemptions !== 'number') r.max_redemptions = 1;
  if (typeof r.redeemed_count !== 'number') r.redeemed_count = r.redeemed_at ? 1 : 0;
  return r;
}

export async function getClaim(code: string): Promise<ClaimRecord | null> {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: claimKey(code) }));
  return Item ? toRecord(Item) : null;
}

export type RedemptionInput = {
  user_id: string;
  user_name?: string;
  horse_id: string;
  horse_name?: string;
  outcome: 'hat' | 'duplicate';
  hat_id: string;
  variant?: number;
  xp_awarded?: number;
};

export type SlotResult = 'won' | 'already_redeemed' | 'exhausted' | 'conflict';

function compact(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

const RETRYABLE_CANCELLATION_CODES = new Set([
  'TransactionConflict',
  'ThrottlingError',
  'ProvisionedThroughputExceeded',
]);
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 25;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * The single-use gate: one transaction claims this user's slot and one of
 * the limited slots, retrying a transient conflict rather than losing it.
 */
export async function redeemClaimSlot(
  claim: ClaimRecord,
  input: RedemptionInput,
): Promise<SlotResult> {
  const item = compact({
    ...claimRedemptionKey(claim.code, input.user_id),
    ...input,
    redeemed_at: new Date().toISOString(),
    ttl: claimTtl(claim.expires_at),
  });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await ddb.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE,
              Item: item,
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Update: {
              TableName: TABLE,
              Key: claimKey(claim.code),
              UpdateExpression: 'SET redeemed_count = if_not_exists(redeemed_count, :zero) + :one',
              // if_not_exists() is an update-expression-only function; a
              // condition expression must spell the same default-to-0 as OR.
              ConditionExpression:
                'attribute_exists(pk) AND attribute_not_exists(redeemed_at) '
                + 'AND (attribute_not_exists(redeemed_count) OR redeemed_count < :max)',
              ExpressionAttributeValues: {
                ':zero': 0,
                ':one': 1,
                ':max': claim.max_redemptions,
              },
            },
          },
        ],
      }));
      return 'won';
    } catch (e: any) {
      if (e?.name !== 'TransactionCanceledException') throw e;
      const reasons = e.CancellationReasons ?? [];
      if (reasons[0]?.Code === 'ConditionalCheckFailed') return 'already_redeemed';
      if (reasons[1]?.Code === 'ConditionalCheckFailed') return 'exhausted';
      const retryable = reasons.some((r: any) => RETRYABLE_CANCELLATION_CODES.has(r?.Code));
      if (!retryable) throw e;
      if (attempt === MAX_ATTEMPTS) return 'conflict';
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * RETRY_BASE_DELAY_MS);
    }
  }
  return 'conflict';
}

function toRedemption(item: Record<string, unknown>): AdminClaimRedemption {
  const { pk, sk, ttl, ...rest } = item;
  return rest as AdminClaimRedemption;
}

export async function getClaimRedemption(
  code: string,
  user_id: string,
): Promise<AdminClaimRedemption | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: claimRedemptionKey(code, user_id),
  }));
  return Item ? toRedemption(Item) : null;
}

export async function listClaimRedemptions(code: string): Promise<AdminClaimRedemption[]> {
  const out: AdminClaimRedemption[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `${CLAIM_PK_PREFIX}${code}`,
        ':sk': CLAIM_REDEMPTION_SK_PREFIX,
      },
      ExclusiveStartKey,
    }));
    for (const item of res.Items ?? []) out.push(toRedemption(item));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out.sort((a, b) => a.redeemed_at.localeCompare(b.redeemed_at));
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
