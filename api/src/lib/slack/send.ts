import { S3Client } from '@aws-sdk/client-s3';
import type {
  RaceCreatedEvent, RaceEndedEvent, LeagueSeasonEndedEvent, GetOrgLeaderboardResponse,
} from '@token-derby/shared';
import type { OrgSlackConfig } from '../../db/organisations.js';
import { postSlackMessage } from './client.js';
import { ensureSprite } from './sprite-store.js';
import {
  buildRaceCreatedMessage, buildRaceEndedMessage, buildLeagueSeasonEndedMessage, buildWeeklyDigestMessage,
  type SlackMessage,
} from './messages.js';

export type OrgWithSlack = { org_id: string; org_name: string; slack?: OrgSlackConfig };

let s3: S3Client | undefined;
function getS3(): S3Client {
  if (!s3) s3 = new S3Client({ region: process.env.AWS_REGION ?? 'eu-west-2' });
  return s3;
}

function log(org_id: string, event: string, error: unknown): void {
  console.warn('slack post failed', { org_id, event, error: error instanceof Error ? error.message : String(error) });
}

async function post(org: OrgWithSlack, msg: SlackMessage): Promise<void> {
  const cfg = org.slack!;
  const res = await postSlackMessage(cfg.bot_token, cfg.channel_id, msg.text, msg.blocks);
  if (!res.ok) console.warn('slack chat.postMessage non-ok', { org_id: org.org_id, error: res.error });
}

export async function sendOrgSlack(org: OrgWithSlack, event: 'race.created', payload: RaceCreatedEvent): Promise<void>;
export async function sendOrgSlack(org: OrgWithSlack, event: 'race.ended', payload: RaceEndedEvent): Promise<void>;
export async function sendOrgSlack(org: OrgWithSlack, event: 'league.season.ended', payload: LeagueSeasonEndedEvent): Promise<void>;
export async function sendOrgSlack(org: OrgWithSlack, event: string, payload: any): Promise<void> {
  const cfg = org.slack;
  if (!cfg) return;
  try {
    if (event === 'race.created') {
      if (!cfg.messages.race_created) return;
      await post(org, buildRaceCreatedMessage(payload as RaceCreatedEvent));
    } else if (event === 'race.ended') {
      if (!cfg.messages.race_ended) return;
      const ended = payload as RaceEndedEvent;
      let spriteUrl: string | undefined;
      const winner = ended.results?.[0];
      const bucket = process.env.SPRITE_BUCKET;
      if (winner && bucket) {
        try { spriteUrl = await ensureSprite(getS3(), bucket, winner.colors); }
        catch (err) { console.warn('sprite upload failed', { org_id: org.org_id, error: err instanceof Error ? err.message : String(err) }); }
      }
      await post(org, buildRaceEndedMessage(ended, spriteUrl));
    } else if (event === 'league.season.ended') {
      if (!cfg.messages.league_season_ended) return;
      await post(org, buildLeagueSeasonEndedMessage(payload as LeagueSeasonEndedEvent));
    }
  } catch (err) {
    log(org.org_id, event, err);
  }
}

export async function sendOrgDigest(org: OrgWithSlack, leaderboard: GetOrgLeaderboardResponse): Promise<void> {
  const cfg = org.slack;
  if (!cfg || !cfg.messages.weekly_digest) return;
  try {
    await post(org, buildWeeklyDigestMessage(leaderboard));
  } catch (err) {
    log(org.org_id, 'weekly_digest', err);
  }
}
