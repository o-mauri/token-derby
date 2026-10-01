import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../src/handlers/remove-org-member.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { addMember, isMember, listOrgMembers } from '../../src/db/organisations.js';
import { ensureStanding, listSeasonStandings } from '../../src/db/league-standings.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import type { LeagueStanding } from '@token-derby/shared';

const rand = () => Math.random().toString(36).slice(2, 8);
const orgName = (prefix: string) => `${prefix}${rand()}`.slice(0, 12);

function removeEvent(org_name: string, user_id: string, caller: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (caller) {
    headers['x-user-id'] = caller.user_id;
    headers['x-user-token'] = caller.secret_token;
  }
  return {
    version: '2.0',
    routeKey: 'DELETE /organisations/{org_name}/members/{user_id}',
    rawPath: `/organisations/${org_name}/members/${user_id}`,
    rawQueryString: '',
    headers,
    pathParameters: { org_name, user_id },
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

async function createOrg(user: TestUser, name: string): Promise<string> {
  const res: any = await createOrgHandler({
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ name }),
    isBase64Encoded: false,
  });
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
  return JSON.parse(res.body).org_id;
}

function standingFor(org_id: string, user_id: string): LeagueStanding {
  return {
    org_id,
    season: 1,
    division: 1,
    stable_horse_id: `sh-${user_id}`,
    horse_name: 'Old Glory',
    user_id,
    user_name: 'Someone',
    points: 42,
    season_tokens: 7,
    entered_at: new Date().toISOString(),
  };
}

describe('remove-org-member handler', () => {
  it('owner removes a member: isMember goes false and they drop from listOrgMembers', async () => {
    const owner = await makeUser('RmOwner1');
    const name = orgName('RmOrg1');
    const org_id = await createOrg(owner, name);
    const member = await makeUser('RmMember1');
    await addMember(org_id, member.user_id, new Date().toISOString());
    expect(await isMember(org_id, member.user_id)).toBe(true);

    const res: any = await handler(removeEvent(name, member.user_id, owner));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    expect(await isMember(org_id, member.user_id)).toBe(false);
    expect((await listOrgMembers(org_id)).some(m => m.user_id === member.user_id)).toBe(false);
  });

  it('a non-owner member cannot remove anyone, and the target survives', async () => {
    const owner = await makeUser('RmOwner2');
    const name = orgName('RmOrg2');
    const org_id = await createOrg(owner, name);
    const member = await makeUser('RmMember2');
    const target = await makeUser('RmTarget2');
    await addMember(org_id, member.user_id, new Date().toISOString());
    await addMember(org_id, target.user_id, new Date().toISOString());

    const res: any = await handler(removeEvent(name, target.user_id, member));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');

    // Load-bearing: the target must still be a member, not merely that a 403 came back.
    expect(await isMember(org_id, target.user_id)).toBe(true);
    expect((await listOrgMembers(org_id)).some(m => m.user_id === target.user_id)).toBe(true);
  });

  it('the creator cannot be removed, even by themselves', async () => {
    const owner = await makeUser('RmOwner3');
    const name = orgName('RmOrg3');
    const org_id = await createOrg(owner, name);

    const res: any = await handler(removeEvent(name, owner.user_id, owner));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('CANNOT_REMOVE_OWNER');

    expect(await isMember(org_id, owner.user_id)).toBe(true);
  });

  it('a member cannot remove the owner (fails on the owner gate first)', async () => {
    const owner = await makeUser('RmOwner4');
    const name = orgName('RmOrg4');
    const org_id = await createOrg(owner, name);
    const member = await makeUser('RmMember4');
    await addMember(org_id, member.user_id, new Date().toISOString());

    const res: any = await handler(removeEvent(name, owner.user_id, member));
    expect(res.statusCode).toBe(403);

    // Assert the outcome, not the reason: the owner survives regardless of which check fired.
    expect(await isMember(org_id, owner.user_id)).toBe(true);
  });

  it('removing a non-member 404s rather than reporting success', async () => {
    const owner = await makeUser('RmOwner5');
    const name = orgName('RmOrg5');
    await createOrg(owner, name);
    const outsider = await makeUser('RmOutsider5');

    const res: any = await handler(removeEvent(name, outsider.user_id, owner));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('USER_NOT_FOUND');
  });

  it("a removed member's existing league standings are intact", async () => {
    const owner = await makeUser('RmOwner6');
    const name = orgName('RmOrg6');
    const org_id = await createOrg(owner, name);
    const member = await makeUser('RmMember6');
    await addMember(org_id, member.user_id, new Date().toISOString());
    const standing = standingFor(org_id, member.user_id);
    await ensureStanding(standing);

    const res: any = await handler(removeEvent(name, member.user_id, owner));
    expect(res.statusCode).toBe(200);

    const standings = await listSeasonStandings(org_id, 1);
    const found = standings.find(s => s.stable_horse_id === standing.stable_horse_id);
    expect(found).toBeDefined();
    expect(found!.points).toBe(42);
    expect(found!.season_tokens).toBe(7);
  });

  it('removing from one org does not affect the same user\'s membership of another', async () => {
    const ownerA = await makeUser('RmOwnerA7');
    const nameA = orgName('RmOrgA7');
    const org_a = await createOrg(ownerA, nameA);

    const ownerB = await makeUser('RmOwnerB7');
    const nameB = orgName('RmOrgB7');
    const org_b = await createOrg(ownerB, nameB);

    const shared = await makeUser('RmShared7');
    await addMember(org_a, shared.user_id, new Date().toISOString());
    await addMember(org_b, shared.user_id, new Date().toISOString());

    const res: any = await handler(removeEvent(nameA, shared.user_id, ownerA));
    expect(res.statusCode).toBe(200);

    expect(await isMember(org_a, shared.user_id)).toBe(false);
    expect(await isMember(org_b, shared.user_id)).toBe(true);
    expect((await listOrgMembers(org_b)).some(m => m.user_id === shared.user_id)).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const res: any = await handler(removeEvent('RmAnonOrg', 'someone', null));
    expect(res.statusCode).toBe(401);
  });

  it('404s on an unknown organisation', async () => {
    const owner = await makeUser('RmOwner8');
    const res: any = await handler(removeEvent(orgName('RmNoOrg8'), owner.user_id, owner));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });
});
