// One-time backfill: stamp `result` onto races finalised before finaliseRace wrote it,
// so the org races listing stops reading their horses. Only races with ended_at and
// no result are touched, so it is safe to re-run.
//
// Usage:
//   AWS_PROFILE=personal AWS_REGION=eu-west-2 npx tsx scripts/backfill-race-results.ts token-derby [--dry-run]
// DYNAMODB_ENDPOINT=http://localhost:8000 runs it against DynamoDB Local.

import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const table = process.argv[2] ?? process.env.TABLE_NAME;
const dryRun = process.argv.includes('--dry-run');
if (!table) {
  console.error('usage: npx tsx scripts/backfill-race-results.ts <table-name> [--dry-run]');
  process.exit(2);
}
// The api's db modules read TABLE_NAME and AWS_REGION at import time.
process.env.TABLE_NAME = table;
process.env.AWS_REGION ??= 'eu-west-2';

async function main(): Promise<void> {
  const { ddb } = await import('../api/src/db/client.js');
  const { listHorses } = await import('../api/src/db/horses.js');
  const { setRaceResult } = await import('../api/src/db/races.js');
  const { raceResultOf } = await import('../api/src/lib/race-result.js');

  console.log(`[backfill] table=${table} region=${process.env.AWS_REGION} dryRun=${dryRun}`);

  let found = 0;
  let stamped = 0;
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: 'pk, race_id, #n',
      FilterExpression: 'sk = :meta AND begins_with(pk, :race) AND attribute_exists(ended_at) AND attribute_not_exists(#r)',
      ExpressionAttributeNames: { '#n': 'name', '#r': 'result' },
      ExpressionAttributeValues: { ':meta': 'META', ':race': 'RACE#' },
      ExclusiveStartKey,
    }));
    for (const race of page.Items ?? []) {
      found++;
      const result = raceResultOf(await listHorses(race.race_id), 'finished');
      console.log(`[backfill] ${race.race_id} "${race.name}": ${result.runners} runners, ${result.total_tokens} tokens, winner ${result.highlight?.horse_name ?? '-'}`);
      if (!dryRun) {
        await setRaceResult(race.race_id, result);
        stamped++;
      }
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  console.log(`[backfill] done: ${found} race(s) missing a result, ${dryRun ? 'none stamped (dry run)' : `${stamped} stamped`}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
