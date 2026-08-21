import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { authenticate } from '../../src/lib/auth.js';
import { putUser } from '../../src/db/users.js';
import { putDevice, getDeviceByToken } from '../../src/db/devices.js';
import * as devices from '../../src/db/devices.js';
import { createUserWithEmail } from '../../src/db/identities.js';
import { hashSecretToken } from '../../src/lib/token-hash.js';
import { deviceKey } from '../../src/db/keys.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { DEVICE_TOUCH_INTERVAL_MS } from '../../src/lib/auth.js';

function ev(user_id: string, token: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'GET /jockey/me', rawPath: '/jockey/me', rawQueryString: '',
    headers: { 'x-user-id': user_id, 'x-user-token': token },
    requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('authenticate with an SSO-created user', () => {
  it('returns an auth error rather than throwing when the row has no secret_token_hash', async () => {
    const user_id = randomUUID();
    // putUser requires a hash; write the row without one the way an SSO create will.
    const { ddb, TABLE } = await import('../../src/db/client.js');
    const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
    const { userMetaKey } = await import('../../src/db/keys.js');
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...userMetaKey(user_id),
        user_id, display_name: 'SsoOnly', created_at: new Date().toISOString(),
        email: 'sso-only@example.com', email_verified: true, idp: 'google', idp_sub: 'sub-1',
      },
    }));

    const res = await authenticate(ev(user_id, 'any-token-at-all'));
    expect('error' in res).toBe(true);
    // Indistinguishable from a wrong token, and it must not name a CLI command
    // that does not exist yet.
    expect((res as { error: string }).error).toBe('Invalid token');
  });

  it('still authenticates a legacy user that does have a hash', async () => {
    const user_id = randomUUID();
    const { hashSecretToken } = await import('../../src/lib/auth.js');
    await putUser(
      { user_id, display_name: 'LegacyUser', created_at: new Date().toISOString() },
      hashSecretToken('secret-abc'),
    );
    const res = await authenticate(ev(user_id, 'secret-abc'));
    expect('error' in res).toBe(false);
    expect((res as { user_id: string }).user_id).toBe(user_id);
  });

  it('rejects a wrong token for a legacy user', async () => {
    const user_id = randomUUID();
    const { hashSecretToken } = await import('../../src/lib/auth.js');
    await putUser(
      { user_id, display_name: 'LegacyUser2', created_at: new Date().toISOString() },
      hashSecretToken('right'),
    );
    const res = await authenticate(ev(user_id, 'wrong'));
    expect('error' in res).toBe(true);
  });
});

describe('authenticate falling back to a device credential', () => {
  it('accepts a device token for a user with no legacy hash', async () => {
    const user_id = randomUUID();
    await createUserWithEmail({
      user_id, email: `${user_id}@example.com`, idp_sub: `sub-${user_id}`, display_name: 'A',
    });
    await putDevice({ user_id, token: 'dev-tok', label: 'laptop' });

    const res = await authenticate(ev(user_id, 'dev-tok'));
    expect('error' in res).toBe(false);
    expect((res as { user_id: string }).user_id).toBe(user_id);
  });

  it('rejects a device token that belongs to another user', async () => {
    const owner = randomUUID();
    const impostor = randomUUID();
    await createUserWithEmail({
      user_id: owner, email: `${owner}@example.com`, idp_sub: `sub-${owner}`, display_name: 'Owner',
    });
    await createUserWithEmail({
      user_id: impostor, email: `${impostor}@example.com`, idp_sub: `sub-${impostor}`, display_name: 'Impostor',
    });
    await putDevice({ user_id: owner, token: 'shared-tok', label: 'laptop' });

    const res = await authenticate(ev(impostor, 'shared-tok'));
    expect('error' in res).toBe(true);
    expect((res as { error: string }).error).toBe('Invalid token');
  });

  it('still accepts a legacy token in one read (does not look up a device)', async () => {
    const user_id = randomUUID();
    const { hashSecretToken } = await import('../../src/lib/auth.js');
    await putUser(
      { user_id, display_name: 'LegacyOneRead', created_at: new Date().toISOString() },
      hashSecretToken('legacy-secret'),
    );
    const spy = vi.spyOn(devices, 'getDeviceByToken');

    const res = await authenticate(ev(user_id, 'legacy-secret'));

    expect('error' in res).toBe(false);
    expect((res as { user_id: string }).user_id).toBe(user_id);
    // This is the load-bearing assertion: a matching legacy hash must never
    // pay for a device read on the 60s CLI heartbeat path.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('accepts a legacy token even when the user also has devices', async () => {
    const user_id = randomUUID();
    const { hashSecretToken } = await import('../../src/lib/auth.js');
    await putUser(
      { user_id, display_name: 'LegacyWithDevice', created_at: new Date().toISOString() },
      hashSecretToken('legacy-secret-2'),
    );
    await putDevice({ user_id, token: 'device-tok-2', label: 'desktop' });

    const legacyRes = await authenticate(ev(user_id, 'legacy-secret-2'));
    expect('error' in legacyRes).toBe(false);
    expect((legacyRes as { user_id: string }).user_id).toBe(user_id);

    const deviceRes = await authenticate(ev(user_id, 'device-tok-2'));
    expect('error' in deviceRes).toBe(false);
    expect((deviceRes as { user_id: string }).user_id).toBe(user_id);
  });
});

describe('authenticate throttles device last_seen_at writes', () => {
  async function putStaleDevice(user_id: string, token: string, ageMs: number) {
    const staleAt = new Date(Date.now() - ageMs).toISOString();
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...deviceKey(user_id, hashSecretToken(token)),
        device_id: randomUUID(),
        label: 'stale-device',
        created_at: staleAt,
        last_seen_at: staleAt,
      },
    }));
    return staleAt;
  }

  it('updates last_seen_at when the stored value is stale', async () => {
    const user_id = randomUUID();
    await createUserWithEmail({
      user_id, email: `${user_id}@example.com`, idp_sub: `sub-${user_id}`, display_name: 'Stale',
    });
    const staleAt = await putStaleDevice(user_id, 'stale-tok', DEVICE_TOUCH_INTERVAL_MS + 60_000);

    const res = await authenticate(ev(user_id, 'stale-tok'));
    expect('error' in res).toBe(false);

    const after = await getDeviceByToken(user_id, 'stale-tok');
    // The load-bearing check: the stored value actually moved, not just "didn't throw".
    expect(after!.last_seen_at).not.toBe(staleAt);
    expect(Date.parse(after!.last_seen_at)).toBeGreaterThan(Date.parse(staleAt));
  });

  it('does not write when last_seen_at is fresh', async () => {
    const user_id = randomUUID();
    await createUserWithEmail({
      user_id, email: `${user_id}@example.com`, idp_sub: `sub-${user_id}`, display_name: 'Fresh',
    });
    await putDevice({ user_id, token: 'fresh-tok', label: 'laptop' });
    const spy = vi.spyOn(devices, 'touchDevice');

    const res = await authenticate(ev(user_id, 'fresh-tok'));
    expect('error' in res).toBe(false);
    // Asserting on the write itself, not on the re-read value — a test that only
    // re-read last_seen_at would still pass even if a same-second write fired.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('never touches a device row on the legacy-token path', async () => {
    const user_id = randomUUID();
    await putUser(
      { user_id, display_name: 'LegacyNoTouch', created_at: new Date().toISOString() },
      hashSecretToken('legacy-secret-3'),
    );
    const spy = vi.spyOn(devices, 'touchDevice');

    const res = await authenticate(ev(user_id, 'legacy-secret-3'));
    expect('error' in res).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
