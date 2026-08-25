import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgDomainKey } from './keys.js';

/** Raised when a domain is already the auto-join destination for another org. */
export class DomainAlreadyClaimedError extends Error {
  org_id: string;

  constructor(domain: string, org_id: string) {
    super(`Domain ${domain} is already claimed by another org`);
    this.name = 'DomainAlreadyClaimedError';
    this.org_id = org_id;
  }
}

export function normaliseDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

/** Strongly consistent: the claim row is the source of truth, not a GSI. */
export async function resolveOrgDomain(domain: string): Promise<string | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: orgDomainKey(normaliseDomain(domain)),
    ConsistentRead: true,
    ProjectionExpression: 'org_id',
  }));
  return Item?.org_id ? String(Item.org_id) : null;
}

/**
 * Claims a domain as an org's auto-join destination. Globally unique — the
 * conditional put is what makes "which org does this domain land me in"
 * always have at most one answer. On conflict, a consistent read names the
 * org already holding it so the caller can explain the refusal.
 */
export async function claimOrgDomain(domain: string, org_id: string): Promise<void> {
  const normalised = normaliseDomain(domain);
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { ...orgDomainKey(normalised), org_id, created_at: new Date().toISOString() },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      const holder = await resolveOrgDomain(normalised);
      throw new DomainAlreadyClaimedError(normalised, holder ?? org_id);
    }
    throw err;
  }
}

/**
 * Releases a domain claim, but only for the org that holds it — the
 * ConditionExpression is what stops one org releasing another org's claim.
 * Releasing an unclaimed domain, or someone else's claim, is a silent no-op.
 */
export async function releaseOrgDomain(domain: string, org_id: string): Promise<void> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: orgDomainKey(normaliseDomain(domain)),
      ConditionExpression: 'org_id = :org_id',
      ExpressionAttributeValues: { ':org_id': org_id },
    }));
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return;
    throw err;
  }
}
