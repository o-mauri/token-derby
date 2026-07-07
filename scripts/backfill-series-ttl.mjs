#!/usr/bin/env node
// One-time backfill: stamp `ttl` (epoch SECONDS) onto existing series POINT#
// rows that predate the TTL feature, so DynamoDB expires them instead of them
// lingering forever after the prune Lambda was retired.
//
// ttl = floor((point.t + 14d) / 1000) — identical to what appendSeriesPoint now
// writes, so backfilled points expire on the same 14-day schedule.
//
// Usage (per environment):
//   AWS_PROFILE=personal node scripts/backfill-series-ttl.mjs token-derby
//   AWS_PROFILE=personal node scripts/backfill-series-ttl.mjs token-derby-staging
// Add --dry-run to only count rows that would be updated.
//
// Idempotent: only rows missing `ttl` are touched, so it is safe to re-run.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION ?? 'eu-west-2';
const TABLE = process.argv[2] ?? process.env.TABLE_NAME;
const DRY_RUN = process.argv.includes('--dry-run');
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const POINT_SK_PREFIX = 'POINT#';

if (!TABLE) {
  console.error('usage: node scripts/backfill-series-ttl.mjs <table-name> [--dry-run]');
  process.exit(2);
}

// DYNAMODB_ENDPOINT lets this run against DynamoDB Local for testing.
const endpoint = process.env.DYNAMODB_ENDPOINT;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: REGION,
  ...(endpoint ? { endpoint } : {}),
}));

let scanned = 0;
let updated = 0;
let ExclusiveStartKey;

console.log(`[backfill] table=${TABLE} region=${REGION} dryRun=${DRY_RUN}`);

do {
  const out = await ddb.send(new ScanCommand({
    TableName: TABLE,
    ProjectionExpression: 'pk, sk, #t, #ttl',
    FilterExpression: 'begins_with(sk, :p) AND attribute_not_exists(#ttl)',
    ExpressionAttributeNames: { '#t': 't', '#ttl': 'ttl' },
    ExpressionAttributeValues: { ':p': POINT_SK_PREFIX },
    ExclusiveStartKey,
  }));

  for (const it of out.Items ?? []) {
    scanned++;
    const t = Number(it.t);
    if (!Number.isFinite(t)) continue; // a POINT# row with no usable timestamp — skip
    const ttl = Math.floor((t + RETENTION_MS) / 1000);
    if (!DRY_RUN) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { pk: it.pk, sk: it.sk },
          UpdateExpression: 'SET #ttl = :ttl',
          // Re-check inside the write so a concurrent writer that already set ttl wins.
          ConditionExpression: 'attribute_not_exists(#ttl)',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':ttl': ttl },
        }));
      } catch (e) {
        if (e?.name !== 'ConditionalCheckFailedException') throw e;
      }
    }
    updated++;
    if (updated % 1000 === 0) console.log(`[backfill] ${updated} points stamped…`);
  }
  ExclusiveStartKey = out.LastEvaluatedKey;
} while (ExclusiveStartKey);

console.log(`[backfill] done: ${updated} point(s) ${DRY_RUN ? 'would be' : ''} stamped (scanned ${scanned} untttl'd POINT# rows)`);
