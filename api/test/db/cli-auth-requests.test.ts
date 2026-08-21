import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../../src/db/client.js';
import { cliAuthRequestKey } from '../../src/db/keys.js';
import {
  putCliAuthRequest,
  getCliAuthRequest,
  getCliAuthRequestByUserCode,
  approveCliAuthRequest,
  consumeCliAuthRequest,
  UserCodeCollisionError,
  CliAuthRequestNotPendingError,
} from '../../src/db/cli-auth-requests.js';

const deviceCode = () => `dc-${randomUUID()}`;
const userCode = () => `UC${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const base = (overrides: Partial<Parameters<typeof putCliAuthRequest>[0]> = {}) => ({
  device_code: deviceCode(),
  user_code: userCode(),
  label: 'omars-laptop',
  ttlSeconds: 600,
  ...overrides,
});

describe('cli auth requests', () => {
  it('round-trips by device_code', async () => {
    const req = base();
    await putCliAuthRequest(req);
    const got = await getCliAuthRequest(req.device_code);
    expect(got).not.toBeNull();
    expect(got!.user_code).toBe(req.user_code);
    expect(got!.label).toBe('omars-laptop');
    expect(got!.status).toBe('pending');
    expect(got!.link_to_user_id).toBeUndefined();
    expect(got!.issued_token).toBeUndefined();
  });

  it('round-trips by user_code, resolving through the pointer row', async () => {
    const req = base();
    await putCliAuthRequest(req);
    const got = await getCliAuthRequestByUserCode(req.user_code);
    expect(got).not.toBeNull();
    expect(got!.device_code).toBe(req.device_code);
    expect(got!.label).toBe('omars-laptop');
  });

  it('carries a link target when one was set', async () => {
    const req = base({ link_to_user_id: 'user-42' });
    await putCliAuthRequest(req);
    const got = await getCliAuthRequest(req.device_code);
    expect(got!.link_to_user_id).toBe('user-42');
  });

  it('returns null for an unknown device_code', async () => {
    expect(await getCliAuthRequest(deviceCode())).toBeNull();
  });

  it('returns null for an unknown user_code', async () => {
    expect(await getCliAuthRequestByUserCode(userCode())).toBeNull();
  });

  it('refuses a duplicate user_code rather than overwriting the pointer', async () => {
    const code = userCode();
    const first = base({ user_code: code });
    await putCliAuthRequest(first);

    const second = base({ user_code: code, label: 'attackers-device' });
    await expect(putCliAuthRequest(second)).rejects.toThrow(UserCodeCollisionError);

    // The original request must still be the one the pointer resolves to —
    // proves the second write did not land anywhere, not merely that it errored.
    const resolved = await getCliAuthRequestByUserCode(code);
    expect(resolved!.device_code).toBe(first.device_code);
    expect(resolved!.label).toBe('omars-laptop');

    // And the second device_code's own row must not exist either — a partial
    // write (pointer refused, record row still written) would also be a bug.
    expect(await getCliAuthRequest(second.device_code)).toBeNull();
  });

  it('lets exactly one of two concurrent puts with the same user_code win', async () => {
    const code = userCode();
    const a = base({ user_code: code, label: 'a' });
    const b = base({ user_code: code, label: 'b' });

    const results = await Promise.allSettled([putCliAuthRequest(a), putCliAuthRequest(b)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(UserCodeCollisionError);

    // The winner is whichever of a/b actually landed — confirm the pointer
    // resolves to exactly one of the two device_codes, not neither/both.
    const resolved = await getCliAuthRequestByUserCode(code);
    expect([a.device_code, b.device_code]).toContain(resolved!.device_code);
  });

  it('treats an expired row as absent via device_code, even though the item is still physically there', async () => {
    const req = base({ ttlSeconds: -1 });
    await putCliAuthRequest(req);
    expect(await getCliAuthRequest(req.device_code)).toBeNull();
  });

  it('treats an expired row as absent via user_code', async () => {
    const req = base({ ttlSeconds: -1 });
    await putCliAuthRequest(req);
    expect(await getCliAuthRequestByUserCode(req.user_code)).toBeNull();
  });

  it('approves a request and makes the credential collectible exactly once', async () => {
    const req = base();
    await putCliAuthRequest(req);
    await approveCliAuthRequest({ device_code: req.device_code, issued_token: 'secret-token-1', user_id: 'user-1', device_id: 'dev-1' });

    const pending = await getCliAuthRequest(req.device_code);
    expect(pending!.status).toBe('approved');

    const first = await consumeCliAuthRequest(req.device_code);
    expect(first).not.toBeNull();
    expect(first!.issued_token).toBe('secret-token-1');
    expect(first!.device_id).toBe('dev-1');
    expect(first!.user_code).toBe(req.user_code);
    expect(first!.label).toBe('omars-laptop');

    const second = await consumeCliAuthRequest(req.device_code);
    expect(second).toBeNull();
  });

  it('refuses to approve a linked request onto a different user, atomically', async () => {
    const req = base({ link_to_user_id: 'owner-1' });
    await putCliAuthRequest(req);

    // The handler checks this too, but its check is a read: putting it in the
    // condition as well means a row that gains a link between that read and
    // this write still cannot be approved onto somebody else.
    await expect(approveCliAuthRequest({
      device_code: req.device_code, issued_token: 'stolen', user_id: 'attacker-1', device_id: 'dev-attacker',
    })).rejects.toThrow(CliAuthRequestNotPendingError);

    const row = await getCliAuthRequest(req.device_code);
    expect(row!.status).toBe('pending');
    expect(row!.issued_token).toBeUndefined();
    expect(row!.user_id).toBeUndefined();
    expect(row!.link_to_user_id).toBe('owner-1');
  });

  it('refuses to approve a row whose link target is an empty string', async () => {
    // putCliAuthRequest drops a falsy link target and the read mapper filters it
    // too, so this state is unreachable through the public API today. The
    // condition covers it anyway: a future writer that stops filtering must not
    // silently turn "linked to nobody in particular" into "approvable by anyone".
    const device_code = deviceCode();
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...cliAuthRequestKey(device_code),
        user_code: userCode(),
        label: 'empty-link',
        link_to_user_id: '',
        status: 'pending',
        created_at: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 600,
      },
    }));

    await expect(approveCliAuthRequest({
      device_code, issued_token: 'nope', user_id: 'somebody', device_id: 'dev-nope',
    })).rejects.toThrow(CliAuthRequestNotPendingError);

    expect((await getCliAuthRequest(device_code))!.status).toBe('pending');
  });

  it('approves a linked request onto the user it is linked to', async () => {
    const req = base({ link_to_user_id: 'owner-2' });
    await putCliAuthRequest(req);

    await approveCliAuthRequest({
      device_code: req.device_code, issued_token: 'legit', user_id: 'owner-2', device_id: 'dev-owner-2',
    });

    const row = await getCliAuthRequest(req.device_code);
    expect(row!.status).toBe('approved');
    expect(row!.issued_token).toBe('legit');
    expect(row!.user_id).toBe('owner-2');
  });

  it('approves an unlinked request onto any user', async () => {
    const req = base();
    await putCliAuthRequest(req);

    await approveCliAuthRequest({
      device_code: req.device_code, issued_token: 'fresh', user_id: 'whoever-3', device_id: 'dev-whoever-3',
    });

    expect((await getCliAuthRequest(req.device_code))!.user_id).toBe('whoever-3');
  });

  it('deletes both rows on consume — the user_code pointer no longer resolves', async () => {
    const req = base();
    await putCliAuthRequest(req);
    await approveCliAuthRequest({ device_code: req.device_code, issued_token: 'tok', user_id: 'user-1', device_id: 'dev-tok' });
    await consumeCliAuthRequest(req.device_code);

    expect(await getCliAuthRequest(req.device_code)).toBeNull();
    expect(await getCliAuthRequestByUserCode(req.user_code)).toBeNull();
  });

  it('refuses to consume a request that was never approved', async () => {
    const req = base();
    await putCliAuthRequest(req);
    expect(await consumeCliAuthRequest(req.device_code)).toBeNull();
    // Still there and still pending — a failed consume must not delete anything.
    expect(await getCliAuthRequest(req.device_code)).not.toBeNull();
  });

  it('returns null consuming an unknown device_code', async () => {
    expect(await consumeCliAuthRequest(deviceCode())).toBeNull();
  });

  it('refuses to consume an approved row whose device_id is missing or empty', async () => {
    // Unreachable through approveCliAuthRequest today, which always writes a
    // real device_id — same standing as the empty-link-target case above.
    // The guard covers it anyway: ConsumedCliAuthRequest promises device_id
    // is a string, and toCliAuthRequest filters a falsy one to `undefined`,
    // so a row like this must not be handed out as though it were valid.
    // Built through the real put+approve path (so the user_code pointer row
    // genuinely exists) and then stripped of device_id directly, rather than
    // hand-crafted, so a missing pointer row can't accidentally save the test.
    const req = base();
    await putCliAuthRequest(req);
    await approveCliAuthRequest({
      device_code: req.device_code, issued_token: 'tok-no-device', user_id: 'user-1', device_id: 'dev-real',
    });
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: cliAuthRequestKey(req.device_code),
      UpdateExpression: 'REMOVE device_id',
    }));

    expect(await consumeCliAuthRequest(req.device_code)).toBeNull();
    // Not consumed: the row (and its would-be credential) must still be there.
    expect((await getCliAuthRequest(req.device_code))!.status).toBe('approved');
    expect(await getCliAuthRequestByUserCode(req.user_code)).not.toBeNull();
  });

  it('lets exactly one of two concurrent consumes win', async () => {
    const req = base();
    await putCliAuthRequest(req);
    await approveCliAuthRequest({ device_code: req.device_code, issued_token: 'race-token', user_id: 'user-1', device_id: 'dev-race' });

    // Both calls read the approved row and pass their checks before either
    // delete lands, so this exercises the conditional-delete race rather
    // than an early-return a sequential double-consume would take.
    const [a, b] = await Promise.all([
      consumeCliAuthRequest(req.device_code),
      consumeCliAuthRequest(req.device_code),
    ]);
    const winners = [a, b].filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.issued_token).toBe('race-token');
  });
});
