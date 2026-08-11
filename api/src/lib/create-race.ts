import type { RaceCreatedEvent, Race } from '@token-derby/shared';
import { DEFAULT_MAX_PARTICIPANTS } from '@token-derby/shared';
import { randomUUID } from 'node:crypto';
import { generateRaceId, generateJoinCode, generateAdminCode } from './codes.js';
import { putRace, getRaceByJoinCode, listRacesByOrgId } from '../db/races.js';
import { countHorses } from '../db/horses.js';
import { getRaceSettings } from '../db/race-settings.js';
import { sendOrgWebhook } from './webhook.js';
import { sendOrgSlack } from './slack/send.js';
import type { OrgSlackConfig } from '../db/organisations.js';

export type CreateRaceOrg = {
  org_id: string;
  org_name: string;
  webhook_url?: string;
  webhook_secret?: string;
  slack?: OrgSlackConfig;
};

export type CreateRaceInput = {
  name: string;
  start_time: string;   // ISO 8601
  end_time: string;     // ISO 8601
  tz: string;
  max_participants?: number;
  counts_input?: boolean;
  primary_top5?: boolean;
  stamina?: boolean;
  creator_user_id: string;
  creator_user_name: string;
  cli_version?: string;
  org?: CreateRaceOrg | null;
  league?: { league_id: string; season: number; round: number };
};

export type CreateRaceResult =
  | { ok: true; race_id: string; join_code: string; admin_code: string }
  | { ok: false; code: 'RACE_OVERLAP'; message: string };

// Creates a race and, for org races, fires the race.created webhook. Orgs run
// one race at a time: a window overlapping an existing org race is rejected
// (best-effort check-then-write — also the idempotency net for the scheduler).
export async function createRace(input: CreateRaceInput): Promise<CreateRaceResult> {
  const start_ms = new Date(input.start_time).getTime();
  const end_ms = new Date(input.end_time).getTime();

  // Reused below to seed expected_field — the overlap check already pays for
  // this race-list read, so only the horse counts below are extra.
  let orgRaces: Race[] = [];
  if (input.org) {
    orgRaces = await listRacesByOrgId(input.org.org_id);
    const clash = orgRaces.find((r) => {
      const otherStart = new Date(r.start_time).getTime();
      const otherEnd = new Date(r.ended_at ?? r.end_time).getTime();
      return start_ms < otherEnd && end_ms > otherStart;
    });
    if (clash) {
      return {
        ok: false,
        code: 'RACE_OVERLAP',
        message: `"${input.org.org_name}" already has a race in that window: "${clash.name}" (${clash.join_code}). One race per org at a time.`,
      };
    }
  }
  const expected_field = input.org ? await meanExpectedField(orgRaces) : undefined;

  const join_code = await findUniqueJoinCode();
  const race_id = generateRaceId();
  const admin_code = generateAdminCode();
  const created_at = new Date().toISOString();
  const max_participants = input.max_participants ?? DEFAULT_MAX_PARTICIPANTS;

  // Snapshot the org's stamina config at creation time, not a live read —
  // scored_tokens accumulates under whatever values were stamped here, so a
  // later org config change must never rescore or alter an in-flight race.
  const settings = input.org ? await getRaceSettings(input.org.org_id) : null;
  const stamina_config = settings?.stamina_config;

  await putRace(
    {
      race_id,
      name: input.name,
      start_time: input.start_time,
      end_time: input.end_time,
      tz: input.tz,
      max_participants,
      join_code,
      created_at,
      creator_user_id: input.creator_user_id,
      creator_user_name: input.creator_user_name,
      ...(input.cli_version ? { cli_version: input.cli_version } : {}),
      ...(input.org ? { org_id: input.org.org_id, organisation_name: input.org.org_name } : {}),
      ...(input.counts_input ? { counts_input: true } : {}),
      ...(input.primary_top5 ? { primary_top5: true } : {}),
      ...(input.stamina ? { stamina: true } : {}),
      ...(stamina_config ? { stamina_config } : {}),
      ...(expected_field !== undefined ? { expected_field } : {}),
      ...(input.league
        ? { league_id: input.league.league_id, league_season: input.league.season, league_round: input.league.round }
        : {}),
    },
    admin_code,
  );

  if (input.org) {
    const payload: RaceCreatedEvent = {
      event: 'race.created',
      delivery_id: randomUUID(),
      sent_at: created_at,
      organisation: { org_id: input.org.org_id, org_name: input.org.org_name },
      race: {
        race_id,
        name: input.name,
        join_code,
        start_time: input.start_time,
        end_time: input.end_time,
        tz: input.tz,
        max_participants,
        created_at,
        creator_user_id: input.creator_user_id,
        creator_user_name: input.creator_user_name,
      },
    };
    await sendOrgWebhook(input.org, 'race.created', payload);
    await sendOrgSlack(input.org, 'race.created', payload);
  }

  return { ok: true, race_id, join_code, admin_code };
}

const EXPECTED_FIELD_WINDOW = 10;

// Mean actual attendance (horse count) across the org's most recent finished
// races. Gated on `ended_at`, not `end_time` — the latter is set at
// scheduling and says nothing about whether the race actually played out.
async function meanExpectedField(races: Race[]): Promise<number | undefined> {
  const finished = races.filter((r) => r.ended_at !== undefined).slice(0, EXPECTED_FIELD_WINDOW);
  if (finished.length === 0) return undefined;
  const counts = await Promise.all(finished.map((r) => countHorses(r.race_id)));
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  return Math.round(mean);
}

async function findUniqueJoinCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateJoinCode();
    const existing = await getRaceByJoinCode(code);
    if (!existing) return code;
  }
  throw new Error('Could not generate unique join code after 10 attempts');
}
