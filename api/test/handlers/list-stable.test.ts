import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import type { StableHorse } from '@token-derby/shared';
import { handler as listStable } from '../../src/handlers/list-stable.js';
import { createUserWithEmail } from '../../src/db/identities.js';
import { putDevice } from '../../src/db/devices.js';
import { putStableHorse } from '../../src/db/stable.js';
import { putWebSession } from '../../src/db/web-sessions.js';

const ev = (headers: Record<string, string>): APIGatewayProxyEventV2 => ({
  version: '2.0', routeKey: 'GET /api/stable', rawPath: '/api/stable', rawQueryString: '',
  headers, requestContext: {} as any, isBase64Encoded: false,
} as APIGatewayProxyEventV2);

const horse = (id: string, name: string): StableHorse => ({
  stable_horse_id: id, name, colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' }, created_at: '2026-05-01T00:00:00Z', xp: 0,
});

async function user() {
  const user_id = randomUUID();
  await createUserWithEmail({ user_id, email: `${user_id}@example.com`, idp_sub: `sub-${user_id}`, display_name: 'Owner' });
  await putStableHorse(user_id, horse(`h-${user_id}-b`, 'Zephyr'));
  await putStableHorse(user_id, horse(`h-${user_id}-a`, 'Apple'));
  return user_id;
}

describe('list-stable', () => {
  it('lists your horses by name for a website session', async () => {
    const user_id = await user();
    await putWebSession(`web-${user_id}`, user_id, 'Owner', new Date(Date.now() + 3_600_000).toISOString(), 3600);
    const res: any = await listStable(ev({ authorization: `Bearer web-${user_id}` }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).horses.map((h: StableHorse) => h.name)).toEqual(['Apple', 'Zephyr']);
  });

  it('still lists them for CLI credentials', async () => {
    const user_id = await user();
    await putDevice({ user_id, token: `dev-${user_id}`, label: 'laptop' });
    const res: any = await listStable(ev({ 'x-user-id': user_id, 'x-user-token': `dev-${user_id}` }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).horses).toHaveLength(2);
  });

  it('refuses a request with no credentials', async () => {
    const res: any = await listStable(ev({}));
    expect(res.statusCode).toBe(401);
  });
});
