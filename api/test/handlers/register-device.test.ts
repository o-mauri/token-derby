import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as registerDevice } from '../../src/handlers/register-device.js';
import { handler as listDevices } from '../../src/handlers/list-devices.js';
import { authenticate } from '../../src/lib/auth.js';
import {
  recordAttempt, DEVICE_REGISTER_BUCKET, DEVICE_REGISTER_LIMIT,
} from '../../src/db/rate-limits.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { makeUser, authHeaders, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function ev(headers: Record<string, string>, body?: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /api/devices',
    rawPath: '/api/devices',
    rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, ...headers },
    requestContext: {} as any,
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function asUser(user: TestUser, body: unknown = { label: 'omars-laptop' }) {
  return ev(authHeaders(user), body);
}

/** The device list as the account view would show it. */
async function devicesOf(user: TestUser, token = user.secret_token) {
  const res: any = await listDevices(ev({ 'x-user-id': user.user_id, 'x-user-token': token }));
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

/** Does this token authenticate as this user? Mirrors what every handler does. */
async function authenticates(user_id: string, token: string): Promise<boolean> {
  const result = await authenticate(ev({ 'x-user-id': user_id, 'x-user-token': token }));
  return !('error' in result);
}

describe('register-device', () => {
  it('mints a credential that authenticates, and the device shows up in the list', async () => {
    const user = await makeUser('Registrar');

    const res: any = await registerDevice(asUser(user, { label: 'omars-laptop' }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.device_id).toBe('string');
    expect(body.secret_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Not the legacy account token dressed up as a new one: the whole point is
    // that this credential is revocable on its own row.
    expect(body.secret_token).not.toBe(user.secret_token);

    // The credential works, and it works as the caller — not as somebody else.
    expect(await authenticates(user.user_id, body.secret_token)).toBe(true);

    const listed = await devicesOf(user, body.secret_token);
    expect(listed.devices.map((d: any) => d.device_id)).toContain(body.device_id);
    expect(listed.devices.find((d: any) => d.device_id === body.device_id).label).toBe('omars-laptop');
  });

  it('leaves the legacy credential working, since it is the one that is mid-migration', async () => {
    const user = await makeUser('StillLegacy');
    const res: any = await registerDevice(asUser(user));
    expect(res.statusCode).toBe(200);

    // Nothing here rotates or clears the account-level token: doing so is what
    // this endpoint exists to avoid, because it is shared with other machines.
    expect(await authenticates(user.user_id, user.secret_token)).toBe(true);
    expect((await devicesOf(user)).has_legacy_credential).toBe(true);
  });

  it('registers two machines separately rather than reusing one row', async () => {
    const user = await makeUser('TwoMachines');
    const a: any = await registerDevice(asUser(user, { label: 'laptop' }));
    const b: any = await registerDevice(asUser(user, { label: 'desktop' }));

    const first = JSON.parse(a.body);
    const second = JSON.parse(b.body);
    expect(first.device_id).not.toBe(second.device_id);
    expect(first.secret_token).not.toBe(second.secret_token);
    const listed = await devicesOf(user);
    expect(listed.devices.map((d: any) => d.label).sort()).toEqual(['desktop', 'laptop']);
  });

  describe('authentication', () => {
    it('refuses a caller with no credentials at all, and writes nothing', async () => {
      const db = await import('../../src/db/devices.js');
      const spy = vi.spyOn(db, 'putDevice');

      const res: any = await registerDevice(ev({}, { label: 'nobody' }));

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('refuses a wrong token for a real user, and mints nothing for that user', async () => {
      const victim = await makeUser('Victim');

      const res: any = await registerDevice(ev({
        'x-user-id': victim.user_id,
        'x-user-token': 'not-the-real-token',
      }, { label: 'attacker-box' }));

      expect(res.statusCode).toBe(401);
      // State, not just status: no row landed on the victim's account.
      expect((await devicesOf(victim)).devices).toHaveLength(0);
    });

    it('refuses a web session, which has no machine behind it to register', async () => {
      const user = await makeUser('WebSessionCaller');
      const token = `web-${randomUUID()}`;
      await putWebSession(token, user.user_id, user.display_name, new Date(Date.now() + 3600_000).toISOString(), 3600);

      const res: any = await registerDevice(ev({ authorization: `Bearer ${token}` }, { label: 'browser' }));

      // Pins `authenticate` over `resolveCaller`. A browser is not a machine: a
      // credential minted for one would go straight into a page's hands with
      // nowhere on disk to live, and the browser already has a session.
      expect(res.statusCode).toBe(401);
      expect((await devicesOf(user)).devices).toHaveLength(0);
    });

    it('refuses a stale identity.json pointing at a user that no longer exists', async () => {
      const res: any = await registerDevice(ev({
        'x-user-id': randomUUID(),
        'x-user-token': 'some-old-token',
      }, { label: 'ghost' }));

      expect(res.statusCode).toBe(401);
    });

    it('refuses a revoked device credential, so a dead machine cannot re-register itself', async () => {
      const user = await makeUser('Revoked');
      const minted = JSON.parse((await registerDevice(asUser(user)) as any).body);
      const db = await import('../../src/db/devices.js');
      expect(await db.deleteDevice(user.user_id, minted.device_id)).toBe(true);

      const res: any = await registerDevice(ev({
        'x-user-id': user.user_id,
        'x-user-token': minted.secret_token,
      }, { label: 'second-wind' }));

      expect(res.statusCode).toBe(401);
    });

    it('accepts a device credential, so a registered machine can register another name', async () => {
      const user = await makeUser('DeviceChained');
      const first = JSON.parse((await registerDevice(asUser(user, { label: 'first' })) as any).body);

      const res: any = await registerDevice(ev({
        'x-user-id': user.user_id,
        'x-user-token': first.secret_token,
      }, { label: 'second' }));

      // A device credential is a CLI credential; this endpoint hands out
      // nothing stronger than what was presented, so there is nothing to gate.
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).device_id).not.toBe(first.device_id);
    });

    it('never lets a body-supplied user_id pick the account', async () => {
      const caller = await makeUser('BodyCaller');
      const other = await makeUser('BodyVictim');

      const res: any = await registerDevice(asUser(caller, { label: 'hijack', user_id: other.user_id }));

      expect(res.statusCode).toBe(200);
      const minted = JSON.parse(res.body);
      expect((await devicesOf(other)).devices).toHaveLength(0);
      expect((await devicesOf(caller)).devices.map((d: any) => d.device_id)).toContain(minted.device_id);
    });
  });

  describe('label validation', () => {
    // The same rule as auth-cli-start, because both go through
    // lib/device-label.ts — the label is rendered on the site either way.
    async function rejects(label: unknown) {
      const user = await makeUser('LabelChecker');
      const db = await import('../../src/db/devices.js');
      const spy = vi.spyOn(db, 'putDevice');

      const res: any = await registerDevice(asUser(user, { label }));

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
      // No row written, and no row visible — the second is the one that matters
      // to the person who would otherwise have to revoke it.
      expect(spy).not.toHaveBeenCalled();
      expect((await devicesOf(user)).devices).toHaveLength(0);
      spy.mockRestore();
    }

    it('rejects a missing label', async () => { await rejects(undefined); });
    it('rejects a non-string label', async () => { await rejects(42); });
    it('rejects a blank label', async () => { await rejects('   '); });
    it('rejects a label over the max length', async () => { await rejects('x'.repeat(41)); });
    it('rejects a right-to-left override (U+202E)', async () => { await rejects('AB3D92‮cod.exe'); });
    it('rejects a zero-width space (U+200B)', async () => { await rejects('omars​laptop'); });
    it('rejects a newline', async () => { await rejects('laptop\nadmin'); });

    it('rejects a missing body outright', async () => {
      const user = await makeUser('NoBody');
      const res: any = await registerDevice(ev(authHeaders(user)));
      expect(res.statusCode).toBe(400);
    });

    it('accepts a label at exactly the max length', async () => {
      const user = await makeUser('MaxLabel');
      const res: any = await registerDevice(asUser(user, { label: 'x'.repeat(40) }));
      expect(res.statusCode).toBe(200);
    });

    it('accepts legitimate non-ASCII, and stores the trimmed label verbatim', async () => {
      const user = await makeUser('Accented');
      const res: any = await registerDevice(asUser(user, { label: "  Amélie's PC 笔记本  " }));
      expect(res.statusCode).toBe(200);
      expect((await devicesOf(user)).devices[0].label).toBe("Amélie's PC 笔记本");
    });
  });

  describe('rate limiting', () => {
    // One write rather than N calls: the counter is what the handler reads.
    const charge = (user_id: string, times: number) =>
      recordAttempt(DEVICE_REGISTER_BUCKET, user_id, Date.now(), times);

    it('allows the registration that lands exactly on the limit', async () => {
      const user = await makeUser('OnTheLimit');
      await charge(user.user_id, DEVICE_REGISTER_LIMIT - 1);

      const res: any = await registerDevice(asUser(user));

      // A ceiling the honest caller may reach, not one they trip on.
      expect(res.statusCode).toBe(200);
      expect((await devicesOf(user)).devices).toHaveLength(1);
    });

    it('refuses past the limit, mints no credential and writes no row', async () => {
      const user = await makeUser('OverTheLimit');
      await charge(user.user_id, DEVICE_REGISTER_LIMIT);
      const db = await import('../../src/db/devices.js');
      const spy = vi.spyOn(db, 'putDevice');

      const res: any = await registerDevice(asUser(user));

      // 429, not the 400 the label rejections give: this cannot pass on the
      // wrong guard firing.
      expect(res.statusCode).toBe(429);
      expect(JSON.parse(res.body).code).toBe('RATE_LIMITED');
      expect(JSON.parse(res.body).secret_token).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
      expect((await devicesOf(user)).devices).toHaveLength(0);
      spy.mockRestore();
    });

    it('is keyed per user, so one exhausted account does not block another', async () => {
      const exhausted = await makeUser('ExhaustedUser');
      const fresh = await makeUser('FreshUser');
      await charge(exhausted.user_id, DEVICE_REGISTER_LIMIT);

      expect(((await registerDevice(asUser(exhausted))) as any).statusCode).toBe(429);
      expect(((await registerDevice(asUser(fresh))) as any).statusCode).toBe(200);
    });

    it('does not charge a label that was rejected', async () => {
      const user = await makeUser('RejectedLabelBudget');
      await charge(user.user_id, DEVICE_REGISTER_LIMIT - 1);

      // A rejected label writes nothing, so it must not eat the one attempt an
      // honest caller has left after fat-fingering the name.
      for (let i = 0; i < 5; i++) {
        expect(((await registerDevice(asUser(user, { label: 'x'.repeat(41) }))) as any).statusCode).toBe(400);
      }
      expect(((await registerDevice(asUser(user))) as any).statusCode).toBe(200);
    });

    it('does not charge a caller who failed to authenticate', async () => {
      const user = await makeUser('UnauthBudget');

      // An unauthenticated caller has no identity to charge, so the guard must
      // sit behind authenticate — otherwise a stranger who knows a user_id
      // could spend that user's budget and lock them out of `link`.
      for (let i = 0; i < DEVICE_REGISTER_LIMIT + 5; i++) {
        const res: any = await registerDevice(ev({
          'x-user-id': user.user_id, 'x-user-token': 'wrong',
        }, { label: 'probe' }));
        expect(res.statusCode).toBe(401);
      }

      expect(((await registerDevice(asUser(user))) as any).statusCode).toBe(200);
    });

    it('clears the honest count and is still a real bound', () => {
      // Derived from what the flow actually costs rather than written out, so
      // changing the limit re-checks this instead of leaving it stale.
      // `link` registers exactly once, on the run that first attaches an email;
      // after that the command short-circuits and mints nothing. So the honest
      // count is dominated by retries after an abandoned browser leg, not by
      // repeat linking.
      const registrationsPerLink = 1;
      const abandonedBrowserRetriesPerHour = 5;
      expect(DEVICE_REGISTER_LIMIT).toBeGreaterThan(registrationsPerLink * abandonedBrowserRetriesPerHour);

      // Still a bound, and be honest about which one: this defends nobody's
      // account (the caller already holds a working credential and gets back a
      // weaker one). What it buys is that a runaway loop cannot bury the
      // Account device list in rows the person has to revoke one at a time.
      const REVOCATIONS_A_PERSON_WILL_TOLERATE = 25;
      expect(DEVICE_REGISTER_LIMIT).toBeLessThan(REVOCATIONS_A_PERSON_WILL_TOLERATE);
    });
  });
});
