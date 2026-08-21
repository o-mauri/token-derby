import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as listDevicesHandler } from '../../src/handlers/list-devices.js';
import { handler as revokeDeviceHandler } from '../../src/handlers/revoke-device.js';
import { handler as logoutDeviceHandler } from '../../src/handlers/logout-device.js';
import { putDevice, listDevices } from '../../src/db/devices.js';
import { createUserWithEmail } from '../../src/db/identities.js';
import { authenticate } from '../../src/lib/auth.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { generateWebSessionToken } from '../../src/lib/codes.js';
import { makeUser, authHeaders, type TestUser } from '../helpers/auth-helper.js';

async function webTokenFor(user: TestUser): Promise<string> {
  const token = generateWebSessionToken();
  await putWebSession(token, user.user_id, user.display_name, new Date(Date.now() + 3600_000).toISOString(), 3600);
  return token;
}

function listEvent(headers: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /api/devices',
    rawPath: '/api/devices',
    rawQueryString: '',
    headers: { 'content-type': 'application/json', ...headers },
    requestContext: {} as any,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function revokeEvent(device_id: string, headers: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'DELETE /api/devices/{device_id}',
    rawPath: `/api/devices/${device_id}`,
    rawQueryString: '',
    headers: { 'content-type': 'application/json', ...headers },
    pathParameters: { device_id },
    requestContext: {} as any,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function logoutEvent(headers: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'DELETE /api/devices/me',
    rawPath: '/api/devices/me',
    rawQueryString: '',
    headers: { 'content-type': 'application/json', ...headers },
    requestContext: {} as any,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

/** Registers a real device row for `user` and returns its device_id and the token that authenticates it. */
async function addDevice(user: TestUser, label: string): Promise<{ device_id: string; token: string }> {
  const token = `dev-tok-${randomUUID()}`;
  const record = await putDevice({ user_id: user.user_id, token, label });
  return { device_id: record.device_id, token };
}

function cliDeviceHeaders(user: TestUser, deviceToken: string): Record<string, string> {
  return { 'x-user-id': user.user_id, 'x-user-token': deviceToken };
}

describe('GET /api/devices', () => {
  it('lists only the caller own devices (CLI credential)', async () => {
    const a = await makeUser('DevicesA');
    const b = await makeUser('DevicesB');
    await addDevice(a, 'a-one');
    await addDevice(a, 'a-two');
    await addDevice(b, 'b-one');

    const res: any = await listDevicesHandler(listEvent(authHeaders(a)));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.devices.map((d: any) => d.label).sort()).toEqual(['a-one', 'a-two']);

    const resB: any = await listDevicesHandler(listEvent(authHeaders(b)));
    const bodyB = JSON.parse(resB.body);
    expect(bodyB.devices.map((d: any) => d.label)).toEqual(['b-one']);
  });

  it('works with a web session', async () => {
    const user = await makeUser('DevicesWebList');
    await addDevice(user, 'web-listed-device');
    const token = await webTokenFor(user);

    const res: any = await listDevicesHandler(listEvent({ authorization: `Bearer ${token}` }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.devices.map((d: any) => d.label)).toEqual(['web-listed-device']);
  });

  it('never returns a token or hash on a device', async () => {
    const user = await makeUser('DevicesNoSecret');
    await addDevice(user, 'secretless-device');

    const res: any = await listDevicesHandler(listEvent(authHeaders(user)));
    const body = JSON.parse(res.body);
    expect(body.devices).toHaveLength(1);
    expect(Object.keys(body.devices[0]).sort()).toEqual(
      ['created_at', 'device_id', 'label', 'last_seen_at'].sort(),
    );
  });

  it('rejects an unauthenticated request', async () => {
    const res: any = await listDevicesHandler(listEvent({}));
    expect(res.statusCode).toBe(401);
  });

  describe('has_legacy_credential', () => {
    it('stays true after revoking every listed device, because the account token survives it', async () => {
      const user = await makeUser('LegacyFlagged');
      await addDevice(user, 'this-machine');

      const before: any = await listDevicesHandler(listEvent(authHeaders(user)));
      expect(JSON.parse(before.body).has_legacy_credential).toBe(true);

      for (const d of JSON.parse(before.body).devices) {
        const revoked: any = await revokeDeviceHandler(revokeEvent(d.device_id, authHeaders(user)));
        expect(revoked.statusCode).toBe(200);
      }

      // This request authenticates with the account-level token itself, so it
      // proves the credential is still live with an empty device list — the
      // exact moment the view would otherwise read as "no machine can act as me".
      const after: any = await listDevicesHandler(listEvent(authHeaders(user)));
      expect(after.statusCode).toBe(200);
      expect(JSON.parse(after.body).devices).toEqual([]);
      expect(JSON.parse(after.body).has_legacy_credential).toBe(true);
    });

    it('is false for an SSO-created account, which never had an account token', async () => {
      const user_id = randomUUID();
      await createUserWithEmail({
        user_id,
        email: `${user_id}@example.com`,
        idp_sub: `sub-${user_id}`,
        display_name: 'SsoOnly',
      });
      const token = generateWebSessionToken();
      await putWebSession(token, user_id, 'SsoOnly', new Date(Date.now() + 3600_000).toISOString(), 3600);
      await putDevice({ user_id, token: `dev-tok-${randomUUID()}`, label: 'only-device' });

      const res: any = await listDevicesHandler(listEvent({ authorization: `Bearer ${token}` }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).devices).toHaveLength(1);
      // Nothing to warn about: for this account the device list IS the full set.
      expect(JSON.parse(res.body).has_legacy_credential).toBe(false);
    });

    it('reports exactly what authenticate still accepts, for both kinds of account', async () => {
      // Anti-drift: the flag and the auth path must never disagree, or the view
      // reassures someone about a credential the server is still honouring.
      const legacy = await makeUser('LegacyAgreement');
      const legacyRes: any = await listDevicesHandler(listEvent(authHeaders(legacy)));
      const legacyAuth = await authenticate(listEvent(authHeaders(legacy)));
      expect(JSON.parse(legacyRes.body).has_legacy_credential).toBe(true);
      expect('error' in legacyAuth).toBe(false);

      const user_id = randomUUID();
      await createUserWithEmail({
        user_id,
        email: `${user_id}@example.com`,
        idp_sub: `sub-${user_id}`,
        display_name: 'SsoAgreement',
      });
      await putDevice({ user_id, token: `dev-tok-${randomUUID()}`, label: 'sso-machine' });
      const webToken = generateWebSessionToken();
      await putWebSession(webToken, user_id, 'SsoAgreement', new Date(Date.now() + 3600_000).toISOString(), 3600);

      const ssoRes: any = await listDevicesHandler(listEvent({ authorization: `Bearer ${webToken}` }));
      const ssoAuth = await authenticate(listEvent({ 'x-user-id': user_id, 'x-user-token': 'not-an-account-token' }));
      // Reported as absent, and genuinely absent: an invented account-level
      // token is refused rather than falling through to some other credential.
      expect(JSON.parse(ssoRes.body).has_legacy_credential).toBe(false);
      expect('error' in ssoAuth).toBe(true);
    });
  });
});

describe('DELETE /api/devices/{device_id}', () => {
  it('revokes the caller own device (CLI credential)', async () => {
    const user = await makeUser('RevokeOwnCli');
    const device = await addDevice(user, 'to-revoke');

    const res: any = await revokeDeviceHandler(revokeEvent(device.device_id, authHeaders(user)));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    const remaining = await listDevices(user.user_id);
    expect(remaining.find((d) => d.device_id === device.device_id)).toBeUndefined();
  });

  it('revokes the caller own device (web session)', async () => {
    const user = await makeUser('RevokeOwnWeb');
    const device = await addDevice(user, 'to-revoke-web');
    const token = await webTokenFor(user);

    const res: any = await revokeDeviceHandler(revokeEvent(device.device_id, { authorization: `Bearer ${token}` }));
    expect(res.statusCode).toBe(200);

    const remaining = await listDevices(user.user_id);
    expect(remaining.find((d) => d.device_id === device.device_id)).toBeUndefined();
  });

  it('allows revoking the credential the caller is currently authenticating with', async () => {
    const user = await makeUser('RevokeSelf');
    const device = await addDevice(user, 'currently-in-use');

    const res: any = await revokeDeviceHandler(
      revokeEvent(device.device_id, cliDeviceHeaders(user, device.token)),
    );
    expect(res.statusCode).toBe(200);

    const remaining = await listDevices(user.user_id);
    expect(remaining.find((d) => d.device_id === device.device_id)).toBeUndefined();
  });

  it('LOAD-BEARING: user B cannot revoke user A device — A device still exists afterwards', async () => {
    const a = await makeUser('RevokeIsolationA');
    const b = await makeUser('RevokeIsolationB');
    const aDevice = await addDevice(a, 'a-only-device');

    await revokeDeviceHandler(revokeEvent(aDevice.device_id, authHeaders(b)));

    const aDevicesAfter = await listDevices(a.user_id);
    expect(aDevicesAfter.find((d) => d.device_id === aDevice.device_id)).toBeDefined();
    expect(aDevicesAfter).toHaveLength(1);
  });

  it('answers both an unknown device_id and another user device_id with 404 DEVICE_NOT_FOUND', async () => {
    const a = await makeUser('IndistinguishableA');
    const b = await makeUser('IndistinguishableB');
    const aDevice = await addDevice(a, 'a-real-device');

    const resUnknown: any = await revokeDeviceHandler(
      revokeEvent('nonexistent-device-id', authHeaders(b)),
    );
    const resOthers: any = await revokeDeviceHandler(
      revokeEvent(aDevice.device_id, authHeaders(b)),
    );

    // Both halves are needed. Equal-to-each-other stops the two answers
    // drifting apart into an existence oracle; the literals stop them
    // collapsing together onto a wrong shared answer — a success for a device
    // that was never revoked, which is what a missing not-found branch does.
    expect(resOthers.statusCode).toBe(resUnknown.statusCode);
    expect(JSON.parse(resOthers.body)).toEqual(JSON.parse(resUnknown.body));
    for (const res of [resUnknown, resOthers]) {
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).code).toBe('DEVICE_NOT_FOUND');
    }
  });

  it('rejects an unauthenticated request', async () => {
    const res: any = await revokeDeviceHandler(revokeEvent('whatever', {}));
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/devices/me', () => {
  it('deletes the device that authenticated the request', async () => {
    const user = await makeUser('LogoutSelf');
    const device = await addDevice(user, 'this-machine');

    const res: any = await logoutDeviceHandler(logoutEvent(cliDeviceHeaders(user, device.token)));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ revoked: true });

    const remaining = await listDevices(user.user_id);
    expect(remaining.find((d) => d.device_id === device.device_id)).toBeUndefined();
  });

  it('leaves the user other devices untouched', async () => {
    const user = await makeUser('LogoutLeavesOthers');
    const thisDevice = await addDevice(user, 'this-machine');
    const otherDevice = await addDevice(user, 'other-machine');

    await logoutDeviceHandler(logoutEvent(cliDeviceHeaders(user, thisDevice.token)));

    const remaining = await listDevices(user.user_id);
    expect(remaining.map((d) => d.device_id)).toEqual([otherDevice.device_id]);
  });

  it('reports revoked: false for a legacy credential with no device row, rather than failing', async () => {
    const user = await makeUser('LogoutLegacy');

    const res: any = await logoutDeviceHandler(logoutEvent(authHeaders(user)));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ revoked: false });
  });

  it('rejects an unauthenticated request', async () => {
    const res: any = await logoutDeviceHandler(logoutEvent({}));
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid device token the same as any other bad credential', async () => {
    const user = await makeUser('LogoutBadToken');

    const res: any = await logoutDeviceHandler(
      logoutEvent(cliDeviceHeaders(user, 'not-a-real-token')),
    );
    expect(res.statusCode).toBe(401);
  });
});
