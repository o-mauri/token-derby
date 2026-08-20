import { describe, it, expect } from 'vitest';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { buildOrgLeaderboard } from '../../src/lib/org-leaderboard.js';
import { addMember } from '../../src/db/organisations.js';
import { putStableHorse } from '../../src/db/stable.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { StableHorse } from '@token-derby/shared';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function createEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: {
      'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id, 'x-user-token': user.secret_token,
    },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  };
}

function uid(): string { return String(Date.now()).slice(-6); }

function horse(id: string, name: string, stats: Partial<StableHorse>): StableHorse {
  return {
    stable_horse_id: id, name, colors: { body: '#1', mane: '#2', tail: '#3', saddle: '#4' },
    created_at: new Date().toISOString(), xp: 0, ...stats,
  };
}

describe('buildOrgLeaderboard', () => {
  it('returns org horses sorted by xp desc with mapped stats', async () => {
    const alice = await makeUser('OLB_Alice');
    const orgName = `OLBrd${uid()}`;
    const created: any = await createOrg(createEvent(orgName, alice));
    const { org_id } = JSON.parse(created.body);

    const bob = await makeUser('OLB_Bob');
    await addMember(org_id, bob.user_id, new Date().toISOString());

    await putStableHorse(alice.user_id, horse('h-a', 'Comet', { xp: 300, wins: 5, podiums: 8, races_entered: 12 }));
    await putStableHorse(bob.user_id,   horse('h-b', 'Bolt',  { xp: 900, wins: 2, podiums: 3, races_entered: 4 }));

    const result = await buildOrgLeaderboard({ org_id, org_name: orgName });
    expect(result.org_name).toBe(orgName);
    expect(result.horses.map(h => h.name)).toEqual(['Bolt', 'Comet']); // xp desc

    const comet = result.horses.find(h => h.name === 'Comet');
    expect(comet).toMatchObject({ owner_name: 'OLB_Alice', wins: 5, podiums: 8, xp: 300, races_entered: 12 });
  });

  it('returns empty horses for an org with no horses', async () => {
    const alice = await makeUser('OLB_Empty');
    const orgName = `OLBEm${uid()}`;
    const created: any = await createOrg(createEvent(orgName, alice));
    const { org_id } = JSON.parse(created.body);

    const result = await buildOrgLeaderboard({ org_id, org_name: orgName });
    expect(result.horses).toEqual([]);
  });
});
