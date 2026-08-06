import { describe, it, expect, vi } from 'vitest';
import { handler } from '../../src/handlers/create-race.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getRaceByJoinCode, getRaceByAdminCode, setRaceEnded } from '../../src/db/races.js';
import { getOrganisationByName } from '../../src/db/organisations.js';
import { putRaceSettings } from '../../src/db/race-settings.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';
import { CURRENT_CLI_VERSION, OUTDATED_CLI_VERSION } from '../helpers/cli-version.js';

function event(
  body: unknown,
  user: TestUser | null,
  cliVersion: string | null = CURRENT_CLI_VERSION,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    version: '2.0',
    routeKey: 'POST /races',
    rawPath: '/races',
    rawQueryString: '',
    headers,
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function orgEvent(body: unknown, user: TestUser): APIGatewayProxyEventV2 {
  return {
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
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('createRace handler', () => {
  it('creates a race and returns join + admin codes', async () => {
    const user = await makeUser('CR_Alice');
    const res: any = await handler(event({
      name: 'Test Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
    }, user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.race_id).toBeTruthy();
    expect(body.join_code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.admin_code).toMatch(/^[0-9a-f-]{36}$/);

    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.name).toBe('Test Derby');
    expect(race?.max_participants).toBe(30);
    expect(race?.creator_user_name).toBe('CR_Alice');

    const raceByAdmin = await getRaceByAdminCode(body.admin_code);
    expect(raceByAdmin?.race_id).toBe(body.race_id);
  });

  it('uses server-stored display_name, ignoring any client-sent name', async () => {
    const user = await makeUser('CR_Server');
    const ev = event({
      name: 'Identity test',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user);
    // Even if a malicious client tries to send an x-user-name, the server ignores it.
    (ev.headers as Record<string, string>)['x-user-name'] = 'Forged';
    const res: any = await handler(ev);
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.creator_user_name).toBe('CR_Server');
  });

  it('respects custom max_participants', async () => {
    const user = await makeUser('CR_Max');
    const res: any = await handler(event({
      name: 'Small Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      max_participants: 5,
    }, user));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.max_participants).toBe(5);
  });

  it('persists counts_input when set to true', async () => {
    const user = await makeUser('CR_CountsIn');
    const res: any = await handler(event({
      name: 'Input+output race',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      counts_input: true,
    }, user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.counts_input).toBe(true);
  });

  it('omits counts_input from the row when not set (default false)', async () => {
    const user = await makeUser('CR_CountsOut');
    const res: any = await handler(event({
      name: 'Output-only race',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.counts_input).toBeUndefined();
  });

  it('persists primary_top5 when requested', async () => {
    const user = await makeUser('CR_Top5');
    const res: any = await handler(event({
      name: 'Top5 Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
      primary_top5: true,
    }, user));
    expect(res.statusCode).toBe(200);
    const race = await getRaceByJoinCode(JSON.parse(res.body).join_code);
    expect(race?.primary_top5).toBe(true);
  });

  it('leaves primary_top5 unset by default (off)', async () => {
    const user = await makeUser('CR_NoTop5');
    const res: any = await handler(event({
      name: 'Default Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
    }, user));
    expect(res.statusCode).toBe(200);
    const race = await getRaceByJoinCode(JSON.parse(res.body).join_code);
    expect(race?.primary_top5).toBeUndefined();
  });

  it('persists the stamina flag from the create request', async () => {
    const user = await makeUser('CR_Stamina');
    const res: any = await handler(event({
      name: 'Stamina Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
      stamina: true,
    }, user));
    expect(res.statusCode).toBe(200);
    const race = await getRaceByJoinCode(JSON.parse(res.body).join_code);
    expect(race?.stamina).toBe(true);
  });

  it('omits stamina when not requested', async () => {
    const user = await makeUser('CR_NoStamina');
    const res: any = await handler(event({
      name: 'No Stamina Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
    }, user));
    expect(res.statusCode).toBe(200);
    const race = await getRaceByJoinCode(JSON.parse(res.body).join_code);
    expect(race?.stamina).toBeUndefined();
  });

  it('rejects missing fields with BAD_REQUEST', async () => {
    const user = await makeUser('CR_BadReq');
    const res: any = await handler(event({ name: 'No times' }, user));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('rejects end_time before start_time', async () => {
    const user = await makeUser('CR_Bwd');
    const res: any = await handler(event({
      name: 'Backwards',
      start_time: '2026-04-22T17:00:00Z',
      end_time: '2026-04-22T09:00:00Z',
      tz: 'UTC',
    }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects unparseable datetime strings', async () => {
    const user = await makeUser('CR_Garbage');
    const res: any = await handler(event({
      name: 'Garbage',
      start_time: 'not-a-date',
      end_time: 'also-not-a-date',
      tz: 'UTC',
    }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing X-Cli-Version header', async () => {
    const user = await makeUser('CR_NoVer');
    const res: any = await handler(event({
      name: 'No version',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user, null));
    expect(res.statusCode).toBe(400);
  });

  it('rejects auth-missing requests with UNAUTHENTICATED', async () => {
    const res: any = await handler(event({
      name: 'No auth',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, null));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('rejects unknown user with UNAUTHENTICATED', async () => {
    const fakeUser: TestUser = {
      user_id: '11111111-1111-1111-1111-111111111111',
      display_name: 'Ghost',
      secret_token: 'fake-token',
    };
    const res: any = await handler(event({
      name: 'Ghost race',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, fakeUser));
    expect(res.statusCode).toBe(401);
  });

  it('rejects wrong token with UNAUTHENTICATED', async () => {
    const user = await makeUser('CR_Wrong');
    const ev = event({
      name: 'Wrong token',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user);
    (ev.headers as Record<string, string>)['x-user-token'] = 'wrong-token';
    const res: any = await handler(ev);
    expect(res.statusCode).toBe(401);
  });

  it('persists cli_version on the race', async () => {
    const user = await makeUser('CR_VerPersist');
    const res: any = await handler(event({
      name: 'Version test',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user, CURRENT_CLI_VERSION));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.cli_version).toBe(CURRENT_CLI_VERSION);
  });

  it('rejects CLI versions older than the minimum with VERSION_MISMATCH', async () => {
    const user = await makeUser('CR_OldCli');
    const res: any = await handler(event({
      name: 'Old client',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user, OUTDATED_CLI_VERSION));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('links a race to an org when caller is a member', async () => {
    const user = await makeUser('CR_OrgOk');
    const orgRes: any = await createOrgHandler(orgEvent({ name: 'CrtRaceA' }, user));
    expect(orgRes.statusCode).toBe(200);
    const res: any = await handler(event({
      name: 'Org Race',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceA',
    }, user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.org_id).toBe(JSON.parse(orgRes.body).org_id);
    expect(race?.organisation_name).toBe('CrtRaceA');
  });

  it('returns ORG_NOT_FOUND for unknown organisation', async () => {
    const user = await makeUser('CR_OrgMiss');
    const res: any = await handler(event({
      name: 'Unknown org',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'NoSuch',
    }, user));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('returns NOT_ORG_MEMBER when creator is not a member', async () => {
    const owner = await makeUser('CR_OrgOwner');
    const other = await makeUser('CR_OrgOther');
    await createOrgHandler(orgEvent({ name: 'CrtRaceB' }, owner));
    const res: any = await handler(event({
      name: 'Not member',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceB',
    }, other));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_MEMBER');
  });

  it('rejects an org race whose window overlaps an existing org race', async () => {
    const user = await makeUser('CR_Ovl');
    await createOrgHandler(orgEvent({ name: 'CrtRaceC' }, user));
    const first: any = await handler(event({
      name: 'First',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceC',
    }, user));
    expect(first.statusCode).toBe(200);

    // Starts before the first race ends.
    const res: any = await handler(event({
      name: 'Clash',
      start_time: '2026-04-22T16:00:00Z',
      end_time: '2026-04-22T20:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceC',
    }, user));
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('RACE_OVERLAP');
    expect(body.message).toContain('First');
  });

  it('allows back-to-back org races (new start == previous end)', async () => {
    const user = await makeUser('CR_B2B');
    await createOrgHandler(orgEvent({ name: 'CrtRaceD' }, user));
    const first: any = await handler(event({
      name: 'Morning',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T12:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceD',
    }, user));
    expect(first.statusCode).toBe(200);

    const res: any = await handler(event({
      name: 'Afternoon',
      start_time: '2026-04-22T12:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceD',
    }, user));
    expect(res.statusCode).toBe(200);
  });

  it('treats a race ended early as occupying only up to its ended_at', async () => {
    const user = await makeUser('CR_Early');
    await createOrgHandler(orgEvent({ name: 'CrtRaceE' }, user));
    const first: any = await handler(event({
      name: 'Cut short',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceE',
    }, user));
    expect(first.statusCode).toBe(200);
    const firstRace = await getRaceByJoinCode(JSON.parse(first.body).join_code);
    await setRaceEnded(firstRace!.race_id, '2026-04-22T11:00:00Z');

    // Overlaps the scheduled window but not the actual (early-ended) one.
    const res: any = await handler(event({
      name: 'After early end',
      start_time: '2026-04-22T12:00:00Z',
      end_time: '2026-04-22T16:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceE',
    }, user));
    expect(res.statusCode).toBe(200);
  });

  it('does not constrain non-org races against org race windows', async () => {
    const user = await makeUser('CR_NoOrg');
    await createOrgHandler(orgEvent({ name: 'CrtRaceF' }, user));
    const first: any = await handler(event({
      name: 'Org race',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceF',
    }, user));
    expect(first.statusCode).toBe(200);

    // Same window, but no organisation_name — allowed.
    const res: any = await handler(event({
      name: 'Personal race',
      start_time: '2026-04-22T10:00:00Z',
      end_time: '2026-04-22T16:00:00Z',
      tz: 'UTC',
    }, user));
    expect(res.statusCode).toBe(200);
  });

  it('stamps the org stamina config onto a new org race', async () => {
    const user = await makeUser('CR_StampCfg');
    await createOrgHandler(orgEvent({ name: 'CRStampCfg' }, user));
    const org = await getOrganisationByName('CRStampCfg');
    await putRaceSettings({
      org_id: org!.org_id,
      stamina_config: { drain_per_min: 7 },
      updated_at: new Date().toISOString(),
      updated_by_user_id: user.user_id,
    });

    const res: any = await handler(event({
      name: 'Stamped Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
      organisation_name: 'CRStampCfg',
    }, user));
    expect(res.statusCode).toBe(200);
    const race = await getRaceByJoinCode(JSON.parse(res.body).join_code);
    expect(race?.stamina_config).toEqual({ drain_per_min: 7 });
  });

  it('leaves stamina_config absent for a race with no org', async () => {
    const user = await makeUser('CR_StampNoOrg');
    const res: any = await handler(event({
      name: 'Unstamped Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
    }, user));
    expect(res.statusCode).toBe(200);
    const race = await getRaceByJoinCode(JSON.parse(res.body).join_code);
    expect(race?.stamina_config).toBeUndefined();
  });

  it('does not retroactively change a race when the org config changes later', async () => {
    const user = await makeUser('CR_StampLater');
    await createOrgHandler(orgEvent({ name: 'CRStampLtr' }, user));
    const org = await getOrganisationByName('CRStampLtr');

    const res: any = await handler(event({
      name: 'Early Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
      organisation_name: 'CRStampLtr',
    }, user));
    expect(res.statusCode).toBe(200);

    await putRaceSettings({
      org_id: org!.org_id,
      stamina_config: { drain_per_min: 12 },
      updated_at: new Date().toISOString(),
      updated_by_user_id: user.user_id,
    });

    const race = await getRaceByJoinCode(JSON.parse(res.body).join_code);
    expect(race?.stamina_config).toBeUndefined();
  });

  it('fires the race.created webhook for org-linked races when configured', async () => {
    const owner = await makeUser('OwnerWh');
    const orgName = 'WebhookOrg1';
    const orgRes: any = await createOrgHandler({
      version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': owner.user_id, 'x-user-token': owner.secret_token },
      requestContext: {} as any,
      body: JSON.stringify({ name: orgName }),
      isBase64Encoded: false,
    });
    expect(orgRes.statusCode).toBe(200);

    let received: { headers: Record<string, string>; body: string } | undefined;
    const server: Server = await new Promise(resolve => {
      const s = createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          received = { headers: req.headers as any, body };
          res.statusCode = 200;
          res.end();
        });
      });
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;

    const { setOrgWebhook, getOrganisationByName } = await import('../../src/db/organisations.js');
    const persistedOrg = await getOrganisationByName(orgName);
    expect(persistedOrg).toBeTruthy();
    const localUrl = `http://127.0.0.1:${port}/h`;
    await setOrgWebhook(persistedOrg!.org_id, localUrl, 'testsecret');

    const createRaceRes: any = await handler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': owner.user_id, 'x-user-token': owner.secret_token },
      requestContext: {} as any,
      body: JSON.stringify({
        name: 'WhRace1',
        start_time: new Date(Date.now() + 60_000).toISOString(),
        end_time:   new Date(Date.now() + 600_000).toISOString(),
        tz: 'UTC',
        organisation_name: orgName,
      }),
      isBase64Encoded: false,
    });
    expect(createRaceRes.statusCode).toBe(200);

    await new Promise(r => setTimeout(r, 50));

    expect(received).toBeDefined();
    expect(received!.headers['x-token-derby-event']).toBe('race.created');
    expect(received!.headers['x-token-derby-signature']).toBe(
      'sha256=' + createHmac('sha256', 'testsecret').update(received!.body).digest('hex'),
    );
    const payload = JSON.parse(received!.body);
    expect(payload.event).toBe('race.created');
    expect(payload.race.name).toBe('WhRace1');
    expect(payload.organisation.org_name).toBe(orgName);

    await new Promise(r => server.close(() => r(null)));
  });

  it('does not fire a webhook for races without an organisation', async () => {
    const user = await makeUser('NoWhUser');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res: any = await handler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any,
      body: JSON.stringify({
        name: 'NoOrgRace',
        start_time: new Date(Date.now() + 60_000).toISOString(),
        end_time:   new Date(Date.now() + 600_000).toISOString(),
        tz: 'UTC',
      }),
      isBase64Encoded: false,
    });
    expect(res.statusCode).toBe(200);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
