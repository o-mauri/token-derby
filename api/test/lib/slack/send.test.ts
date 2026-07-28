import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const post = vi.fn(async () => ({ ok: true }));
const ensure = vi.fn(async () => 'https://bucket/winners/x.png');
vi.mock('../../../src/lib/slack/client.js', () => ({ postSlackMessage: (...a: any[]) => post(...a) }));
vi.mock('../../../src/lib/slack/sprite-store.js', () => ({ ensureSprite: (...a: any[]) => ensure(...a) }));

import { sendOrgSlack } from '../../../src/lib/slack/send.js';
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
