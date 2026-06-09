import { PutCommand, GetCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgScheduleKey } from './keys.js';
import type { RaceSchedule } from '@token-derby/shared';

export const SCHEDULES_INDEX = 'SchedulesIndex';
const SCHEDULE_MARKER = 'SCHEDULE';

export async function putSchedule(schedule: RaceSchedule): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...orgScheduleKey(schedule.org_id),
      ...schedule,
      schedule_marker: SCHEDULE_MARKER,
    },
  }));
}

export async function getSchedule(org_id: string): Promise<RaceSchedule | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: orgScheduleKey(org_id),
  }));
  return Item ? pickSchedule(Item) : null;
}

export async function deleteSchedule(org_id: string): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: orgScheduleKey(org_id),
  }));
}

export async function listAllSchedules(): Promise<RaceSchedule[]> {
  const out: RaceSchedule[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: SCHEDULES_INDEX,
      KeyConditionExpression: 'schedule_marker = :m',
      ExpressionAttributeValues: { ':m': SCHEDULE_MARKER },
      ExclusiveStartKey,
    }));
    for (const it of res.Items ?? []) out.push(pickSchedule(it));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

// Claim `localDate` for the org's schedule. Returns true iff this call set the
// marker (i.e. the day had not already been materialised). Mirrors the
// conditional-write idiom of setRaceEndedIfAbsent in db/races.ts.
export async function tryClaimMaterialised(org_id: string, localDate: string): Promise<boolean> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: orgScheduleKey(org_id),
      UpdateExpression: 'SET last_materialised_date = :d',
      ConditionExpression: 'attribute_exists(pk) AND (attribute_not_exists(last_materialised_date) OR last_materialised_date <> :d)',
      ExpressionAttributeValues: { ':d': localDate },
    }));
    return true;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

function pickSchedule(item: Record<string, any>): RaceSchedule {
  const { pk: _pk, sk: _sk, schedule_marker: _m, ...rest } = item;
  return rest as RaceSchedule;
}
