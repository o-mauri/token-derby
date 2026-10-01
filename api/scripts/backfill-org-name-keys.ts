// One-off: stamp org_name_key (the lower-cased org name) on organisations
// created before case-insensitive lookup. Dry run unless --apply. Refuses to
// write anything if two orgs share a key, since a lookup could not tell them apart.
//
//   AWS_PROFILE=personal AWS_REGION=eu-west-2 npx tsx api/scripts/backfill-org-name-keys.ts [--apply]
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../src/db/client.js';
import { orgMetaKey, ORG_PK_PREFIX } from '../src/db/keys.js';
import { orgNameKey } from '../src/db/organisations.js';

const APPLY = process.argv.includes('--apply');

type OrgRow = { org_id: string; org_name: string; org_name_key?: string };

async function scanOrgs(): Promise<OrgRow[]> {
  const out: OrgRow[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'begins_with(pk, :p) AND sk = :meta',
      ExpressionAttributeValues: { ':p': ORG_PK_PREFIX, ':meta': 'META' },
      ProjectionExpression: 'org_id, org_name, org_name_key',
      ExclusiveStartKey,
    }));
    for (const item of res.Items ?? []) out.push(item as OrgRow);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

async function main(): Promise<void> {
  const orgs = await scanOrgs();
  const byKey = new Map<string, string[]>();
  for (const o of orgs) byKey.set(orgNameKey(o.org_name), [...(byKey.get(orgNameKey(o.org_name)) ?? []), o.org_name]);
  const clashes = [...byKey.values()].filter((names) => names.length > 1);
  if (clashes.length > 0) {
    console.error(`refusing to write: ${clashes.length} name(s) differ only by case:`);
    for (const names of clashes) console.error(`  ${names.join(' / ')}`);
    process.exit(1);
  }

  const missing = orgs.filter((o) => o.org_name_key !== orgNameKey(o.org_name));
  console.log(`${orgs.length} orgs, ${missing.length} need org_name_key`);
  for (const o of missing) {
    console.log(`  ${o.org_name} -> ${orgNameKey(o.org_name)}`);
    if (!APPLY) continue;
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: orgMetaKey(o.org_id),
      UpdateExpression: 'SET org_name_key = :k',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':k': orgNameKey(o.org_name) },
    }));
  }
  console.log(APPLY ? `wrote ${missing.length} orgs` : 'dry run: nothing written (pass --apply to write)');
}

main().catch((e) => { console.error(e); process.exit(1); });
