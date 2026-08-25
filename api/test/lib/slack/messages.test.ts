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

  it('race ended prints the scored figure, not raw tokens, on a stamina race', () => {
    const staminaEnded = {
      ...ENDED,
      results: [
        { rank: 1, horse_id: 'h1', stable_horse_id: 's1', name: 'Bolt', colors: COLORS, final_tokens: 10_000, final_scored_tokens: 8_000, xp_awarded: 10, user_id: 'u1', user_name: 'Al' },
        { rank: 2, horse_id: 'h2', stable_horse_id: 's2', name: 'Dobbin', colors: COLORS, final_tokens: 9_000, final_scored_tokens: 9_000, xp_awarded: 5, user_id: 'u2', user_name: 'Bo' },
      ],
    } as unknown as RaceEndedEvent;
    const m = buildRaceEndedMessage(staminaEnded);
    const text = m.blocks.find((b: any) => b.type === 'section')!.text.text as string;
    expect(text).toContain('8000 tokens');
    expect(text).not.toContain('10000 tokens');
  });

  it('weekly digest ranks by wins/podiums/xp', () => {
    const m = buildWeeklyDigestMessage(LEADERBOARD);
    expect(m.text).toContain('TeamFoo');
    expect(m.blocks.some((b: any) => b.text?.text?.includes('Most Wins'))).toBe(true);
    expect(m.blocks.some((b: any) => b.text?.text?.includes('Most XP'))).toBe(true);
  });
});

describe('the live race link on a starting race', () => {
  it('is a clickable Slack link carrying the scheme and the join code', () => {
    const msg = buildRaceCreatedMessage(CREATED);
    const flat = JSON.stringify(msg.blocks);
    // Slack only renders <url|label>; a bare hostname posts as plain text, which
    // is what the changelog line elsewhere in this file still does.
    expect(flat).toContain('<https://token-derby.mauricode.co.uk/race/AB7XQ2|');
  });

  it('points at the join code of this race, not a fixed URL', () => {
    const other = { ...CREATED, race: { ...(CREATED as any).race, join_code: 'ZZ9WQ1' } } as any;
    const flat = JSON.stringify(buildRaceCreatedMessage(other).blocks);
    expect(flat).toContain('/race/ZZ9WQ1|');
    expect(flat).not.toContain('AB7XQ2');
  });
});
