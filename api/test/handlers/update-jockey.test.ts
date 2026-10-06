import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { handler as updateJockey } from '../../src/handlers/update-jockey.js';
import { createUserWithEmail } from '../../src/db/identities.js';
import { putDevice } from '../../src/db/devices.js';
import { getWebSession, putWebSession } from '../../src/db/web-sessions.js';
import { getUserById } from '../../src/db/users.js';

const ev = (headers: Record<string, string>, body: unknown): APIGatewayProxyEventV2 => ({
  version: '2.0', routeKey: 'PUT /api/jockey/me', rawPath: '/api/jockey/me', rawQueryString: '',
  headers, body: JSON.stringify(body), requestContext: {} as any, isBase64Encoded: false,
} as APIGatewayProxyEventV2);

async function user() {
  const user_id = randomUUID();
  await createUserWithEmail({ user_id, email: `${user_id}@example.com`, idp_sub: `sub-${user_id}`, display_name: 'Before' });
  return user_id;
}

describe('update-jockey', () => {
  it('renames with a web session', async () => {
    const user_id = await user();
    const token = `web-${user_id}`;
    await putWebSession(token, user_id, 'Before', new Date(Date.now() + 3_600_000).toISOString(), 3600);
    const res: any = await updateJockey(ev({ authorization: `Bearer ${token}` }, { display_name: '  Omar  ' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ user_id, display_name: 'Omar' });
    expect((await getUserById(user_id))!.display_name).toBe('Omar');
    // Later requests in the same session stamp the new name, not the one from sign-in.
    expect((await getWebSession(token))!.display_name).toBe('Omar');
  });

  it('renames the user in their other browsers too', async () => {
    const user_id = await user();
    const [here, there] = [`web-${user_id}-a`, `web-${user_id}-b`];
    for (const t of [here, there]) await putWebSession(t, user_id, 'Before', new Date(Date.now() + 3_600_000).toISOString(), 3600);
    await updateJockey(ev({ authorization: `Bearer ${here}` }, { display_name: 'Omar' }));
    expect((await getWebSession(there))!.display_name).toBe('Omar');
  });

  it('renames web sessions when renamed from the CLI', async () => {
    const user_id = await user();
    await putDevice({ user_id, token: `dev-${user_id}`, label: 'laptop' });
    await putWebSession(`web-${user_id}`, user_id, 'Before', new Date(Date.now() + 3_600_000).toISOString(), 3600);
    await updateJockey(ev({ 'x-user-id': user_id, 'x-user-token': `dev-${user_id}` }, { display_name: 'Cli' }));
    expect((await getWebSession(`web-${user_id}`))!.display_name).toBe('Cli');
  });

  it('still renames with CLI credentials', async () => {
    const user_id = await user();
    await putDevice({ user_id, token: `dev-${user_id}`, label: 'laptop' });
    const res: any = await updateJockey(ev({ 'x-user-id': user_id, 'x-user-token': `dev-${user_id}` }, { display_name: 'Cli' }));
    expect(res.statusCode).toBe(200);
  });

  it('refuses no credentials', async () => {
    const res: any = await updateJockey(ev({}, { display_name: 'x' }));
    expect(res.statusCode).toBe(401);
  });

  it.each([['blank', '   '], ['too long', 'a'.repeat(41)]])('refuses a %s name', async (_, display_name) => {
    const user_id = await user();
    await putDevice({ user_id, token: `d-${user_id}`, label: 'l' });
    const res: any = await updateJockey(ev({ 'x-user-id': user_id, 'x-user-token': `d-${user_id}` }, { display_name }));
    expect(res.statusCode).toBe(400);
  });
});
