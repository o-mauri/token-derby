import { describe, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler as cliApprove } from '../../src/handlers/auth-cli-approve.js';
import { handler as cliPoll } from '../../src/handlers/auth-cli-poll.js';
import {
  putCliAuthRequest,
  getCliAuthRequest,
  CliAuthRequestNotPendingError,
} from '../../src/db/cli-auth-requests.js';
import { listDevices, getDeviceByToken } from '../../src/db/devices.js';
import { recordAttempt, CLI_APPROVE_BUCKET, CLI_APPROVE_LIMIT } from '../../src/db/rate-limits.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { createUserWithEmail } from '../../src/db/identities.js';
import { generateWebSessionToken, generateSecretToken } from '../../src/lib/codes.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { cliAuthCodeKey } from '../../src/db/keys.js';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@token-derby/shared';
import { makeUser, authHeaders } from '../helpers/auth-helper.js';
import { authenticate } from '../../src/lib/auth.js';

async function webTokenFor(user_id: string, display_name = 'Web User', ttlMs = 3600_000): Promise<string> {
  const token = generateWebSessionToken();
  await putWebSession(token, user_id, display_name, new Date(Date.now() + ttlMs).toISOString(), 3600);
  return token;
}

/** An SSO-created account: a real user row with NO secret_token_hash, which is
 *  the state a brand-new web sign-in lands in. */
async function makeSsoUser(display_name: string): Promise<string> {
  const user_id = randomUUID();
  await createUserWithEmail({
    user_id,
    display_name,
    email: `${user_id}@example.com`,
    idp_sub: `sub-${user_id}`,
  });
  return user_id;
}

function ev(over: {
  token?: string;
  headers?: Record<string, string>;
  body?: string | undefined;
} = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /api/auth/cli/approve',
    rawPath: '/api/auth/cli/approve',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      ...(over.token ? { authorization: `Bearer ${over.token}` } : {}),
      ...(over.headers ?? {}),
    },
    requestContext: {} as any,
    body: 'body' in over ? over.body : JSON.stringify({ user_code: 'ABCDEF' }),
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

/** A fresh alphabet-legal user_code per call, so nothing collides on the pointer row. */
function freshUserCode(): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[bytes[i]! % JOIN_CODE_ALPHABET.length];
  }
  return out;
}

async function pending(opts: {
  label?: string;
  link_to_user_id?: string;
  ttlSeconds?: number;
} = {}): Promise<{ device_code: string; user_code: string }> {
  // The real generator: this device_code is polled with in the cross-check
  // test below, and the poll handler enforces the exact issued length.
  const device_code = generateSecretToken();
  const user_code = freshUserCode();
  await putCliAuthRequest({
    device_code,
    user_code,
    label: opts.label ?? 'test-machine',
    ...(opts.link_to_user_id ? { link_to_user_id: opts.link_to_user_id } : {}),
    ttlSeconds: opts.ttlSeconds ?? 600,
  });
  return { device_code, user_code };
}

function approveEvent(user_code: string, token?: string, headers?: Record<string, string>) {
  return ev({ ...(token ? { token } : {}), ...(headers ? { headers } : {}), body: JSON.stringify({ user_code }) });
}

function previewEvent(user_code: string, token?: string) {
  return ev({ ...(token ? { token } : {}), body: JSON.stringify({ user_code, preview: true }) });
}

function pollEvent(device_code: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /api/auth/cli/poll',
    rawPath: '/api/auth/cli/poll',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {} as any,
    body: JSON.stringify({ device_code }),
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('auth-cli-approve', () => {
  describe('the session guard', () => {
    it('approves nothing at all when no credentials are sent', async () => {
      const user = await makeUser('NoSessionVictim');
      const { device_code, user_code } = await pending({ link_to_user_id: user.user_id });

      const res: any = await cliApprove(approveEvent(user_code));

      expect(res.statusCode).toBe(401);
      // State, not just the response: nothing was minted and nothing was marked.
      expect(await listDevices(user.user_id)).toEqual([]);
      const row = await getCliAuthRequest(device_code);
      expect(row!.status).toBe('pending');
      expect(row!.issued_token).toBeUndefined();
      expect(row!.user_id).toBeUndefined();
    });

    it('approves nothing for a bearer token that is not a session', async () => {
      const user = await makeUser('BogusBearerVictim');
      const { device_code, user_code } = await pending({ link_to_user_id: user.user_id });

      const res: any = await cliApprove(approveEvent(user_code, 'not-a-real-session-token'));

      expect(res.statusCode).toBe(401);
      expect(await listDevices(user.user_id)).toEqual([]);
      expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
    });

    it('approves nothing for a session that has already expired', async () => {
      const user = await makeUser('ExpiredSessionUser');
      const token = await webTokenFor(user.user_id, user.display_name, -1000);
      const { device_code, user_code } = await pending();

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(401);
      expect(await listDevices(user.user_id)).toEqual([]);
      expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
    });

    it('refuses a CLI credential — approval is a browser act, not something a machine can do for itself', async () => {
      const user = await makeUser('SelfApprover');
      const { device_code, user_code } = await pending({ link_to_user_id: user.user_id });

      // These are credentials that would authenticate anywhere else in the API.
      const res: any = await cliApprove(approveEvent(user_code, undefined, authHeaders(user)));

      expect(res.statusCode).toBe(401);
      expect(await listDevices(user.user_id)).toEqual([]);
      expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
    });

    it('rejects the session before it ever reads the pending row', async () => {
      const db = await import('../../src/db/cli-auth-requests.js');
      const lookup = vi.spyOn(db, 'getCliAuthRequestByUserCode');
      const { user_code } = await pending();

      const res: any = await cliApprove(approveEvent(user_code));

      expect(res.statusCode).toBe(401);
      expect(lookup).not.toHaveBeenCalled();
      lookup.mockRestore();
    });
  });

  describe('the wrong-account guard — the attack this endpoint exists to stop', () => {
    it('refuses when the pending row is linked to somebody else, and mints nothing for either party', async () => {
      const owner = await makeUser('CodeOwner');
      const attacker = await makeUser('Approver');
      const attackerToken = await webTokenFor(attacker.user_id, attacker.display_name);
      const { device_code, user_code } = await pending({ link_to_user_id: owner.user_id, label: 'owners-laptop' });

      const res: any = await cliApprove(approveEvent(user_code, attackerToken));

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).code).toBe('CLI_AUTH_WRONG_ACCOUNT');

      // No credential on the approver's account...
      expect(await listDevices(attacker.user_id)).toEqual([]);
      // ...and none on the account the code was bound to either.
      expect(await listDevices(owner.user_id)).toEqual([]);
      // ...and the request is still waiting, uncontaminated.
      const row = await getCliAuthRequest(device_code);
      expect(row!.status).toBe('pending');
      expect(row!.issued_token).toBeUndefined();
      expect(row!.user_id).toBeUndefined();
      expect(row!.link_to_user_id).toBe(owner.user_id);
    });

    it('refuses before minting, so the refusal cannot be a delete-after-the-fact', async () => {
      const owner = await makeUser('MintCheckOwner');
      const attacker = await makeUser('MintCheckApprover');
      const attackerToken = await webTokenFor(attacker.user_id, attacker.display_name);
      const { user_code } = await pending({ link_to_user_id: owner.user_id });

      const devices = await import('../../src/db/devices.js');
      const put = vi.spyOn(devices, 'putDevice');
      const res: any = await cliApprove(approveEvent(user_code, attackerToken));

      expect(res.statusCode).toBe(403);
      expect(put).not.toHaveBeenCalled();
      put.mockRestore();
    });

    it('still refuses when the linked account no longer exists', async () => {
      const attacker = await makeUser('GhostLinkApprover');
      const attackerToken = await webTokenFor(attacker.user_id, attacker.display_name);
      const { user_code } = await pending({ link_to_user_id: randomUUID() });

      const res: any = await cliApprove(approveEvent(user_code, attackerToken));

      expect(res.statusCode).toBe(403);
      expect(await listDevices(attacker.user_id)).toEqual([]);
    });
  });

  describe('the lookup', () => {
    it('refuses an unknown code without minting', async () => {
      const user = await makeUser('UnknownCodeUser');
      const token = await webTokenFor(user.user_id, user.display_name);

      const res: any = await cliApprove(approveEvent('ZZZZZZ', token));

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).code).toBe('CLI_AUTH_NOT_FOUND');
      expect(await listDevices(user.user_id)).toEqual([]);
    });

    it('refuses an expired pending request without minting', async () => {
      const user = await makeUser('ExpiredRequestUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending({ ttlSeconds: -1 });

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(404);
      expect(await listDevices(user.user_id)).toEqual([]);
      // The row is physically still there (TTL sweeps lazily) and untouched.
      expect(await getCliAuthRequest(device_code)).toBeNull();
    });

    it('refuses a pointer row whose request row has gone, without minting', async () => {
      const user = await makeUser('DanglingPointerUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const user_code = freshUserCode();
      // Pointer only: this is the shape approveCliAuthRequest would raise
      // CliAuthRequestNotPendingError for on a missing device_code.
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { ...cliAuthCodeKey(user_code), device_code: `dc-gone-${randomUUID()}` },
      }));

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(404);
      expect(await listDevices(user.user_id)).toEqual([]);
    });

    it('answers an over-long user_code with a 404 rather than throwing on the table', async () => {
      const user = await makeUser('OverLongCodeUser');
      const token = await webTokenFor(user.user_id, user.display_name);

      // 2100 chars is past DynamoDB's 2048-byte key limit. normaliseUserCode
      // rejects anything that is not exactly JOIN_CODE_LENGTH before any key is
      // built from it, so this is already bounded — pinned here so a future
      // reordering that looks the code up first cannot turn it into a 500.
      const res: any = await cliApprove(ev({ token, body: JSON.stringify({ user_code: 'A'.repeat(2100) }) }));

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).code).toBe('CLI_AUTH_NOT_FOUND');
    });

    it('answers a malformed code the same way as an unknown one, without a lookup', async () => {
      const user = await makeUser('MalformedCodeUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const db = await import('../../src/db/cli-auth-requests.js');
      const lookup = vi.spyOn(db, 'getCliAuthRequestByUserCode');

      for (const bad of ['', 'ABC', 'ABCDEFG', 'ABCDE!', 'AB0DEF']) {
        const res: any = await cliApprove(approveEvent(bad, token));
        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body).code).toBe('CLI_AUTH_NOT_FOUND');
      }
      // A code that cannot match anything stored is not worth a read.
      expect(lookup).not.toHaveBeenCalled();
      expect(await listDevices(user.user_id)).toEqual([]);
      lookup.mockRestore();
    });

    it('rejects a missing or non-string user_code as a bad request', async () => {
      const user = await makeUser('NoCodeUser');
      const token = await webTokenFor(user.user_id, user.display_name);

      for (const body of [undefined, '{}', 'not json', JSON.stringify({ user_code: 42 })]) {
        const res: any = await cliApprove(ev({ token, body }));
        expect(res.statusCode).toBe(400);
      }
      expect(await listDevices(user.user_id)).toEqual([]);
    });

    it('accepts the code as a human types it — lowercase, spaced and dashed', async () => {
      const user = await makeUser('TypistUser');
      const token = await webTokenFor(user.user_id, user.display_name);

      for (const shape of [(c: string) => c.toLowerCase(), (c: string) => `${c.slice(0, 3)}-${c.slice(3)}`, (c: string) => ` ${c} `]) {
        const { user_code } = await pending();
        const res: any = await cliApprove(approveEvent(shape(user_code), token));
        expect(res.statusCode).toBe(200);
      }
      expect(await listDevices(user.user_id)).toHaveLength(3);
    });
  });

  describe('the happy path', () => {
    it('attaches an unlinked request to the caller and hands back a working credential', async () => {
      const user = await makeUser('FreshCliUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending({ label: 'kitchen-laptop' });

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ label: 'kitchen-laptop' });

      const row = await getCliAuthRequest(device_code);
      expect(row!.status).toBe('approved');
      expect(row!.user_id).toBe(user.user_id);
      expect(typeof row!.issued_token).toBe('string');

      // Exactly one device, labelled as the CLI asked, on the caller's account.
      const devices = await listDevices(user.user_id);
      expect(devices).toHaveLength(1);
      expect(devices[0]!.label).toBe('kitchen-laptop');

      // The token on the row is the one the device row was keyed by — a
      // credential that does not authenticate is no credential at all.
      expect(await getDeviceByToken(user.user_id, row!.issued_token!)).not.toBeNull();
      const auth = await authenticate({
        version: '2.0', routeKey: 'GET /jockey/me', rawPath: '/jockey/me', rawQueryString: '',
        headers: { 'x-user-id': user.user_id, 'x-user-token': row!.issued_token! },
        requestContext: {} as any, isBase64Encoded: false,
      } as APIGatewayProxyEventV2);
      expect(auth).toEqual({ user_id: user.user_id, display_name: 'FreshCliUser', device_label: 'kitchen-laptop' });
    });

    it('works for a brand-new SSO account that has no CLI credential at all', async () => {
      const user_id = await makeSsoUser('SsoNewcomer');
      const token = await webTokenFor(user_id, 'SsoNewcomer');
      const { device_code, user_code } = await pending({ label: 'first-machine' });

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(200);
      const row = await getCliAuthRequest(device_code);
      expect(row!.user_id).toBe(user_id);
      const auth = await authenticate({
        version: '2.0', routeKey: 'GET /jockey/me', rawPath: '/jockey/me', rawQueryString: '',
        headers: { 'x-user-id': user_id, 'x-user-token': row!.issued_token! },
        requestContext: {} as any, isBase64Encoded: false,
      } as APIGatewayProxyEventV2);
      expect(auth).toEqual({ user_id, display_name: 'SsoNewcomer', device_label: 'first-machine' });
    });

    it('links a request whose link_to_user_id matches the caller, onto that same account', async () => {
      const user = await makeUser('RelinkingUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending({ link_to_user_id: user.user_id, label: 'same-laptop' });

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ label: 'same-laptop' });
      expect((await getCliAuthRequest(device_code))!.user_id).toBe(user.user_id);
      expect(await listDevices(user.user_id)).toHaveLength(1);
    });

    it('leaves other accounts untouched', async () => {
      const user = await makeUser('IsolatedApprover');
      const bystander = await makeUser('IsolatedBystander');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { user_code } = await pending();

      expect((await cliApprove(approveEvent(user_code, token)) as any).statusCode).toBe(200);
      expect(await listDevices(bystander.user_id)).toEqual([]);
    });

    it('hands the CLI, via poll, the device_id of the very row this approval created — not just some id', async () => {
      // Crosses the approve -> poll boundary through the real handlers, not
      // through a test helper that fabricates its own device_id. A future
      // reordering of putDevice/approveCliAuthRequest that threads the wrong
      // id through would still make every other test in this file and in
      // auth-cli-poll.test.ts pass — only comparing against the row that
      // listDevices actually shows for this user catches it.
      const user = await makeUser('DeviceIdCrossCheckUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending({ label: 'cross-check-laptop' });

      const approveRes: any = await cliApprove(approveEvent(user_code, token));
      expect(approveRes.statusCode).toBe(200);

      const pollRes: any = await cliPoll(pollEvent(device_code));
      expect(pollRes.statusCode).toBe(200);
      const body = JSON.parse(pollRes.body);
      expect(body.status).toBe('approved');

      const devices = await listDevices(user.user_id);
      expect(devices).toHaveLength(1);
      expect(body.device_id).toBe(devices[0]!.device_id);
    });
  });

  describe('approving twice', () => {
    it('mints one device, not two, and does not replace the first credential', async () => {
      const user = await makeUser('DoubleApprover');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();

      const first: any = await cliApprove(approveEvent(user_code, token));
      expect(first.statusCode).toBe(200);
      const firstToken = (await getCliAuthRequest(device_code))!.issued_token;

      const second: any = await cliApprove(approveEvent(user_code, token));

      expect(second.statusCode).toBe(404);
      expect(JSON.parse(second.body).code).toBe('CLI_AUTH_NOT_FOUND');
      expect(await listDevices(user.user_id)).toHaveLength(1);
      // The credential the CLI is already waiting on must survive the second call.
      expect((await getCliAuthRequest(device_code))!.issued_token).toBe(firstToken);
    });

    it('does not even mint a device on the second approval', async () => {
      const user = await makeUser('NoSecondMintUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { user_code } = await pending();
      expect((await cliApprove(approveEvent(user_code, token)) as any).statusCode).toBe(200);

      const devices = await import('../../src/db/devices.js');
      const put = vi.spyOn(devices, 'putDevice');
      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(404);
      // An already-approved row is caught on the read, not by minting and
      // rolling back — the rollback is for the concurrent case only.
      expect(put).not.toHaveBeenCalled();
      put.mockRestore();
    });

    it('mints one device when a second person approves the same unlinked code', async () => {
      const first = await makeUser('RaceFirst');
      const second = await makeUser('RaceSecond');
      const { device_code, user_code } = await pending();

      expect((await cliApprove(approveEvent(user_code, await webTokenFor(first.user_id, first.display_name))) as any).statusCode).toBe(200);
      const res: any = await cliApprove(approveEvent(user_code, await webTokenFor(second.user_id, second.display_name)));

      expect(res.statusCode).toBe(404);
      expect(await listDevices(first.user_id)).toHaveLength(1);
      expect(await listDevices(second.user_id)).toEqual([]);
      expect((await getCliAuthRequest(device_code))!.user_id).toBe(first.user_id);
    });

    it('mints one device when two approvals land concurrently', async () => {
      const user = await makeUser('ConcurrentApprover');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();

      const results = await Promise.all([
        cliApprove(approveEvent(user_code, token)) as Promise<any>,
        cliApprove(approveEvent(user_code, token)) as Promise<any>,
      ]);

      expect(results.filter(r => r.statusCode === 200)).toHaveLength(1);
      // The loser's device row must be rolled back, or the user is left with a
      // machine in their device list that no CLI ever collected a token for.
      const devices = await listDevices(user.user_id);
      expect(devices).toHaveLength(1);
      const row = await getCliAuthRequest(device_code);
      expect(await getDeviceByToken(user.user_id, row!.issued_token!)).not.toBeNull();
    });
  });

  describe('the rate limit', () => {
    /** Burns budget the cheap way, so a boundary test does not need 20 HTTP calls. */
    // One write, not `times` of them: the counter is what matters, not how
    // many calls got it there. Serialising hundreds of round-trips per case
    // was slow enough to time out under full-suite load.
    async function charge(user_id: string, times: number): Promise<void> {
      await recordAttempt(CLI_APPROVE_BUCKET, user_id, Date.now(), times);
    }

    it('allows the attempt that lands exactly on the limit', async () => {
      const user = await makeUser('AtLimitUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      await charge(user.user_id, CLI_APPROVE_LIMIT - 1);
      const { user_code } = await pending();

      const res: any = await cliApprove(approveEvent(user_code, token));

      // The limit is a ceiling the honest user may reach, not one they trip on.
      expect(res.statusCode).toBe(200);
      expect(await listDevices(user.user_id)).toHaveLength(1);
    });

    it('refuses the attempt past the limit, and approves nothing', async () => {
      const user = await makeUser('OverLimitUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      await charge(user.user_id, CLI_APPROVE_LIMIT);
      const { device_code, user_code } = await pending();

      const res: any = await cliApprove(approveEvent(user_code, token));

      // 429 — distinguishable from 401 (no session), 403 (wrong account) and
      // 404 (unknown code), so this test cannot pass on the wrong guard firing.
      expect(res.statusCode).toBe(429);
      expect(JSON.parse(res.body).code).toBe('RATE_LIMITED');

      // No credential minted...
      expect(await listDevices(user.user_id)).toEqual([]);
      // ...and the pending row is exactly as the CLI left it.
      const row = await getCliAuthRequest(device_code);
      expect(row!.status).toBe('pending');
      expect(row!.issued_token).toBeUndefined();
      expect(row!.user_id).toBeUndefined();
    });

    it('fires before the lookup, so the response cannot be used as an existence oracle', async () => {
      const owner = await makeUser('OracleOwner');
      const prober = await makeUser('OracleProber');
      const token = await webTokenFor(prober.user_id, prober.display_name);
      await charge(prober.user_id, CLI_APPROVE_LIMIT);
      const live = await pending();
      const linked = await pending({ link_to_user_id: owner.user_id });

      // A real unlinked code, a real code belonging to someone else, and a code
      // that does not exist all have to answer identically once over budget —
      // otherwise the status is itself the oracle the limit exists to close.
      for (const code of [live.user_code, linked.user_code, 'ZZZZZZ']) {
        const res: any = await cliApprove(approveEvent(code, token));
        expect(res.statusCode).toBe(429);
        expect(JSON.parse(res.body).code).toBe('RATE_LIMITED');
      }
      expect(await listDevices(prober.user_id)).toEqual([]);
      expect((await getCliAuthRequest(live.device_code))!.status).toBe('pending');
    });

    it('is charged per caller — one prober does not lock anybody else out', async () => {
      const prober = await makeUser('BudgetProber');
      const bystander = await makeUser('BudgetBystander');
      await charge(prober.user_id, CLI_APPROVE_LIMIT + 5);

      const proberRes: any = await cliApprove(approveEvent(
        (await pending()).user_code, await webTokenFor(prober.user_id, prober.display_name)));
      const bystanderRes: any = await cliApprove(approveEvent(
        (await pending()).user_code, await webTokenFor(bystander.user_id, bystander.display_name)));

      expect(proberRes.statusCode).toBe(429);
      expect(bystanderRes.statusCode).toBe(200);
      expect(await listDevices(bystander.user_id)).toHaveLength(1);
    });

    it('is set where an honest user has room and a prober does not', () => {
      // Four machines in one sitting, three mistypes each. A mistype is a failed
      // preview; a machine that works is a preview plus an approval. Spelling it
      // out this way is what catches the limit being left behind when the cost
      // per registration changes — it went from one charge to two when preview
      // was added, and 20 would no longer clear this.
      const honestWorstCase = 4 * (3 + 2);
      expect(CLI_APPROVE_LIMIT).toBeGreaterThan(honestWorstCase);
      // Still a real bound rather than a formality: at this ceiling a prober
      // gets a few dozen guesses an hour against a ~10^9 space.
      expect(CLI_APPROVE_LIMIT).toBeLessThan(100);
    });

    it('does not charge a code that could never match anything', async () => {
      const user = await makeUser('FreeTypoUser');
      const token = await webTokenFor(user.user_id, user.display_name);

      // Malformed codes buy a prober nothing, so they must not eat the budget a
      // fat-fingered honest user needs.
      for (let i = 0; i < CLI_APPROVE_LIMIT + 5; i++) {
        expect((await cliApprove(approveEvent('!!!', token)) as any).statusCode).toBe(404);
      }
      const { user_code } = await pending();
      expect((await cliApprove(approveEvent(user_code, token)) as any).statusCode).toBe(200);
    });
  });

  describe('preview', () => {
    it('returns the label and writes absolutely nothing', async () => {
      const user = await makeUser('PreviewUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending({ label: 'study-desktop' });

      const res: any = await cliApprove(previewEvent(user_code, token));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ label: 'study-desktop' });

      // No credential exists anywhere...
      expect(await listDevices(user.user_id)).toEqual([]);
      // ...and the CLI is still waiting exactly as it was.
      const row = await getCliAuthRequest(device_code);
      expect(row!.status).toBe('pending');
      expect(row!.issued_token).toBeUndefined();
      expect(row!.user_id).toBeUndefined();
    });

    it('does not mint even when asked twice, then the real approval still works', async () => {
      const user = await makeUser('PreviewThenApprove');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending({ label: 'the-machine' });

      expect((await cliApprove(previewEvent(user_code, token)) as any).statusCode).toBe(200);
      expect((await cliApprove(previewEvent(user_code, token)) as any).statusCode).toBe(200);
      expect(await listDevices(user.user_id)).toEqual([]);

      const res: any = await cliApprove(approveEvent(user_code, token));
      expect(res.statusCode).toBe(200);
      expect(await listDevices(user.user_id)).toHaveLength(1);
      expect((await getCliAuthRequest(device_code))!.status).toBe('approved');
    });

    it('shows the label for a code linked to the caller themselves — the relink path', async () => {
      const user = await makeUser('PreviewRelinkUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending({ link_to_user_id: user.user_id, label: 'my-own-laptop' });

      const res: any = await cliApprove(previewEvent(user_code, token));

      // A returning user's actual route through the page: their own CLI already
      // holds their identity, so the row is linked to them and must preview.
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ label: 'my-own-laptop' });
      expect(await listDevices(user.user_id)).toEqual([]);
      expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
    });

    it('refuses a code linked to another jockey without leaking its label', async () => {
      const owner = await makeUser('PreviewLeakOwner');
      const prober = await makeUser('PreviewLeakProber');
      const token = await webTokenFor(prober.user_id, prober.display_name);
      const { user_code } = await pending({ link_to_user_id: owner.user_id, label: 'owners-secret-hostname' });

      const res: any = await cliApprove(previewEvent(user_code, token));

      // Same refusal an approval would get. A label here would tell a prober
      // whose code they found, and device labels are hostnames.
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).code).toBe('CLI_AUTH_WRONG_ACCOUNT');
      expect(res.body).not.toContain('owners-secret-hostname');
      expect(JSON.parse(res.body).label).toBeUndefined();
    });

    it('refuses unknown and expired codes the same way an approval does', async () => {
      const user = await makeUser('PreviewMissUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const expired = await pending({ ttlSeconds: -1, label: 'expired-machine' });

      for (const code of ['ZZZZZZ', expired.user_code]) {
        const res: any = await cliApprove(previewEvent(code, token));
        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body).code).toBe('CLI_AUTH_NOT_FOUND');
        expect(JSON.parse(res.body).label).toBeUndefined();
      }
    });

    it('is charged against the same budget — it is not a free probe', async () => {
      const user = await makeUser('PreviewBudgetUser');
      const token = await webTokenFor(user.user_id, user.display_name);

      // Spend the whole budget on previews alone.
      for (let i = 0; i < CLI_APPROVE_LIMIT; i++) {
        const res: any = await cliApprove(previewEvent(freshUserCode(), token));
        expect(res.statusCode).toBe(404);
      }

      // A real approval of a real code must now be refused: previews consumed it.
      const { device_code, user_code } = await pending();
      const res: any = await cliApprove(approveEvent(user_code, token));
      expect(res.statusCode).toBe(429);
      expect(await listDevices(user.user_id)).toEqual([]);
      expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
    });

    it('is indistinguishable from an approval when over budget', async () => {
      const user = await makeUser('PreviewOverBudget');
      const token = await webTokenFor(user.user_id, user.display_name);
      for (let i = 0; i < CLI_APPROVE_LIMIT; i++) await recordAttempt(CLI_APPROVE_BUCKET, user.user_id);
      const live = await pending();

      const previewRes: any = await cliApprove(previewEvent(live.user_code, token));
      const approveRes: any = await cliApprove(approveEvent(live.user_code, token));

      // Same status and same code both ways: which one the caller asked for
      // must not be readable off the refusal. Bodies are compared to each other
      // so they cannot drift apart, and to the literal refusal code so they
      // cannot collapse together onto a shared 200 with a label in it.
      expect(previewRes.statusCode).toBe(429);
      expect(approveRes.statusCode).toBe(429);
      expect(JSON.parse(previewRes.body)).toEqual(JSON.parse(approveRes.body));
      expect(JSON.parse(previewRes.body).code).toBe('RATE_LIMITED');
      expect((await getCliAuthRequest(live.device_code))!.status).toBe('pending');
    });

    it('rejects a non-boolean preview rather than guessing, and mints nothing', async () => {
      const user = await makeUser('PreviewCoercionUser');
      const token = await webTokenFor(user.user_id, user.display_name);

      for (const bad of ['true', 1, {}, null]) {
        const { user_code } = await pending();
        const res: any = await cliApprove(ev({ token, body: JSON.stringify({ user_code, preview: bad }) }));
        // Coercing 'true' to falsy would mint a credential for somebody who
        // only asked to look — the wrong direction to fail in.
        expect(res.statusCode).toBe(400);
      }
      expect(await listDevices(user.user_id)).toEqual([]);
    });

    it('treats preview:false as a real approval', async () => {
      const user = await makeUser('PreviewFalseUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();

      const res: any = await cliApprove(ev({ token, body: JSON.stringify({ user_code, preview: false }) }));

      expect(res.statusCode).toBe(200);
      expect(await listDevices(user.user_id)).toHaveLength(1);
      expect((await getCliAuthRequest(device_code))!.status).toBe('approved');
    });

    it('needs a web session like everything else here', async () => {
      const user = await makeUser('PreviewNoSessionUser');
      const { device_code, user_code } = await pending({ link_to_user_id: user.user_id });

      const anon: any = await cliApprove(previewEvent(user_code));
      const cli: any = await cliApprove(ev({
        headers: authHeaders(user), body: JSON.stringify({ user_code, preview: true }),
      }));

      expect(anon.statusCode).toBe(401);
      expect(cli.statusCode).toBe(401);
      expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
    });
  });

  describe('when marking the row approved fails after the device was written', () => {
    /** Fails the approve write for real, leaving the pending row untouched. */
    function failApprove(err: Error) {
      return import('../../src/db/cli-auth-requests.js')
        .then(db => vi.spyOn(db, 'approveCliAuthRequest').mockRejectedValueOnce(err));
    }

    it('rolls the device row back when the write demonstrably did not land', async () => {
      const user = await makeUser('RollbackUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();
      const spy = await failApprove(new CliAuthRequestNotPendingError(device_code));

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(404);
      expect(spy).toHaveBeenCalledTimes(1);
      // The row still says pending and carries no token, which is the positive
      // evidence the write did not land — so the device row must go.
      const row = await getCliAuthRequest(device_code);
      expect(row!.status).toBe('pending');
      expect(row!.issued_token).toBeUndefined();
      expect(await listDevices(user.user_id)).toEqual([]);
      spy.mockRestore();
    });

    it('rolls back and rethrows on an unexpected failure that did not land', async () => {
      const user = await makeUser('RollbackThrowUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();
      const spy = await failApprove(new Error('dynamo exploded'));

      await expect(cliApprove(approveEvent(user_code, token))).rejects.toThrow('dynamo exploded');

      expect(await listDevices(user.user_id)).toEqual([]);
      expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
      spy.mockRestore();
    });

    it('KEEPS the device row when the write landed and only the acknowledgement was lost', async () => {
      const user = await makeUser('LostAckUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending({ label: 'lost-ack-laptop' });

      // DynamoDB applied the transaction and the response never came back. The
      // SDK's retry is a fresh transaction, so its #status = :pending condition
      // now fails and we arrive in the catch with the approval already durable.
      const db = await import('../../src/db/cli-auth-requests.js');
      const real = db.approveCliAuthRequest;
      const spy = vi.spyOn(db, 'approveCliAuthRequest').mockImplementationOnce(async (input) => {
        await real(input);
        throw new CliAuthRequestNotPendingError(input.device_code);
      });

      const res: any = await cliApprove(approveEvent(user_code, token));

      // The row is approved and carries the token, so the operation succeeded.
      const row = await getCliAuthRequest(device_code);
      expect(row!.status).toBe('approved');
      expect(row!.user_id).toBe(user.user_id);
      const issued = row!.issued_token!;

      // The credential the CLI is about to collect MUST still resolve to a
      // device row. Deleting it here is worse than any orphan row: the CLI
      // writes the token to identity.json, the pending row is then consumed,
      // and every later call fails 'Invalid token' with no way to re-approve.
      expect(await getDeviceByToken(user.user_id, issued)).not.toBeNull();
      const devices = await listDevices(user.user_id);
      expect(devices).toHaveLength(1);
      expect(devices[0]!.label).toBe('lost-ack-laptop');

      // And the page is told the truth rather than a 404 its own CLI contradicts.
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ label: 'lost-ack-laptop' });

      spy.mockRestore();
    });

    it('keeps the device row when it cannot tell whether the write landed', async () => {
      const user = await makeUser('AmbiguousAckUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();

      // The row is gone by the time we look: a poll consumed it, meaning the
      // credential is live. Ambiguity must not cost the user their credential.
      const db = await import('../../src/db/cli-auth-requests.js');
      const approveSpy = vi.spyOn(db, 'approveCliAuthRequest')
        .mockRejectedValueOnce(new CliAuthRequestNotPendingError(device_code));
      const readSpy = vi.spyOn(db, 'getCliAuthRequest').mockResolvedValueOnce(null);

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(404);
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(await listDevices(user.user_id)).toHaveLength(1);

      approveSpy.mockRestore();
      readSpy.mockRestore();
    });

    it('keeps the device row when the confirming read itself fails', async () => {
      const user = await makeUser('UnreadableAckUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();

      const db = await import('../../src/db/cli-auth-requests.js');
      const approveSpy = vi.spyOn(db, 'approveCliAuthRequest')
        .mockRejectedValueOnce(new CliAuthRequestNotPendingError(device_code));
      const readSpy = vi.spyOn(db, 'getCliAuthRequest').mockRejectedValueOnce(new Error('read failed'));
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(404);
      expect(logSpy).toHaveBeenCalled();
      expect(await listDevices(user.user_id)).toHaveLength(1);

      approveSpy.mockRestore();
      readSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('still answers, and does not lose the original error, when the rollback itself fails', async () => {
      const user = await makeUser('RollbackFailUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();

      const db = await import('../../src/db/cli-auth-requests.js');
      const devices = await import('../../src/db/devices.js');
      const approveSpy = vi.spyOn(db, 'approveCliAuthRequest')
        .mockRejectedValueOnce(new CliAuthRequestNotPendingError(device_code));
      const deleteSpy = vi.spyOn(devices, 'deleteDevice').mockRejectedValueOnce(new Error('delete failed'));
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(404);
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalled();

      approveSpy.mockRestore();
      deleteSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('the label', () => {
    it('comes from the pending row, never from the request body', async () => {
      const user = await makeUser('LabelSourceUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { user_code } = await pending({ label: 'the-real-label' });

      const res: any = await cliApprove(ev({
        token,
        body: JSON.stringify({ user_code, label: 'attacker-supplied' }),
      }));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).label).toBe('the-real-label');
      expect((await listDevices(user.user_id))[0]!.label).toBe('the-real-label');
    });

    it('is returned verbatim — escaping belongs to the page that renders it', async () => {
      const user = await makeUser('LabelEscapeUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const nasty = '<img src=x onerror=1>';
      const { user_code } = await pending({ label: nasty });

      const res: any = await cliApprove(approveEvent(user_code, token));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).label).toBe(nasty);
    });

    it('never leaks the minted token to the browser', async () => {
      const user = await makeUser('NoTokenLeakUser');
      const token = await webTokenFor(user.user_id, user.display_name);
      const { device_code, user_code } = await pending();

      const res: any = await cliApprove(approveEvent(user_code, token));

      const issued = (await getCliAuthRequest(device_code))!.issued_token!;
      expect(res.body).not.toContain(issued);
      expect(Object.keys(JSON.parse(res.body))).toEqual(['label']);
    });
  });
});
