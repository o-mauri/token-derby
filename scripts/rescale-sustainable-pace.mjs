#!/usr/bin/env node
// One-time migration: rescale stored `stamina_config.sustainable_pace` by 10.
//
// Races no longer have an output-only mode — every race counts input+output —
// so the 10x TOKEN_INPUT_MULTIPLIER that used to be applied at scoring time is
// now baked into the constants (default 4,000 -> 40,000 tokens/min). Overrides
// already stored on an org's RACE_SETTINGS row are in the old units and would
// otherwise read as a 10x harsher pace than the org chose.
//
// Usage (per environment):
//   AWS_PROFILE=personal node scripts/rescale-sustainable-pace.mjs token-derby
//   AWS_PROFILE=personal node scripts/rescale-sustainable-pace.mjs token-derby-staging
// Add --dry-run to list the rows that would change without writing.
//
// Idempotent: a converted row is stamped with `sustainable_pace_scaled_at`, and
// stamped rows are skipped, so re-running can never multiply twice.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION ?? 'eu-west-2';
const TABLE = process.argv[2] ?? process.env.TABLE_NAME;
const DRY_RUN = process.argv.includes('--dry-run');
const RACE_SETTINGS_SK = 'RACE_SETTINGS';
const FACTOR = 10;

if (!TABLE) {
  console.error('usage: node scripts/rescale-sustainable-pace.mjs <table-name> [--dry-run]');
  process.exit(2);
}

const endpoint = process.env.DYNAMODB_ENDPOINT;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: REGION,
  ...(endpoint ? { endpoint } : {}),
}));

let scanned = 0;
let updated = 0;
let ExclusiveStartKey;

console.log(`[rescale] table=${TABLE} region=${REGION} dryRun=${DRY_RUN}`);

do {
  const out = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'sk = :sk AND attribute_exists(stamina_config)',
    ExpressionAttributeValues: { ':sk': RACE_SETTINGS_SK },
    ExclusiveStartKey,
  }));

  for (const item of out.Items ?? []) {
    scanned++;
    const pace = item.stamina_config?.sustainable_pace;
    if (typeof pace !== 'number') continue;          // tuned, but not this param
    if (item.sustainable_pace_scaled_at) continue;   // already converted

    const next = pace * FACTOR;
    console.log(`  ${item.pk}  ${pace} -> ${next}`);
    if (DRY_RUN) { updated++; continue; }

    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { pk: item.pk, sk: item.sk },
      UpdateExpression: 'SET stamina_config.sustainable_pace = :p, sustainable_pace_scaled_at = :t',
      ConditionExpression: 'attribute_not_exists(sustainable_pace_scaled_at)',
      ExpressionAttributeValues: { ':p': next, ':t': new Date().toISOString() },
    }));
    updated++;
  }

  ExclusiveStartKey = out.LastEvaluatedKey;
} while (ExclusiveStartKey);

console.log(`[rescale] settings rows scanned=${scanned} ${DRY_RUN ? 'would update' : 'updated'}=${updated}`);
