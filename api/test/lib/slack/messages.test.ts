import { describe, it, expect } from 'vitest';
import { buildRaceCreatedMessage, buildRaceEndedMessage, buildWeeklyDigestMessage } from '../../../src/lib/slack/messages.js';
import type { RaceCreatedEvent, RaceEndedEvent, GetOrgLeaderboardResponse } from '@token-derby/shared';

const COLORS = { body: '#FF0000', mane: '#000000', tail: '#000000', saddle: '#CC0000' };

const CREATED = {
  event: 'race.created', delivery_id: 'd1', sent_at: '2026-05-20T17:00:00.000Z',
  organisation: { org_id: 'o1', org_name: 'TeamFoo' },
  race: { race_id: 'r1', name: 'Friday Sprint', join_code: 'AB7XQ2',
    start_time: '2026-05-21T17:00:00.000Z', end_time: '2026-05-21T17:30:00.000Z',
    tz: 'Europe/London', max_participants: 20, created_at: '2026-05-20T17:00:00.000Z',
    creator_user_id: 'u1', creator_user_name: 'Al' },
} as unknown as RaceCreatedEvent;

const ENDED = {
  event: 'race.ended', delivery_id: 'd2', sent_at: '2026-05-20T17:30:00.000Z',
  organisation: { org_id: 'o1', org_name: 'TeamFoo' },
  race: { race_id: 'r1', name: 'Friday Sprint', join_code: 'AB7XQ2', start_time: 'x', end_time: 'y', tz: 'Europe/London', created_at: 'z', ended_at: 'w' },
  results: [{ rank: 1, horse_id: 'h1', stable_horse_id: 's1', name: 'Bolt', colors: COLORS, final_tokens: 42, xp_awarded: 10, user_id: 'u1', user_name: 'Al' }],
} as unknown as RaceEndedEvent;

const LEADERBOARD: GetOrgLeaderboardResponse = {
  org_name: 'TeamFoo',
  horses: [
    { name: 'Bolt', owner_name: 'Al', wins: 3, podiums: 5, xp: 100, races_entered: 8 },
    { name: 'Dash', owner_name: 'Bo', wins: 1, podiums: 2, xp: 40, races_entered: 4 },
  ],
};

describe('message builders', () => {
  it('race created includes join code', () => {
    const m = buildRaceCreatedMessage(CREATED);
    expect(m.text).toContain('AB7XQ2');
    expect(m.blocks[0]!.type).toBe('header');
  });

  it('race ended lists the winner and embeds the sprite when given a url', () => {
    const m = buildRaceEndedMessage(ENDED, 'https://bucket/winners/x.png');
    expect(m.text).toContain('Bolt');
    expect(m.blocks.some((b: any) => b.type === 'image' && b.image_url.includes('winners'))).toBe(true);
  });

  it('race ended omits the image block when no sprite url', () => {
    const m = buildRaceEndedMessage(ENDED);
    expect(m.blocks.some((b: any) => b.type === 'image')).toBe(false);
  });

  it('weekly digest ranks by wins/podiums/xp', () => {
    const m = buildWeeklyDigestMessage(LEADERBOARD);
    expect(m.text).toContain('TeamFoo');
    expect(m.blocks.some((b: any) => b.text?.text?.includes('Most Wins'))).toBe(true);
    expect(m.blocks.some((b: any) => b.text?.text?.includes('Most XP'))).toBe(true);
  });
});
