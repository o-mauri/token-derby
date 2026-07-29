import { describe, it, expect } from 'vitest';
import './../setup.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../../src/db/client.js';
import { putOrganisation, getOrganisationById, setOrgSlack, clearOrgSlack, markDigestSent } from '../../src/db/organisations.js';
import type { OrgSlackConfig } from '../../src/db/organisations.js';

// Reads the sparse index directly: the index name and marker value are a
// persistent infra contract, so they are spelled out rather than imported.
async function orgIdsOnSlackIndex(): Promise<string[]> {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'SlackOrgsIndex',
    KeyConditionExpression: 'slack_marker = :m',
    ExpressionAttributeValues: { ':m': 'SLACK' },
  }));
  return (res.Items ?? []).map((i) => i.org_id as string);
}

const CONFIG: OrgSlackConfig = {
  bot_token: 'xoxb-secret', channel_id: 'C1',
  messages: { race_created: true, race_ended: true, league_season_ended: false, weekly_digest: true, release_published: false },
  digest: { weekday: 5, time_local: '15:00', tz: 'Europe/London' },
};

async function seedOrg(id: string) {
  await putOrganisation({ org_id: id, org_name: `Org${id.slice(0, 6)}`, creator_user_id: 'u1', created_at: 'now' } as any, `jt-${id}`);
}

describe('org slack db', () => {
  it('round-trips config and clears it', async () => {
    const id = `slack-${Date.now()}`;
    await seedOrg(id);
    await setOrgSlack(id, CONFIG);
    let org = await getOrganisationById(id);
    expect(org!.slack!.bot_token).toBe('xoxb-secret');
    expect(org!.slack!.digest!.weekday).toBe(5);
    await clearOrgSlack(id);
    org = await getOrganisationById(id);
    expect(org!.slack).toBeUndefined();
  });

  it('indexes the org on SlackOrgsIndex while slack is configured', async () => {
    const id = `marker-${Date.now()}`;
    await seedOrg(id);
    expect(await orgIdsOnSlackIndex()).not.toContain(id);

    await setOrgSlack(id, CONFIG);
    expect(await orgIdsOnSlackIndex()).toContain(id);

    await clearOrgSlack(id);
    expect(await orgIdsOnSlackIndex()).not.toContain(id);
  });

  it('keeps the index marker out of the returned org record', async () => {
    const id = `strip-${Date.now()}`;
    await seedOrg(id);
    await setOrgSlack(id, CONFIG);
    const org = await getOrganisationById(id);
    expect(org).not.toHaveProperty('slack_marker');
  });

  it('markDigestSent claims a date at most once', async () => {
    const id = `digest-${Date.now()}`;
    await seedOrg(id);
    await setOrgSlack(id, CONFIG);
    expect(await markDigestSent(id, '2026-07-10')).toBe(true);
    expect(await markDigestSent(id, '2026-07-10')).toBe(false);   // same day, already claimed
    expect(await markDigestSent(id, '2026-07-17')).toBe(true);    // new day
  });
});
