import { PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { horseKey, parseHorseId, RACE_PK_PREFIX, HORSE_SK_PREFIX } from './keys.js';
import type { Horse, RecentEvent } from '@token-derby/shared';
import type { AchievementState } from '../lib/evaluate-achievements.js';

export async function putHorse(race_id: string, horse: Horse, heartbeat_token: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...horseKey(race_id, horse.horse_id),
      ...horse,
      heartbeat_token,
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function listHorses(race_id: string): Promise<Horse[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :hp)',
    ExpressionAttributeValues: {
      ':pk': `${RACE_PK_PREFIX}${race_id}`,
      ':hp': HORSE_SK_PREFIX,
    },
  }));
  return Items.map(pickHorse);
}

export async function updateHorseHeartbeat(
  race_id: string,
  horse_id: string,
  current_tokens: number,
  last_heartbeat: string,
  state: AchievementState,
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression:
      'SET current_tokens = :t, last_heartbeat = :h, live_xp = :lx, ' +
      'last_rank = :lr, racer_streak_ms = :rs, racer_awards = :ra, ' +
      'pacesetter_streak_ms = :ps, pacesetter_awards = :pa, ' +
      'overtake_awards = :oa, lead_take_awards = :lta, ' +
      'was_in_last = :wil, comeback_awarded = :ca, ' +
      'recent_events = :re' +
      stampedeFragment(state) + pulledAwayFragment(state) + gapFragment(state),
    ExpressionAttributeValues: {
      ':t': current_tokens,
      ':h': last_heartbeat,
      ':lx': state.live_xp,
      ':lr': state.last_rank ?? null,
      ':rs': state.racer_streak_ms,
      ':ra': state.racer_awards,
      ':ps': state.pacesetter_streak_ms,
      ':pa': state.pacesetter_awards,
      ':oa': state.overtake_awards,
      ':lta': state.lead_take_awards,
      ':wil': state.was_in_last,
      ':ca': state.comeback_awarded,
      ':re': state.recent_events,
      ...(state.last_stampede_at !== undefined ? { ':sa': state.last_stampede_at } : {}),
      ...(state.last_pulled_away_at !== undefined ? { ':pwa': state.last_pulled_away_at } : {}),
      ...(state.last_gap_in_1st !== undefined ? { ':g': state.last_gap_in_1st } : {}),
    },
    ConditionExpression: 'attribute_exists(pk)',
  }));
}

function stampedeFragment(s: AchievementState): string {
  return s.last_stampede_at !== undefined ? ', last_stampede_at = :sa' : '';
}
function pulledAwayFragment(s: AchievementState): string {
  return s.last_pulled_away_at !== undefined ? ', last_pulled_away_at = :pwa' : '';
}
function gapFragment(s: AchievementState): string {
  return s.last_gap_in_1st !== undefined ? ', last_gap_in_1st = :g' : '';
}

export async function setHorseFinalTokens(
  race_id: string,
  horse_id: string,
  final_tokens: number,
): Promise<void> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: horseKey(race_id, horse_id),
      UpdateExpression: 'SET final_tokens = :f',
      ConditionExpression: 'attribute_not_exists(final_tokens)',
      ExpressionAttributeValues: { ':f': final_tokens },
    }));
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

// Conditional XP-award marker. Only the first caller succeeds; subsequent
// callers return false so the stable-horse XP increment is not repeated.
export async function setHorseXpAwarded(
  race_id: string,
  horse_id: string,
  xp_awarded: number,
): Promise<boolean> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: horseKey(race_id, horse_id),
      UpdateExpression: 'SET xp_awarded = :x',
      ConditionExpression: 'attribute_not_exists(xp_awarded)',
      ExpressionAttributeValues: { ':x': xp_awarded },
    }));
    return true;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

export type HorseHeartbeatRecord = {
  current_tokens: number;
  last_heartbeat: string;
  live_xp: number;
  last_rank: number | undefined;
  racer_streak_ms: number;
  racer_awards: number;
  pacesetter_streak_ms: number;
  pacesetter_awards: number;
  overtake_awards: number;
  lead_take_awards: number;
  last_stampede_at: number | undefined;
  was_in_last: boolean;
  comeback_awarded: boolean;
  last_gap_in_1st: number | undefined;
  last_pulled_away_at: number | undefined;
  recent_events: RecentEvent[];
};

export async function getHorseForHeartbeat(
  race_id: string,
  horse_id: string,
  heartbeat_token: string,
): Promise<HorseHeartbeatRecord | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
  }));
  if (!Item || Item.heartbeat_token !== heartbeat_token) return null;
  return {
    current_tokens: Number(Item.current_tokens ?? 0),
    last_heartbeat: String(Item.last_heartbeat ?? ''),
    live_xp: Number(Item.live_xp ?? 0),
    last_rank: Item.last_rank == null ? undefined : Number(Item.last_rank),
    racer_streak_ms: Number(Item.racer_streak_ms ?? 0),
    racer_awards: Number(Item.racer_awards ?? 0),
    pacesetter_streak_ms: Number(Item.pacesetter_streak_ms ?? 0),
    pacesetter_awards: Number(Item.pacesetter_awards ?? 0),
    overtake_awards: Number(Item.overtake_awards ?? 0),
    lead_take_awards: Number(Item.lead_take_awards ?? 0),
    last_stampede_at: Item.last_stampede_at == null ? undefined : Number(Item.last_stampede_at),
    was_in_last: Boolean(Item.was_in_last ?? false),
    comeback_awarded: Boolean(Item.comeback_awarded ?? false),
    last_gap_in_1st: Item.last_gap_in_1st == null ? undefined : Number(Item.last_gap_in_1st),
    last_pulled_away_at: Item.last_pulled_away_at == null ? undefined : Number(Item.last_pulled_away_at),
    recent_events: Array.isArray(Item.recent_events) ? (Item.recent_events as RecentEvent[]) : [],
  };
}

export async function findHorseByUser(race_id: string, user_id: string): Promise<Horse | null> {
  const horses = await listHorses(race_id);
  return horses.find(h => h.user_id === user_id) ?? null;
}

export async function rotateHeartbeatToken(
  race_id: string,
  horse_id: string,
  new_token: string,
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression: 'SET heartbeat_token = :t',
    ExpressionAttributeValues: { ':t': new_token },
    ConditionExpression: 'attribute_exists(pk)',
  }));
}

export async function countHorses(race_id: string): Promise<number> {
  const { Count = 0 } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :hp)',
    ExpressionAttributeValues: {
      ':pk': `${RACE_PK_PREFIX}${race_id}`,
      ':hp': HORSE_SK_PREFIX,
    },
    Select: 'COUNT',
  }));
  return Count;
}

function pickHorse(item: Record<string, any>): Horse {
  const horse_id = parseHorseId(item.sk);
  if (!horse_id) throw new Error(`not a horse item: ${item.sk}`);
  const { pk: _pk, sk: _sk, heartbeat_token: _hb, ...rest } = item;
  return { ...rest, horse_id } as Horse;
}
