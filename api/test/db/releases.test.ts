import { describe, it, expect } from 'vitest';
import './../setup.js';
import { claimRelease } from '../../src/db/releases.js';
import type { AnnounceReleaseRequest } from '@token-derby/shared';
import { putOrganisation, setOrgSlack, listOrgsWithSlackRelease, type OrgSlackConfig } from '../../src/db/organisations.js';

function release(version: string, component: 'cli' | 'site' = 'cli'): AnnounceReleaseRequest {
  return { component, version, date: '2026-07-28', changes: ['first thing'] };
}

describe('release markers', () => {
  it('claims a version at most once', async () => {
    const v = `2.13.${Date.now() % 1000}`;
    expect(await claimRelease(release(v))).toBe(true);
    expect(await claimRelease(release(v))).toBe(false);
  });

  it('tracks cli and site versions independently', async () => {
    const v = `3.0.${Date.now() % 1000}`;
    expect(await claimRelease(release(v, 'cli'))).toBe(true);
    expect(await claimRelease(release(v, 'site'))).toBe(true);
  });
});

const BASE: OrgSlackConfig = {
  bot_token: 'xoxb', channel_id: 'C1',
  messages: { race_created: true, race_ended: true, league_season_ended: false, weekly_digest: false, release_published: false },
};

describe('listOrgsWithSlackRelease', () => {
  it('returns only orgs with release_published enabled', async () => {
    const on = `rel-on-${Date.now()}`;
    const off = `rel-off-${Date.now()}`;
    for (const id of [on, off]) {
      await putOrganisation({ org_id: id, org_name: `Org${id.slice(0, 8)}`, creator_user_id: 'u1', created_at: 'now' } as any, `jt-${id}`);
    }
    await setOrgSlack(on, { ...BASE, messages: { ...BASE.messages, release_published: true } });
    await setOrgSlack(off, BASE);

    const ids = (await listOrgsWithSlackRelease()).map((o) => o.org_id);
    expect(ids).toContain(on);
    expect(ids).not.toContain(off);
  });
});
