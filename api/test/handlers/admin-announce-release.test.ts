import { describe, it, expect, vi } from 'vitest';
import './../setup.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { signSession } from '../../src/lib/admin-auth.js';

const SECRET = 'release-secret';
vi.mock('../../src/lib/admin-config.js', () => ({
  loadAdminConfig: vi.fn(async () => ({ username: 'omar', passwordHash: 'x:y', sessionSecret: SECRET })),
}));

const sent: any[] = [];
const failingOrgIds = new Set<string>();
vi.mock('../../src/lib/slack/send.js', () => ({
  sendOrgRelease: vi.fn(async (org: any) => { sent.push(org.org_id); return !failingOrgIds.has(org.org_id); }),
}));

import { handler } from '../../src/handlers/admin-announce-release.js';
import { putOrganisation, setOrgSlack, clearOrgSlack, type OrgSlackConfig } from '../../src/db/organisations.js';

const token = () => signSession(SECRET, { sub: 'admin', exp: Math.floor(Date.now() / 1000) + 60 });

function ev(body?: unknown, tok?: string): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (tok) headers['authorization'] = `Bearer ${tok}`;
  return { headers, body: body === undefined ? undefined : JSON.stringify(body) } as unknown as APIGatewayProxyEventV2;
}

const good = (version: string) => ({ component: 'cli', version, date: '2026-07-28', changes: ['a fix'] });
const call = (body?: unknown, tok?: string) => handler(ev(body, tok) as any, {} as any, {} as any) as Promise<any>;
const uniq = () => `9.9.${Math.floor(Math.random() * 100000)}`;

describe('admin-announce-release', () => {
  it('rejects a missing token with 401', async () => {
    const res = await call(good(uniq()));
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed payloads with 400', async () => {
    const bad: unknown[] = [
      undefined,
      { ...good(uniq()), component: 'desktop' },
      { ...good(uniq()), version: '2.13' },
      { ...good(uniq()), date: '28-07-2026' },
      { ...good(uniq()), changes: [] },
      { ...good(uniq()), changes: ['  '] },
      { ...good(uniq()), changes: Array.from({ length: 21 }, (_, i) => `c${i}`) },
    ];
    for (const body of bad) {
      const res = await call(body, token());
      expect(res.statusCode).toBe(400);
    }
  });

  it('announces once and reports the org count', async () => {
    sent.length = 0;
    const id = `ann-${Date.now()}`;
    await putOrganisation({ org_id: id, org_name: `Ann${Date.now()}`, creator_user_id: 'u1', created_at: 'now' } as any, `jt-${id}`);
    const cfg: OrgSlackConfig = {
      bot_token: 'xoxb', channel_id: 'C1',
      messages: { race_created: false, race_ended: false, league_season_ended: false, weekly_digest: false, release_published: true },
    };
    await setOrgSlack(id, cfg);

    const version = uniq();
    const first = await call(good(version), token());
    expect(first.statusCode).toBe(200);
    const body = JSON.parse(first.body);
    expect(body.announced).toBe(true);
    expect(body.orgs_notified).toBe(1);
    expect(sent).toContain(id);

    const before = sent.length;
    const second = await call(good(version), token());
    expect(JSON.parse(second.body)).toEqual({ announced: false, reason: 'duplicate' });
    expect(sent.length).toBe(before);

    await clearOrgSlack(id);
  });

  it('counts only successful sends, not attempted ones', async () => {
    sent.length = 0;
    failingOrgIds.clear();
    const okId = `ann-ok-${Date.now()}`;
    const failId = `ann-fail-${Date.now()}`;
    await putOrganisation({ org_id: okId, org_name: `AnnOk${Date.now()}`, creator_user_id: 'u1', created_at: 'now' } as any, `jt-${okId}`);
    await putOrganisation({ org_id: failId, org_name: `AnnFail${Date.now()}`, creator_user_id: 'u1', created_at: 'now' } as any, `jt-${failId}`);
    const cfg: OrgSlackConfig = {
      bot_token: 'xoxb', channel_id: 'C1',
      messages: { race_created: false, race_ended: false, league_season_ended: false, weekly_digest: false, release_published: true },
    };
    await setOrgSlack(okId, cfg);
    await setOrgSlack(failId, cfg);
    failingOrgIds.add(failId);

    const version = uniq();
    const res = await call(good(version), token());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.announced).toBe(true);
    // Both orgs are attempted (present in `sent`), but only the successful
    // one counts — an unconditional `orgs_notified += 1` would report 2 here.
    expect(sent).toContain(okId);
    expect(sent).toContain(failId);
    expect(body.orgs_notified).toBe(1);

    failingOrgIds.delete(failId);
    await clearOrgSlack(okId);
    await clearOrgSlack(failId);
  });
});
