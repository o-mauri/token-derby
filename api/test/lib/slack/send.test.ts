import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Rest params and a widened result keep the call-args and mockResolvedValueOnce
// assertions below type-checkable.
const post = vi.fn(async (..._a: any[]): Promise<{ ok: boolean; error?: string }> => ({ ok: true }));
const ensure = vi.fn(async (..._a: any[]) => 'https://bucket/winners/x.png');
vi.mock('../../../src/lib/slack/client.js', () => ({ postSlackMessage: (...a: any[]) => post(...a) }));
vi.mock('../../../src/lib/slack/sprite-store.js', () => ({ ensureSprite: (...a: any[]) => ensure(...a) }));

import { sendOrgSlack, sendOrgRelease } from '../../../src/lib/slack/send.js';
import type { OrgSlackConfig } from '../../../src/db/organisations.js';

const slack: OrgSlackConfig = {
  bot_token: 'xoxb', channel_id: 'C1',
  messages: { race_created: true, race_ended: true, league_season_ended: true, weekly_digest: true, release_published: true },
};
const CREATED = { event: 'race.created', race: { name: 'R', join_code: 'AB1', start_time: '2026-05-21T17:00:00.000Z', end_time: '2026-05-21T17:30:00.000Z', tz: 'Europe/London' }, organisation: { org_id: 'o1', org_name: 'F' } } as any;
const ENDED = { event: 'race.ended', race: { name: 'R', tz: 'Europe/London' }, organisation: { org_id: 'o1', org_name: 'F' }, results: [{ rank: 1, name: 'Bolt', colors: { body: '#FF0000', mane: '#000', tail: '#000', saddle: '#c00' }, final_tokens: 1, user_name: 'Al' }] } as any;

beforeEach(() => { post.mockClear(); ensure.mockClear(); process.env.SPRITE_BUCKET = 'bucket'; });
afterEach(() => { delete process.env.SPRITE_BUCKET; });

describe('sendOrgSlack', () => {
  it('does nothing when slack is not configured', async () => {
    await sendOrgSlack({ org_id: 'o1', org_name: 'F' }, 'race.created', CREATED);
    expect(post).not.toHaveBeenCalled();
  });

  it('does nothing when the message toggle is off', async () => {
    const off = { ...slack, messages: { ...slack.messages, race_created: false } };
    await sendOrgSlack({ org_id: 'o1', org_name: 'F', slack: off }, 'race.created', CREATED);
    expect(post).not.toHaveBeenCalled();
  });

  it('posts race.created', async () => {
    await sendOrgSlack({ org_id: 'o1', org_name: 'F', slack }, 'race.created', CREATED);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]![1]).toBe('C1');
  });

  it('renders a sprite and posts race.ended', async () => {
    await sendOrgSlack({ org_id: 'o1', org_name: 'F', slack }, 'race.ended', ENDED);
    expect(ensure).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledOnce();
  });

  it('never throws when posting fails', async () => {
    post.mockRejectedValueOnce(new Error('boom'));
    await expect(sendOrgSlack({ org_id: 'o1', org_name: 'F', slack }, 'race.created', CREATED)).resolves.toBeUndefined();
  });
});

const RELEASE = {
  component: 'cli' as const, version: '2.13.0', date: '2026-07-28', changes: ['a fix'],
};

describe('sendOrgRelease', () => {
  it('returns false and posts nothing when slack is unconfigured', async () => {
    expect(await sendOrgRelease({ org_id: 'o1', org_name: 'F' }, RELEASE)).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('returns false and posts nothing when the toggle is off', async () => {
    const off = { ...slack, messages: { ...slack.messages, release_published: false } };
    expect(await sendOrgRelease({ org_id: 'o1', org_name: 'F', slack: off }, RELEASE)).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('posts and reports success', async () => {
    expect(await sendOrgRelease({ org_id: 'o1', org_name: 'F', slack }, RELEASE)).toBe(true);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]![1]).toBe('C1');
  });

  it('reports failure without throwing when Slack says no', async () => {
    post.mockResolvedValueOnce({ ok: false, error: 'channel_not_found' });
    expect(await sendOrgRelease({ org_id: 'o1', org_name: 'F', slack }, RELEASE)).toBe(false);
  });

  it('reports failure without throwing when the post rejects', async () => {
    post.mockRejectedValueOnce(new Error('boom'));
    expect(await sendOrgRelease({ org_id: 'o1', org_name: 'F', slack }, RELEASE)).toBe(false);
  });
});
