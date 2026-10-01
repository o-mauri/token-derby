import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as cliPoll } from '../../src/handlers/auth-cli-poll.js';
import {
  putCliAuthRequest,
  getCliAuthRequest,
  getCliAuthRequestByUserCode,
  approveCliAuthRequest,
} from '../../src/db/cli-auth-requests.js';
import { recordAttempt, CLI_POLL_BUCKET, CLI_POLL_LIMIT } from '../../src/db/rate-limits.js';
import { putOrganisation, addMember } from '../../src/db/organisations.js';
import { CLI_AUTH_TTL_SECONDS, CLI_AUTH_POLL_INTERVAL_SECONDS, DEVICE_CODE_LENGTH } from '@token-derby/shared';
import { generateSecretToken } from '../../src/lib/codes.js';
import { makeUser, makeHorse } from '../helpers/auth-helper.js';

// The real generator, not a shorter stand-in: the handler checks device_code
// against the exact length /start issues, so a stub would not exercise it.
const deviceCode = () => generateSecretToken();
const userCode = () => `UC${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

function ev(body: string | undefined): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /api/auth/cli/poll',
    rawPath: '/api/auth/cli/poll',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {} as any,
    body,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function pollEvent(device_code: string) {
  return ev(JSON.stringify({ device_code }));
}

async function pendingRequest(opts: { label?: string; link_to_user_id?: string } = {}) {
  const device_code = deviceCode();
  const user_code = userCode();
  await putCliAuthRequest({
    device_code,
    user_code,
    label: opts.label ?? 'test-machine',
    ...(opts.link_to_user_id ? { link_to_user_id: opts.link_to_user_id } : {}),
    ttlSeconds: 600,
  });
  return { device_code, user_code };
}

async function approvedRequest(user_id: string, opts: { label?: string } = {}) {
  const { device_code, user_code } = await pendingRequest(opts);
  const issued_token = `tok-${randomUUID()}`;
  const device_id = `dev-${randomUUID()}`;
  await approveCliAuthRequest({ device_code, issued_token, user_id, device_id });
  return { device_code, user_code, issued_token, device_id };
}

async function makeOrgFor(user_id: string, org_name: string): Promise<string> {
  const org_id = randomUUID();
  await putOrganisation(
    { org_id, org_name, created_at: new Date().toISOString(), creator_user_id: user_id, creator_user_name: 'x' },
    `jt-${org_id}`,
  );
  await addMember(org_id, user_id, new Date().toISOString());
  return org_id;
}

describe('auth-cli-poll', () => {
  describe('the request shape', () => {
    it('rejects a missing or non-string device_code as a bad request', async () => {
      for (const body of [undefined, '{}', 'not json', JSON.stringify({ device_code: 42 }), JSON.stringify({ device_code: '' })]) {
        const res: any = await cliPoll(ev(body));
        expect(res.statusCode).toBe(400);
      }
    });

    it('rejects an over-long device_code with a 400 rather than throwing on the partition key', async () => {
      // 2100 chars: over DynamoDB's 2048-byte hash key limit. device_code is
      // the rate-limit subject and then a partition key, so without the length
      // check this is an unhandled 500 from one unauthenticated request —
      // there is no try/catch in lib/http.ts to catch it.
      const res: any = await cliPoll(pollEvent('x'.repeat(2100)));
      expect(res.statusCode).toBe(400);
    });

    it('rejects lengths either side of the issued one, and accepts the issued one', async () => {
      const issued = generateSecretToken();
      // Pins the check to what /start actually mints rather than to a literal.
      expect(issued).toHaveLength(DEVICE_CODE_LENGTH);

      for (const wrong of ['x'.repeat(DEVICE_CODE_LENGTH - 1), 'x'.repeat(DEVICE_CODE_LENGTH + 1)]) {
        expect((await cliPoll(pollEvent(wrong)) as any).statusCode).toBe(400);
      }
      // A never-issued code of the right length is still the pending answer,
      // so the length check has not become an existence oracle.
      const res: any = await cliPoll(pollEvent(issued));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'pending' });
    });

    it('never touches the table for a wrong-length device_code', async () => {
      const rateLimits = await import('../../src/db/rate-limits.js');
      const spy = vi.spyOn(rateLimits, 'recordAttempt');

      await cliPoll(pollEvent('x'.repeat(2100)));

      // The charge is the first write, and it is what blows up on the key —
      // so the check has to fire before it, not after.
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('the existence oracle', () => {
    it('answers an unknown code and a genuinely pending one identically', async () => {
      const { device_code: pendingCode } = await pendingRequest();
      const unknownCode = deviceCode();

      const pendingRes: any = await cliPoll(pollEvent(pendingCode));
      const unknownRes: any = await cliPoll(pollEvent(unknownCode));

      expect(pendingRes.statusCode).toBe(200);
      expect(unknownRes.statusCode).toBe(200);
      // Compared to each other, not to a literal: this is the property that
      // must never drift, so pin it to what the other branch actually returns
      // rather than to a copy of it that could silently go stale.
      expect(JSON.parse(unknownRes.body)).toEqual(JSON.parse(pendingRes.body));
      expect(JSON.parse(pendingRes.body)).toEqual({ status: 'pending' });
    });

    it('does not distinguish a linked-but-pending code from an unlinked one', async () => {
      const { device_code } = await pendingRequest({ link_to_user_id: randomUUID() });
      const res: any = await cliPoll(pollEvent(device_code));
      expect(JSON.parse(res.body)).toEqual({ status: 'pending' });
    });
  });

  describe('the happy path', () => {
    it('reports pending before approval', async () => {
      const { device_code } = await pendingRequest();
      const res: any = await cliPoll(pollEvent(device_code));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'pending' });
      // Still there, still pending — a poll before approval must not touch the row.
      expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
    });

    it('collects the credential once approved, with the user, token and counts', async () => {
      const user = await makeUser('PolledJockey');
      await makeHorse(user, 'Thunder');
      await makeHorse(user, 'Lightning');
      await makeOrgFor(user.user_id, `Org${randomUUID().slice(0, 6)}`);
      const { device_code, issued_token, device_id } = await approvedRequest(user.user_id, { label: 'kitchen-laptop' });

      const res: any = await cliPoll(pollEvent(device_code));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({
        status: 'approved',
        user_id: user.user_id,
        secret_token: issued_token,
        device_id,
        display_name: 'PolledJockey',
        horses: 2,
        orgs: 1,
      });
    });

    it('includes the email when the user has one linked, and omits it when they do not', async () => {
      const { createUserWithEmail } = await import('../../src/db/identities.js');
      const user_id = randomUUID();
      await createUserWithEmail({
        user_id, display_name: 'EmailedJockey', email: `${user_id}@example.com`, idp_sub: `sub-${user_id}`,
      });
      const { device_code } = await approvedRequest(user_id);

      const res: any = await cliPoll(pollEvent(device_code));
      const body = JSON.parse(res.body);
      expect(body.email).toBe(`${user_id}@example.com`);

      const legacyUser = await makeUser('NoEmailJockey');
      const { device_code: legacyCode } = await approvedRequest(legacyUser.user_id);
      const legacyRes: any = await cliPoll(pollEvent(legacyCode));
      const legacyBody = JSON.parse(legacyRes.body);
      expect(legacyBody.email).toBeUndefined();
      expect('email' in legacyBody).toBe(false);
    });

    it('reports zero horses and zero orgs for a brand-new account', async () => {
      const user = await makeUser('BareJockey');
      const { device_code } = await approvedRequest(user.user_id);

      const res: any = await cliPoll(pollEvent(device_code));

      const body = JSON.parse(res.body);
      expect(body.horses).toBe(0);
      expect(body.orgs).toBe(0);
    });
  });

  describe('single-use collection', () => {
    it('deletes both rows on a successful collection', async () => {
      const user = await makeUser('SingleUseJockey');
      const { device_code, user_code } = await approvedRequest(user.user_id);

      const res: any = await cliPoll(pollEvent(device_code));
      expect(res.statusCode).toBe(200);

      expect(await getCliAuthRequest(device_code)).toBeNull();
      expect(await getCliAuthRequestByUserCode(user_code)).toBeNull();
    });

    it('answers pending, not the credential again, on a second poll of the same device_code', async () => {
      const user = await makeUser('ReplayVictim');
      const { device_code, issued_token } = await approvedRequest(user.user_id);

      const first: any = await cliPoll(pollEvent(device_code));
      expect(JSON.parse(first.body).secret_token).toBe(issued_token);

      const second: any = await cliPoll(pollEvent(device_code));

      expect(second.statusCode).toBe(200);
      expect(JSON.parse(second.body)).toEqual({ status: 'pending' });
      // Proves this is a real re-collection attempt, not a cached response.
      expect(JSON.parse(second.body).secret_token).toBeUndefined();
    });

    it('hands the credential to only one of two concurrent polls', async () => {
      const user = await makeUser('ConcurrentPoller');
      const { device_code, issued_token } = await approvedRequest(user.user_id);

      const [a, b]: any[] = await Promise.all([
        cliPoll(pollEvent(device_code)),
        cliPoll(pollEvent(device_code)),
      ]);

      const bodies = [JSON.parse(a.body), JSON.parse(b.body)];
      const approved = bodies.filter((x) => x.status === 'approved');
      expect(approved).toHaveLength(1);
      expect(approved[0]!.secret_token).toBe(issued_token);
      expect(bodies.filter((x) => x.status === 'pending')).toHaveLength(1);
    });
  });

  describe('the rate limit', () => {
    // One write, not `times` of them: the counter is what matters, not how
    // many calls got it there. Serialising hundreds of round-trips per case
    // was slow enough to time out under full-suite load.
    async function charge(device_code: string, times: number): Promise<void> {
      await recordAttempt(CLI_POLL_BUCKET, device_code, Date.now(), times);
    }

    it('allows the poll that lands exactly on the limit', async () => {
      const user = await makeUser('AtLimitPoller');
      const { device_code, issued_token } = await approvedRequest(user.user_id);
      await charge(device_code, CLI_POLL_LIMIT - 1);

      const res: any = await cliPoll(pollEvent(device_code));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).secret_token).toBe(issued_token);
    });

    it('reports a rate-limit error for the poll past the limit — and collects nothing', async () => {
      const user = await makeUser('OverLimitPoller');
      const { device_code, issued_token } = await approvedRequest(user.user_id);
      await charge(device_code, CLI_POLL_LIMIT);

      const res: any = await cliPoll(pollEvent(device_code));

      // device_code is 256 bits and unguessable — polling one at all proves
      // possession of it, so there is no existence oracle to protect here.
      // A distinguishable 429 lets a misbehaving client stop and back off
      // instead of spinning silently to the 600s expiry.
      expect(res.statusCode).toBe(429);
      expect(JSON.parse(res.body).code).toBe('RATE_LIMITED');
      // State, not just shape: the approved row must still be sitting there,
      // untouched and still collectible once the window rolls over.
      const row = await getCliAuthRequest(device_code);
      expect(row!.status).toBe('approved');
      expect(row!.issued_token).toBe(issued_token);
    });

    it('throttles a device_code that was never issued, identically to a real one', async () => {
      // Pins that rate limiting is existence-AGNOSTIC. A plausible future
      // optimisation — only charging codes that exist, to save table writes —
      // would reopen the existence oracle that the unknown/pending pairing
      // closes, and nothing else in this file would go red.
      const user = await makeUser('ExistenceAgnosticPoller');
      const { device_code: real } = await approvedRequest(user.user_id);
      const fabricated = 'never-issued-device-code'.padEnd(DEVICE_CODE_LENGTH, '0');

      await charge(real, CLI_POLL_LIMIT);
      await charge(fabricated, CLI_POLL_LIMIT);

      const realRes: any = await cliPoll(pollEvent(real));
      const fakeRes: any = await cliPoll(pollEvent(fabricated));

      // Equal to each other so the two cannot drift apart, AND pinned to the
      // literal refusal so they cannot collapse together onto a wrong shared
      // answer — a 200 pending for both would satisfy the first pair alone.
      expect(fakeRes.statusCode).toBe(realRes.statusCode);
      expect(JSON.parse(fakeRes.body)).toEqual(JSON.parse(realRes.body));
      expect(realRes.statusCode).toBe(429);
      expect(JSON.parse(realRes.body).code).toBe('RATE_LIMITED');
    });

    it('fires before the lookup: an over-limit poll never even reaches consumeCliAuthRequest', async () => {
      const user = await makeUser('PreLookupGuardPoller');
      const { device_code } = await approvedRequest(user.user_id);
      await charge(device_code, CLI_POLL_LIMIT);

      const db = await import('../../src/db/cli-auth-requests.js');
      const spy = vi.spyOn(db, 'consumeCliAuthRequest');

      await cliPoll(pollEvent(device_code));

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('is charged per device_code — a fresh login flow (a new device_code) is not throttled by an old one', async () => {
      const user = await makeUser('FreshFlowPoller');
      const exhausted = await approvedRequest(user.user_id);
      await charge(exhausted.device_code, CLI_POLL_LIMIT + 5);
      const stillOver: any = await cliPoll(pollEvent(exhausted.device_code));
      expect(stillOver.statusCode).toBe(429);
      const stillOverAgain: any = await cliPoll(pollEvent(exhausted.device_code));
      expect(stillOverAgain.statusCode).toBe(429);

      // A restarted login mints its own device_code and so its own budget,
      // even within the same rate-limit window and for the same person.
      const fresh = await approvedRequest(user.user_id);
      const res: any = await cliPoll(pollEvent(fresh.device_code));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).secret_token).toBe(fresh.issued_token);
    });

    it('has real headroom above one flow\'s honest worst-case poll count', () => {
      // A well-behaved CLI polls every interval for the whole life of the
      // flow if never approved: this is the actual number Task 4 committed
      // to, derived from its own constants rather than hardcoded here, so a
      // change to either constant re-checks this bound instead of going stale.
      const honestWorstCase = Math.ceil(CLI_AUTH_TTL_SECONDS / CLI_AUTH_POLL_INTERVAL_SECONDS);
      expect(honestWorstCase).toBe(120);
      expect(CLI_POLL_LIMIT).toBeGreaterThan(honestWorstCase);
    });
  });

  describe('the label and identity', () => {
    it('never leaks the CLI-supplied label of a still-pending request', async () => {
      const { device_code } = await pendingRequest({ label: 'a-secret-hostname' });
      const res: any = await cliPoll(pollEvent(device_code));
      expect(res.body).not.toContain('a-secret-hostname');
    });

    it('leaves other pending and approved requests untouched', async () => {
      const bystanderUser = await makeUser('PollBystander');
      const bystander = await approvedRequest(bystanderUser.user_id);
      const { device_code } = await pendingRequest();

      await cliPoll(pollEvent(device_code));

      const row = await getCliAuthRequest(bystander.device_code);
      expect(row!.status).toBe('approved');
      expect(row!.issued_token).toBe(bystander.issued_token);
    });
  });
});
