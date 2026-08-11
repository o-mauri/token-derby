import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgRaceSettingsKey } from './keys.js';
import type { RaceSettings } from '@token-derby/shared';

export async function putRaceSettings(settings: RaceSettings): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...orgRaceSettingsKey(settings.org_id),
      ...settings,
    },
  }));
}

export async function getRaceSettings(org_id: string): Promise<RaceSettings | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: orgRaceSettingsKey(org_id),
  }));
  return Item ? pickRaceSettings(Item) : null;
}

function pickRaceSettings(item: Record<string, any>): RaceSettings {
  const { pk: _pk, sk: _sk, ...rest } = item;
  return rest as RaceSettings;
}
