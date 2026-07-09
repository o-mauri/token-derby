import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../../src/db/client.js';
import { stableHorseKey } from '../../src/db/keys.js';

// Minimal stable-horse row so awardHorseXp's attribute_exists(pk) passes in tests.
export async function putHorseForTest(user_id: string, stable_horse_id: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { ...stableHorseKey(user_id, stable_horse_id), user_id, stable_horse_id, name: stable_horse_id, xp: 0 },
  }));
}
