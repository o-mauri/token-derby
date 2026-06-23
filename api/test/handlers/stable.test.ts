import { describe, it, expect } from 'vitest';
import { handler as listStable } from '../../src/handlers/list-stable.js';
import { handler as createStableHorse } from '../../src/handlers/create-stable-horse.js';
import { handler as updateStableHorse } from '../../src/handlers/update-stable-horse.js';
import { handler as deleteStableHorse } from '../../src/handlers/delete-stable-horse.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

const COLORS = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };

function authedEvent(
  user: TestUser,
  method: string,
  path: string,
  body?: unknown,
  pathParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {
    'x-cli-version': CURRENT_CLI_VERSION,
    'x-user-id': user.user_id,
    'x-user-token': user.secret_token,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    pathParameters,
    headers,
    requestContext: {} as any,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('stable handlers', () => {
  it('list returns empty for a fresh user', async () => {
    const user = await makeUser('StableListEmpty');
    const res: any = await listStable(authedEvent(user, 'GET', '/jockey/me/horses'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).horses).toEqual([]);
  });

  it('create + list round-trips, new horses start at xp = 0', async () => {
    const user = await makeUser('StableCreate');
    const created: any = await createStableHorse(authedEvent(user, 'POST', '/jockey/me/horses', { name: 'Gary', colors: COLORS }));
    expect(created.statusCode).toBe(200);
    const horse = JSON.parse(created.body);
    expect(horse.stable_horse_id).toBeTruthy();
    expect(horse.name).toBe('Gary');
    expect(horse.xp).toBe(0);

    const listed: any = await listStable(authedEvent(user, 'GET', '/jockey/me/horses'));
    const horses = JSON.parse(listed.body).horses;
    expect(horses).toHaveLength(1);
    expect(horses[0].stable_horse_id).toBe(horse.stable_horse_id);
    expect(horses[0].xp).toBe(0);
  });

  it('rejects duplicate horse names within the same user', async () => {
    const user = await makeUser('StableDup');
    await createStableHorse(authedEvent(user, 'POST', '/jockey/me/horses', { name: 'Gary', colors: COLORS }));
    const dup: any = await createStableHorse(authedEvent(user, 'POST', '/jockey/me/horses', { name: 'Gary', colors: COLORS }));
    expect(dup.statusCode).toBe(409);
    expect(JSON.parse(dup.body).code).toBe('STABLE_HORSE_NAME_TAKEN');
  });

  it('different users can have horses with the same name', async () => {
    const alice = await makeUser('StableA');
    const bob = await makeUser('StableB');
    const a: any = await createStableHorse(authedEvent(alice, 'POST', '/jockey/me/horses', { name: 'Sharedname', colors: COLORS }));
    const b: any = await createStableHorse(authedEvent(bob, 'POST', '/jockey/me/horses', { name: 'Sharedname', colors: COLORS }));
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
  });

  it('update changes colors', async () => {
    const user = await makeUser('StableUpd');
    const created: any = await createStableHorse(authedEvent(user, 'POST', '/jockey/me/horses', { name: 'Gary', colors: COLORS }));
    const horse = JSON.parse(created.body);
    const newColors = { body: '#fff', mane: '#fff', tail: '#fff', saddle: '#fff' };
    const upd: any = await updateStableHorse(
      authedEvent(user, 'PUT', `/jockey/me/horses/${horse.stable_horse_id}`, { colors: newColors }, { stable_horse_id: horse.stable_horse_id }),
    );
    expect(upd.statusCode).toBe(200);
    expect(JSON.parse(upd.body).colors).toEqual(newColors);
  });

  it('update changes name and frees the old name', async () => {
    const user = await makeUser('StableRename');
    const a: any = await createStableHorse(authedEvent(user, 'POST', '/jockey/me/horses', { name: 'Old', colors: COLORS }));
    const horse = JSON.parse(a.body);
    const upd: any = await updateStableHorse(
      authedEvent(user, 'PUT', `/jockey/me/horses/${horse.stable_horse_id}`, { name: 'New' }, { stable_horse_id: horse.stable_horse_id }),
    );
    expect(upd.statusCode).toBe(200);
    expect(JSON.parse(upd.body).name).toBe('New');
    // Old name should now be available again
    const reuse: any = await createStableHorse(authedEvent(user, 'POST', '/jockey/me/horses', { name: 'Old', colors: COLORS }));
    expect(reuse.statusCode).toBe(200);
  });

  it('update returns STABLE_HORSE_NOT_FOUND for unknown id', async () => {
    const user = await makeUser('StableMiss');
    const res: any = await updateStableHorse(
      authedEvent(user, 'PUT', '/jockey/me/horses/nope', { colors: COLORS }, { stable_horse_id: 'nope' }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('delete removes the horse and frees the name', async () => {
    const user = await makeUser('StableDel');
    const a: any = await createStableHorse(authedEvent(user, 'POST', '/jockey/me/horses', { name: 'Doomed', colors: COLORS }));
    const horse = JSON.parse(a.body);
    const del: any = await deleteStableHorse(
      authedEvent(user, 'DELETE', `/jockey/me/horses/${horse.stable_horse_id}`, undefined, { stable_horse_id: horse.stable_horse_id }),
    );
    expect(del.statusCode).toBe(200);
    // Name should now be reusable.
    const reuse: any = await createStableHorse(authedEvent(user, 'POST', '/jockey/me/horses', { name: 'Doomed', colors: COLORS }));
    expect(reuse.statusCode).toBe(200);
  });

  it('UNAUTHENTICATED when X-User-Token is missing', async () => {
    const noAuth: APIGatewayProxyEventV2 = {
      version: '2.0', routeKey: 'GET /jockey/me/horses', rawPath: '/jockey/me/horses', rawQueryString: '',
      headers: { 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': '00000000-0000-0000-0000-000000000000' },
      requestContext: {} as any, isBase64Encoded: false,
    };
    const res: any = await listStable(noAuth);
    expect(res.statusCode).toBe(401);
  });

  it('UNAUTHENTICATED when user_id is unknown', async () => {
    const noUser: APIGatewayProxyEventV2 = {
      version: '2.0', routeKey: 'GET /jockey/me/horses', rawPath: '/jockey/me/horses', rawQueryString: '',
      headers: {
        'x-cli-version': CURRENT_CLI_VERSION,
        'x-user-id': '00000000-0000-0000-0000-000000000000',
        'x-user-token': 'any-token-here',
      },
      requestContext: {} as any, isBase64Encoded: false,
    };
    const res: any = await listStable(noUser);
    expect(res.statusCode).toBe(401);
  });
});
