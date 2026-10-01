import { randomUUID } from 'node:crypto';
import { putRace } from '../../src/db/races.js';
import { putHorse } from '../../src/db/horses.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../../src/db/client.js';
import { horseKey } from '../../src/db/keys.js';
import { makeUser, makeHorse } from './auth-helper.js';
import type { Horse, Race } from '@token-derby/shared';
import { FIELD_MEDIAN_PACE } from '@token-derby/shared';

// Pass a shared object with `reuse: true` to keep the first horse's
// user/stable-horse identity stable across repeated seedRace calls (so pace
// history can be asserted across races for the same jockey).
export type SeedRaceJockey = {
  reuse?: boolean;
  user_id?: string;
  stable_horse_id?: string;
};

export type SeedRaceOptions = {
  distinct_jockeys: number;
  duration_hours: number;
  tokens: number[];
  scored?: number[];
  jockey?: SeedRaceJockey;
  // Anchor instant. All horses join at (now - duration_hours) and the race
  // is finalised (by the caller) at `now` — pass it through to finaliseRace
  // to keep the enrolled window exact rather than drifting with wall clock.
  now?: Date;
};

export type SeedRaceResult = {
  race: Race;
  horses: Horse[];
  now: Date;
};

export async function seedRace(opts: SeedRaceOptions): Promise<SeedRaceResult> {
  const now = opts.now ?? new Date();
  const startMs = now.getTime() - opts.duration_hours * 3_600_000;
  const start_time = new Date(startMs).toISOString();
  const race_id = `sr-${randomUUID()}`;

  const race: Race = {
    race_id,
    name: 'Seeded Race',
    start_time,
    end_time: now.toISOString(),
    tz: 'UTC',
    max_participants: 30,
    join_code: `J${randomUUID().slice(0, 6).toUpperCase()}`,
    created_at: start_time,
  };
  await putRace(race, `admin-${race_id}`);

  const horses: Horse[] = [];
  for (let i = 0; i < opts.tokens.length; i++) {
    const label = `Runner${i}-${randomUUID().slice(0, 6)}`;
    let user_id: string;
    let stable_horse_id: string;

    if (i === 0 && opts.jockey?.reuse && opts.jockey.user_id && opts.jockey.stable_horse_id) {
      user_id = opts.jockey.user_id;
      stable_horse_id = opts.jockey.stable_horse_id;
    } else {
      const user = await makeUser(label);
      const stableHorse = await makeHorse(user, label);
      user_id = user.user_id;
      stable_horse_id = stableHorse.stable_horse_id;
      if (i === 0 && opts.jockey) {
        opts.jockey.user_id = user_id;
        opts.jockey.stable_horse_id = stable_horse_id;
      }
    }

    const horse: Horse = {
      horse_id: `h-${randomUUID()}`,
      stable_horse_id,
      name: label,
      colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
      current_tokens: opts.tokens[i]!,
      ...(opts.scored ? { scored_tokens: opts.scored[i]! } : {}),
      last_heartbeat: now.toISOString(),
      joined_at: start_time,
      user_id,
      user_name: label,
      xp: 0,
    };
    await putHorse(race_id, horse, `tok-${horse.horse_id}`);
    horses.push(horse);
  }

  return { race, horses, now };
}

export async function setHorseSpanForTest(race_id: string, horse_id: string, first: string, last: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression: 'SET first_scored_at = :f, last_scored_at = :l',
    ExpressionAttributeValues: { ':f': first, ':l': last },
  }));
}

// For market-pricing tests: a race anchored `elapsedMin` minutes into its
// run, with horses joined at the off. Bypasses the jockey/stable-horse
// handlers (pricing never reads them) so seeding stays fast.
export type SeedLiveRaceOptions = {
  runners: number;
  elapsedMin: number;
  durationHours?: number;   // total race length; default keeps it live well past elapsedMin
  tokens?: number[];        // per-horse current_tokens; default a plausible banked amount
  priorPace?: number[];     // per-horse prior_pace; default FIELD_MEDIAN_PACE
  orgId?: string;
  // Minutes after the off of each horse's first and last scoring beat.
  firstScoredMin?: number[];
  lastScoredMin?: number[];
  league?: { league_id: string; season: number };
};

export type SeedLiveRaceResult = {
  race: Race;
  horses: Horse[];
};

export async function seedLiveRace(opts: SeedLiveRaceOptions): Promise<SeedLiveRaceResult> {
  const now = Date.now();
  const durationHours = opts.durationHours ?? 4;
  const startMs = now - opts.elapsedMin * 60_000;
  const endMs = startMs + durationHours * 3_600_000;
  const start_time = new Date(startMs).toISOString();
  const race_id = `slr-${randomUUID()}`;

  const race: Race = {
    race_id,
    name: 'Live Seeded Race',
    start_time,
    end_time: new Date(endMs).toISOString(),
    tz: 'UTC',
    max_participants: 30,
    join_code: `J${randomUUID().slice(0, 6).toUpperCase()}`,
    created_at: start_time,
    ...(opts.orgId ? { org_id: opts.orgId } : {}),
    ...(opts.league ? { league_id: opts.league.league_id, league_season: opts.league.season } : {}),
  };
  await putRace(race, `admin-${race_id}`);

  const horses: Horse[] = [];
  for (let i = 0; i < opts.runners; i++) {
    const horse: Horse = {
      horse_id: `h-${randomUUID()}`,
      stable_horse_id: `sh-${randomUUID()}`,
      name: `Runner${i}`,
      colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
      current_tokens: opts.tokens?.[i] ?? Math.round(FIELD_MEDIAN_PACE * opts.elapsedMin),
      last_heartbeat: new Date(now).toISOString(),
      joined_at: start_time,
      user_id: `u-${randomUUID()}`,
      user_name: `Runner${i}`,
      xp: 0,
      prior_pace: opts.priorPace?.[i] ?? FIELD_MEDIAN_PACE,
      ...(opts.firstScoredMin?.[i] !== undefined
        ? { first_scored_at: new Date(startMs + opts.firstScoredMin[i]! * 60_000).toISOString() } : {}),
      ...(opts.lastScoredMin?.[i] !== undefined
        ? { last_scored_at: new Date(startMs + opts.lastScoredMin[i]! * 60_000).toISOString() } : {}),
    };
    await putHorse(race_id, horse, `tok-${horse.horse_id}`);
    horses.push(horse);
  }

  return { race, horses };
}
